import type { SerializedNode } from '@runespect/agent/protocol/internal';
import { searchMatches } from './search';

// The view's search: the query, which match is current, and the "n of m" it shows. A new query
// jumps to its first match; Enter and Shift+Enter cycle, wrapping. What a selected match does is
// the view's (`onSelect`): the panel highlights it in the page by message, the overlay directly.
export class Search {
  #query = $state('');
  #index = $state(0);
  #nodes: () => SerializedNode[];
  #onSelect: (id: number) => void;
  #matches = $derived.by(() => searchMatches(this.#nodes(), this.#query));
  readonly status: string = $derived.by(() => {
    if (!this.#query.trim()) return '';
    if (this.#matches.error) return 'bad regex';
    const m = this.#matches.ids.length;
    return `${m ? this.#index + 1 : 0} of ${m}`;
  });

  constructor(nodes: () => SerializedNode[], onSelect: (id: number) => void) {
    this.#nodes = nodes;
    this.#onSelect = onSelect;
  }

  get query(): string {
    return this.#query;
  }

  set(query: string): void {
    this.#query = query;
    this.#index = 0;
    this.#select();
  }

  key(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    const len = this.#matches.ids.length;
    if (!len) return;
    event.preventDefault();
    this.#index = (this.#index + (event.shiftKey ? -1 : 1) + len) % len;
    this.#select();
  }

  #select(): void {
    const id = this.#matches.ids[this.#index];
    if (id != null) this.#onSelect(id);
  }
}
