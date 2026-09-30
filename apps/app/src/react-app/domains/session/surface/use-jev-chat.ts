import { useCallback, useEffect, useRef, useState } from "react";
import { JEV_CONSENT_VERSION, JEV_MAX_TEXT_LENGTH, type JevAvailability, type JevResult } from "@matterhorn-work/types/jev";
import type { MatterhornServerClient } from "../../../../app/lib/matterhorn-server";
import type { ComposerDraft, ModelRef } from "../../../../app/types";

export function jevPreferenceKey(scope: string) { return `matterhorn.jev.${JEV_CONSENT_VERSION}.${scope}`; }
export function jevDraftText(draft: ComposerDraft): string | null {
  if (draft.mode !== "prompt" || draft.command || draft.attachments.length || draft.privacy?.mode === "private_workspace"
    || draft.privacy?.mode === "transaction" || draft.privacy?.attachmentIds?.length || draft.privacy?.memoryIds?.length
    || draft.privacy?.agentFileIds?.length || draft.privacy?.coworkerId
    || draft.parts.some((part) => part.type !== "text" && part.type !== "paste")) return null;
  // Match draftToParts and the server's exact text binding, not enriched workspace context.
  const text = draft.parts.flatMap((part) => part.type === "text" || part.type === "paste" ? [part.text] : []).join("\n");
  return text.trim() && text.length <= JEV_MAX_TEXT_LENGTH ? text : null;
}

export function useJevChat(input: {
  client: MatterhornServerClient; workspaceId: string; sessionId: string;
  model: ModelRef; privateMode: boolean;
}) {
  const [availability, setAvailability] = useState<JevAvailability | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [notice, setNotice] = useState("");
  const [classifying, setClassifying] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const optedIn = useRef(false);
  const cached = useRef<{ key: string; result: Extract<JevResult, { status: "classified" }> } | null>(null);
  useEffect(() => {
    let current = true;
    setAvailability(null); setEnabled(false); optedIn.current = false; cached.current = null; setNotice("");
    void input.client.getJevAvailability(input.workspaceId).then((status) => {
      if (!current) return;
      setAvailability(status);
      let remembered = false;
      try { remembered = localStorage.getItem(jevPreferenceKey(status.preferenceScope)) === "enabled"; } catch { /* session-only preference */ }
      optedIn.current = remembered;
      setEnabled(remembered);
    }).catch(() => { if (current) setNotice("Jev availability could not be checked. Regular chat still works."); });
    return () => { current = false; controller.current?.abort("chat_cancelled"); optedIn.current = false; };
  }, [input.client, input.workspaceId]);
  useEffect(() => {
    cached.current = null;
    setNotice("");
    return () => { controller.current?.abort("chat_cancelled"); };
  }, [input.sessionId, input.model.providerID, input.model.modelID, input.privateMode]);

  const change = useCallback((value: boolean) => {
    if (!availability || (value && (!availability.available || input.privateMode))) return;
    optedIn.current = value; setEnabled(value); cached.current = null; setNotice("");
    if (!value) controller.current?.abort("jev_disabled");
    try { localStorage.setItem(jevPreferenceKey(availability.preferenceScope), value ? "enabled" : "disabled"); }
    catch { setNotice("Choice applies now, but this browser could not save it for later."); }
  }, [availability, input.privateMode]);
  const cancel = useCallback(() => { controller.current?.abort("chat_cancelled"); }, []);
  const prepare = useCallback(async (draft: ComposerDraft): Promise<ComposerDraft> => {
    if (!optedIn.current) return draft;
    const text = jevDraftText(draft);
    if (!text || input.privateMode || ["venice", "ollama", "lmstudio", "local"].includes(input.model.providerID.toLowerCase())) {
      setNotice("Jev skipped: private, sensitive-context, command, or long message."); return draft;
    }
    if (!availability?.available) { setNotice("Jev is unavailable. Using your selected model without classification."); return draft; }
    const key = JSON.stringify([input.workspaceId, input.sessionId, input.model, text]);
    const previous = cached.current;
    if (previous?.key === key && previous.result.expiresAt > Date.now() + 10_000) return { ...draft, jevReceipt: previous.result.receipt };
    const pending = new AbortController(); controller.current = pending;
    setClassifying(true); setNotice("Jev is classifying this message…");
    try {
      const result = await input.client.classifyWithJev(input.workspaceId, input.sessionId, {
        text, model: { providerId: input.model.providerID, modelId: input.model.modelID }, consentVersion: JEV_CONSENT_VERSION,
      }, pending.signal);
      if (pending.signal.aborted || !optedIn.current) return draft;
      if (result.status !== "classified") { setNotice(result.reason); return draft; }
      cached.current = { key, result };
      setNotice(`Jev: ${result.topic.replaceAll("_", " ")} · ${result.task}. Your selected model answers.`);
      return { ...draft, jevReceipt: result.receipt };
    } catch {
      if (pending.signal.reason !== "chat_cancelled") setNotice("Jev did not finish. Using your selected model without classification.");
      return draft;
    } finally {
      setClassifying(false);
      if (controller.current === pending) controller.current = null;
      // Stopping or leaving the conversation must not dispatch a late model request.
      if (pending.signal.reason === "chat_cancelled") throw new Error("Message cancelled before model submission. Your draft is preserved.");
    }
  }, [availability, input.client, input.workspaceId, input.sessionId, input.model, input.privateMode]);
  return { availability, enabled, notice, classifying, change, cancel, prepare };
}
