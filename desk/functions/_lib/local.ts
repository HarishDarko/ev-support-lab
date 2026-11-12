// Whether a request is to this machine: a local `wrangler pages dev`, or a test. A production request is to the
// site's own hostname (or its pages.dev one), so it can never match.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function isLocalUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}
