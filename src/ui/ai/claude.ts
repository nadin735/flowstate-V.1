/**
 * AI through the viewer's own Claude account when FLOWSTATE runs as a published
 * claude.ai artifact (the `sample` capability). No API key is involved; each call
 * asks the viewer for consent the first time. Absent everywhere else.
 */
type SampleFn = ((input: string, opts?: Record<string, unknown>) => Promise<{ text: string }>) & {
  json: <T>(input: string, opts?: Record<string, unknown>) => Promise<T>;
  limits: () => Promise<{ images?: { mediaTypes: string[] } }>;
};

let samplePromise: Promise<SampleFn | null> | null = null;

export function claudeSample(): Promise<SampleFn | null> {
  if (!samplePromise) {
    const c = (globalThis as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
    samplePromise = c?.use ? (c.use("sample") as Promise<SampleFn | null>).catch(() => null) : Promise.resolve(null);
  }
  return samplePromise;
}

/** Maps a sample error code to a short user-facing explanation. */
export function sampleErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code;
  switch (code) {
    case "not_granted":
      return "Access to Claude was not allowed for this page.";
    case "sampling_disabled":
      return "Claude is not available for this account.";
    case "rate_limited":
      return "Too many requests or usage limit reached — try again later.";
    case "session_expired":
      return "Please sign in to claude.ai again.";
    case "invalid_json":
      return "Claude's answer could not be read as data.";
    case "images_unavailable":
      return "Images cannot be sent to Claude from this view.";
    case "cancelled":
      return "Cancelled.";
    default:
      return (e as { message?: string })?.message || "Claude could not be reached.";
  }
}
