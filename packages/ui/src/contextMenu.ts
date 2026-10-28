// One entry in a right-click <ContextMenu>. Shared so hosts (Tree, Detail) can type their item
// lists without importing a type out of the component.
export interface MenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}
