import type { Plugin } from "vite";

// Cloudflare Web Analytics: a cookieless page-view beacon. The token is public (it names the site, it does not
// authorise anything), so it belongs in the page. Only the production build gets the tag, so dev, tests and the
// local server never call Cloudflare. The CSP in public/_headers already allows the beacon script and its endpoint.
export const CF_BEACON_TOKEN = "75e77520a4c54b15af8563a009dc8444";

export const beaconTag = (token: string) =>
  `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${token}"}'></script>`;

export function cloudflareBeacon(token = CF_BEACON_TOKEN): Plugin {
  return {
    name: "cloudflare-web-analytics",
    apply: "build",
    transformIndexHtml: { order: "post", handler: (html) => html.replace("</body>", `${beaconTag(token)}</body>`) },
  };
}
