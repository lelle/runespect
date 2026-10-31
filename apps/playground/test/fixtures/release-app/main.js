import { mount } from 'svelte';
import Counter from './Counter.svelte';
import { cart } from './cart.svelte.js';

mount(Counter, { target: document.body, props: { label: cart.items[0] } });
