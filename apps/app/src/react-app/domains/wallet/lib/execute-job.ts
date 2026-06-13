/**
 * Job execution engine — extracted from AgentWorkspace for global cron support.
 * Builds calldata server-side, queues via requestApproval() or requestBatchApproval().
 */
import type { Job } from "../hooks/useJobQueue";
import type { WalletStore } from "../state/wallet-store";
import { isWhitelistedAddress } from "../infra/whitelist";
import { sendJobCompleted } from "./notifications";

export interface JobExecutionContext {
  address: string;
  chainId: number;
  store: WalletStore;
  ethBalance: string | null;
  usdcBalance: string | null;
  logRun: (id: string, entry: Job["history"][number]) => void;
  pause: (id: string) => void;
  notificationsEnabled?: boolean;
}

function hasPositiveValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    return BigInt(value) > 0n;
  } catch {
    return Number(value) > 0;
  }
}

function classifyBuiltTxRisk({
  chainId,
  to,
  value,
  data,
}: {
  chainId: number;
  to: unknown;
  value: unknown;
  data: unknown;
}): "low" | "medium" | "high" {
  const target = typeof to === "string" ? to : "";
  const hasData = typeof data === "string" && data !== "" && data !== "0x";
  if (!/^0x[a-fA-F0-9]{40}$/.test(target)) return "high";
  if (hasData && !isWhitelistedAddress(chainId, target)) return "high";
  if (hasPositiveValue(value)) return "medium";
  return hasData ? "medium" : "low";
}

export async function executeJob(ctx: JobExecutionContext, job: Job): Promise<void> {
  const { address, chainId, store, ethBalance, usdcBalance, logRun, pause, notificationsEnabled } = ctx;
  let jobStatus: "approved" | "rejected" | "failed" = "approved";
  let txHash: string | undefined;

  try {
    let result;
    if (job.action.type === "aave_supply") {
      const token = String(job.action.params.token ?? "USDC").toUpperCase();
      const { tokensForChain } = await import("../../../infra/token-registry");
      const registry = tokensForChain(chainId);
      const meta = registry?.[token];
      if (!meta) throw new Error(`Token ${token} not supported`);

      let amount: string;
      if (token === "USDC" && usdcBalance) {
        amount = String(Math.round(Number(usdcBalance) * 10 ** meta.decimals));
      } else if ((token === "ETH" || token === "WETH") && ethBalance) {
        amount = String(Math.round(Number(ethBalance) * 10 ** meta.decimals));
      } else {
        amount = String(10 ** meta.decimals);
      }
      const res = await fetch("/api/aave/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId, asset: meta.address, amount, onBehalfOf: address }),
      });
      result = await res.json();
    } else if (job.action.type === "transfer") {
      const token = String(job.action.params.token ?? "USDC").toUpperCase();
      const amount = String(job.action.params.amount ?? "1");
      const to = String(job.action.params.to ?? address);
      const { tokensForChain } = await import("../../../infra/token-registry");
      const registry = tokensForChain(chainId);
      const meta = registry?.[token];
      const tokenAddr = meta ? meta.address : "native";
      const raw = meta ? String(Math.round(Number(amount) * 10 ** meta.decimals)) : String(Math.round(Number(amount) * 10 ** 18));
      const res = await fetch("/api/transfer/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId, token: tokenAddr, to, amount: raw }),
      });
      result = await res.json();
    } else if (job.action.type === "bridge") {
      const token = String(job.action.params.token ?? "USDC").toUpperCase();
      const amount = String(job.action.params.amount ?? "1");
      const toChain = Number(job.action.params.toChain ?? 1);
      const { tokensForChain } = await import("../../../infra/token-registry");
      const registry = tokensForChain(chainId);
      const meta = registry?.[token];
      const tokenAddr = meta ? meta.address : "native";
      const raw = meta ? String(Math.round(Number(amount) * 10 ** meta.decimals)) : String(Math.round(Number(amount) * 10 ** 18));
      const res = await fetch("/api/bridge/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId, destinationChainId: toChain, originToken: tokenAddr, amount: raw, recipient: address }),
      });
      const quoteJson = await res.json();
      if (!quoteJson.success) throw new Error(quoteJson.error ?? "Bridge quote failed");
      const depositRes = await fetch("/api/bridge/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId,
          destinationChainId: toChain,
          inputToken: tokenAddr,
          outputToken: tokenAddr,
          inputAmount: raw,
          outputAmount: quoteJson.receiveAmount,
          recipient: address,
          quoteTimestamp: Math.floor(Date.now() / 1000),
        }),
      });
      result = await depositRes.json();
    } else if (job.action.type === "multi_hop") {
      const steps = job.action.params.steps as Array<{ type: string; params: Record<string, unknown> }>;
      if (!Array.isArray(steps) || steps.length === 0) throw new Error("No steps in multi-hop job");

      const batchSteps: import("../state/wallet-store").BatchStepView[] = [];
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        let stepResult;
        if (step.type === "bridge") {
          const token = String(step.params.token ?? "USDC").toUpperCase();
          const amount = String(step.params.amount ?? "1");
          const toChain = Number(step.params.toChain ?? 1);
          const { tokensForChain } = await import("../../../infra/token-registry");
          const registry = tokensForChain(chainId);
          const meta = registry?.[token];
          const tokenAddr = meta ? meta.address : "native";
          const raw = meta ? String(Math.round(Number(amount) * 10 ** meta.decimals)) : String(Math.round(Number(amount) * 10 ** 18));
          const res = await fetch("/api/bridge/quote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chainId, destinationChainId: toChain, originToken: tokenAddr, amount: raw, recipient: address }),
          });
          const quoteJson = await res.json();
          if (!quoteJson.success) throw new Error(`Step ${i + 1} bridge quote failed: ${quoteJson.error}`);
          const depositRes = await fetch("/api/bridge/deposit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chainId,
              destinationChainId: toChain,
              inputToken: tokenAddr,
              outputToken: tokenAddr,
              inputAmount: raw,
              outputAmount: quoteJson.receiveAmount,
              recipient: address,
              quoteTimestamp: Math.floor(Date.now() / 1000),
            }),
          });
          stepResult = await depositRes.json();
        } else if (step.type === "aave_supply") {
          const token = String(step.params.token ?? "USDC").toUpperCase();
          const { tokensForChain } = await import("../../../infra/token-registry");
          const registry = tokensForChain(chainId);
          const meta = registry?.[token];
          if (!meta) throw new Error(`Token ${token} not supported in step ${i + 1}`);
          let amount: string;
          if (token === "USDC" && usdcBalance) {
            amount = String(Math.round(Number(usdcBalance) * 10 ** meta.decimals));
          } else if ((token === "ETH" || token === "WETH") && ethBalance) {
            amount = String(Math.round(Number(ethBalance) * 10 ** meta.decimals));
          } else {
            amount = String(10 ** meta.decimals);
          }
          const res = await fetch("/api/aave/deposit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chainId, asset: meta.address, amount, onBehalfOf: address }),
          });
          stepResult = await res.json();
        } else {
          throw new Error(`Unsupported step type: ${step.type}`);
        }
        if (!stepResult?.success) throw new Error(`Step ${i + 1} failed: ${stepResult?.error ?? "Unknown error"}`);
        batchSteps.push({
          id: `step-${i}`,
          type: step.type,
          description: step.type === "bridge" ? `Bridge to chain ${step.params.toChain ?? "?"}` : `Deposit to Aave`,
          to: stepResult.to,
          data: stepResult.data,
          value: stepResult.value,
        });
      }

      store.requestBatchApproval({
        batchId: `multi_hop_${job.id}`,
        steps: batchSteps,
        chainId,
        proposedBy: `agent_job:${job.id}`,
        riskLevel: batchSteps.some((step) =>
          classifyBuiltTxRisk({ chainId, to: step.to, value: step.value, data: step.data }) === "high"
        ) ? "high" : "medium",
      });

      logRun(job.id, { ts: Date.now(), status: "approved" });
      jobStatus = "approved";
      if (notificationsEnabled) {
        sendJobCompleted(job.name, jobStatus, txHash);
      }
      return;
    } else {
      throw new Error(`Unsupported action: ${job.action.type}`);
    }

    if (!result?.success) {
      throw new Error(result?.error ?? "Failed to build calldata");
    }

    store.requestApproval(
      result.to,
      result.value,
      result.data,
      chainId,
      `agent_job:${job.id}`,
      classifyBuiltTxRisk({ chainId, to: result.to, value: result.value, data: result.data }),
    );

    logRun(job.id, { ts: Date.now(), status: "approved" });
    jobStatus = "approved";
  } catch (err) {
    jobStatus = "failed";
    logRun(job.id, {
      ts: Date.now(),
      status: "failed",
      error: err instanceof Error ? err.message : "Unknown error",
    });
    pause(job.id);
  }

  if (notificationsEnabled) {
    sendJobCompleted(job.name, jobStatus, txHash);
  }
}
