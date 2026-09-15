import type { MatterhornBackendModelCatalogSnapshot, MatterhornProviderPrivacyPolicy } from "@matterhorn-work/types/backend-models";
import { useEffect, useReducer } from "react";
import { Button } from "@/components/ui/button";
import { isVerifiedPrivateModePolicy } from "../../session/private-model-mode";

export function PrivateModelSetup(props: {
  catalog?: Pick<MatterhornBackendModelCatalogSnapshot, "providers">;
  policy?: MatterhornProviderPrivacyPolicy;
  loading: boolean;
  failed: boolean;
  onRefresh: () => void;
  onChooseModel: () => void;
}) {
  const [, recheck] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    const expiresAt = Date.parse(props.policy?.verificationExpiresAt ?? "");
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return;
    const timer = window.setTimeout(recheck, Math.min(expiresAt - Date.now() + 1, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [props.policy?.verificationExpiresAt]);
  const provider = props.catalog?.providers.find((item) => item.id === "venice" && item.connected);
  const ready = !props.loading && !props.failed && provider?.modelIds.some((modelID) =>
    isVerifiedPrivateModePolicy(props.policy, { providerID: "venice", modelID }),
  );
  return (
    <section aria-label="Private model setup" className="space-y-3 border-b border-border pb-5">
      <h3 className="text-sm font-semibold">Private model</h3>
      <p className="max-w-[65ch] text-sm text-muted-foreground" role="status">
        {props.loading ? "Checking private models…"
          : props.failed ? "Private models could not be checked. Try again."
          : ready ? "A verified Venice model is available. Select it in your chat to turn Private on."
          : provider ? "Venice is connected, but its private-model verification is unavailable. Private stays off."
          : "Private needs a server-managed Venice connection. Ask your workspace operator to finish setup."}
      </p>
      <div className="flex flex-wrap gap-2">
        {ready ? <Button size="sm" onClick={props.onChooseModel}>Choose model</Button> : null}
        <Button size="sm" variant="outline" disabled={props.loading} onClick={props.onRefresh}>Check again</Button>
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer py-1 focus-visible:outline focus-visible:outline-2">Setup and privacy details</summary>
        <p className="mt-2 max-w-[65ch] leading-5">
          Your operator adds VENICE_API_KEY to the backend secret manager and restarts the managed runtime.
          Matterhorn must then verify the current private, tool-capable models. Never paste a key in chat.
          Private changes the model provider; it does not erase saved chats or make external tools private.
        </p>
      </details>
    </section>
  );
}
