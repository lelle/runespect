// Escape or a click outside the popup closes it. Listens in the capture phase, so the popup hears
// Escape before the search and the tree do, and stops it there. Checks the click's composed path,
// because inside the overlay's shadow root a click's target is the shadow host. Returns the cleanup,
// so an $effect can return it.
export function dismissOn(popup: () => Element | null | undefined, close: () => void): () => void {
  const onClick = (e: MouseEvent): void => {
    const el = popup();
    if (el && !e.composedPath().includes(el)) close();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    close();
  };
  window.addEventListener('click', onClick, true);
  window.addEventListener('keydown', onKey, true);
  return () => {
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('keydown', onKey, true);
  };
}
