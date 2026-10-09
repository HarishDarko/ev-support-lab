// Number formatting for costs, times and token counts. Plain functions so tests can pin the output.

/** USD to the precision that matters: a call costs fractions of a cent, a whole run a few cents. */
export function formatUsd(amount: number): string {
  if (amount === 0) return "$0.00";
  return `$${amount.toFixed(amount < 0.01 ? 4 : 3)}`;
}

/** USD for the top strip: whole cents, and "<$0.01" while a run has spent less than half a cent. */
export function formatUsdShort(amount: number): string {
  if (amount === 0) return "$0.00";
  return amount < 0.005 ? "<$0.01" : `$${amount.toFixed(2)}`;
}

export function formatSeconds(ms: number): string {
  if (ms < 100) return "<0.1 s";
  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatTokens(tokens: { input: number; output: number }): string {
  return `${tokens.input.toLocaleString("en-US")} in · ${tokens.output.toLocaleString("en-US")} out`;
}
