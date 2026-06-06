/**
 * Simple natural language intent parser for job creation.
 * Patterns: "{action} {token} {target} {frequency}"
 * No LLM dependency — pure regex for speed and predictability.
 */

export interface JobIntent {
  name: string;
  type: "recurring" | "oneshot";
  action: { type: string; params: Record<string, unknown> };
  schedule: { intervalMs: number; description: string };
}

export function parseIntent(intent: string): { success: true; job: JobIntent } | { success: false; error: string } {
  const lower = intent.toLowerCase().trim();

  // Pattern: sweep {token} to {target} every {N} {unit}
  const sweepMatch = lower.match(/sweep\s+(\w+)\s+to\s+(\w+)(?:\s+every\s+(\d+)\s+(minute|hour|day|days|hours|minutes))?/);
  if (sweepMatch) {
    const [, token, target, num, unit] = sweepMatch;
    const interval = num ? Number(num) : 1;
    const unitMs = unit?.startsWith("minute") ? 60000 : unit?.startsWith("hour") ? 3600000 : 86400000;
    return {
      success: true,
      job: {
        name: `Sweep ${token.toUpperCase()} to ${target}`,
        type: num ? "recurring" : "oneshot",
        action: { type: "aave_supply", params: { token: token.toUpperCase(), target } },
        schedule: { intervalMs: interval * unitMs, description: `Every ${interval} ${unit || "day"}` },
      },
    };
  }

  // Pattern: send {amount} {token} to {address} every {N} {unit}
  const sendMatch = lower.match(/send\s+([\d.]+)\s+(\w+)\s+to\s+(0x[a-f0-9]{40})(?:\s+every\s+(\d+)\s+(minute|hour|day|days|hours|minutes))?/);
  if (sendMatch) {
    const [, amount, token, address, num, unit] = sendMatch;
    const interval = num ? Number(num) : 1;
    const unitMs = unit?.startsWith("minute") ? 60000 : unit?.startsWith("hour") ? 3600000 : 86400000;
    return {
      success: true,
      job: {
        name: `Send ${amount} ${token.toUpperCase()}`,
        type: num ? "recurring" : "oneshot",
        action: { type: "transfer", params: { token: token.toUpperCase(), amount, to: address } },
        schedule: { intervalMs: interval * unitMs, description: `Every ${interval} ${unit || "day"}` },
      },
    };
  }

  // Pattern: bridge {amount} {token} to {chain} every {N} {unit}
  const bridgeMatch = lower.match(/bridge\s+([\d.]+)\s+(\w+)\s+to\s+(base|ethereum|arbitrum)(?:\s+every\s+(\d+)\s+(minute|hour|day|days|hours|minutes))?/);
  if (bridgeMatch) {
    const [, amount, token, chain, num, unit] = bridgeMatch;
    const interval = num ? Number(num) : 1;
    const unitMs = unit?.startsWith("minute") ? 60000 : unit?.startsWith("hour") ? 3600000 : 86400000;
    const chainMap: Record<string, number> = { base: 8453, ethereum: 1, arbitrum: 42161 };
    return {
      success: true,
      job: {
        name: `Bridge ${amount} ${token.toUpperCase()} to ${chain}`,
        type: num ? "recurring" : "oneshot",
        action: { type: "bridge", params: { token: token.toUpperCase(), amount, toChain: chainMap[chain] ?? 1 } },
        schedule: { intervalMs: interval * unitMs, description: `Every ${interval} ${unit || "day"}` },
      },
    };
  }

  // Pattern: bridge {amount} {token} to {chain} then deposit to {target} every {N} {unit}
  const multiHopMatch = lower.match(/bridge\s+([\d.]+)\s+(\w+)\s+to\s+(base|ethereum|arbitrum)\s+then\s+deposit\s+to\s+(\w+)(?:\s+every\s+(\d+)\s+(minute|hour|day|days|hours|minutes))?/);
  if (multiHopMatch) {
    const [, amount, token, chain, target, num, unit] = multiHopMatch;
    const interval = num ? Number(num) : 1;
    const unitMs = unit?.startsWith("minute") ? 60000 : unit?.startsWith("hour") ? 3600000 : 86400000;
    const chainMap: Record<string, number> = { base: 8453, ethereum: 1, arbitrum: 42161 };
    return {
      success: true,
      job: {
        name: `Bridge ${amount} ${token.toUpperCase()} to ${chain} then deposit`,
        type: num ? "recurring" : "oneshot",
        action: {
          type: "multi_hop",
          params: {
            steps: [
              { type: "bridge", params: { token: token.toUpperCase(), amount, toChain: chainMap[chain] ?? 1 } },
              { type: "aave_supply", params: { token: token.toUpperCase(), target } },
            ],
          },
        },
        schedule: { intervalMs: interval * unitMs, description: `Every ${interval} ${unit || "day"}` },
      },
    };
  }

  return { success: false, error: "Could not understand intent. Try: 'sweep USDC to Aave every day'" };
}
