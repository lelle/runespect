import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ENCODED_TAGS, TO_PAGE_KINDS, TO_PANEL_KINDS } from '@runespect/agent/protocol/internal';

// The wire format is described by hand in the protocol reference. The compiler already makes a new
// kind or encoding be listed in the protocol; this makes it be described as well, and a removed one
// be taken out of the page.
const reference = readFileSync(
  path.join(import.meta.dirname, '../../../docs/reference/protocol.md'),
  'utf8',
);

const section = (title: string): string => {
  const start = reference.indexOf(`\n## ${title}\n`);
  if (start < 0) return '';
  const end = reference.indexOf('\n## ', start + 1);
  return reference.slice(start, end < 0 ? undefined : end);
};
const headings = (title: string): string[] =>
  [...section(title).matchAll(/^### `([^`]+)`$/gm)].map(([, name]) => name).sort();
const tableTags = (title: string): string[] =>
  [...section(title).matchAll(/^\| `([^`]+)` +\|/gm)].map(([, name]) => name).sort();

test('the protocol reference describes every message kind', () => {
  expect(headings('Messages')).toEqual([...TO_PANEL_KINDS, ...TO_PAGE_KINDS].sort());
});

test('the protocol reference describes every control message', () => {
  expect(headings('Control messages')).toEqual(['events', 'register']);
});

test('the protocol reference describes every value marker', () => {
  expect(tableTags('Values')).toEqual(
    [...Object.keys(ENCODED_TAGS), 'function', 'error', 'dehydrated', 'partial'].sort(),
  );
});
