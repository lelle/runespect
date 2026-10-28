import { test, expect } from 'vitest';
import { dismissOn } from '@runespect/ui/internal';

// One way for every popup (the node menu, the settings, the page picker) to close on Escape or a
// click outside it.
function popupIn(root: ParentNode & Node) {
  const popup = document.createElement('div');
  const inside = popup.appendChild(document.createElement('button'));
  root.appendChild(popup);
  let closed = 0;
  const stop = dismissOn(
    () => popup,
    () => closed++,
  );
  return { inside, closed: () => closed, stop };
}

test('a click inside the popup keeps it open, and a click outside closes it', () => {
  const p = popupIn(document.body);
  p.inside.click();
  expect(p.closed()).toBe(0);
  document.body.click();
  expect(p.closed()).toBe(1);
  p.stop();
});

// Inside the overlay's shadow root a click's target is the shadow host; asking the target whether it
// is inside the popup says no for every click, so that check alone would close the popup on clicks inside it.
test('inside a shadow root, a click inside the popup still keeps it open', () => {
  const host = document.body.appendChild(document.createElement('div'));
  const p = popupIn(host.attachShadow({ mode: 'open' }));
  p.inside.click();
  expect(p.closed()).toBe(0);
  p.stop();
});

test('Escape closes it and goes no further', () => {
  const p = popupIn(document.body);
  let reachedPage = false;
  document.body.addEventListener('keydown', () => (reachedPage = true), { once: true });
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(p.closed()).toBe(1);
  expect(reachedPage).toBe(false);
  p.stop();
});
