/**
 * PDF.js reads text with `for await (… of readableStream)`. Safari (incl. iOS) does not
 * implement async iteration on ReadableStream yet, and the PDF.js legacy build does not
 * polyfill it, so text extraction failed there with "undefined is not a function".
 * This adds the missing iterator using the standard reader API.
 */
type IterableStream = ReadableStream & { [Symbol.asyncIterator]?: unknown; values?: unknown };

if (typeof ReadableStream !== "undefined") {
  const proto = ReadableStream.prototype as IterableStream;
  if (typeof proto[Symbol.asyncIterator] !== "function") {
    const values = async function* (this: ReadableStream, opts?: { preventCancel?: boolean }) {
      const reader = this.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) return;
          yield value;
        }
      } finally {
        if (!opts?.preventCancel) await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    };
    Object.defineProperty(proto, Symbol.asyncIterator, { value: values, writable: true, configurable: true });
    if (typeof proto.values !== "function") Object.defineProperty(proto, "values", { value: values, writable: true, configurable: true });
  }
}

export {};
