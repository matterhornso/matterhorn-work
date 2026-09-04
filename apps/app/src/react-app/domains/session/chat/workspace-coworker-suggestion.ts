import type { MatterhornCoworkerTemplateId } from "@matterhorn-work/types";

export function suggestCoworkerTemplate(outcome: string): MatterhornCoworkerTemplateId {
  const normalized = outcome.toLowerCase();
  if (/\b(buy|sell|swap|send|transfer|stake|unstake|order|trade|bridge|deposit|withdraw|transaction)\b/.test(normalized)) {
    return "transaction_coordinator";
  }
  if (/\b(risk|monitor|watch|alert|exposure|liquidation|funding|volatile|volatility|health)\b/.test(normalized)) {
    return "risk_monitor";
  }
  if (/\b(balance|balances|holding|holdings|portfolio|treasury|reconcile|cash|inventory)\b/.test(normalized)) {
    return "treasury_coworker";
  }
  return "market_analyst";
}
