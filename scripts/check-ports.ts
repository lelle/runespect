// The ports test servers listen on, and which file claims each. Playwright's web servers are named by
// their URLs in playwright.config.ts; a standalone script claims a port with `const NAME = 5191;`.
// A port passed in (`process.argv[2] ?? 5189`) belongs to whoever passes it.
const URL_PORT = /localhost:(\d{4,5})/g;
const CONST_PORT = /^const \w+ = (\d{4,5});/gm;

/** Ports claimed by more than one file, each with the files that claim it. */
export function portCollisions(
  files: { name: string; text: string }[],
): { port: number; owners: string[] }[] {
  const owners = new Map<number, Set<string>>();
  for (const { name, text } of files) {
    const pattern = name.endsWith('playwright.config.ts') ? URL_PORT : CONST_PORT;
    for (const [, port] of text.matchAll(pattern)) {
      const claims = owners.get(Number(port)) ?? new Set();
      owners.set(Number(port), claims.add(name));
    }
  }
  return [...owners]
    .filter(([, claims]) => claims.size > 1)
    .map(([port, claims]) => ({ port, owners: [...claims] }));
}
