#!/usr/bin/env node
// Prints name@version for every workspace package whose version is not released yet, one per line,
// and nothing when everything is. A public package is released on npm; a private one by its git
// tag, which `changeset publish` makes. The release workflow publishes only then.
//   node scripts/unpublished-packages.ts
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

// A failed lookup counts as unpublished: the workflow then asks for approval, and `changeset
// publish` skips whatever npm already has.
export async function unpublishedPackages(
  manifests: { name: string; version: string; private?: boolean }[],
  onNpm: (spec: string) => Promise<boolean>,
  tagged: (spec: string) => Promise<boolean>,
  ignored: string[] = [],
): Promise<string[]> {
  const missing: string[] = [];
  for (const { name, version, private: isPrivate } of manifests) {
    if (ignored.includes(name)) continue;
    const spec = `${name}@${version}`;
    const published = await (isPrivate ? tagged : onNpm)(spec).catch(() => false);
    if (!published) missing.push(spec);
  }
  return missing;
}

async function onNpm(spec: string): Promise<boolean> {
  const { stdout } = await promisify(execFile)('npm', ['view', spec, 'version']);
  return stdout.trim() !== '';
}

async function tagged(spec: string): Promise<boolean> {
  const { stdout } = await promisify(execFile)('git', ['tag', '--list', spec]);
  return stdout.trim() !== '';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const packages = join(root, 'packages');
  const { ignore } = JSON.parse(readFileSync(join(root, '.changeset/config.json'), 'utf8'));
  const manifests = readdirSync(packages)
    .filter((p) => existsSync(join(packages, p, 'package.json')))
    .map((p) => JSON.parse(readFileSync(join(packages, p, 'package.json'), 'utf8')));
  for (const spec of await unpublishedPackages(manifests, onNpm, tagged, ignore)) console.log(spec);
}
