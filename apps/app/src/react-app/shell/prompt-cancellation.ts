export function assertPromptActive(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error(JSON.stringify({ code: "write_denied", details: { reason: "cancelled" } }));
  }
}

// Preparation may finish after Stop. Reject promptly and never let that late
// result authorize dispatch. Do not use this around an already-sent request:
// the server must retain its identity and reconcile any actual provider usage.
export function prepareActivePrompt<T>(signal: AbortSignal | undefined, prepare: () => Promise<T>): Promise<T> {
  assertPromptActive(signal);
  if (!signal) return prepare();
  return new Promise((resolve, reject) => {
    const cancel = () => {
      try { assertPromptActive(signal); } catch (error) { reject(error); }
    };
    signal.addEventListener("abort", cancel, { once: true });
    Promise.resolve().then(() => {
      assertPromptActive(signal);
      return prepare();
    }).then((result) => {
      signal.removeEventListener("abort", cancel);
      try { assertPromptActive(signal); resolve(result); } catch (error) { reject(error); }
    }, (error) => {
      signal.removeEventListener("abort", cancel);
      reject(error);
    });
  });
}
