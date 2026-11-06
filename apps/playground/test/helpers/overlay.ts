import { mount, flushSync } from 'svelte';
import { Inspect } from '@runespect/ui/internal';
import App from '../../src/App.svelte';

/** The playground app and the in-page overlay over it, mounted; `root` is the overlay's shadow root. */
export function mountOverlay() {
  const app = document.createElement('div');
  const target = document.createElement('div');
  document.body.append(app, target);
  mount(App, { target: app });
  mount(Inspect, { target });
  flushSync();
  const root = target.querySelector('[data-testid="runespect-overlay-host"]')!.shadowRoot!;
  return { app, target, root };
}

/** Opens every component's values in the overlay, which starts with them all closed. */
export function openAllValues(root: ParentNode): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-values]')) {
    if (button.getAttribute('aria-expanded') === 'false') button.click();
  }
  flushSync();
}
