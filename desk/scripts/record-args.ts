// The record script's arguments, apart from the script so a test can check them: `<url> [--pack <id>]`.
import { DEFAULT_PACK_ID } from "../shared/packs";

/**
 * The base URL and the industry. No --pack means EV charging, exactly as before. Anything else that looks like an
 * option (such as --pack=saas-support) is refused, so a typo never records, and pays for, the wrong industry.
 */
export function recordArgs(argv: readonly string[]): { baseUrl: string; pack: string } {
  const args = [...argv];
  const at = args.indexOf("--pack");
  let pack: string = DEFAULT_PACK_ID;
  if (at >= 0) {
    const value = args[at + 1];
    if (!value || value.startsWith("-")) throw new Error("--pack needs an industry id, e.g. --pack saas-support.");
    pack = value;
    args.splice(at, 2);
  }
  const unknown = args.find((a) => a.startsWith("-"));
  if (unknown) throw new Error(`Unknown option "${unknown}". Use: npm run record -- <url> [--pack <id>]`);
  if (args.length > 1) throw new Error(`Only one URL, please: got ${args.join(" ")}.`);
  return { baseUrl: (args[0] ?? "http://127.0.0.1:8788").replace(/\/+$/, ""), pack };
}

/** Where a pack's recording lives, under src/data/. EV keeps its original file name. */
export const recordingFile = (pack: string): string =>
  pack === DEFAULT_PACK_ID ? "recorded-run.json" : `recorded-run.${pack}.json`;
