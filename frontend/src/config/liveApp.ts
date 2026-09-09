export const LIVE_APP_ORIGIN = "https://expenssnap.netlify.app";

export function liveAppUrl(path = "/") {
  return new URL(path, LIVE_APP_ORIGIN).toString();
}
