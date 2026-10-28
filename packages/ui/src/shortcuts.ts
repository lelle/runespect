// Keyboard-shortcut helpers. Pure so the "is the user typing?" guard is unit-testable — the
// panel uses it to avoid hijacking keys (e.g. "/") while focus is in a text field/editable element.

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable ||
    el.contentEditable === 'true'
  );
}
