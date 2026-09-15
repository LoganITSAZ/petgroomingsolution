/**
 * Delays calling `fn` until `wait` ms after the most recent call, cancelling
 * any call still pending — the shape every "wait for the typing to pause"
 * control in the app needs (search-as-you-type, live previews).
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  wait: number
): ((...args: Args) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  // Teardown needs this: a React effect that removes its listeners still
  // leaves the last keystroke's timer armed, and it fires against a form that
  // has since been unmounted.
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  return debounced;
}
