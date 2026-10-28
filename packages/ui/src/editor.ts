// Build an "open in editor" URL from a source location. Svelte gives us the real .svelte
// file at build time (preprocessor) — no runtime symbolication needed, unlike React. The
// template is configurable; {file} and {line} are substituted. loc is "file" or "file:line".
export const DEFAULT_EDITOR_TEMPLATE = 'vscode://file/{file}:{line}';

export function editorUrl(loc: string, template: string = DEFAULT_EDITOR_TEMPLATE): string {
  const match = /^(.*):(\d+)$/.exec(loc);
  const file = match ? match[1] : loc;
  const line = match ? match[2] : '1';
  return template.replace('{file}', file).replace('{line}', line);
}
