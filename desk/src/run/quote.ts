// Finding the quoted words in a ticket so they can be highlighted in place.
// The server accepts a quote ignoring case, spacing, curly quotes, dashes and arrows, and a quote shortened with an
// ellipsis only if every piece appears in order. This does the same search, but returns positions. Like the server,
// it drops quote marks, straight or curly, around each piece.

export interface Span {
  start: number;
  end: number;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The server reads an arrow and its plain form as the same (functions/_lib/checks.ts, normalize), and any dash as
// "-", so "->", an en or em dash followed by ">", and "→" are one arrow there. This does the same. Arrows are matched
// in the same pass as dashes, so the dash in "->" is never read on its own.
const DASH = "[-–—]";
const ARROW_RIGHT = `(?:${DASH}>|→)`;
const ARROW_LEFT = `(?:<${DASH}|←)`;
const arrowOrDash = (m: string) =>
  m === "→" || m.endsWith(">") ? ARROW_RIGHT : m === "←" || m.startsWith("<") ? ARROW_LEFT : DASH;

function patternFor(piece: string): RegExp {
  const source = escapeRegExp(piece)
    .replace(/\s+/g, "\\s+")
    .replace(/['‘’]/g, "['‘’]")
    .replace(/["“”]/g, '["“”]')
    .replace(/[-–—]>|→|<[-–—]|←|[-–—]/g, arrowOrDash);
  return new RegExp(source, "i");
}

/** Where `quote` sits in `text`, as one span per piece. Empty when it cannot be found. */
export function quoteSpans(text: string, quote: string | null | undefined): Span[] {
  if (!quote) return [];
  const pieces = quote
    .split(/\.\.\.|…/)
    .map((p) => p.replace(/^["'“”‘’.,\s]+|["'“”‘’.,\s]+$/g, ""))
    .filter(Boolean);
  const spans: Span[] = [];
  let from = 0;
  for (const piece of pieces) {
    const match = patternFor(piece).exec(text.slice(from));
    if (!match) return [];
    const start = from + match.index;
    spans.push({ start, end: start + match[0].length });
    from = start + match[0].length;
  }
  return spans;
}

export interface TextPart {
  text: string;
  quoted: boolean;
}

/** Splits `text` into plain and quoted parts, in order, for rendering. */
export function splitByQuote(text: string, quote: string | null | undefined): TextPart[] {
  const spans = quoteSpans(text, quote);
  if (!spans.length) return [{ text, quoted: false }];
  const parts: TextPart[] = [];
  let at = 0;
  for (const { start, end } of spans) {
    if (start > at) parts.push({ text: text.slice(at, start), quoted: false });
    parts.push({ text: text.slice(start, end), quoted: true });
    at = end;
  }
  if (at < text.length) parts.push({ text: text.slice(at), quoted: false });
  return parts;
}
