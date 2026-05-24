// Recognise known shapes of docling-serve / Docling / upstream-library
// failure modes in raw error strings, and append a one-line actionable
// hint to the message.
//
// Why this exists: the plugin's failure toast historically surfaces the
// server's verbatim error ("HTTP 500: Cannot convert a MPS Tensor to
// float64 dtype…"). For known patterns we can do better — append a
// short hint pointing at the workaround, so the user doesn't have to
// search the README to recover. The README still owns the long-form
// explanation; this module just points there.
//
// Patterns are evaluated in order. Each matching pattern appends its
// hint once. The function is pure and lives outside convert.ts so it
// can be unit-tested without the Zotero global.

interface KnownIssue {
  /** Short identifier — surfaced in Zotero.debug logs but not the toast. */
  id: string;
  /**
   * Predicate. A RegExp is cheapest; for multi-token AND-matching where
   * order varies, prefer a function (see the MPS entry below).
   */
  matches: (message: string) => boolean;
  /** One-line hint appended after a separator. Keep this short. */
  hint: string;
}

// Order matters only insofar as a single match emits a single hint; if a
// caller ever wants multiple hints from one message, they'll accumulate
// in the order declared here.
export const KNOWN_SERVER_ISSUES: ReadonlyArray<KnownIssue> = [
  {
    id: "mps-float64",
    // RT-DETRv2 in transformers hard-codes a float64 tensor; PyTorch's
    // MPS backend can't represent float64 on Apple Silicon. The two
    // tokens can appear in either order across versions, so match each
    // independently rather than as a fixed phrase.
    matches: (m) => /\bMPS\b/.test(m) && /\bfloat64\b/i.test(m),
    hint: "Apple Silicon MPS bug — restart docling-serve with PYTORCH_ENABLE_MPS_FALLBACK=1 (see README → Troubleshooting).",
  },
];

/**
 * Append known-issue hint(s) to a server error message. If no pattern
 * matches, returns the message unchanged. Multiple matching patterns
 * each append their hint, separated by " · ".
 *
 * Examples:
 *
 *   enrichServerError("HTTP 500: Cannot convert a MPS Tensor to float64 dtype")
 *     → "HTTP 500: Cannot convert a MPS Tensor to float64 dtype
 *        · Apple Silicon MPS bug — restart docling-serve with
 *          PYTORCH_ENABLE_MPS_FALLBACK=1 (see README → Troubleshooting)."
 *
 *   enrichServerError("Server not reachable")
 *     → "Server not reachable"   (unchanged — no known issue matched)
 */
export function enrichServerError(message: string): string {
  if (!message) return message;
  const hints: string[] = [];
  for (const issue of KNOWN_SERVER_ISSUES) {
    try {
      if (issue.matches(message)) hints.push(issue.hint);
    } catch {
      // A broken predicate must never break error surfacing.
    }
  }
  if (hints.length === 0) return message;
  return `${message}\n· ${hints.join("\n· ")}`;
}
