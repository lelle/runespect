import { execFileSync } from 'node:child_process';
import { version } from '../../../../packages/vite-plugin/package.json';
import type { LayoutServerLoad } from './$types';

// What the site was built from; the commit is left out when git is not there. Changesets waiting
// in .changeset/ mean main is ahead of the released version.
function currentCommit(): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return undefined;
  }
}

// Listed by Vite when the build starts, so it does not depend on the directory it runs from.
const changesets = Object.keys(import.meta.glob('../../../../.changeset/*.md'));

const build = {
  version,
  commit: currentCommit(),
  unreleased: changesets.some((file) => !file.endsWith('/README.md')),
};

export const load: LayoutServerLoad = () => ({ build });
