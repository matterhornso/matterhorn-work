import type { ApprovalConfig, ApprovalRequest } from "./types.js";
import { shortId } from "./utils.js";

interface ApprovalResult {
  id: string;
  allowed: boolean;
  reason?: string;
}

interface PendingApproval {
  request: ApprovalRequest;
  resolve: (result: ApprovalResult) => void;
}

export class ApprovalService {
  private config: ApprovalConfig;
  private pending = new Map<string, PendingApproval>();

  constructor(config: ApprovalConfig) {
    this.config = config;
  }

  list(): ApprovalRequest[] {
    return Array.from(this.pending.values()).map((entry) => entry.request);
  }

  async requestApproval(
    input: Omit<ApprovalRequest, "id" | "createdAt">,
    signal?: AbortSignal,
  ): Promise<ApprovalResult> {
    if (signal?.aborted) {
      return { id: "cancelled", allowed: false, reason: "cancelled" };
    }
    if (this.config.mode === "auto") {
      return { id: "auto", allowed: true };
    }
    const id = shortId();
    const request: ApprovalRequest = {
      ...input,
      id,
      createdAt: Date.now(),
    };

    const result = await new Promise<ApprovalResult>((resolve) => {
      const settle = (result: ApprovalResult) => {
        if (!this.pending.delete(id)) return;
        clearTimeout(timeout);
        signal?.removeEventListener("abort", cancel);
        resolve(result);
      };
      const cancel = () => settle({ id, allowed: false, reason: "cancelled" });
      const timeout = setTimeout(() => {
        settle({ id, allowed: false, reason: "timeout" });
      }, this.config.timeoutMs);

      this.pending.set(id, { request, resolve: settle });
      signal?.addEventListener("abort", cancel, { once: true });
    });

    return result;
  }

  respond(id: string, reply: "allow" | "deny"): ApprovalResult | null {
    const pending = this.pending.get(id);
    if (!pending) return null;
    const result: ApprovalResult = {
      id,
      allowed: reply === "allow",
      reason: reply === "allow" ? undefined : "denied",
    };
    pending.resolve(result);
    return result;
  }
}
