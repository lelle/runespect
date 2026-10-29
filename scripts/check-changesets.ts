#!/usr/bin/env node
// Enforces the release strategy in .changeset/README.md on a pull request.
//   node scripts/check-changesets.ts <base-rev>   CI: what the branch changed since <base-rev>
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

interface Changeset {
  file: string;
  text: string;
}

type Packages = Record<string, { name: string; version: string }>;

// The packages and bumps a changeset's frontmatter lists, as `"@scope/name": patch` lines.
function bumpsOf(changeset: Changeset): Map<string, string> {
  const frontmatter = changeset.text.match(/^---\n([\s\S]*?)---/)?.[1] ?? '';
  return new Map(
    [...frontmatter.matchAll(/^\s*["']?([^"':\s]+)["']?\s*:\s*(\w+)/gm)].map(([, name, bump]) => [
      name,
      bump,
    ]),
  );
}

/**
 * What keeps a branch from following the release strategy: a released package it changes without
 * a changeset, or a major bump that would take a 0.x package to 1.0.0. An empty changeset says the
 * change is one users will not notice.
 */
export function checkChangesets({
  changed,
  changesets,
  packages,
}: {
  changed: string[];
  changesets: Changeset[];
  packages: Packages;
}): string[] {
  const bumps = changesets.map((changeset) => ({ changeset, bumps: bumpsOf(changeset) }));
  const acknowledged = bumps.some(({ bumps }) => bumps.size === 0);
  const covered = new Set(bumps.flatMap(({ bumps }) => [...bumps.keys()]));
  const versions = new Map(Object.values(packages).map((p) => [p.name, p.version]));

  const missing = Object.entries(packages)
    .filter(([dir]) =>
      changed.some((file) => file.startsWith(`${dir}/`) && file !== `${dir}/CHANGELOG.md`),
    )
    .filter(([, { name }]) => !acknowledged && !covered.has(name))
    .map(
      ([, { name }]) =>
        `${name} changed without a changeset: add one with \`pnpm changeset\`, or ` +
        '`pnpm changeset --empty` when users will not notice.',
    );
  const tooBig = bumps.flatMap(({ changeset, bumps }) =>
    [...bumps]
      .filter(([name, bump]) => bump === 'major' && versions.get(name)?.startsWith('0.'))
      .map(
        ([name]) =>
          `${changeset.file}: a major bump of ${name} before 1.0 would release 1.0.0; ` +
          'use minor for a breaking change.',
      ),
  );
  return [...missing, ...tooBig];
}

const git = (...args: string[]) =>
  execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean);

// The packages a release covers: those under packages/ the changesets config does not ignore.
function releasedPackages(): Packages {
  const { ignore } = JSON.parse(readFileSync('.changeset/config.json', 'utf8'));
  return Object.fromEntries(
    readdirSync('packages')
      .filter((dir) => existsSync(`packages/${dir}/package.json`))
      .map((dir) => [
        `packages/${dir}`,
        JSON.parse(readFileSync(`packages/${dir}/package.json`, 'utf8')),
      ])
      .filter(([, manifest]) => !ignore.includes(manifest.name))
      .map(([dir, { name, version }]) => [dir, { name, version }]),
  );
}

function main([base]: string[]): number {
  if (!base) {
    console.error('usage: check-changesets.ts <base-rev>');
    return 2;
  }
  const changed = git('diff', '--name-only', `${base}...HEAD`);
  const changesets = git(
    'diff',
    '--name-only',
    '--diff-filter=AM',
    `${base}...HEAD`,
    '--',
    '.changeset/*.md',
  )
    .filter((file) => file !== '.changeset/README.md')
    .map((file) => ({ file, text: readFileSync(file, 'utf8') }));
  const problems = checkChangesets({ changed, changesets, packages: releasedPackages() });

  if (problems.length === 0) return 0;
  console.error('The branch does not follow the release strategy in .changeset/README.md:');
  for (const problem of problems) console.error(`  - ${problem}`);
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
