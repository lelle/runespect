import { test, expect, vi } from 'vitest';
import { mount, flushSync } from 'svelte';
import { Split } from '@runespect/ui/internal';

// The divider between the two panes of the panel, by pointer and by keyboard.

function split() {
  const target = document.body.appendChild(document.createElement('div'));
  const props = $state({ pct: 45, left: (() => {}) as any, right: (() => {}) as any });
  mount(Split, { target, props });
  flushSync();
  const separator = target.querySelector('[role="separator"]') as HTMLElement;
  return { props, separator };
}

// jsdom lays nothing out, so the split's box is set by the test: 200 px wide from the left edge.
test('a drag puts the divider where the pointer is, and a release ends it', () => {
  const rect = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue({ left: 0, width: 200 } as DOMRect);
  try {
    const { props, separator } = split();
    separator.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 90 }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 120 }));
    flushSync();
    expect(props.pct).toBe(60);

    window.dispatchEvent(new MouseEvent('pointerup'));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 40 }));
    flushSync();
    expect(props.pct).toBe(60);
  } finally {
    rect.mockRestore();
  }
});

test('Home and End put the divider at its ends, and other keys are left to the page', () => {
  const { props, separator } = split();
  const press = (key: string) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    separator.dispatchEvent(e);
    flushSync();
    return e.defaultPrevented;
  };

  expect(press('Home')).toBe(true);
  expect(props.pct).toBe(20);
  expect(press('End')).toBe(true);
  expect(props.pct).toBe(80);
  expect(press('Tab')).toBe(false);
  expect(props.pct).toBe(80);
});

// The overlay stacks its panes: the divider runs across, and the pointer and keys go up and down.
test('a vertical split follows the pointer down, and the up and down arrow keys', () => {
  const rect = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue({ top: 0, height: 400, left: 0, width: 200 } as DOMRect);
  try {
    const target = document.body.appendChild(document.createElement('div'));
    const props = $state({
      pct: 45,
      direction: 'vertical' as const,
      left: (() => {}) as any,
      right: (() => {}) as any,
    });
    mount(Split, { target, props });
    flushSync();
    const separator = target.querySelector('[role="separator"]') as HTMLElement;
    expect(separator.getAttribute('aria-orientation')).toBe('horizontal');

    separator.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: 100 }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientY: 240 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    flushSync();
    expect(props.pct).toBe(60);

    separator.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    flushSync();
    expect(props.pct).toBe(64);
  } finally {
    rect.mockRestore();
  }
});
