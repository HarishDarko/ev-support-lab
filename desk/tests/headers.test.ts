// The Pages _headers file: a Content-Security-Policy that allows the one inline script by its hash, frame
// protection, and long caching for the hashed files only. If the inline theme script in index.html changes, its
// hash here must change with it, or the browser blocks the script.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const headers = readFileSync(join(ROOT, "public", "_headers"), "utf8");
const html = readFileSync(join(ROOT, "index.html"), "utf8");

/** The header lines under one path rule, as name to value. */
function rule(path: string): Map<string, string> {
  const lines = headers.split("\n");
  const at = lines.indexOf(path);
  expect(at, `${path} rule`).toBeGreaterThan(-1);
  const out = new Map<string, string>();
  for (const line of lines.slice(at + 1)) {
    if (!line.startsWith("  ")) break;
    const colon = line.indexOf(":");
    out.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }
  return out;
}

describe("_headers", () => {
  const all = rule("/*");
  const csp = all.get("content-security-policy") ?? "";
  const directive = (name: string) =>
    csp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith(`${name} `));

  it("allows every inline script in index.html by its hash, and no other inline script", () => {
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
      (m) => `'sha256-${createHash("sha256").update(m[1]!).digest("base64")}'`,
    );
    expect(inline).toHaveLength(1);
    const scriptSrc = directive("script-src")!.split(" ").slice(1);
    expect(scriptSrc).toEqual(["'self'", ...inline]);
    expect(csp).not.toContain("unsafe-eval");
  });

  it("keeps everything else to this site and blocks framing", () => {
    expect(directive("default-src")).toBe("default-src 'self'");
    expect(directive("connect-src")).toBe("connect-src 'self'");
    expect(directive("object-src")).toBe("object-src 'none'");
    expect(directive("base-uri")).toBe("base-uri 'none'");
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(all.get("x-frame-options")).toBe("DENY");
  });

  it("caches only the hashed files for a year", () => {
    expect(rule("/assets/*").get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(all.has("cache-control")).toBe(false);
  });
});
