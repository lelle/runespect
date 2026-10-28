import { chromium } from '@playwright/test';
import mermaidScript from 'mermaid/dist/mermaid.min.js?raw';

// Mermaid needs a browser to lay a diagram out, so the build draws every diagram once in Chrome
// and keeps the SVG. Labels are SVG text rather than HTML, and Mermaid's own <style> and colours
// are left out: the site's stylesheet colours the diagram, in both themes.

declare const mermaid: {
  initialize(config: object): void;
  render(id: string, source: string): Promise<{ svg: string }>;
};

// The same stack as the site's body text (site.css).
const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

/** The SVG of each Mermaid source, in order. */
export async function renderDiagrams(sources: string[]): Promise<string[]> {
  if (!sources.length) return [];
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: mermaidScript });
    const drawn = await page.evaluate(
      async ({ all, font }) => {
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          // Measured with the font the site draws it in; lines break only where the source does.
          themeVariables: { fontFamily: font, fontSize: '14px' },
          htmlLabels: false,
          markdownAutoWrap: false,
          flowchart: { htmlLabels: false, useMaxWidth: true, wrappingWidth: 1000 },
        });
        const svgs: string[] = [];
        for (const [i, source] of all.entries()) {
          svgs.push((await mermaid.render(`diagram-${i}`, source)).svg);
        }
        return svgs;
      },
      { all: sources, font: FONT },
    );
    return drawn.map(withoutColours);
  } finally {
    await browser.close();
  }
}

function withoutColours(svg: string): string {
  return svg
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replaceAll(/\s(?:fill|stroke)="#[0-9a-fA-F]{3,8}"/g, '')
    .replaceAll(/\sstyle="[^"]*"/g, (style) =>
      /(?:fill|stroke|color)\s*:/.test(style) ? '' : style,
    );
}
