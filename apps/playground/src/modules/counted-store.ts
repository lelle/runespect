import { writable } from 'svelte/store';

const value = writable(7);
export const subscribers = { n: 0 };
export const counted = {
  subscribe(run: (value: number) => void) {
    subscribers.n++;
    const off = value.subscribe(run);
    return () => {
      subscribers.n--;
      off();
    };
  },
};
