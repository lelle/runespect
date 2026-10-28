import { loadSetting, saveSetting } from './persisted';
import { resolveTheme, THEMES, type ResolvedTheme, type ThemeSetting } from './theme';

const systemMedia = (): MediaQueryList | null =>
  typeof matchMedia === 'undefined' ? null : matchMedia('(prefers-color-scheme: dark)');

// The view's theme: the choice, saved, and what it comes to while the choice is 'auto' and the OS
// switches. Persists from an $effect, so make it while a component initialises.
export class Theme {
  setting = $state(
    loadSetting<ThemeSetting>('theme', 'auto', (v) => THEMES.includes(v as ThemeSetting)),
  );
  #systemDark = $state(false);
  readonly resolved: ResolvedTheme = $derived(resolveTheme(this.setting, this.#systemDark));

  constructor({ media = systemMedia() }: { media?: MediaQueryList | null } = {}) {
    this.#systemDark = media?.matches ?? false;
    $effect(() => {
      if (!media) return;
      const on = (): boolean => (this.#systemDark = media.matches);
      media.addEventListener('change', on);
      return () => media.removeEventListener('change', on);
    });
    $effect(() => saveSetting('theme', this.setting));
  }
}
