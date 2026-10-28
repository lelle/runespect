#!/usr/bin/env node
// Enforces the commit standard in CONTRIBUTING.md.
//   node scripts/check-commit-msg.ts <message-file>      the commit-msg hook (.githooks/commit-msg)
//   node scripts/check-commit-msg.ts --range <rev-range>  CI: every commit in a pull request
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TYPES = [
  'feat',
  'fix',
  'docs',
  'test',
  'refactor',
  'chore',
  'build',
  'ci',
  'perf',
  'style',
  'revert',
];

// A directory under packages/ or apps/, or one of the few cross-cutting areas.
const SCOPES = [
  'ui',
  'agent',
  'vite-plugin',
  'extension',
  'proxy',
  'prod-reader',
  'playground',
  'sveltekit-spa',
  'demo',
  'site',
  'deps',
  'e2e',
];

const MAX_LINE_LENGTH = 72;
const URL = /\bhttps?:\/\/\S+/;
const SUBJECT = /^([^(:!\s]+)(?:\(([^)]*)\))?(!)?: (.*)$/;
const FIXUP = /^(fixup|squash|amend)! /;
// What `git revert` writes; the original subject inside it was checked when it was committed.
const GIT_REVERT = /^Revert ".+"$/;
const AI_ATTRIBUTION = [
  /^claude-session:/i,
  /^co-authored-by:.*\b(claude|anthropic)\b/i,
  /generated with .*claude code/i,
];
const SCISSORS = /^# -+ >8 -+$/;

/** The message git will actually record, from the file a commit-msg hook is handed. */
export function readableMessage(fileContent: string): string {
  const lines = fileContent.split('\n');
  const scissors = lines.findIndex((line) => SCISSORS.test(line));
  return (scissors === -1 ? lines : lines.slice(0, scissors))
    .filter((line) => !line.startsWith('#'))
    .join('\n')
    .trim();
}

function checkSubject(subject: string): string[] {
  if (GIT_REVERT.test(subject)) return [];
  const match = SUBJECT.exec(subject);
  if (!match) return [`subject must look like "type(scope): description" — got "${subject}"`];

  const [, type, scope, , description] = match;
  const problems: string[] = [];
  if (!TYPES.includes(type)) {
    problems.push(`unknown type "${type}" — use one of: ${TYPES.join(', ')}`);
  }
  if (scope !== undefined && !SCOPES.includes(scope)) {
    problems.push(`unknown scope "${scope}" — use one of: ${SCOPES.join(', ')}, or leave it out`);
  }
  if (description.trim() === '') problems.push('subject has no description after the colon');
  // "Add", not "HMR": a capitalised word is a sentence start, an all-caps one an acronym.
  if (/^[A-Z][a-z]/.test(description)) {
    problems.push(
      `description starts with a capital — write "${description[0].toLowerCase()}${description.slice(1)}"`,
    );
  }
  if (description.endsWith('.')) problems.push('subject ends with a period — drop it');
  return problems;
}

/** Every way `message` breaks the standard; empty when it follows it. */
export function checkCommitMessage(
  message: string,
  { allowFixup = false }: { allowFixup?: boolean } = {},
): string[] {
  const [subject, ...rest] = message.split('\n');

  if (FIXUP.test(subject)) {
    return allowFixup ? [] : [`"${subject}" must be squashed into its target before merging`];
  }

  const problems = checkSubject(subject);
  if (subject.length > MAX_LINE_LENGTH) {
    problems.push(`subject is ${subject.length} characters — the limit is ${MAX_LINE_LENGTH}`);
  }
  if (rest.length > 0 && rest[0].trim() !== '') {
    problems.push('leave a blank line between the subject and the body');
  }
  const longLines = rest.filter((line) => line.length > MAX_LINE_LENGTH && !URL.test(line));
  if (longLines.length > 0) {
    problems.push(
      `wrap the body at ${MAX_LINE_LENGTH} characters — ${longLines.length} line(s) are longer`,
    );
  }
  for (const line of rest) {
    if (AI_ATTRIBUTION.some((pattern) => pattern.test(line.trim()))) {
      problems.push(`remove the AI attribution line "${line.trim()}"`);
    }
  }
  return problems;
}

interface Commit {
  hash: string;
  parents: string[];
  message: string;
}

/** Every problem in a range of `{ hash, parents, message }` commits, prefixed with its commit. */
export function checkCommits(commits: Commit[]): string[] {
  return commits.flatMap(({ hash, parents, message }) => {
    const problems =
      parents.length > 1
        ? ['merge commits are not allowed — rebase onto the target branch instead']
        : checkCommitMessage(message);
    return problems.map((problem) => `${hash.slice(0, 7)}: ${problem}`);
  });
}

function commitsInRange(range: string): Commit[] {
  const fieldSeparator = '\x1f';
  const commitSeparator = '\x1e';
  const format = ['%H', '%P', '%B'].join(fieldSeparator) + commitSeparator;
  return execFileSync('git', ['log', `--format=${format}`, range], { encoding: 'utf8' })
    .split(commitSeparator)
    .map((entry) => entry.replace(/^\n/, ''))
    .filter((entry) => entry !== '')
    .map((entry) => {
      const [hash, parents, message] = entry.split(fieldSeparator);
      return { hash, parents: parents.split(' ').filter(Boolean), message: message.trim() };
    });
}

function main([first, second]: string[]): number {
  if (!first || (first === '--range' && !second)) {
    console.error('usage: check-commit-msg.ts <message-file> | --range <rev-range>');
    return 2;
  }
  const problems =
    first === '--range'
      ? checkCommits(commitsInRange(second))
      : checkCommitMessage(readableMessage(readFileSync(first, 'utf8')), { allowFixup: true });

  if (problems.length === 0) return 0;
  console.error('Commit message does not follow CONTRIBUTING.md:');
  for (const problem of problems) console.error(`  - ${problem}`);
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
