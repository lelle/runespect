// A line that says what just happened, for a few seconds: Open in editor cannot tell whether an
// editor opened, so it says what it asked and where to look.
export const NOTICE_MS = 3000;

export class Notice {
  text = $state<string | null>(null);
  #timer: ReturnType<typeof setTimeout> | undefined;
  #gone = false;

  show(text: string): void {
    // An answer that comes after the view is gone has nowhere to show.
    if (this.#gone) return;
    this.text = text;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => (this.text = null), NOTICE_MS);
  }

  dispose(): void {
    this.#gone = true;
    clearTimeout(this.#timer);
  }
}
