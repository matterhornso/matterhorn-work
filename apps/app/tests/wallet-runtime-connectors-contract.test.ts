import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  handleWalletDisclosureSummaryKeyDown,
  walletConnectionErrorMessage,
} from "../src/react-app/domains/settings/pages/wallet-view";

function readReactAppSource(path: string) {
  return readFileSync(
    new URL(`../src/react-app/${path}`, import.meta.url),
    "utf8",
  );
}

describe("wallet runtime connector contract", () => {
  test("public authentication defers the wallet runtime until a wallet-capable route opens", () => {
    const viteSource = readFileSync(
      new URL("../vite.config.ts", import.meta.url),
      "utf8",
    );
    const providersSource = readReactAppSource("shell/providers.tsx");
    const appEntrySource = readFileSync(
      new URL("../src/index.react.tsx", import.meta.url),
      "utf8",
    );
    const publicSigninSource = readReactAppSource(
      "shell/public-signin-bootstrap.tsx",
    );
    const publicTrustSource = readReactAppSource(
      "shell/public-trust-bootstrap.tsx",
    );
    const authenticatedAppSource = readReactAppSource(
      "shell/authenticated-app.tsx",
    );
    const lazyProviderSource = readReactAppSource(
      "shell/LazyWalletRuntimeProvider.tsx",
    );
    const walletRuntimeSource = readReactAppSource(
      "shell/LazyWalletRuntimeShell.tsx",
    );
    const walletProviderSource = readReactAppSource(
      "domains/wallet/WalletProvider.tsx",
    );
    const nftWalletBridgeSource = readReactAppSource(
      "domains/session/media/nft-draft-wallet-bridge.tsx",
    );

    expect(providersSource).toContain("routeNeedsWalletRuntime");
    expect(providersSource).toContain(
      "if (requireSignin && !hasCachedAuth && !publicBetaWeb) return false",
    );
    expect(providersSource).toContain("readDenBootstrapConfig().requireSignin");
    expect(providersSource).toContain(
      "Boolean(readDenSettings().authToken?.trim())",
    );
    expect(providersSource).toContain('path === "/signin"');
    expect(providersSource).toContain("isPublicTrustPath(path)");
    expect(providersSource).toContain('path === "/welcome"');
    expect(providersSource).toContain('path === "/onboarding"');
    expect(providersSource).toContain("WALLET_RUNTIME_PANELS");
    expect(providersSource).toContain("settings\\/wallet");
    expect(providersSource).toContain("crypto-apps");
    expect(providersSource).toContain(
      'new URLSearchParams(search).get("panel")',
    );
    expect(providersSource).toContain(
      'if (publicBetaWeb && panel !== "wallet" && !reviewedDeskActions) return false',
    );
    expect(providersSource).toContain(
      "MATTERHORN_LAUNCH_FEATURES.reviewedDeskActions",
    );
    expect(providersSource).toContain("<WalletProvider>");
    expect(providersSource).toContain("<LazyWalletRuntimeProvider");
    expect(nftWalletBridgeSource).toContain(
      "<DAppKitProvider dAppKit={suiDAppKit}>",
    );
    expect(nftWalletBridgeSource).toContain(
      "<NftDraftWalletBridgeContent {...props} />",
    );
    expect(appEntrySource).toContain(
      'import("./react-app/shell/authenticated-app")',
    );
    expect(appEntrySource).toContain(
      'import PublicSigninBootstrap from "./react-app/shell/public-signin-bootstrap"',
    );
    expect(appEntrySource).toContain(
      'import("./react-app/shell/public-trust-bootstrap")',
    );
    expect(appEntrySource).toContain("if (publicTrustEntry)");
    expect(appEntrySource).not.toContain(
      'import { AppProviders } from "./react-app/shell/providers"',
    );
    expect(publicSigninSource).not.toContain("AppProviders");
    expect(publicSigninSource).not.toContain("LazyWalletRuntimeProvider");
    expect(publicSigninSource).not.toContain("DenAuthProvider");
    expect(publicSigninSource).not.toContain("DesktopConfigProvider");
    expect(publicTrustSource).toContain("<PublicTrustRoute />");
    expect(publicTrustSource).not.toContain("AppProviders");
    expect(publicTrustSource).not.toContain("QueryClientProvider");
    expect(publicTrustSource).not.toContain("DenAuthProvider");
    expect(publicTrustSource).not.toContain("LazyWalletRuntimeProvider");
    expect(authenticatedAppSource).toContain("<AppProviders>");
    expect(providersSource).not.toContain('from "wagmi"');
    expect(providersSource).not.toContain('from "@mysten/dapp-kit-react"');
    expect(viteSource).toContain('id.includes("vite/preload-helper")');
    expect(
      viteSource.indexOf('id.includes("vite/preload-helper")'),
    ).toBeLessThan(viteSource.indexOf('id.includes("node_modules/wagmi")'));
    expect(lazyProviderSource).toContain(
      'lazy(() => import("./LazyWalletRuntimeShell"))',
    );
    expect(walletRuntimeSource).toContain("<WagmiProvider");
    expect(walletRuntimeSource).toContain("<DAppKitProvider");
    expect(walletRuntimeSource).toContain("<PhantomSuiConnectionProvider>");
    expect(walletRuntimeSource).not.toContain("<WalletProvider>");
    expect(lazyProviderSource).toContain(
      "enabled || wallet.snapshot.pendingApproval !== null",
    );
    expect(walletProviderSource).toContain(
      'window.addEventListener("matterhorn:tx-approval-request"',
    );
  });

  test("wagmi config exposes explicit EVM wallet connectors without advertising unconfigured WalletConnect", () => {
    const source = readReactAppSource("infra/wagmi-config.ts");
    const packageManifest = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { dependencies?: Record<string, string> };

    expect(source).toContain(
      'import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors"',
    );
    expect(source).toContain("connectors:");
    expect(source).toContain('target: "metaMask"');
    expect(source).toContain("coinbaseWallet({");
    expect(source).toContain('appName: "Matterhorn Desks"');
    expect(source).toContain("injected()");
    expect(source).toContain("VITE_WALLETCONNECT_PROJECT_ID");
    expect(source).toContain("walletConnectProjectId");
    expect(source).toContain("walletConnect({");
    expect(source).toContain("baseSepolia");
    expect(source).toContain("base");
    expect(source).toContain('http("https://sepolia.base.org")');
    expect(source).toContain('http("https://mainnet.base.org")');
    expect(source).not.toContain("[baseSepolia.id]: http(),");
    expect(source).not.toContain("[base.id]: http(),");
    expect(packageManifest.dependencies?.["@coinbase/wallet-sdk"]).toBe(
      "^4.3.6",
    );
  });

  test("wallet settings copy labels connector families truthfully", () => {
    const source = readReactAppSource("domains/settings/pages/wallet-view.tsx");

    expect(source).toContain("function evmConnectorKindLabel");
    expect(source).toContain('return "WalletConnect"');
    expect(source).toContain('return "Coinbase Wallet"');
    expect(source).toContain('return "Browser wallet extension"');
    expect(source).not.toContain(
      'connector.id.includes("injected") ? "Browser wallet extension"',
    );
  });

  test("wallet settings names the user action when an EVM connector is available", () => {
    const source = readReactAppSource("domains/settings/pages/wallet-view.tsx");

    expect(source).toMatch(
      /const\s*\{\s*connectAsync,\s*connectors\s*\}\s*=\s*useConnect\(\)/,
    );
    expect(source).toContain(
      "const connectPromise = connectAsync({ connector })",
    );
    expect(source).toContain("await Promise.race([");
    expect(source).not.toContain("await connect({ connector })");
    expect(source).toContain("function walletConnectionErrorMessage");
    expect(source).toContain("Wallet connection timed out.");
    expect(source).toContain("handleCancelConnection");
    expect(source).toContain(
      "is not available in this browser. Install or enable it, then try again.",
    );
    expect(source).toContain("Wallet connection was cancelled.");
    expect(source).toContain(
      "appears to be locked. Unlock it, then try again.",
    );
    expect(source).toContain(
      "could not connect. Try again, or open the wallet for more details.",
    );
    expect(source).toContain("Continue in");
    expect(source).toContain("connectingConnectorId === connector.id");
    expect(source.match(/role="alert"/g)?.length ?? 0).toBeGreaterThanOrEqual(
      2,
    );
    expect(source.match(/role="status"/g)?.length ?? 0).toBeGreaterThanOrEqual(
      2,
    );
    expect(source).toMatch(
      /case "available":\s*return \{ label: "Connect wallet"/,
    );
    expect(source).not.toMatch(
      /case "available":\s*return \{ label: "Needs setup"/,
    );
  });

  test("connector errors distinguish missing Coinbase, cancellation, locked, and other failures", () => {
    const coinbase = { id: "coinbaseWalletSDK", name: "Coinbase Wallet" };

    expect(
      walletConnectionErrorMessage(
        {
          name: "TypeError",
          message: "Connector initialization failed",
          cause: {
            message:
              'Failed to resolve module specifier "@coinbase/wallet-sdk"',
          },
        },
        coinbase,
      ),
    ).toBe(
      "Coinbase Wallet is not available in this browser. Install or enable it, then try again.",
    );
    expect(
      walletConnectionErrorMessage(
        {
          message: "Connection failed",
          cause: { code: 4001, message: "User rejected request" },
        },
        coinbase,
      ),
    ).toBe("Wallet connection was cancelled.");
    expect(
      walletConnectionErrorMessage(new Error("Wallet is locked"), coinbase),
    ).toBe("Coinbase Wallet appears to be locked. Unlock it, then try again.");
    expect(
      walletConnectionErrorMessage(
        new Error(
          "Wallet connection timed out. Close any wallet prompt, then try again.",
        ),
        coinbase,
      ),
    ).toBe(
      "Wallet connection timed out. Close any wallet prompt, then try again.",
    );
    expect(
      walletConnectionErrorMessage(new Error("RPC request failed"), coinbase),
    ).toBe(
      "Coinbase Wallet could not connect. Try again, or open the wallet for more details.",
    );
  });

  test("every wallet disclosure has keyboard activation and visible focus", () => {
    const source = readReactAppSource("domains/settings/pages/wallet-view.tsx");
    const summaryCount = source.match(/<summary/g)?.length ?? 0;
    const keyboardHandlerCount =
      source.match(/onKeyDown=\{handleWalletDisclosureSummaryKeyDown\}/g)
        ?.length ?? 0;

    expect(summaryCount).toBeGreaterThan(0);
    expect(keyboardHandlerCount).toBe(summaryCount);
    expect(source).toContain("const WALLET_DISCLOSURE_SUMMARY_FOCUS_CLASS");
    expect(source).toContain("focus-visible:ring-2");
    expect(source).not.toMatch(/<summary[^>]*role=/s);
  });

  test("wallet disclosure keyboard activation toggles exactly once", () => {
    const details = { open: false };
    let prevented = 0;
    const event = (key: string, repeat = false) =>
      ({
        key,
        repeat,
        preventDefault: () => {
          prevented += 1;
        },
        currentTarget: {
          closest: (selector: string) =>
            selector === "details" ? details : null,
        },
      }) as unknown as ReactKeyboardEvent<HTMLElement>;

    handleWalletDisclosureSummaryKeyDown(event("Enter"));
    expect(details.open).toBe(true);
    expect(prevented).toBe(1);

    handleWalletDisclosureSummaryKeyDown(event(" "));
    expect(details.open).toBe(false);
    expect(prevented).toBe(2);

    handleWalletDisclosureSummaryKeyDown(event("Enter", true));
    expect(details.open).toBe(false);
    expect(prevented).toBe(3);

    handleWalletDisclosureSummaryKeyDown(event("ArrowDown"));
    expect(details.open).toBe(false);
    expect(prevented).toBe(3);
  });

  test("wallet settings keeps recognizable MetaMask and Coinbase marks", () => {
    const source = readReactAppSource("domains/settings/pages/wallet-view.tsx");

    expect(source).toContain("function WalletConnectorMark");
    expect(source).toContain('identity.includes("metamask")');
    expect(source).toContain('identity.includes("coinbase")');
    expect(source).toContain('"/wallet-metamask.svg"');
    expect(source).toContain('"/wallet-coinbase.svg"');
    expect(
      source.match(/<WalletConnectorMark\s+connector=\{connector\}/g),
    ).toHaveLength(2);
  });

  test("Sui wallet rail keeps connection and transfer actions in one progressive surface", () => {
    const walletViewSource = readReactAppSource(
      "domains/settings/pages/wallet-view.tsx",
    );
    const phantomIconSource = readFileSync(
      new URL("../public/wallet-phantom.svg", import.meta.url),
      "utf8",
    );
    const suiWorkflowSource = readReactAppSource(
      "domains/wallet/sui-workflow-panel.tsx",
    );
    const phantomProviderSource = readReactAppSource(
      "domains/wallet/phantom-sui-provider.tsx",
    );
    const walletRuntimeSource = readReactAppSource(
      "shell/LazyWalletRuntimeShell.tsx",
    );

    expect(walletViewSource).toContain("<SuiWorkflowPanel");
    expect(walletViewSource).toContain("embedded");
    expect(walletViewSource).toContain(
      "rounded-md bg-dls-surface-muted/[0.045]",
    );
    expect(walletViewSource).not.toContain(
      "rounded-full px-2 py-0.5 text-[11px] font-medium",
    );
    expect(walletViewSource).toContain("const WALLET_CONNECTOR_ACTION_CLASS");
    expect(walletViewSource).toContain(
      "bg-dls-surface-raised text-dls-text shadow-none",
    );
    expect(walletViewSource).toContain("hover:bg-dls-surface-muted/55");
    expect(walletViewSource).not.toContain("Preview only");

    expect(suiWorkflowSource).toContain(
      'const SUI_PANEL_SECTION_CLASS = "matterhorn-rail-section grid gap-3 py-2"',
    );
    expect(suiWorkflowSource).toContain(
      'const SUI_PANEL_INPUT_CLASS = "h-8 rounded-md border-0',
    );
    expect(suiWorkflowSource).toContain(
      'const SUI_PANEL_TEXTAREA_CLASS = "min-h-[4.5rem] rounded-md border-0',
    );
    expect(walletViewSource).toContain("phantomSui.detected");
    expect(walletViewSource).toContain("walletStandardPhantom");
    expect(walletViewSource).toContain("otherSuiWallets");
    expect(walletViewSource).toContain("function PhantomWalletMark");
    expect(walletViewSource).toContain('"/wallet-phantom.svg"');
    expect(walletViewSource).toContain(
      "<PhantomWalletMark icon={walletStandardPhantom?.icon} />",
    );
    expect(walletViewSource).toContain("<PhantomWalletMark />");
    expect(phantomIconSource).toContain('fill="#AB9FF2"');
    expect(phantomIconSource).toContain('fill="#FFFDF8"');
    expect(walletViewSource).toContain("Connect Phantom for Sui");
    expect(walletViewSource).toContain("Install or enable Phantom for Sui");
    expect(walletViewSource).toContain("https://phantom.app/download");
    expect(suiWorkflowSource).not.toContain(
      "!directWalletAvailable || connectedAddress",
    );
    expect(suiWorkflowSource).toContain(
      "You can prepare exact transfer terms now. Connect the sender wallet only when you are ready to sign and submit.",
    );
    expect(suiWorkflowSource).toContain(
      'disabled={!canSignPreview || busyAction === "sign"}',
    );
    expect(suiWorkflowSource).toContain(
      "account?.address ?? phantomSui.address",
    );
    expect(suiWorkflowSource).toContain(
      "Phantom Sui is connected for public reads and transfer previews",
    );
    expect(phantomProviderSource).toContain("phantom?.sui");
    expect(phantomProviderSource).toContain("requestAccount()");
    expect(phantomProviderSource).toContain("isValidSuiAddress");
    expect(walletRuntimeSource).toContain("<PhantomSuiConnectionProvider>");
    expect(suiWorkflowSource).toContain("props.embedded");
    expect(suiWorkflowSource).not.toContain("Sui wallet workflow");
    expect(suiWorkflowSource).not.toContain("No custody");
  });

  test("EVM and Sui connectors share one user-facing wallet list", () => {
    const source = readReactAppSource("domains/settings/pages/wallet-view.tsx");

    expect(source).toContain("integrated?: boolean");
    expect(source).toContain("props.integrated && directSuiWalletAvailable");
    expect(source).toContain('integrated={runtime === "web"}');
    expect(source.match(/integrated=\{runtime === "web"\}/g)).toHaveLength(3);
    expect(source).toContain("{!integrated ? (");
    expect(source).toContain(
      "Connect a supported wallet. Signing stays in your wallet.",
    );
  });

  test("compact wallet rail keeps reference detail behind progressive disclosure", () => {
    const source = readReactAppSource("domains/settings/pages/wallet-view.tsx");

    expect(source).toContain(
      "if (props.compact && rows.length === 0) return null",
    );
    expect(source).toContain("Safety activity");
    expect(source).toContain("Supported wallets and desks");
    expect(source).toContain("How signing works");
    expect(source).toContain('className="group matterhorn-rail-section"');
    expect(source).not.toContain(
      "<WalletBoundaryList compact safetyCopy={capability.safetyCopy} />",
    );
  });

  test("full wallet settings keeps routine safety and protocol detail behind disclosure", () => {
    const source = readReactAppSource("domains/settings/pages/wallet-view.tsx");

    expect(source).toContain("Base transaction limits");
    expect(source).toContain("How limits work");
    expect(source).toContain("Action guide");
    expect(source).toContain("aria-expanded={limitsGuideOpen}");
    expect(source).toContain("aria-expanded={statusGuideOpen}");
    expect(source).toContain("Signing &amp; privacy");
    expect(source).toContain('row.riskLevel !== "low"');
    expect(source).not.toContain(
      "Recent approvals, blocks, and wallet handoff guardrails.",
    );
    expect(source).not.toContain(
      "Matterhorn shows where each action is reviewed, signed, and submitted.",
    );
  });

  test("protocol support names the bounded wallet-approved action instead of implying general automation", () => {
    const source = readReactAppSource("domains/settings/pages/wallet-view.tsx");

    expect(source).toMatch(
      /cap\.canSubmit\s*\? "Read markets, prepare the exact order/,
    );
    expect(source).toContain('"Transfer, stake, unstake: review & submit"');
    expect(source).toContain('"Order: review & submit"');
    expect(source).toContain('"Buy, sell, cancel: review & submit"');
    expect(source).toContain("agents and watches cannot submit");
    expect(source).toContain(
      "A review &amp; submit badge applies only to the action named in its row",
    );
    expect(source).toContain('queryKey: ["wallet-market-execution-readiness"]');
    expect(source).toContain(
      "matterhornServerClient.marketExecutionReadiness()",
    );
    expect(source).toContain('protocol === "hyperliquid" && cap.canSubmit');
    expect(source).toContain(
      "canSubmit: props.hyperliquidExecutionReady === true",
    );
    expect(
      source.match(/hyperliquidExecutionReady=\{hyperliquidExecutionReady\}/g),
    ).toHaveLength(2);
  });
});
