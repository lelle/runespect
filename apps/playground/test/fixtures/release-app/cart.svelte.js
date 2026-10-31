let items = $state(['apple']);

export const cart = {
  get items() {
    return items;
  },
};
