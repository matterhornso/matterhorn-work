/** @jsxImportSource react */
import type { MatterhornAgentRunReceipt } from "@matterhorn-work/types/guarded-agent-runtime";

function receiptDuration(receipt: MatterhornAgentRunReceipt): string {
  const durationMs = receipt.responseDurationMs ?? 0;
  if (durationMs < 1_000) return `${durationMs}ms`;
  return `${(durationMs / 1_000).toFixed(durationMs < 10_000 ? 1 : 0)}s`;
}

function receiptToolLabel(tool: MatterhornAgentRunReceipt["tools"][number]): string {
  return [
    `${tool.name} · ${tool.outcome}`,
    `${tool.latencyMs}ms`,
    tool.source ? `source ${tool.source}` : null,
    tool.freshness ? `freshness ${tool.freshness}` : null,
  ].filter(Boolean).join(" · ");
}

function selectedContextLabel(receipt: MatterhornAgentRunReceipt): string | null {
  if (!receipt.context) return null;
  const entries = [
    receipt.context.chatFiles > 0 ? `${receipt.context.chatFiles} chat file${receipt.context.chatFiles === 1 ? "" : "s"}` : null,
    receipt.context.coworkerFiles > 0
      ? `${receipt.context.coworkerFiles} coworker file${receipt.context.coworkerFiles === 1 ? "" : "s"}`
      : null,
    receipt.context.savedMemories > 0
      ? `${receipt.context.savedMemories} saved memor${receipt.context.savedMemories === 1 ? "y" : "ies"}`
      : null,
  ].filter((entry): entry is string => Boolean(entry));
  return entries.length > 0 ? entries.join(" · ") : "No files or saved memories";
}

export function AgentRunReceiptDisclosure({ receipt }: { receipt: MatterhornAgentRunReceipt }) {
  const totalTokens = receipt.usage.inputTokens + receipt.usage.outputTokens + receipt.usage.reasoningTokens;
  const capabilityDenials = receipt.capabilities.filter((decision) => decision.decision === "denied").length;
  const contextLabel = selectedContextLabel(receipt);
  const trainingLabel = receipt.provider.trainingUse === "none"
    ? "No training"
    : receipt.provider.trainingUse === "opt_in_only"
      ? "Training only if provider account opts in"
      : "Training policy unverified";
  const retentionLabel = receipt.provider.retentionDays === null
    ? receipt.provider.privacyStatus === "local_processing" ? "Local processing" : "Retention period not verified"
    : `${receipt.provider.retentionDays}-day provider retention`;
  const status = receipt.status === "success"
    ? "Completed"
    : receipt.status === "partial"
      ? "Partially completed"
      : receipt.status === "cancelled"
        ? "Cancelled"
        : "Failed";
  return (
    <details className="mt-3 rounded-lg border border-dls-border bg-dls-surface/45 text-xs text-dls-secondary">
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-dls-text/25">
        <span className="font-medium text-dls-text">Run receipt</span>
        <span className="flex flex-wrap justify-end gap-x-3 gap-y-1 tabular-nums">
          <span>{status}</span>
          <span>{receiptDuration(receipt)}</span>
          <span>{totalTokens.toLocaleString()} tokens</span>
          <span>{receipt.tools.length} tool{receipt.tools.length === 1 ? "" : "s"}</span>
        </span>
      </summary>
      <div className="grid gap-3 border-t border-dls-border px-3 py-3 sm:grid-cols-2">
        <div>
          <div className="font-medium text-dls-text">Privacy</div>
          <div className="mt-1 leading-5">
            {receipt.provider.name || receipt.provider.id}/{receipt.provider.modelId} · {receipt.privacy.mode.replaceAll("_", " ")}
            {receipt.privacy.requestHash ? ` · request proof ${receipt.privacy.requestHash.slice(0, 12)}…` : ""}
            <br />
            {receipt.privacy.dataLeavesMatterhorn ? "Data left Matterhorn" : "Processed inside Matterhorn"}
            {receipt.privacy.consent === "single_request" ? " · one-request consent" : ""}
            <br />
            {trainingLabel} · {retentionLabel}
            {receipt.privacy.dataCategories.length > 0 ? (
              <>
                <br />
                Sent: {receipt.privacy.dataCategories.join(", ")}
                {receipt.privacy.redactionCount > 0 ? ` · ${receipt.privacy.redactionCount} redacted` : ""}
              </>
            ) : null}
            {contextLabel ? (
              <>
                <br />
                Used for this run: {contextLabel}
              </>
            ) : null}
            {receipt.memory.readIds.length > 0 || receipt.memory.writtenIds.length > 0 ? (
              <>
                <br />
                Memory: {receipt.memory.readIds.length} read · {receipt.memory.writtenIds.length} written
              </>
            ) : null}
            {receipt.provider.policyUrl ? (
              <>
                <br />
                <a
                  href={receipt.provider.policyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-dls-border underline-offset-2 hover:text-dls-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dls-text/25"
                >
                  Provider privacy policy
                </a>
              </>
            ) : null}
          </div>
        </div>
        <div>
          <div className="font-medium text-dls-text">Usage</div>
          <div className="mt-1 leading-5 tabular-nums">
            {receipt.usage.inputTokens.toLocaleString()} input · {receipt.usage.outputTokens.toLocaleString()} output
            <br />
            {receipt.usage.reasoningTokens.toLocaleString()} reasoning · {receipt.usage.cacheReadTokens.toLocaleString()} cache reads
            {receipt.usage.cacheWriteTokens > 0 ? ` · ${receipt.usage.cacheWriteTokens.toLocaleString()} cache writes` : ""}
            <br />
            Estimated cost: ${receipt.usage.estimatedCostUsd.toFixed(4)}
            <br />
            Budget: {receipt.usage.toolCallBudget.reads} reads · {receipt.usage.toolCallBudget.preparesPerFamily} prepare · 0 submits
          </div>
        </div>
        <div>
          <div className="font-medium text-dls-text">Tools</div>
          <div className="mt-1 leading-5">
            {receipt.tools.length > 0
              ? receipt.tools.map(receiptToolLabel).join("; ")
              : "No crypto tools used."}
            {receipt.capabilities.length > 0 ? (
              <>
                <br />
                {receipt.capabilities.length} capability decision{receipt.capabilities.length === 1 ? "" : "s"}
                {capabilityDenials > 0 ? ` · ${capabilityDenials} denied` : " · none denied"}
              </>
            ) : null}
          </div>
        </div>
        <div>
          <div className="font-medium text-dls-text">Wallet review</div>
          <div className="mt-1 leading-5">
            {receipt.reviewedActions.length > 0
              ? receipt.reviewedActions.map((action) => (
                  <span key={action.intentHash} className="block break-all">
                    Intent {action.intentHash.slice(0, 12)}… · simulation {action.simulationReference.slice(0, 18)}…
                    {action.publicReceipt ? ` · receipt ${action.publicReceipt}` : " · not submitted"}
                  </span>
                ))
              : "No transaction prepared or submitted."}
          </div>
        </div>
      </div>
    </details>
  );
}
