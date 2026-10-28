#!/usr/bin/env node
// Prints name@version for every public workspace package whose version is not on npm yet, one per
// line, and nothing when everything is published. The release workflow publishes only then.
//   node scripts/unpublished-packages.ts
import { execFile } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

// A failed lookup counts as unpublished: the workflow then asks for approval, and `changeset
// publish` skips whatever npm already has.
export async function unpublishedPackages(
  manifests: { name: string; version: string; private?: boolean }[],
  onNpm: (spec: string) => Promise<boolean>,
): Promise<string[]> {
  const missing: string[] = [];
  for (const { name, version, private: isPrivate } of manifests) {
    if (isPrivate) continue;
    const spec = `${name}@${version}`;
    const published = await onNpm(spec).catch(() => false);
    if (!published) missing.push(spec);
  }
  return missing;
}

async function onNpm(spec: string): Promise<boolean> {
  const { stdout } = await promisify(execFile)('npm', ['view', spec, 'version']);
  return stdout.trim() !== '';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const packages = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'packages');
  const manifests = readdirSync(packages).map((p) =>
    JSON.parse(readFileSync(join(packages, p, 'package.json'), 'utf8')),
  );
  for (const spec of await unpublishedPackages(manifests, onNpm)) console.log(spec);
}
