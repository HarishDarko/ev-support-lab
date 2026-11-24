/** A fallback reason is a short phrase ("AI quote not found in the ticket") or a full sentence, depending on who wrote
 * it. Close it as a sentence so whatever the UI says next never runs into it. */
export const asSentence = (text: string): string => {
  const t = text.trim();
  return /[.!?]["')\]]*$/.test(t) ? t : `${t}.`;
};
