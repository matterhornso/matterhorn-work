import { useCallback, useRef } from "react";
import { validatePrivacyConsentToken } from "../../../../../app/lib/agent-privacy-consent";

// Keep event callbacks distinct from the explicit consent path. The ref also
// gates duplicate clicks before React renders the pending/disabled state.
export function useComposerSubmission(dispatch: (consentToken?: string) => Promise<void>, scope = "composer") {
  const pending = useRef(new Set<string>());
  const submit = useCallback(async (consentToken?: string) => {
    if (pending.current.has(scope)) return;
    pending.current.add(scope);
    try {
      await dispatch(consentToken);
    } finally {
      pending.current.delete(scope);
    }
  }, [dispatch, scope]);

  const send = useCallback(() => submit(), [submit]);
  const sendWithConsent = useCallback(async (value: unknown) => {
    const token = validatePrivacyConsentToken(value);
    if (token === undefined) {
      throw new Error("Privacy approval is missing. Review privacy details and try again.");
    }
    await submit(token);
  }, [submit]);

  return { send, sendWithConsent };
}
