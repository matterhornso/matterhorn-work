/** @jsxImportSource react */
import { useEffect, useId, useRef, useState } from "react";
import { takeAccountOutcome } from "../../../app/lib/account-outcome";
import { accountClientState } from "../../../app/lib/account-client-state";

export function AccountOutcomeNotice({ scope, className }: { scope: string; className?: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const loadedScope = useRef<string | null>(null);
  const id = useId();
  useEffect(() => {
    // Do not consume twice during React's development effect replay.
    if (loadedScope.current !== scope) {
      loadedScope.current = scope;
      setMessage(takeAccountOutcome());
    }
    return accountClientState.register(`account-outcome:${id}`, () => setMessage(null));
  }, [id, scope]);
  return message ? <div className={className} role="status" aria-live="polite">{message}</div> : null;
}
