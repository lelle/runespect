// jsdom's window.postMessage delivers with `event.source` null; a browser sets it to the sending
// window, and the agent only hears its own window. Same clone, same task boundary, real source.
if (typeof window !== 'undefined') {
  window.postMessage = ((message: unknown) => {
    const data = structuredClone(message);
    setTimeout(
      () => window.dispatchEvent(new MessageEvent('message', { data, source: window })),
      0,
    );
  }) as typeof window.postMessage;
}
