/** A fallback reason is a short phrase ("AI quote not found in the ticket") or a full sentence, depending on who wrote
 * it. Close it as a sentence so whatever the UI says next never runs into it. Blank or missing text gives "", so the
 * caller can tell there is no reason and say something else instead of a lone full stop. */
export const asSentence = (text: string | null | undefined): string => {
  const t = (text ?? "").trim();
  if (!t) return "";
  return /[.!?\u2026]["')\]\u201d\u2019]*$/.test(t) ? t : `${t}.`;
};
