/** @jsxImportSource react */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Boxes,
  CircleUser,
  Copy,
  ExternalLink,
  FolderCog,
  Info,
  Lock,
  Network,
  Palette,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SettingsTab } from "../../../../app/types";
import {
  getInitialThemeMode,
  setThemeMode,
  subscribeToTheme,
  type ThemeMode,
} from "../../../../app/theme";

const APP_VERSION = String(
  import.meta.env.VITE_MATTERHORN_WORK_APP_VERSION ?? import.meta.env.VITE_OPENWORK_APP_VERSION ?? "",
).trim();
const DENSITY_STORAGE_KEY = "matterhorn:settings:density";

type Density = "comfortable" | "compact";

function readDensity(): Density {
  if (typeof window === "undefined") return "comfortable";
  try {
    return window.localStorage.getItem(DENSITY_STORAGE_KEY) === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

function applyDensity(value: Density) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.density = value;
  }
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(DENSITY_STORAGE_KEY, value);
    } catch {
      // ignore persistence failures
    }
  }
}

function SettingsCard(props: {
  icon: ReactNode;
  title: string;
  description: string;
  status?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-dls-border bg-dls-surface p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-dls-border bg-background text-dls-text">
          {props.icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-6 text-dls-text">{props.title}</h2>
          <p className="mt-0.5 text-sm leading-5 text-dls-secondary">{props.description}</p>
        </div>
        {props.status ? <div className="ml-auto shrink-0">{props.status}</div> : null}
      </div>
      {props.children ? <div className="flex flex-col gap-3">{props.children}</div> : null}
    </section>
  );
}

function Row(props: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-dls-border bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-dls-text">{props.label}</p>
        {props.hint ? <p className="mt-0.5 break-words text-xs leading-5 text-dls-secondary">{props.hint}</p> : null}
      </div>
      <div className="shrink-0 text-sm text-dls-secondary">{props.value}</div>
    </div>
  );
}

function StatusBadge(props: { children: ReactNode; tone?: "ready" | "setup" | "preview" | "desktop" | "cloud" }) {
  const tone =
    props.tone === "ready"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : props.tone === "setup"
        ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
        : props.tone === "preview"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
          : props.tone === "cloud"
            ? "border-violet-500/30 bg-violet-500/10 text-violet-300"
            : "border-dls-border bg-background text-dls-secondary";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {props.children}
    </span>
  );
}

function CopyButton(props: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(() => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(props.text).then(
        () => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        },
        () => {},
      );
    }
  }, [props.text]);
  return (
    <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onCopy}>
      <Copy size={13} />
      {copied ? "Copied" : props.label}
    </Button>
  );
}

export function SettingsOverviewView(props: { onSelectTab: (tab: SettingsTab) => void }) {
  const { onSelectTab } = props;
  const [theme, setTheme] = useState<ThemeMode>(getInitialThemeMode());
  const [density, setDensity] = useState<Density>(readDensity());

  useEffect(() => subscribeToTheme(() => setTheme(getInitialThemeMode())), []);

  const onThemeChange = useCallback((mode: ThemeMode) => {
    setThemeMode(mode);
    setTheme(mode);
  }, []);

  const onDensityChange = useCallback((value: Density) => {
    applyDensity(value);
    setDensity(value);
  }, []);

  const themeOptions: Array<{ id: ThemeMode; label: string }> = [
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
    { id: "system", label: "System" },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-dls-text">Settings</h1>
        <p className="mt-1 text-sm leading-6 text-dls-secondary">
          Your account, appearance, safety, protocols, extensions, workspaces, and diagnostics — all in one place.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        {/* 1. Profile */}
        <SettingsCard
          icon={<CircleUser size={18} />}
          title="Profile"
          description="Your account and sign-in status."
          status={<StatusBadge tone="setup">Needs setup</StatusBadge>}
        >
          <Row
            label="Account"
            hint="You are not signed in to a Matterhorn Work account. Sign in to sync cloud workspaces. Local use needs no account."
            value={<StatusBadge tone="setup">Signed out</StatusBadge>}
          />
          <div>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => onSelectTab("cloud-account")}>
              Open account settings
            </Button>
          </div>
        </SettingsCard>

        {/* 2. Appearance */}
        <SettingsCard
          icon={<Palette size={18} />}
          title="Appearance"
          description="Theme, accent, and text density."
          status={<StatusBadge tone="ready">Ready</StatusBadge>}
        >
          <Row
            label="Theme"
            hint="Choose light, dark, or follow your system."
            value={
              <div className="flex gap-1.5">
                {themeOptions.map((option) => (
                  <Button
                    key={option.id}
                    variant={theme === option.id ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={() => onThemeChange(option.id)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            }
          />
          <Row
            label="Matterhorn accent"
            hint="The accent used across the workspace."
            value={
              <span className="flex items-center gap-2">
                <span className="size-5 rounded-full border border-dls-border" style={{ backgroundColor: "var(--matterhorn-blue, #7c3aed)" }} />
                <span className="size-5 rounded-full border border-dls-border" style={{ backgroundColor: "#0D2B4E" }} />
              </span>
            }
          />
          <Row
            label="Text density"
            hint="Comfortable is roomier; compact fits more on screen."
            value={
              <div className="flex gap-1.5">
                <Button variant={density === "comfortable" ? "default" : "outline"} size="sm" className="text-xs" onClick={() => onDensityChange("comfortable")}>
                  Comfortable
                </Button>
                <Button variant={density === "compact" ? "default" : "outline"} size="sm" className="text-xs" onClick={() => onDensityChange("compact")}>
                  Compact
                </Button>
              </div>
            }
          />
          <div>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-dls-secondary" onClick={() => onSelectTab("appearance")}>
              More appearance options
            </Button>
          </div>
        </SettingsCard>

        {/* 3. Safety & Wallets */}
        <SettingsCard
          icon={<ShieldCheck size={18} />}
          title="Safety & Wallets"
          description="How Matterhorn Work keeps Web3 actions safe."
          status={<StatusBadge tone="setup">Wallet setup</StatusBadge>}
        >
          <p className="text-sm leading-6 text-dls-secondary">
            Matterhorn Work is <span className="font-medium text-dls-text">non-custodial</span>. It never holds your keys, signs silently, or moves funds on your behalf. You stay in control of every on-chain action.
          </p>
          <ul className="flex list-none flex-col gap-2 text-sm leading-6 text-dls-secondary">
            <li className="rounded-xl border border-dls-border bg-background px-4 py-3">
              <span className="font-medium text-dls-text">Bittensor:</span> actions are prepared as previews. Anything on-chain is signed in your own external Bittensor-compatible signer — Matterhorn Work cannot sign or broadcast.
            </li>
            <li className="rounded-xl border border-dls-border bg-background px-4 py-3">
              <span className="font-medium text-dls-text">Hyperliquid &amp; Polymarket:</span> read and preview only. Live submission is off; Matterhorn Work does not submit live market trades.
            </li>
            <li className="rounded-xl border border-dls-border bg-background px-4 py-3">
              <span className="font-medium text-dls-text">No secret storage:</span> Matterhorn Work never asks for or stores seed phrases, private keys, or API secrets.
            </li>
          </ul>
        </SettingsCard>

        {/* 4. Protocols */}
        <SettingsCard
          icon={<Network size={18} />}
          title="Protocols"
          description="Status of each Web3 workspace."
          status={<StatusBadge tone="ready">Boundaries visible</StatusBadge>}
        >
          <Row label="Bittensor" hint="TAO, subnets, validators, and staking previews (external signer required)." value={<StatusBadge tone="ready">Beta ready</StatusBadge>} />
          <Row label="Hyperliquid" hint="Account, orderbook, and order previews. Live submission off." value={<StatusBadge tone="preview">Preview only</StatusBadge>} />
          <Row label="Polymarket" hint="Market discovery, odds, and compliance previews. Live submission off." value={<StatusBadge tone="preview">Preview only</StatusBadge>} />
          <p className="text-xs leading-5 text-dls-secondary">
            Open a protocol workspace from the sidebar to explore its desk.
          </p>
        </SettingsCard>

        {/* 5. MCPs & Connectors */}
        <SettingsCard
          icon={<Boxes size={18} />}
          title="MCPs &amp; Connectors"
          description="Connected protocol tools, app connectors, and custom MCP servers."
          status={<StatusBadge tone="ready">Ready</StatusBadge>}
        >
          <p className="text-sm leading-6 text-dls-secondary">
            Connect Model Context Protocol (MCP) servers, protocol tools, and app connectors so Matterhorn Work can use them from chat. Some tools may be unavailable until their connector is configured or signed in.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => onSelectTab("extensions")}>
              Manage MCPs
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-dls-secondary" onClick={() => onSelectTab("extensions")}>
              Add a custom MCP
            </Button>
          </div>
        </SettingsCard>

        {/* 6. Workspaces */}
        <SettingsCard
          icon={<FolderCog size={18} />}
          title="Workspaces"
          description="Local and shared workspaces, and diagnostics."
          status={<StatusBadge tone="ready">Ready</StatusBadge>}
        >
          <p className="text-sm leading-6 text-dls-secondary">
            A workspace is a folder on your machine the agent can work in. <span className="font-medium text-dls-text">Local</span> workspaces stay on your computer. <span className="font-medium text-dls-text">Remote / shared</span> workspaces connect to a hosted worker so you can run work in the cloud.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => onSelectTab("permissions")}>
              Authorized folders
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-dls-secondary" onClick={() => onSelectTab("advanced")}>
              Runtime diagnostics
            </Button>
          </div>
        </SettingsCard>

        {/* 7. Beta Diagnostics */}
        <SettingsCard
          icon={<Stethoscope size={18} />}
          title="Beta Diagnostics"
          description="Version info and tools for reporting issues."
          status={<StatusBadge tone="desktop">Desktop only</StatusBadge>}
        >
          <Row label="App version" value={<span className="font-mono text-xs">{APP_VERSION || "dev"}</span>} />
          <Row
            label="Run a diagnostics check"
            hint="Copy and run this in your terminal to capture a redacted readiness report."
            value={<CopyButton text="pnpm desktop:beta-doctor -- --strict --json" label="Copy command" />}
          />
          <p className="text-xs leading-5 text-dls-secondary">
            See the beta first-run and customer-evidence docs for the full checklist.
          </p>
        </SettingsCard>

        {/* 8. Privacy & Data */}
        <SettingsCard
          icon={<Lock size={18} />}
          title="Privacy &amp; Data"
          description="Where your data lives, and what is never stored."
          status={<StatusBadge tone="ready">Ready</StatusBadge>}
        >
          <p className="text-sm leading-6 text-dls-secondary">
            Your chats, generated artifacts, and on-chain receipts are stored <span className="font-medium text-dls-text">locally on your machine</span> by default.
          </p>
          <ul className="flex list-none flex-col gap-2 text-sm leading-6 text-dls-secondary">
            <li className="rounded-xl border border-dls-border bg-background px-4 py-3">
              <span className="font-medium text-dls-text">Stored locally:</span> chat history, artifacts, and public on-chain receipts/links.
            </li>
            <li className="rounded-xl border border-dls-border bg-background px-4 py-3">
              <span className="font-medium text-dls-text">Never stored:</span> seed phrases, private keys, API secrets, raw signatures, or wallet exports.
            </li>
          </ul>
        </SettingsCard>

        {/* 9. About */}
        <SettingsCard
          icon={<Info size={18} />}
          title="About"
          description="Matterhorn Work version and resources."
          status={<StatusBadge tone="ready">Ready</StatusBadge>}
        >
          <Row label="Matterhorn Work" value={<span className="font-mono text-xs">{APP_VERSION ? `v${APP_VERSION}` : "developer build"}</span>} />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => onSelectTab("updates")}>
              Check for updates
            </Button>
            <a
              href="https://github.com/matterhornso/matterhorn-work"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-dls-border bg-background px-2.5 py-1.5 text-xs text-dls-secondary transition-colors hover:text-dls-text"
            >
              Docs &amp; support
              <ExternalLink size={12} />
            </a>
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}
