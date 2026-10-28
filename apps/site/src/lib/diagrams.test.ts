import { test, expect } from 'vitest';
import { renderDiagrams } from './diagrams';

// Mermaid blocks in docs/ are drawn to SVG when the site is built, so a phone loads no script to
// see them. The site's stylesheet colours them, so they follow the light and dark theme.

const flowchart = 'flowchart TB\n  agent["@runespect/agent"] -->|connect| panel[Panel]';

test('draws each diagram as SVG with its labels as text', async () => {
  const [svg] = await renderDiagrams([flowchart]);
  expect(svg.startsWith('<svg')).toBe(true);
  expect(svg).toContain('@runespect/agent');
  expect(svg).toContain('connect');
  expect(svg).not.toContain('<foreignObject');
}, 60_000);

test("leaves the colours to the site's stylesheet", async () => {
  const [svg] = await renderDiagrams([flowchart]);
  expect(svg).not.toContain('<style');
  expect(svg).not.toMatch(/fill:\s*#|stroke:\s*#|fill="#|stroke="#/);
}, 60_000);

test('gives every diagram its own ids, so two on one page do not clash', async () => {
  const [first, second] = await renderDiagrams([flowchart, flowchart]);
  const ids = (svg: string) => [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  expect(ids(first).filter((id) => ids(second).includes(id))).toEqual([]);
}, 60_000);
