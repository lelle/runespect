import { test, expect, beforeEach, vi } from 'vitest';
import { mount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import App from '../src/App.svelte';
import { Inspect } from '@runespect/ui/internal';

beforeEach(() => agent.reset());

// The overlay renders inside its own shadow root, so the host page's CSS cannot reach it.
function setup() {
  const app = document.createElement('div');
  const target = document.createElement('div');
  document.body.append(app, target);
  mount(App, { target: app });
  mount(Inspect, { target });
  flushSync();
  const overlay = target.querySelector('[data-testid="runespect-overlay-host"]')!.shadowRoot!;
  return { app, target, overlay };
}

const fire = (el: any, value: any) => {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
};

test('overlay renders the component tree from the shared agent', () => {
  const { overlay } = setup();
  expect(overlay.querySelector('[data-component="App"]')).toBeTruthy();
  expect(overlay.querySelectorAll('[data-component="Counter"]')).toHaveLength(2);

  const app = overlay.querySelector('[data-component="App"]')!;
  expect(app.querySelectorAll('[data-component="Counter"]')).toHaveLength(2);
});

test('overlay shows live values and updates when the app changes', () => {
  const { app, overlay } = setup();
  const input = overlay.querySelectorAll('[data-edit="Counter.count"]')[0] as HTMLInputElement;
  expect(input.value).toBe('1');

  app.querySelectorAll('button')[0].click();
  flushSync();
  expect(input.value).toBe('2');
});

test('editing in the overlay flows back into the app', () => {
  const { app, overlay } = setup();
  fire(overlay.querySelectorAll('[data-edit="Counter.count"]')[0], '99');
  expect(app.querySelectorAll('button')[0].textContent).toBe('99 / 198');
});

test('derived values are shown read-only (no input)', () => {
  const { overlay } = setup();
  const firstCounter = overlay.querySelector('[data-component="Counter"]')!;
  expect(firstCounter.querySelector('[data-value="Counter.doubled"]')).toBeTruthy();
  expect(firstCounter.querySelector('[data-edit="Counter.doubled"]')).toBeNull();
});

test('the overlay lives in a shadow root of its own, with its styles inside it', () => {
  const { target, overlay } = setup();
  expect(target.querySelector('[data-testid="runespect-overlay"]')).toBeNull();
  expect(overlay.querySelector('[data-testid="runespect-overlay"]')).toBeTruthy();
  expect(overlay.querySelector('style')?.textContent).toContain('runespect-overlay');
});

// The picker listens on the document, where a click inside the shadow root arrives with the host
// as its target. The overlay's own buttons must keep working while picking.
test("while picking, the overlay's own buttons still work and nothing is picked", () => {
  const { overlay } = setup();
  const pick = overlay.querySelector('[data-testid="runespect-pick"]') as HTMLButtonElement;
  const settings = overlay.querySelector('[data-testid="runespect-settings"]') as HTMLButtonElement;
  pick.click();
  flushSync();
  settings.click();
  flushSync();
  expect(settings.getAttribute('aria-expanded')).toBe('true');
  expect(pick.getAttribute('aria-pressed')).toBe('true');
  pick.click(); // the picker listens on the whole document; leave it off for the next test
  flushSync();
});

// Window listeners see a click inside the shadow root as a click on the host, i.e. outside the menu.
test("a choice in the overlay's settings menu is applied and leaves the menu open", () => {
  const { overlay } = setup();
  (overlay.querySelector('[data-testid="runespect-settings"]') as HTMLButtonElement).click();
  flushSync();
  const flash = overlay.querySelector('[data-setting="Flash on update"]') as HTMLInputElement;
  const before = flash.checked;
  flash.click();
  flushSync();
  expect(flash.checked).toBe(!before);
  expect(overlay.querySelector('[data-testid="runespect-settings-menu"]')).toBeTruthy();
});

test('Escape that ends picking is not also handled by the page', () => {
  const { overlay } = setup();
  let seenByPage = false;
  const onPageKey = (): void => void (seenByPage = true);
  document.addEventListener('keydown', onPageKey);
  (overlay.querySelector('[data-testid="runespect-pick"]') as HTMLButtonElement).click();
  flushSync();
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  document.removeEventListener('keydown', onPageKey);
  expect(seenByPage).toBe(false);
});

// The overlay reads the agent directly, so it follows runespect({ openInEditor: false }) without a
// hello: the names stay, but none of them links to an editor.
test('overlay drops the editor links when Open in editor is off', () => {
  expect(setup().overlay.querySelector('a[data-open="Counter"]')).toBeTruthy();
  document.body.replaceChildren();

  agent.setOpenInEditor(false);
  const { overlay } = setup();
  expect(overlay.querySelector('[data-component="Counter"]')).toBeTruthy();
  expect(overlay.querySelector('a[data-open]')).toBeNull();
});

// The overlay remembers it across reloads, as the panel does.
test('the overlay remembers "only stateful", under the key the panel uses', () => {
  localStorage.clear();
  const first = setup();
  (first.overlay.querySelector('[data-testid="runespect-settings"]') as HTMLButtonElement).click();
  flushSync();
  (
    first.overlay.querySelector('[data-setting="Only components with state"]') as HTMLInputElement
  ).click();
  flushSync();

  expect(setup().overlay.querySelector('[data-testid="runespect-state-filter"]')).toBeTruthy();
  expect(localStorage.getItem('runespect:onlyStateful')).toBe('true');
});

test('the overlay closes to a button that opens it again', () => {
  const { overlay } = setup();
  (overlay.querySelector('[aria-label="Close runespect"]') as HTMLButtonElement).click();
  flushSync();
  expect(overlay.querySelector('[data-testid="runespect-overlay"]')).toBeNull();

  (overlay.querySelector('.runespect-reopen') as HTMLButtonElement).click();
  flushSync();
  expect(overlay.querySelector('[data-component="Counter"]')).toBeTruthy();
});

// The setting is how a value starts, so it shows on the values drawn after it is chosen.
test("the overlay's 'Expand values' is kept, and opens the values of the next overlay", () => {
  localStorage.clear();
  agent.report(agent.enter('Settings'), 'cfg', { theme: 'dark' });
  const open = () => {
    const target = document.body.appendChild(document.createElement('div'));
    mount(Inspect, { target });
    flushSync();
    return target.querySelector('[data-testid="runespect-overlay-host"]')!.shadowRoot!;
  };
  const toggle = (o: ShadowRoot) => o.querySelector('[data-value="Settings.cfg"] [data-expand]')!;
  const first = open();
  expect(toggle(first).getAttribute('aria-expanded')).toBe('false');

  (first.querySelector('[data-testid="runespect-settings"]') as HTMLButtonElement).click();
  flushSync();
  (first.querySelector('[data-setting="Expand values"]') as HTMLInputElement).click();
  flushSync();

  expect(toggle(open()).getAttribute('aria-expanded')).toBe('true');
  localStorage.clear();
});

const highlight = (overlay: ShadowRoot) =>
  overlay.querySelector<HTMLElement>('[data-testid="runespect-highlight"]');

// While picking, the box follows the pointer over the page, and goes once it is over the overlay.
test('the box goes when the pointer moves over the overlay while picking', () => {
  const { app, overlay } = setup();
  const pick = overlay.querySelector('[data-testid="runespect-pick"]') as HTMLButtonElement;
  pick.click();
  flushSync();
  app.querySelector('button')!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  flushSync();
  expect(highlight(overlay)).toBeTruthy();

  overlay
    .querySelector('header')!
    .dispatchEvent(new MouseEvent('mousemove', { bubbles: true, composed: true }));
  flushSync();
  expect(highlight(overlay)).toBeNull();
  pick.click(); // the picker listens on the whole document; leave it off for the next test
  flushSync();
});

// jsdom lays nothing out, so the element's box is set by the test; the window resizing is what moves it.
test('the box follows its element when the window resizes', () => {
  const { overlay } = setup();
  let top = 10;
  const rect = vi
    .spyOn(Element.prototype, 'getBoundingClientRect')
    .mockImplementation(() => ({ top, left: 0, width: 5, height: 5 }) as DOMRect);
  try {
    overlay
      .querySelector('[data-component="Counter"] > .name')!
      .dispatchEvent(new MouseEvent('mouseenter'));
    flushSync();
    expect(highlight(overlay)!.style.top).toBe('10px');

    top = 40;
    window.dispatchEvent(new Event('resize'));
    flushSync();
    expect(highlight(overlay)!.style.top).toBe('40px');
  } finally {
    rect.mockRestore();
  }
});
