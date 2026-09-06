/** @jsxImportSource react */
import type {
  MatterhornAgentPrivacyMode,
  MatterhornAgentRunReceipt,
} from "@matterhorn-work/types/guarded-agent-runtime";

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralForm}`;
}

function receiptDuration(receipt: MatterhornAgentRunReceipt): string {
  const durationMs = receipt.responseDurationMs;
  if (durationMs === null) return "Still running";
  if (durationMs < 1_000) return `${durationMs}ms`;
  return `${(durationMs / 1_000).toFixed(durationMs < 10_000 ? 1 : 0)}s`;
}

export function receiptStatusLabel(status: MatterhornAgentRunReceipt["status"]): string {
  if (status === "success") return "Completed";
  if (status === "partial") return "Partially completed";
  if (status === "cancelled") return "Cancelled";
  if (status === "pending") return "In progress";
  return "Failed";
}

export function privacyModeLabel(mode: MatterhornAgentPrivacyMode): string {
  if (mode === "public_research") return "Public research";
  if (mode === "private_workspace") return "Private workspace";
  return "Wallet request";
}

export function privacyCategoryLabel(category: string): string {
  if (category === "public") return "public information";
  if (category === "workspace_private") return "workspace information";
  if (category === "wallet_private") return "wallet-related information";
  if (category === "untrusted_external") return "app and market data";
  if (category === "secret") return "secret";
  return category.replaceAll("_", " ");
}

function providerTrainingLabel(receipt: MatterhornAgentRunReceipt): string {
  if (receipt.provider.trainingUse === "none") return "The provider does not use this request for training.";
  if (receipt.provider.trainingUse === "opt_in_only") {
    return "The provider may use requests for training only when its account explicitly opts in.";
  }
  return "The provider's training policy has not been verified.";
}

function providerRetentionLabel(receipt: MatterhornAgentRunReceipt): string {
  if (receipt.provider.retentionDays === 0) {
    return "The provider does not keep this request after processing.";
  }
  if (receipt.provider.retentionDays !== null) {
    return `The provider may keep request data for up to ${plural(receipt.provider.retentionDays, "day")}.`;
  }
  if (receipt.provider.privacyStatus === "local_processing") {
    return "The request was processed locally.";
  }
  return "The provider's data-storage period has not been verified.";
}

function selectedContextLabel(receipt: MatterhornAgentRunReceipt): string | null {
  if (!receipt.context) return null;
  const entries = [
    receipt.context.chatFiles > 0 ? plural(receipt.context.chatFiles, "chat file") : null,
    receipt.context.coworkerFiles > 0 ? plural(receipt.context.coworkerFiles, "coworker file") : null,
    receipt.context.savedMemories > 0 ? plural(receipt.context.savedMemories, "saved memory", "saved memories") : null,
  ].filter((entry): entry is string => entry !== null);
  return entries.length > 0 ? entries.join(" · ") : "No files or saved memories";
}

function focusedContextLabel(receipt: MatterhornAgentRunReceipt): string | null {
  const optimization = receipt.contextOptimization;
  if (!optimization || optimization.availableCryptoTools === 0) return null;
  const shortened = optimization.dataSectionsShortened + optimization.dataSectionsOmitted;
  return [
    `Matterhorn made ${plural(optimization.activeCryptoTools, "crypto action")} available for this answer instead of the full ${optimization.availableCryptoTools}.`,
    shortened > 0 ? `${plural(shortened, "older context section")} shortened or left out.` : null,
  ].filter((entry): entry is string => entry !== null).join(" ");
}

function friendlyIdentifier(value: string): string {
  return value
    .replace(/^matterhorn[._-]?/i, "")
    .replace(/[._:-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toolOutcomeLabel(outcome: MatterhornAgentRunReceipt["tools"][number]["outcome"]): string {
  if (outcome === "success") return "Completed";
  if (outcome === "timeout") return "Timed out";
  if (outcome === "denied") return "Blocked by safety rules";
  return "Did not complete";
}

function evidenceDeliveryLabel(tool: MatterhornAgentRunReceipt["tools"][number]): string | null {
  if (tool.evidence?.delivery === "certified_cache") return "Used recently checked public data";
  if (tool.evidence?.delivery === "live") return "Fetched from the app";
  return null;
}

function evidenceAgeLabel(tool: MatterhornAgentRunReceipt["tools"][number]): string | null {
  const ageMs = tool.evidence?.ageMs;
  if (ageMs === null || ageMs === undefined) return null;
  if (ageMs < 1_000) return "Observed just now";
  if (ageMs < 60_000) return `Observed ${Math.round(ageMs / 1_000)}s earlier`;
  return `Observed ${Math.round(ageMs / 60_000)}m earlier`;
}

function toolSummary(tool: MatterhornAgentRunReceipt["tools"][number]): string {
  const name = tool.source ? friendlyIdentifier(tool.source) : friendlyIdentifier(tool.name);
  return [
    `${name}: ${toolOutcomeLabel(tool.outcome)}`,
    evidenceDeliveryLabel(tool),
    evidenceAgeLabel(tool),
    tool.freshness ? `Data ${tool.freshness}` : null,
  ].filter((entry): entry is string => entry !== null).join(" · ");
}

function walletSummary(receipt: MatterhornAgentRunReceipt): string {
  if (receipt.reviewedActions.length === 0) return "No wallet action was prepared.";
  const submitted = receipt.reviewedActions.filter((action) => action.publicReceipt !== null).length;
  if (submitted === 0) {
    return `${plural(receipt.reviewedActions.length, "wallet action")} prepared for review. None was sent.`;
  }
  return `${plural(receipt.reviewedActions.length, "wallet action")} prepared · ${plural(submitted, "public receipt")} recorded.`;
}

export function AgentRunReceiptDisclosure({ receipt }: { receipt: MatterhornAgentRunReceipt }) {
  const totalTokens = receipt.usage.inputTokens + receipt.usage.outputTokens + receipt.usage.reasoningTokens;
  const capabilityDenials = receipt.capabilities.filter((decision) => decision.decision === "denied").length;
  const contextLabel = selectedContextLabel(receipt);
  const focusedContext = focusedContextLabel(receipt);
  const providerName = receipt.provider.name || receipt.provider.id;
  const secretWasBlocked = receipt.privacy.dataCategories.includes("secret");
  const sharedCategories = [
    ...new Set(
      receipt.privacy.dataCategories
        .filter((category) => category !== "secret")
        .map(privacyCategoryLabel),
    ),
  ];

  return (
    <details className="mt-3 rounded-lg border border-dls-border bg-dls-surface/45 text-xs text-dls-secondary">
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-dls-text/25">
        <span className="font-medium text-dls-text">Response details</span>
        <span className="flex flex-wrap justify-end gap-x-3 gap-y-1 tabular-nums">
          <span>{receiptStatusLabel(receipt.status)}</span>
          <span>{receiptDuration(receipt)}</span>
          <span>{plural(totalTokens, "token")}</span>
        </span>
      </summary>

      <div className="grid gap-x-6 gap-y-4 border-t border-dls-border px-3 py-3 sm:grid-cols-2">
        <section aria-labelledby={`receipt-${receipt.id}-privacy`}>
          <h3 id={`receipt-${receipt.id}-privacy`} className="font-medium text-dls-text">Privacy</h3>
          <div className="mt-1 space-y-1 leading-5">
            <p>{providerName} · {receipt.provider.modelId} · {privacyModeLabel(receipt.privacy.mode)}</p>
            <p>
              {receipt.privacy.dataLeavesMatterhorn
                ? `Matterhorn sent this request to ${providerName} to produce the answer.`
                : "This request stayed inside Matterhorn."}
            </p>
            <p>{providerTrainingLabel(receipt)} {providerRetentionLabel(receipt)}</p>
            {receipt.privacy.consent === "single_request" ? (
              <p>You approved sharing this exact request once. That approval cannot be reused.</p>
            ) : null}
            {sharedCategories.length > 0 ? <p>Shared: {sharedCategories.join(", ")}.</p> : null}
            {secretWasBlocked ? <p>Matterhorn blocked a secret before sharing this request.</p> : null}
            {receipt.privacy.redactionCount > 0 ? (
              <p>Matterhorn removed {plural(receipt.privacy.redactionCount, "sensitive item")} before sending.</p>
            ) : null}
            {contextLabel ? <p>Used for this answer: {contextLabel}.</p> : null}
            {receipt.memory.readIds.length > 0 || receipt.memory.writtenIds.length > 0 ? (
              <p>
                Saved memory: {plural(receipt.memory.readIds.length, "item")} used · {plural(receipt.memory.writtenIds.length, "item")} saved.
              </p>
            ) : null}
            {receipt.provider.policyUrl ? (
              <a
                href={receipt.provider.policyUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block underline decoration-dls-border underline-offset-2 hover:text-dls-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dls-text/25"
              >
                Read {providerName}'s privacy policy
              </a>
            ) : null}
          </div>
        </section>

        <section aria-labelledby={`receipt-${receipt.id}-usage`}>
          <h3 id={`receipt-${receipt.id}-usage`} className="font-medium text-dls-text">Time and usage</h3>
          <div className="mt-1 space-y-1 leading-5 tabular-nums">
            <p>{plural(receipt.usage.inputTokens, "input token")} · {plural(receipt.usage.outputTokens, "answer token")}</p>
            {receipt.usage.reasoningTokens > 0 ? <p>{plural(receipt.usage.reasoningTokens, "reasoning token")}</p> : null}
            <p>Response time: {receiptDuration(receipt)} · Estimated cost ${receipt.usage.estimatedCostUsd.toFixed(4)}</p>
            <p>
              Run limit: up to {plural(receipt.usage.toolCallBudget.reads, "app lookup")} and {plural(receipt.usage.toolCallBudget.preparesPerFamily, "wallet draft")} per action type. Sending transactions was disabled.
            </p>
            {focusedContext ? <p>{focusedContext}</p> : null}
          </div>
        </section>

        <section aria-labelledby={`receipt-${receipt.id}-apps`}>
          <h3 id={`receipt-${receipt.id}-apps`} className="font-medium text-dls-text">Apps and data</h3>
          <div className="mt-1 leading-5">
            {receipt.tools.length > 0 ? (
              <ul className="space-y-1">
                {receipt.tools.map((tool, index) => (
                  <li key={`${tool.name}-${index}`}>{toolSummary(tool)}</li>
                ))}
              </ul>
            ) : (
              <p>No crypto apps were used.</p>
            )}
          </div>
        </section>

        <section aria-labelledby={`receipt-${receipt.id}-wallet`}>
          <h3 id={`receipt-${receipt.id}-wallet`} className="font-medium text-dls-text">Wallet</h3>
          <div className="mt-1 space-y-1 leading-5">
            <p>{walletSummary(receipt)}</p>
            <p>Your connected wallet is the only place that can approve and send a transaction.</p>
          </div>
        </section>
      </div>

      <details className="border-t border-dls-border px-3 py-2">
        <summary className="min-h-8 cursor-pointer list-none font-medium text-dls-text outline-none focus-visible:ring-2 focus-visible:ring-dls-text/25">
          Technical details
        </summary>
        <div className="grid gap-x-6 gap-y-3 pb-1 pt-2 leading-5 sm:grid-cols-2">
          <div>
            <p className="font-medium text-dls-text">Request and storage</p>
            <p className="mt-1 break-all">Request proof: {receipt.privacy.requestHash ?? "Unavailable for this older response"}</p>
            <p className="break-all">Receipt proof: {receipt.integrity.recordHash}</p>
            <p>Cache: {plural(receipt.usage.cacheReadTokens, "token")} read · {plural(receipt.usage.cacheWriteTokens, "token")} written</p>
            {receipt.contextOptimization ? (
              <p>
                Context compiler: {receipt.contextOptimization.compilerVersion} · {receipt.contextOptimization.systemChars.toLocaleString()} characters · {receipt.contextOptimization.activeToolSchemaChars.toLocaleString()} of {receipt.contextOptimization.availableToolSchemaChars.toLocaleString()} crypto-tool schema characters
              </p>
            ) : null}
          </div>
          <div>
            <p className="font-medium text-dls-text">Safety checks</p>
            <p className="mt-1">
              {plural(receipt.capabilities.length, "authorization check")} · {capabilityDenials === 0 ? "none blocked" : `${plural(capabilityDenials, "check")} blocked`}
            </p>
            {receipt.capabilities.length > 0 ? (
              <ul className="mt-1 space-y-1">
                {receipt.capabilities.map((decision, index) => (
                  <li key={`${decision.callId}-${index}`} className="break-all">
                    {decision.toolName} · {decision.decision} · {decision.latencyMs}ms
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {receipt.tools.length > 0 ? (
            <div>
              <p className="font-medium text-dls-text">Exact app calls</p>
              <ul className="mt-1 space-y-1">
                {receipt.tools.map((tool, index) => (
                  <li key={`${tool.name}-technical-${index}`} className="break-all">
                    {tool.name} · {tool.access} · {tool.trust} · {tool.outcome} · {tool.latencyMs}ms
                    {tool.source ? ` · ${tool.source}` : ""}
                    {tool.freshness ? ` · ${tool.freshness}` : ""}
                    {tool.evidence ? ` · ${tool.evidence.delivery} · age ${tool.evidence.ageMs ?? "unknown"}ms · freshness limit ${tool.evidence.freshnessMaxAgeMs ?? "none"}ms` : ""}
                    {tool.evidence?.projectionHash ? ` · evidence proof ${tool.evidence.projectionHash}` : ""}
                    {tool.evidence?.observationHash ? ` · observation proof ${tool.evidence.observationHash}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {receipt.reviewedActions.length > 0 ? (
            <div>
              <p className="font-medium text-dls-text">Wallet-action proofs</p>
              <ul className="mt-1 space-y-1">
                {receipt.reviewedActions.map((action) => (
                  <li key={action.intentHash} className="break-all">
                    Intent {action.intentHash} · policy {action.policyHash} · simulation {action.simulationReference}
                    {action.publicReceipt ? ` · public receipt ${action.publicReceipt}` : " · not sent"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </details>
    </details>
  );
}
