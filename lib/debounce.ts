/**
 * Delays calling `fn` until `wait` ms after the most recent call, cancelling
 * any call still pending — the shape every "wait for the typing to pause"
 * control in the app needs (search-as-you-type, live previews).
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  wait: number
): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
