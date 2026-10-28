import { type BundledLanguage, createCssVariablesTheme, createHighlighter } from 'shiki';
import { escapeHtml } from './docs';

/** Highlighted HTML for `code`, or undefined when there is no grammar for `lang`. */
export type Highlight = (code: string, lang: string) => string | undefined;

const LANGS: BundledLanguage[] = ['ts', 'js', 'json', 'sh', 'svelte', 'html'];
const hasGrammar = (lang: string): lang is BundledLanguage => (LANGS as string[]).includes(lang);

// TextMate scopes to the site's token classes, first match from the innermost scope out.
// Operators, punctuation, names and shell arguments stay plain.
const CLASSES: Array<[prefix: string, kind: string]> = [
  ['comment', 'comment'],
  ['support.type.property-name', ''],
  ['string.quoted', 'string'],
  ['string.template', 'string'],
  ['constant.numeric', 'number'],
  ['constant.language', 'keyword'],
  ['constant.other.option', 'type'],
  ['storage', 'keyword'],
  ['keyword.control', 'keyword'],
  ['keyword.operator.new', 'keyword'],
  ['keyword.operator.expression', 'keyword'],
  ['entity.name.command', 'keyword'],
  ['entity.name.tag', 'keyword'],
  ['support.type', 'type'],
  ['entity.name.type', 'type'],
  ['entity.other.attribute-name', 'type'],
];

function kindOf(scopes: string[]): string {
  for (const scope of scopes.toReversed()) {
    const match = CLASSES.find(([prefix]) => scope.startsWith(prefix));
    if (match) return match[1];
  }
  return '';
}

/** Loads the grammars once; the returned function is synchronous. */
export async function createCodeHighlighter(): Promise<Highlight> {
  const theme = createCssVariablesTheme({ name: 'site' });
  const shiki = await createHighlighter({ themes: [theme], langs: LANGS });
  return (code, lang) => {
    if (!hasGrammar(lang)) return undefined;
    const { tokens } = shiki.codeToTokens(code, { lang, theme: 'site', includeExplanation: true });
    return tokens
      .map((line) => {
        const parts: Array<{ kind: string; text: string }> = [];
        for (const token of line) {
          for (const part of token.explanation ?? []) {
            const kind = kindOf(part.scopes.map((s) => s.scopeName));
            const last = parts.at(-1);
            if (last?.kind === kind) last.text += part.content;
            else parts.push({ kind, text: part.content });
          }
        }
        return parts
          .map(({ kind, text }) =>
            kind ? `<span class="t-${kind}">${escapeHtml(text)}</span>` : escapeHtml(text),
          )
          .join('');
      })
      .join('\n');
  };
}
