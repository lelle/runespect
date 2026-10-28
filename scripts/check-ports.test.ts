import { test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { portCollisions } from './check-ports.ts';

// Each test server listens on a port of its own. A server left running by one suite (a Playwright
// web server, a standalone e2e script) would otherwise answer for another, which then tests the
// wrong app or fails to start.

test('a port declared by two owners is a collision', () => {
  const files = [
    { name: 'playwright.config.ts', text: "url: 'http://localhost:5188/demo/'" },
    { name: 'e2e/hmr.ts', text: 'const PORT = 5188;' },
    { name: 'e2e/pages.ts', text: 'const WITH = 5191;\nconst PLAIN = 5192;' },
  ];
  expect(portCollisions(files)).toEqual([
    { port: 5188, owners: ['playwright.config.ts', 'e2e/hmr.ts'] },
  ]);
});

test('one owner may use its port many times, and a port it is given is no claim', () => {
  const files = [
    { name: 'playwright.config.ts', text: "url: 'http://localhost:5189/'\ncommand: 'x 5189'" },
    { name: 'e2e/serve.ts', text: 'const PORT = Number(process.argv[2] ?? 5189);' },
  ];
  expect(portCollisions(files)).toEqual([]);
});

test('no two test servers in the repository share a port', () => {
  const scripts = ['e2e', 'scripts'].flatMap((dir) =>
    readdirSync(dir)
      .filter((name) => /(?<!\.(test|spec))\.ts$/.test(name))
      .map((name) => `${dir}/${name}`),
  );
  const files = ['playwright.config.ts', ...scripts].map((name) => ({
    name,
    text: readFileSync(name, 'utf8'),
  }));
  expect(portCollisions(files)).toEqual([]);
});
