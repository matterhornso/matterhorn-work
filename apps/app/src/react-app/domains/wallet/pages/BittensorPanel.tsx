/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  BrainCircuit,
  Database,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  Star,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  BittensorActionQuote,
  BittensorSubnetDetail,
  BittensorSubnetSummary,
  BittensorSubtensorSidecarHealth,
  BittensorWalletSnapshot,
} from "@matterhorn-work/types";

const WATCH_ADDRESS_KEY = "matterhorn:bittensor:watchAddress";
const FAVORITES_KEY = "matterhorn:bittensor:favorites";
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const CUSTOMER_DEMO_COMMANDS = {
  readiness: "matterhorn-work crypto readiness --json",
  readinessApi: "curl -sS \"$MATTERHORN_WORK_SERVER_URL/api/crypto/readiness\" -H \"Authorization: Bearer $MATTERHORN_WORK_TOKEN\"",
  smoke: "pnpm smoke:customer-ready-crypto",
  livePublicQa: "matterhorn-work crypto live-public-qa --output-dir /tmp/matterhorn-live-public-qa --fixture --strict --json",
  evidenceVerify: [
    "matterhorn-work crypto evidence-verify",
    "--bundle-json /tmp/matterhorn-market-customer-evidence.json",
    "--bundle-md /tmp/matterhorn-market-customer-evidence.md",
    "--strict",
    "--json",
  ].join(" "),
  packet: [
    "matterhorn-work crypto customer-packet",
    "--customer-ready-smoke /tmp/matterhorn-crypto-smoke.json",
    "--market-evidence-verify /tmp/matterhorn-market-evidence-verify.json",
    "--bittensor-evidence-verify /tmp/bittensor-evidence-verify.json",
    "--output /tmp/matterhorn-crypto-customer-packet.md",
    "--json-output /tmp/matterhorn-crypto-customer-packet.json",
    "--strict",
  ].join(" "),
} as const;
const CUSTOMER_DEMO_PROMPTS = [
  {
    id: "bittensor-image-subnets",
    label: "Bittensor discovery",
    betaVisible: true,
    prompt: "Use unified crypto chat. Find Bittensor subnets useful for image generation. Return customer-safe cards and explain which actions are read-only, which are preview-only, and which require external signing.",
  },
  {
    id: "bittensor-tao-wallet",
    label: "TAO wallet",
    betaVisible: true,
    prompt: "Use unified crypto chat. Show my TAO for the public SS58 address in context. If no public SS58 address is available, ask one concise question for a public coldkey only. Do not ask for seed phrases or private keys.",
  },
  {
    id: "hyperliquid-orderbook",
    label: "Hyperliquid read",
    betaVisible: false,
    prompt: "Use unified crypto chat. Show BTC Hyperliquid orderbook context and explain why Matterhorn is preview-only for orders: Can submit: No, Live submission: Off, External signer required.",
  },
  {
    id: "polymarket-compliance",
    label: "Polymarket compliance",
    betaVisible: false,
    prompt: "Use unified crypto chat. Find Polymarket markets about AI and show any compliance blocks without executable order terms.",
  },
  {
    id: "external-signer-preview",
    label: "Signer preview",
    betaVisible: true,
    prompt: "Use unified crypto chat. Explain the external-signer preview flow across Bittensor, Hyperliquid, and Polymarket. Make clear that Matterhorn prepares safe previews; my wallet/client decides whether anything is signed externally, and Matterhorn cannot sign, submit, custody, or broadcast.",
  },
] as const;
const BITTENSOR_BETA_MODE = (() => {
  const flag = typeof import.meta.env?.VITE_MATTERHORN_BITTENSOR_BETA === "string"
    ? import.meta.env.VITE_MATTERHORN_BITTENSOR_BETA.trim().toLowerCase()
    : "";
  return flag === "1" || flag === "true";
})();

type Tab = "overview" | "demo" | "subnets" | "wallet" | "actions";
type ActionType = BittensorActionQuote["action"];
type ReadinessCheck = {
  id?: string;
  label?: string;
  status?: "pass" | "warning" | "fail" | "skip";
  summary?: string;
};
type ReadinessReport = {
  ready?: boolean;
  checks?: ReadinessCheck[];
  warnings?: string[];
  blockers?: string[];
  nextActions?: string[];
  checkedAt?: string;
};

function readinessStateForVenue(checks: ReadinessCheck[], venue: string): string {
  const needle = venue.toLowerCase();
  const matches = checks.filter((check) => {
    const id = check.id?.toLowerCase() ?? "";
    const label = check.label?.toLowerCase() ?? "";
    return id.includes(needle) || label.includes(needle);
  });
  if (!matches.length) return "Unknown";
  if (matches.some((check) => check.status === "fail")) return "Blocked";
  if (matches.some((check) => check.status === "warning" || check.status === "skip")) return "Review";
  return "Ready";
}

function isValidSs58Address(address: string): boolean {
  const trimmed = address.trim();
  return trimmed.length >= 32 && trimmed.length <= 64 && BASE58_RE.test(trimmed);
}

function shortAddress(value: string | null | undefined): string {
  if (!value) return "Unavailable";
  return value.length > 14 ? `${value.slice(0, 6)}...${value.slice(-6)}` : value;
}

function formatNumber(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function readFavorites(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

function writeFavorites(favorites: number[]): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }
}

function contextValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function buildBittensorChatPrompt(prompt: string, context: Record<string, unknown>): string {
  const lines: string[] = [];
  const add = (label: string, value: unknown) => {
    const formatted = contextValue(value);
    if (formatted) lines.push(`- ${label}: ${formatted}`);
  };

  add("ss58Address", context.ss58Address);
  add("netuid", context.netuid);
  add("amountTao", context.amountTao);
  add("validatorHotkey", context.validatorHotkey);
  add("recipient", context.recipient);
  add("destination", context.destination);
  add("action", context.action);

  const subnet = context.subnet as Partial<BittensorSubnetSummary> | null | undefined;
  if (subnet && typeof subnet === "object") {
    add("subnet.netuid", subnet.netuid);
    add("subnet.name", subnet.name);
    add("subnet.category", subnet.category);
    add("subnet.source", subnet.source);
  }

  const wallet = context.wallet as Partial<BittensorWalletSnapshot> | null | undefined;
  if (wallet && typeof wallet === "object") {
    add("wallet.ss58Address", wallet.ss58Address);
    add("wallet.taoBalance", wallet.taoBalance);
    add("wallet.positions", Array.isArray(wallet.stakePositions) ? wallet.stakePositions.length : null);
    add("wallet.source", wallet.source);
    add("wallet.freshness", wallet.freshness);
  }

  const quote = context.quote as Partial<BittensorActionQuote> | null | undefined;
  if (quote && typeof quote === "object") {
    add("quote.action", quote.action);
    add("quote.netuid", quote.netuid);
    add("quote.amountTao", quote.amountTao);
    add("quote.expectedAlpha", quote.expectedAlpha);
    add("quote.feeTao", quote.feeTao);
    add("quote.slippageBps", quote.slippageBps);
    add("quote.source", quote.source);
  }

  return lines.length ? `${prompt}\n\nBittensor context:\n${lines.join("\n")}` : prompt;
}

export default function BittensorPanel() {
  const [tab, setTab] = useState<Tab>("overview");
  const [subnets, setSubnets] = useState<BittensorSubnetSummary[]>([]);
  const [selectedNetuid, setSelectedNetuid] = useState<number | null>(null);
  const [detail, setDetail] = useState<BittensorSubnetDetail | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watchAddress, setWatchAddress] = useState(() =>
    typeof window !== "undefined" ? window.localStorage.getItem(WATCH_ADDRESS_KEY) ?? "" : "",
  );
  const [wallet, setWallet] = useState<BittensorWalletSnapshot | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<number[]>(readFavorites);
  const [action, setAction] = useState<ActionType>("stake");
  const [actionNetuid, setActionNetuid] = useState("14");
  const [amountTao, setAmountTao] = useState("1");
  const [validatorHotkey, setValidatorHotkey] = useState("");
  const [recipient, setRecipient] = useState("");
  const [quote, setQuote] = useState<BittensorActionQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [sidecarStatus, setSidecarStatus] = useState<BittensorSubtensorSidecarHealth | null>(null);
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [cryptoReadiness, setCryptoReadiness] = useState<ReadinessReport | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [cryptoReadinessLoading, setCryptoReadinessLoading] = useState(false);
  const [copiedCustomerCommand, setCopiedCustomerCommand] = useState<string | null>(null);
  const [agentPromptReady, setAgentPromptReady] = useState(false);
  const [loadedSavedWatchAddress, setLoadedSavedWatchAddress] = useState(false);

  const loadSubnets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bittensor/subnets");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Failed to load subnets");
      const next = (json.subnets ?? []) as BittensorSubnetSummary[];
      setSubnets(next);
      setSelectedNetuid((current) => current ?? next[0]?.netuid ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Bittensor subnets");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSidecarStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/bittensor/sidecar/health");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Failed to load sidecar status");
      setSidecarStatus(json.health as BittensorSubtensorSidecarHealth);
    } catch {
      setSidecarStatus(null);
    }
  }, []);

  const loadReadiness = useCallback(async () => {
    setReadinessLoading(true);
    try {
      const res = await fetch("/api/bittensor/readiness");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Failed to load Bittensor readiness");
      setReadiness(json.report as ReadinessReport);
    } catch (err) {
      setReadiness({
        ready: false,
        checks: [{
          id: "readiness_api",
          label: "Readiness API",
          status: "fail",
          summary: err instanceof Error ? err.message : "Failed to load Bittensor readiness.",
        }],
        warnings: ["Readiness check could not run from the app."],
      });
    } finally {
      setReadinessLoading(false);
    }
  }, []);

  const loadCryptoReadiness = useCallback(async () => {
    setCryptoReadinessLoading(true);
    try {
      const res = await fetch("/api/crypto/readiness");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Failed to load crypto readiness");
      setCryptoReadiness((json.report ?? json) as ReadinessReport);
    } catch (err) {
      setCryptoReadiness({
        ready: false,
        checks: [{
          id: "crypto_readiness_api",
          label: "Crypto readiness API",
          status: "fail",
          summary: err instanceof Error ? err.message : "Failed to load unified crypto readiness.",
        }],
        warnings: ["Unified crypto readiness could not run from the app."],
      });
    } finally {
      setCryptoReadinessLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (netuid: number) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/bittensor/subnets/${netuid}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Failed to load subnet");
      setDetail(json.subnet as BittensorSubnetDetail);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadWallet = useCallback(async () => {
    const addr = watchAddress.trim();
    if (!addr) {
      setWallet(null);
      setWalletError(null);
      return;
    }
    if (!isValidSs58Address(addr)) {
      setWallet(null);
      setWalletError("Enter a valid SS58 public address.");
      return;
    }
    setWalletLoading(true);
    setWalletError(null);
    try {
      window.localStorage.setItem(WATCH_ADDRESS_KEY, addr);
      const res = await fetch(`/api/bittensor/wallet/${encodeURIComponent(addr)}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Failed to load wallet");
      setWallet(json.wallet as BittensorWalletSnapshot);
    } catch (err) {
      setWallet(null);
      setWalletError(err instanceof Error ? err.message : "Failed to load wallet");
    } finally {
      setWalletLoading(false);
    }
  }, [watchAddress]);

  useEffect(() => {
    loadSubnets();
  }, [loadSubnets]);

  useEffect(() => {
    void loadSidecarStatus();
    void loadReadiness();
    void loadCryptoReadiness();
  }, [loadCryptoReadiness, loadReadiness, loadSidecarStatus]);

  useEffect(() => {
    if (selectedNetuid !== null) loadDetail(selectedNetuid);
  }, [loadDetail, selectedNetuid]);

  useEffect(() => {
    if (loadedSavedWatchAddress) return;
    setLoadedSavedWatchAddress(true);
    if (watchAddress.trim()) void loadWallet();
  }, [loadWallet, loadedSavedWatchAddress, watchAddress]);

  const filteredSubnets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subnets;
    return subnets.filter((subnet) =>
      `${subnet.netuid} ${subnet.name} ${subnet.symbol} ${subnet.category} ${subnet.benefitSummary}`
        .toLowerCase()
        .includes(q),
    );
  }, [query, subnets]);

  const favoriteSubnets = useMemo(
    () => subnets.filter((subnet) => favorites.includes(subnet.netuid)),
    [favorites, subnets],
  );

  const recentSubnets = useMemo(
    () => [...subnets]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 4),
    [subnets],
  );
  const customerDemoPrompts = useMemo(
    () => CUSTOMER_DEMO_PROMPTS.filter((item) => !BITTENSOR_BETA_MODE || item.betaVisible),
    [],
  );

  const toggleFavorite = (netuid: number) => {
    setFavorites((current) => {
      const next = current.includes(netuid)
        ? current.filter((item) => item !== netuid)
        : [...current, netuid];
      writeFavorites(next);
      return next;
    });
  };

  const requestQuote = async () => {
    setQuoteLoading(true);
    setQuote(null);
    try {
      const res = await fetch("/api/bittensor/actions/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          netuid: action === "transfer" ? null : Number(actionNetuid),
          amountTao,
          validatorHotkey,
          recipient,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Failed to quote action");
      setQuote(json.quote as BittensorActionQuote);
    } catch (err) {
      setQuote({
        action,
        netuid: action === "transfer" ? null : Number(actionNetuid),
        amountTao: Number(amountTao) || null,
        expectedAlpha: null,
        feeTao: null,
        slippageBps: null,
        requiresExternalSignature: true,
        warnings: [err instanceof Error ? err.message : "Quote failed"],
      });
    } finally {
      setQuoteLoading(false);
    }
  };

  const refreshBittensor = () => {
    void loadSubnets();
    void loadSidecarStatus();
    void loadReadiness();
    void loadCryptoReadiness();
  };

  const sendToChat = async (prompt: string, context: Record<string, unknown>, options: { mode?: "bittensor" | "crypto"; source?: string } = {}) => {
    const mode = options.mode ?? "bittensor";
    const expandedPrompt = mode === "bittensor" ? buildBittensorChatPrompt(prompt, context) : prompt;
    window.dispatchEvent(new CustomEvent(mode === "crypto" ? "matterhorn:crypto-chat-handoff" : "matterhorn:bittensor-chat-handoff", {
      detail: {
        prompt: expandedPrompt,
        context,
        source: options.source ?? "bittensor-panel",
      },
    }));
    setAgentPromptReady(true);
    window.setTimeout(() => setAgentPromptReady(false), 2000);
  };

  const copyCustomerDemoCommand = async (kind: keyof typeof CUSTOMER_DEMO_COMMANDS) => {
    await navigator.clipboard?.writeText(CUSTOMER_DEMO_COMMANDS[kind]);
    setCopiedCustomerCommand(kind);
    window.setTimeout(() => setCopiedCustomerCommand(null), 2000);
  };

  const askAgentAboutSubnet = async (subnet: BittensorSubnetSummary) => {
    const prompt = `Use Bittensor chat mode. Explain subnet ${subnet.netuid} (${subnet.name}) in beginner language, then tell me how it could help my Matterhorn Work tasks. Include utility, risks, metagraph context, whether Matterhorn can directly invoke this subnet, and which actions require external Bittensor signing.`;
    await sendToChat(prompt, { netuid: subnet.netuid, subnet });
  };

  const askAgentAboutWallet = async () => {
    const address = watchAddress.trim();
    const prompt = wallet
      ? `Use Bittensor chat mode. Review this watch-only Bittensor wallet snapshot for ${address}. Explain TAO balance, subnet stake exposure, validator hotkeys, slippage risk, provider freshness, and safe next steps. Do not ask for seed phrases or private keys.`
      : `Use Bittensor chat mode. Help me inspect this Bittensor SS58 coldkey public address: ${address || "[paste address]"}. Show wallet positions, subnet exposure, validator hotkeys, and risks.`;
    await sendToChat(prompt, { ss58Address: address, wallet });
  };

  const askAgentAboutReadiness = async () => {
    const prompt = "Use Bittensor chat mode. Review the current Matterhorn Bittensor customer readiness status. Explain any failing or warning checks, what is safe to demo, and the next command or fix to run before a test customer session.";
    await sendToChat(prompt, { readiness });
  };

  const askAgentAboutCryptoReadiness = async () => {
    const prompt = "Use unified crypto chat. Review the current Matterhorn crypto customer readiness status across Bittensor, Hyperliquid, and Polymarket. Explain blockers, warnings, safe demo paths, and the next command to run. Do not ask for private keys, API secrets, raw signatures, signed payloads, or wallet exports.";
    await sendToChat(prompt, { cryptoReadiness }, { mode: "crypto", source: "crypto-readiness-panel" });
  };

  const askAgentForCustomerDemo = async (item: (typeof CUSTOMER_DEMO_PROMPTS)[number]) => {
    await sendToChat(item.prompt, {
      ss58Address: watchAddress.trim() || undefined,
      wallet,
      readiness,
      cryptoReadiness,
      sourcePrompt: item.id,
    }, { mode: "crypto", source: "crypto-customer-demo-checklist" });
  };

  const askAgentAboutQuote = async () => {
    if (!quote) return;
    const prompt = `Use Bittensor chat mode. Review this Bittensor ${quote.action} quote. Explain the consequence, netuid, amount, expected alpha, fee, slippage, warnings, and exactly what I must do in an external Bittensor-compatible signer before anything can be broadcast.`;
    await sendToChat(prompt, {
      action: quote.action,
      netuid: quote.netuid,
      amountTao: quote.amountTao,
      validatorHotkey,
      recipient,
      destination: recipient,
      quote,
    });
  };

  const readinessChecks = readiness?.checks ?? [];
  const readinessFailures = readinessChecks.filter((check) => check.status === "fail");
  const readinessNextAction = readiness?.nextActions?.find(Boolean) ?? null;
  const readinessState = readiness
    ? readiness.ready === true && readinessFailures.length === 0
      ? "Ready"
      : readinessFailures.length
        ? "Blocked"
        : "Review"
    : "Unknown";
  const cryptoReadinessChecks = cryptoReadiness?.checks ?? [];
  const cryptoReadinessFailures = cryptoReadinessChecks.filter((check) => check.status === "fail");
  const cryptoReadinessWarnings = cryptoReadinessChecks.filter((check) => check.status === "warning" || check.status === "skip");
  const cryptoReadinessBlocker = cryptoReadiness?.blockers?.find(Boolean) ?? null;
  const cryptoReadinessNextAction = cryptoReadiness?.nextActions?.find(Boolean) ?? null;
  const cryptoReadinessState = cryptoReadiness
    ? cryptoReadiness.ready === true && cryptoReadinessFailures.length === 0
      ? "Ready"
      : cryptoReadinessFailures.length
        ? "Blocked"
        : "Review"
    : "Unknown";
  const hyperliquidReadinessState = readinessStateForVenue(cryptoReadinessChecks, "hyperliquid");
  const polymarketReadinessState = readinessStateForVenue(cryptoReadinessChecks, "polymarket");

  return (
    <div className="flex h-full flex-col overflow-hidden bg-dls-sidebar animate-fade-in">
      <div className="border-b border-dls-border p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-sky-500/10">
              <BrainCircuit className="size-5 text-sky-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-dls-text">Bittensor</h2>
              <p className="text-xs text-dls-secondary">
                Finney mainnet · {sidecarStatus?.configured ? "sidecar ready" : "watch-only"}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-dls-secondary"
            onClick={refreshBittensor}
            disabled={loading}
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
        <div className="grid grid-cols-5 gap-1 rounded-lg bg-dls-surface p-1">
          {[
            { key: "overview" as const, label: "Overview" },
            { key: "demo" as const, label: "Demo" },
            { key: "subnets" as const, label: "Subnets" },
            { key: "wallet" as const, label: "Wallet" },
            { key: "actions" as const, label: "Actions" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              className={cn(
                "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                tab === item.key ? "bg-sky-500 text-white" : "text-dls-secondary hover:text-dls-text",
              )}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {error && (
          <Notice tone="warning" icon={<AlertTriangle className="size-4" />} title="Bittensor provider">
            {error}
          </Notice>
        )}

        {tab === "overview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Subnets" value={subnets.length ? String(subnets.length) : "—"} />
              <Metric label="Favorites" value={String(favorites.length)} />
              <Metric label="Source" value={subnets.some((s) => s.source === "tao.app") ? "Live" : "Fallback"} />
              <Metric
                label="Sidecar"
                value={sidecarStatus?.status === "healthy" ? "Healthy" : sidecarStatus?.status === "unreachable" ? "Unreachable" : "Off"}
              />
            </div>
            {sidecarStatus?.status === "unreachable" ? (
              <p className="text-xs leading-5 text-amber-300">{sidecarStatus.message}</p>
            ) : null}

            <Section title="Watched Wallet" icon={<Wallet className="size-4" />}>
              {watchAddress.trim() ? (
                <div className="space-y-2">
                  <div className="font-mono text-sm text-dls-text break-all">{watchAddress.trim()}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Metric label="TAO" value={formatNumber(wallet?.taoBalance)} compact />
                    <Metric label="Stake" value={formatNumber(wallet?.estimatedValueTao)} compact />
                  </div>
                  {wallet?.providerStatus === "provider_unavailable" && (
                    <p className="text-xs text-amber-300">{wallet.message ?? "Portfolio provider unavailable."}</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-dls-secondary">No Bittensor watch address saved.</p>
              )}
            </Section>

            <Section title="Favorites" icon={<Star className="size-4" />}>
              {favoriteSubnets.length ? (
                <div className="space-y-2">
                  {favoriteSubnets.map((subnet) => (
                    <SubnetRow
                      key={subnet.netuid}
                      subnet={subnet}
                      selected={selectedNetuid === subnet.netuid}
                      favorite
                      onSelect={() => {
                        setSelectedNetuid(subnet.netuid);
                        setTab("subnets");
                      }}
                      onFavorite={() => toggleFavorite(subnet.netuid)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-dls-secondary">No favorite subnets yet.</p>
              )}
            </Section>

            <Section title="Recent Subnets" icon={<Database className="size-4" />}>
              <div className="space-y-2">
                {recentSubnets.map((subnet) => (
                  <SubnetRow
                    key={subnet.netuid}
                    subnet={subnet}
                    selected={selectedNetuid === subnet.netuid}
                    favorite={favorites.includes(subnet.netuid)}
                    onSelect={() => {
                      setSelectedNetuid(subnet.netuid);
                      setTab("subnets");
                    }}
                    onFavorite={() => toggleFavorite(subnet.netuid)}
                  />
                ))}
              </div>
            </Section>
          </div>
        )}

        {tab === "demo" && (
          <div className="space-y-4">
            <Section title="Readiness" icon={<Shield className="size-4" />}>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Metric label={BITTENSOR_BETA_MODE ? "Bittensor Beta" : "Bittensor"} value={readinessState} compact />
                  <Metric label="Hyperliquid" value={hyperliquidReadinessState} compact />
                  <Metric label="Polymarket" value={polymarketReadinessState} compact />
                  <Metric label="Unified smoke" value={cryptoReadinessState} compact />
                </div>
                {BITTENSOR_BETA_MODE ? (
                  <p className="text-xs leading-5 text-sky-200">
                    Bittensor beta boundary: Bittensor is the customer-facing launch surface. Market previews are hidden in Bittensor beta mode and remain preview/R&amp;D only.
                  </p>
                ) : null}
                {cryptoReadinessBlocker ? (
                  <p className="text-xs leading-5 text-red-300">Blocker: {cryptoReadinessBlocker}</p>
                ) : cryptoReadinessFailures[0] ? (
                  <p className="text-xs leading-5 text-red-300">{cryptoReadinessFailures[0].label ?? "Crypto readiness"}: {cryptoReadinessFailures[0].summary ?? "Needs attention before customer demo."}</p>
                ) : cryptoReadinessWarnings[0] ? (
                  <p className="text-xs leading-5 text-amber-300">{cryptoReadinessWarnings[0].label ?? "Crypto readiness"}: {cryptoReadinessWarnings[0].summary ?? "Review before customer demo."}</p>
                ) : cryptoReadiness?.ready && readiness?.ready ? (
                  <p className="text-xs leading-5 text-emerald-300">Unified crypto readiness is green for Bittensor, Hyperliquid, and Polymarket read/preview demo flows.</p>
                ) : (
                  <p className="text-xs leading-5 text-dls-secondary">Refresh readiness before a test customer session.</p>
                )}
                {cryptoReadinessNextAction || readinessNextAction ? (
                  <p className="text-xs leading-5 text-sky-200">Next: {cryptoReadinessNextAction ?? readinessNextAction}</p>
                ) : null}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={refreshBittensor} disabled={readinessLoading || cryptoReadinessLoading}>
                    {readinessLoading || cryptoReadinessLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    Refresh
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={askAgentAboutReadiness} disabled={!readiness}>
                    <BrainCircuit className="size-3.5" />
                    Bittensor Chat
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={askAgentAboutCryptoReadiness} disabled={!cryptoReadiness}>
                    <BrainCircuit className="size-3.5" />
                    Crypto Chat
                  </Button>
                </div>
              </div>
            </Section>

            <Section title="Try prompts" icon={<BrainCircuit className="size-4" />}>
              <div className="grid gap-2">
                {customerDemoPrompts.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="rounded-xl border border-dls-border bg-dls-surface px-3 py-2.5 text-left transition-colors hover:border-sky-500/35 hover:bg-dls-hover"
                    onClick={() => void askAgentForCustomerDemo(item)}
                  >
                    <span className="block text-xs font-semibold text-dls-text">{item.label}</span>
                    <span className="mt-1 block break-words text-[11px] leading-5 text-dls-secondary">
                      {item.prompt}
                    </span>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Evidence" icon={<Database className="size-4" />}>
              <div className="space-y-3">
                <p className="text-xs leading-5 text-dls-secondary">
                  Copy customer-safe commands for smoke, live public QA, customer packet, and evidence verification.
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("smoke")}>
                    {copiedCustomerCommand === "smoke" ? "Copied" : "Smoke"}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("livePublicQa")}>
                    {copiedCustomerCommand === "livePublicQa" ? "Copied" : "Live public QA"}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("packet")}>
                    {copiedCustomerCommand === "packet" ? "Copied" : "Customer packet"}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => void copyCustomerDemoCommand("evidenceVerify")}>
                    {copiedCustomerCommand === "evidenceVerify" ? "Copied" : "Evidence verify"}
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button variant="ghost" size="sm" className="text-xs text-dls-secondary" onClick={() => void copyCustomerDemoCommand("readiness")}>
                    {copiedCustomerCommand === "readiness" ? "Copied" : "Readiness CLI"}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs text-dls-secondary" onClick={() => void copyCustomerDemoCommand("readinessApi")}>
                    {copiedCustomerCommand === "readinessApi" ? "Copied" : "Readiness API"}
                  </Button>
                </div>
              </div>
            </Section>

            <Section title="Safety" icon={<Shield className="size-4" />}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  "Non-custodial",
                  "Read/preview-only",
                  "Preview Only",
                  "External signer required",
                  "No market submit",
                ].map((item) => (
                  <div key={item} className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200">
                    {item}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-dls-secondary">
                Demo boundary: no seed phrases, private keys, API secrets, raw signatures, signed payloads, wallet exports, custody, or live Hyperliquid/Polymarket submission.
              </p>
              <p className="mt-2 text-xs leading-5 text-dls-secondary">
                Matterhorn prepares safe previews; your wallet/client decides whether anything is signed externally.
              </p>
              {BITTENSOR_BETA_MODE ? (
                <p className="mt-2 text-xs leading-5 text-dls-secondary">
                  In Bittensor beta, Hyperliquid and Polymarket are preview/R&amp;D only and are not part of the customer launch promise.
                </p>
              ) : null}
            </Section>
          </div>
        )}

        {tab === "subnets" && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-xl border border-dls-border bg-dls-surface px-3 py-2">
                <Search className="size-4 text-dls-secondary" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder="Search netuid, name, utility"
                  className="min-w-0 flex-1 bg-transparent text-sm text-dls-text outline-none placeholder:text-dls-secondary"
                />
              </div>
              {loading ? (
                <LoadingLabel label="Loading subnets" />
              ) : (
                <div className="space-y-2">
                  {filteredSubnets.map((subnet) => (
                    <SubnetRow
                      key={subnet.netuid}
                      subnet={subnet}
                      selected={selectedNetuid === subnet.netuid}
                      favorite={favorites.includes(subnet.netuid)}
                      onSelect={() => setSelectedNetuid(subnet.netuid)}
                      onFavorite={() => toggleFavorite(subnet.netuid)}
                    />
                  ))}
                </div>
              )}
            </div>
            <SubnetDetailCard
              detail={detail}
              loading={detailLoading}
              agentPromptReady={agentPromptReady}
              onAskAgent={askAgentAboutSubnet}
            />
          </div>
        )}

        {tab === "wallet" && (
          <div className="space-y-4">
            <Section title="Watch Coldkey" icon={<Shield className="size-4" />}>
              <div className="space-y-3">
                <input
                  value={watchAddress}
                  onChange={(event) => {
                    setWatchAddress(event.currentTarget.value);
                    setWalletError(null);
                  }}
                  placeholder="SS58 coldkey public address"
                  className="h-11 w-full rounded-xl border border-dls-border bg-dls-surface px-3 font-mono text-sm text-dls-text outline-none placeholder:text-dls-secondary"
                />
                <Button className="w-full gap-1.5 bg-sky-500 text-white hover:bg-sky-600" onClick={loadWallet} disabled={walletLoading}>
                  {walletLoading ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}
                  Watch Address
                </Button>
                <Button variant="outline" className="w-full gap-1.5" onClick={askAgentAboutWallet} disabled={!watchAddress.trim()}>
                  <BrainCircuit className="size-4" />
                  {agentPromptReady ? "Sent to Chat" : "Ask in Chat"}
                </Button>
                {walletError && <p className="text-xs text-red-300">{walletError}</p>}
              </div>
            </Section>

            {wallet && (
              <Section title="Wallet Snapshot" icon={<Wallet className="size-4" />}>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Metric label="TAO balance" value={formatNumber(wallet.taoBalance)} compact />
                    <Metric label="Total TAO value" value={formatNumber(wallet.estimatedValueTao)} compact />
                  </div>
                  {wallet.providerStatus === "provider_unavailable" && (
                    <Notice tone="warning" icon={<AlertTriangle className="size-4" />} title="Provider unavailable">
                      {wallet.message ?? "Wallet portfolio data is unavailable."}
                    </Notice>
                  )}
                  <div className="space-y-2">
                    {wallet.stakePositions.map((position) => (
                      <div key={`${position.netuid}:${position.validatorHotkey}`} className="rounded-xl border border-dls-border bg-dls-surface p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium text-dls-text">{position.subnetName}</div>
                            <div className="text-xs text-dls-secondary">Subnet {position.netuid}</div>
                          </div>
                          <span className="rounded-full bg-sky-500/10 px-2 py-1 text-[10px] font-semibold uppercase text-sky-300">
                            {position.slippageRisk}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <Metric label="Alpha" value={formatNumber(position.alphaAmount)} compact />
                          <Metric label="TAO value" value={formatNumber(position.taoValue)} compact />
                        </div>
                        <div className="mt-2 text-[11px] text-dls-secondary">
                          Validator hotkey: <span className="font-mono">{shortAddress(position.validatorHotkey)}</span>
                        </div>
                      </div>
                    ))}
                    {wallet.stakePositions.length === 0 && wallet.providerStatus === "ok" && (
                      <p className="text-sm text-dls-secondary">No subnet stake positions returned.</p>
                    )}
                  </div>
                </div>
              </Section>
            )}
          </div>
        )}

        {tab === "actions" && (
          <div className="space-y-4">
            <Notice tone="info" icon={<Shield className="size-4" />} title="Quote-only actions">
              Matterhorn prepares Bittensor actions for review. External Bittensor-compatible signing is required.
            </Notice>
            <Section title="Prepare Action" icon={<ArrowUpDown className="size-4" />}>
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-1 rounded-lg bg-dls-surface p-1">
                  {(["stake", "unstake", "transfer", "compare"] as ActionType[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={cn(
                        "rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors",
                        action === item ? "bg-sky-500 text-white" : "text-dls-secondary hover:text-dls-text",
                      )}
                      onClick={() => setAction(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                {action !== "transfer" && (
                  <LabeledInput label="Netuid" value={actionNetuid} onChange={setActionNetuid} />
                )}
                {action !== "compare" && (
                  <LabeledInput label="Amount TAO" value={amountTao} onChange={setAmountTao} />
                )}
                {(action === "stake" || action === "unstake") && (
                  <LabeledInput label="Validator hotkey" value={validatorHotkey} onChange={setValidatorHotkey} />
                )}
                {action === "transfer" && (
                  <LabeledInput label="Recipient coldkey" value={recipient} onChange={setRecipient} />
                )}
                <Button className="w-full gap-1.5 bg-sky-500 text-white hover:bg-sky-600" onClick={requestQuote} disabled={quoteLoading}>
                  {quoteLoading ? <Loader2 className="size-4 animate-spin" /> : <ArrowUpDown className="size-4" />}
                  Prepare Quote
                </Button>
              </div>
            </Section>

            {quote && (
              <Section title="Quote" icon={<Shield className="size-4" />}>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Metric label="Expected alpha" value={formatNumber(quote.expectedAlpha)} compact />
                    <Metric label="Fee TAO" value={formatNumber(quote.feeTao, 6)} compact />
                    <Metric label="Slippage" value={quote.slippageBps === null ? "—" : `${quote.slippageBps} bps`} compact />
                    <Metric label="Signer" value={quote.requiresExternalSignature ? "External" : "Matterhorn"} compact />
                  </div>
                  <div className="space-y-2">
                    {quote.warnings.map((warning) => (
                      <div key={warning} className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                        <span>{warning}</span>
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" className="w-full gap-1.5" onClick={askAgentAboutQuote}>
                    <BrainCircuit className="size-4" />
                    {agentPromptReady ? "Sent to Chat" : "Review in Chat"}
                  </Button>
                </div>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dls-border bg-dls-sidebar p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-dls-text">
        <span className="text-sky-400">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={cn("rounded-xl border border-dls-border bg-dls-surface p-3", compact && "p-2.5")}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-dls-secondary">{label}</div>
      <div className={cn("mt-1 truncate font-mono font-semibold text-dls-text", compact ? "text-sm" : "text-lg")}>{value}</div>
    </div>
  );
}

function Notice({ tone, icon, title, children }: { tone: "info" | "warning"; icon: ReactNode; title: string; children: ReactNode }) {
  const classes = tone === "warning"
    ? "border-amber-500/20 bg-amber-500/10 text-amber-200"
    : "border-sky-500/20 bg-sky-500/10 text-sky-200";
  return (
    <div className={cn("mb-4 flex items-start gap-2 rounded-xl border px-3 py-2.5", classes)}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <div className="text-xs font-semibold">{title}</div>
        <div className="mt-0.5 text-xs leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function LoadingLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-dls-secondary">
      <Loader2 className="size-4 animate-spin" />
      {label}
    </div>
  );
}

function SubnetRow({
  subnet,
  selected,
  favorite,
  onSelect,
  onFavorite,
}: {
  subnet: BittensorSubnetSummary;
  selected: boolean;
  favorite: boolean;
  onSelect: () => void;
  onFavorite: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-dls-surface p-3 transition-colors",
        selected ? "border-sky-500/60" : "border-dls-border hover:border-sky-500/30",
      )}
    >
      <div className="flex items-start gap-2">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] text-sky-300">#{subnet.netuid}</span>
            <span className="truncate text-sm font-medium text-dls-text">{subnet.name}</span>
          </div>
          <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-dls-secondary">{subnet.benefitSummary}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Pill>{subnet.category}</Pill>
            <Pill>{subnet.symbol}</Pill>
            <Pill>{subnet.source === "tao.app" ? "Live" : "Fallback"}</Pill>
          </div>
        </button>
        <button
          type="button"
          className={cn("rounded-lg p-1.5 transition-colors", favorite ? "text-amber-300" : "text-dls-secondary hover:text-dls-text")}
          onClick={onFavorite}
          title={favorite ? "Remove favorite" : "Add favorite"}
        >
          <Star className={cn("size-4", favorite && "fill-current")} />
        </button>
      </div>
    </div>
  );
}

function SubnetDetailCard({
  detail,
  loading,
  agentPromptReady,
  onAskAgent,
}: {
  detail: BittensorSubnetDetail | null;
  loading: boolean;
  agentPromptReady: boolean;
  onAskAgent: (subnet: BittensorSubnetSummary) => void;
}) {
  if (loading) return <LoadingLabel label="Loading subnet detail" />;
  if (!detail) {
    return (
      <div className="rounded-xl border border-dls-border bg-dls-surface p-4 text-sm text-dls-secondary">
        Select a subnet to inspect.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-dls-border bg-dls-sidebar p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-sky-300">Subnet {detail.netuid}</div>
          <h3 className="truncate text-lg font-semibold text-dls-text">{detail.name}</h3>
          <p className="mt-1 text-sm leading-relaxed text-dls-secondary">{detail.benefitSummary}</p>
        </div>
        <Button size="sm" className="shrink-0 gap-1.5 bg-sky-500 text-white hover:bg-sky-600" onClick={() => onAskAgent(detail)}>
          <BrainCircuit className="size-3.5" />
          {agentPromptReady ? "Sent to Chat" : "Ask in Chat"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Metric label="Price TAO" value={formatNumber(detail.priceTao, 6)} compact />
        <Metric label="Emission" value={formatNumber(detail.emission)} compact />
        <Metric label="Neurons" value={formatNumber(detail.metagraphSummary.neurons, 0)} compact />
        <Metric label="Block" value={formatNumber(detail.metagraphSummary.block, 0)} compact />
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-dls-secondary">Use cases</div>
        <div className="space-y-1.5">
          {detail.knownUseCases.map((item) => (
            <div key={item} className="rounded-lg bg-dls-surface px-3 py-2 text-xs text-dls-text">{item}</div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-dls-secondary">Top validators</div>
        {detail.topValidators.length ? (
          <div className="space-y-1.5">
            {detail.topValidators.slice(0, 4).map((validator, index) => (
              <div key={`${validator.uid}:${validator.hotkey}:${index}`} className="rounded-lg bg-dls-surface px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-dls-text">UID {validator.uid ?? "—"}</span>
                  <span className="font-mono text-xs text-dls-secondary">{formatNumber(validator.stake)}</span>
                </div>
                <div className="mt-1 font-mono text-[11px] text-dls-secondary">Hotkey {shortAddress(validator.hotkey)}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-dls-secondary">Validator data unavailable.</p>
        )}
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-dls-secondary">Risks</div>
        <div className="space-y-1.5">
          {detail.risks.map((risk) => (
            <div key={risk} className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {risk}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {detail.links.map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-dls-border px-2.5 py-1.5 text-xs text-dls-secondary transition-colors hover:text-dls-text"
          >
            <ExternalLink className="size-3" />
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-dls-border bg-dls-sidebar px-2 py-0.5 text-[10px] text-dls-secondary">
      {children}
    </span>
  );
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-dls-secondary">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="h-10 w-full rounded-xl border border-dls-border bg-dls-surface px-3 font-mono text-sm text-dls-text outline-none placeholder:text-dls-secondary"
      />
    </label>
  );
}
