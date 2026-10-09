import { splitByQuote } from "../../run";
import "./QuotedText.css";

/** Ticket text with the words the AI quoted highlighted in place. Without a verified quote nothing is highlighted. */
export function QuotedText({
  text,
  quote,
  tone = "ai",
}: {
  text: string;
  quote: string | null;
  /** `rule` marks words a rule matched, which are not AI output. */
  tone?: "ai" | "rule";
}) {
  const parts = splitByQuote(text, quote);
  return (
    <>
      {parts.map((part, i) =>
        part.quoted ? (
          <mark key={i} className={tone === "ai" ? "quote" : "quote quote--rule"}>
            {part.text}
          </mark>
        ) : (
          part.text
        ),
      )}
    </>
  );
}
