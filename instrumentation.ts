/**
 * Runs once when the server starts, before it takes a request.
 *
 * Reading the config loads the shop's time zone into this process (see
 * `shopTimeZone()` in lib/utils.ts), so a route that formats a time before it
 * happens to read the config does not get the default zone on the first
 * request after a restart.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getConfig } = await import("@/lib/config");
  // A database that is not up yet leaves the default until the first read.
  await getConfig().catch((error) => console.error("Shop time zone not loaded:", error));
}
