import { loadSetting, saveSetting } from './persisted';

// The settings both views show, each under one key, so a choice in the panel is there in the
// overlay and back. Persists from an $effect, so make it while a component initialises.
export class Preferences {
  flash = $state(loadSetting('flash', true));
  expandValues = $state(loadSetting('expandValues', false));
  onlyStateful = $state(loadSetting('onlyStateful', false));

  constructor() {
    $effect(() => saveSetting('flash', this.flash));
    $effect(() => saveSetting('expandValues', this.expandValues));
    $effect(() => saveSetting('onlyStateful', this.onlyStateful));
  }
}
