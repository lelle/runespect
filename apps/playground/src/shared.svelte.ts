// State outside any component: nothing reports it, so a component that renders from it changes its
// children without a value of its own changing.
export const shared = $state({ counters: 1 });
