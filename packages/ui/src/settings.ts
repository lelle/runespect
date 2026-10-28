// Rows in the settings dropdown. The host owns each value (usually a persisted $state) and updates
// it in onChange; <SettingsMenu> just presents the rows. Mirrors the host-owns-state split of
// <ContextMenu>/MenuItem. A toggle renders a checkbox; a select renders a <select> of options.
export interface SettingToggle {
  kind?: 'toggle';
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}
interface SettingSelect {
  kind: 'select';
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}
export type SettingItem = SettingToggle | SettingSelect;
