import { openInEditorUrl, type OpenInEditor } from '@runespect/agent/protocol/internal';

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

// A vscode:// link opens by itself; through the dev server the view asks the page (or, in the page,
// the agent), so the link is there for a middle click and is not followed.
export function sourceHref(loc: string, mode: OpenInEditor): string {
  return mode === 'vscode' ? editorUrl(loc) : openInEditorUrl(loc);
}

/** Opens `loc` as `mode` says; `e` is the click on a link to it, if there was one. */
export function openSource(
  loc: string,
  mode: OpenInEditor,
  onOpen: (loc: string) => void,
  e?: MouseEvent,
): void {
  if (mode === 'vscode') {
    if (!e) window.open(editorUrl(loc), '_blank', 'noreferrer');
    return;
  }
  e?.preventDefault();
  onOpen(loc);
}

// launch-editor reports a failure only in the dev server's terminal, so this says where to look.
export function openingNotice(loc: string): string {
  const name = loc.split(/[\\/]/).pop() ?? loc;
  return `Opening ${name} in your editor. Nothing opened? See the dev server's terminal.`;
}

export const UNREACHABLE_NOTICE = 'Could not reach the dev server to open the editor.';
