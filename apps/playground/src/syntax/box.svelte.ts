// A reactive class declared in a module of its own, for components that import it.
export class Box {
  value = $state(1);
  double = $derived(this.value * 2);
}
