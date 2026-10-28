import { test, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { checkCommitMessage, checkCommits, readableMessage } from './check-commit-msg.ts';

// The commit standard in CONTRIBUTING.md, as executable rules. `checkCommitMessage` judges one
// message; `checkCommits` judges a range the way CI does (every commit, and no merges).

test('accepts a typed subject with a package scope', () => {
  expect(checkCommitMessage('feat(ui): add element picker')).toEqual([]);
});

test('accepts a typed subject without a scope', () => {
  expect(checkCommitMessage('docs: explain the two ways to open the panel')).toEqual([]);
});

test('accepts a breaking-change marker', () => {
  expect(checkCommitMessage('feat(agent)!: version the handshake')).toEqual([]);
});

test('accepts a body separated from the subject by a blank line', () => {
  const message = 'fix(agent): keep the tree alive across HMR\n\nThe node store was reactive.';
  expect(checkCommitMessage(message)).toEqual([]);
});

test('rejects a subject without a type', () => {
  expect(checkCommitMessage('add element picker')).toHaveLength(1);
});

test.each(['spike', 'harden', 'wip'])('rejects the non-standard type "%s"', (type) => {
  const problems = checkCommitMessage(`${type}: try something`);
  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain(type);
});

test.each(['panel', 'picker', 'protocol', 'ui,agent'])(
  'rejects the scope "%s" that is not a package',
  (scope) => {
    const problems = checkCommitMessage(`feat(${scope}): do a thing`);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(scope);
  },
);

const workspaceDirs = ['packages', 'apps'].flatMap((parent) =>
  readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name),
);

test.each(workspaceDirs)('accepts the workspace directory "%s" as a scope', (dir) => {
  expect(checkCommitMessage(`feat(${dir}): do a thing`)).toEqual([]);
});

test('rejects an empty description', () => {
  expect(checkCommitMessage('feat(ui): ')).toHaveLength(1);
});

test('accepts a subject of exactly 72 characters and rejects 73', () => {
  const prefix = 'feat(ui): ';
  expect(checkCommitMessage(prefix + 'a'.repeat(72 - prefix.length))).toEqual([]);
  expect(checkCommitMessage(prefix + 'a'.repeat(73 - prefix.length))).toHaveLength(1);
});

test('accepts a body line of exactly 72 characters and rejects 73', () => {
  const subject = 'fix(ui): stop the flicker\n\n';
  expect(checkCommitMessage(subject + 'a'.repeat(72))).toEqual([]);
  const problems = checkCommitMessage(subject + 'a'.repeat(73));
  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatch(/wrap/i);
});

test('accepts a long body line when it carries a URL that cannot be wrapped', () => {
  const url = 'https://github.com/sveltejs/svelte/issues/11389#' + 'a'.repeat(60);
  expect(checkCommitMessage(`fix(ui): stop the flicker\n\nSee ${url}`)).toEqual([]);
});

test('rejects a body that starts on the line right after the subject', () => {
  expect(checkCommitMessage('fix(ui): stop the flicker\nbecause it flickered')).toHaveLength(1);
});

test.each([
  'Claude-Session: https://claude.ai/code/session_abc',
  'Co-Authored-By: Claude <noreply@anthropic.com>',
  '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
])('rejects the AI attribution line "%s"', (line) => {
  expect(checkCommitMessage(`fix(ui): stop the flicker\n\n${line}`)).toHaveLength(1);
});

test('accepts a human co-author', () => {
  const message = 'fix(ui): stop the flicker\n\nCo-authored-by: Ada <ada@example.com>';
  expect(checkCommitMessage(message)).toEqual([]);
});

test('rejects a fixup commit unless fixups are allowed', () => {
  const message = 'fixup! feat(ui): add element picker';
  expect(checkCommitMessage(message)).toHaveLength(1);
  expect(checkCommitMessage(message, { allowFixup: true })).toEqual([]);
});

test('reports every problem in a message, not just the first', () => {
  const message = 'spike(panel): try it\n\nClaude-Session: https://claude.ai/code/session_abc';
  expect(checkCommitMessage(message)).toHaveLength(3);
});

test('readableMessage drops git comment lines and everything below the scissors line', () => {
  const file = [
    'feat(ui): add element picker',
    '',
    '# Please enter the commit message for your changes.',
    '# ------------------------ >8 ------------------------',
    'diff --git a/x b/x',
    '+Claude-Session: not part of the message',
  ].join('\n');
  expect(readableMessage(file)).toBe('feat(ui): add element picker');
});

test('checkCommits passes a range of well-formed, single-parent commits', () => {
  const commits = [
    { hash: 'a1', parents: ['a0'], message: 'feat(ui): add element picker' },
    { hash: 'a2', parents: ['a1'], message: 'test(e2e): cover the picker' },
  ];
  expect(checkCommits(commits)).toEqual([]);
});

test('checkCommits names the commit a problem belongs to', () => {
  const commits = [
    { hash: 'a1', parents: ['a0'], message: 'feat(ui): add element picker' },
    { hash: 'b2', parents: ['a1'], message: 'oops' },
  ];
  const problems = checkCommits(commits);
  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain('b2');
});

test('checkCommits rejects a merge commit even when its message is well-formed', () => {
  const commits = [{ hash: 'm1', parents: ['a1', 'b1'], message: 'chore: merge main' }];
  const problems = checkCommits(commits);
  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatch(/merge/i);
});

test('checkCommits rejects a fixup commit that was never squashed', () => {
  const commits = [{ hash: 'f1', parents: ['a1'], message: 'fixup! feat(ui): add element picker' }];
  expect(checkCommits(commits)).toHaveLength(1);
});

// The rules CONTRIBUTING states are the rules the script holds.
test('rejects a description that starts with a capitalised word, and accepts an acronym', () => {
  expect(checkCommitMessage('feat(ui): Add element picker')).toHaveLength(1);
  expect(checkCommitMessage('fix(agent): HMR no longer drops the tree')).toEqual([]);
});

test('rejects a subject that ends with a period', () => {
  expect(checkCommitMessage('docs: explain the panel window.')).toHaveLength(1);
});

test('accepts the subject git revert writes', () => {
  expect(checkCommitMessage('Revert "feat(ui): add element picker"')).toEqual([]);
});
