import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readReactAppSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

describe("wallet runtime connector contract", () => {
  test("wagmi config exposes explicit EVM wallet connectors without advertising unconfigured WalletConnect", () => {
    const source = readReactAppSource("infra/wagmi-config.ts");

    expect(source).toContain('import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors"');
    expect(source).toContain("connectors:");
    expect(source).toContain('target: "metaMask"');
    expect(source).toContain("coinbaseWallet({");
    expect(source).toContain('appName: "Matterhorn Work"');
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
  });

  test("wallet settings copy labels connector families truthfully", () => {
    const source = readReactAppSource("domains/settings/pages/wallet-view.tsx");

    expect(source).toContain("function evmConnectorKindLabel");
    expect(source).toContain('return "WalletConnect"');
    expect(source).toContain('return "Coinbase Wallet"');
    expect(source).toContain('return "Browser wallet extension"');
    expect(source).not.toContain('connector.id.includes("injected") ? "Browser wallet extension"');
  });

  test("wallet settings names the user action when an EVM connector is available", () => {
    const source = readReactAppSource("domains/settings/pages/wallet-view.tsx");

    expect(source).toContain('case "available": return { label: "Connect wallet"');
    expect(source).not.toContain('case "available": return { label: "Needs setup"');
  });

  test("wallet settings keeps recognizable MetaMask and Coinbase marks", () => {
    const source = readReactAppSource("domains/settings/pages/wallet-view.tsx");

    expect(source).toContain("function WalletConnectorMark");
    expect(source).toContain('identity.includes("metamask")');
    expect(source).toContain('identity.includes("coinbase")');
    expect(source).toContain('"/wallet-metamask.svg"');
    expect(source).toContain('"/wallet-coinbase.svg"');
    expect(source.match(/<WalletConnectorMark connector=\{connector\}/g)).toHaveLength(2);
  });

  test("Sui wallet rail keeps connection and transfer actions in one progressive surface", () => {
    const walletViewSource = readReactAppSource("domains/settings/pages/wallet-view.tsx");
    const suiWorkflowSource = readReactAppSource("domains/wallet/sui-workflow-panel.tsx");
    const phantomProviderSource = readReactAppSource("domains/wallet/phantom-sui-provider.tsx");
    const providersSource = readReactAppSource("shell/providers.tsx");

    expect(walletViewSource).toContain("<SuiWorkflowPanel");
    expect(walletViewSource).toContain("embedded");
    expect(walletViewSource).toContain("rounded-md bg-dls-surface-muted/[0.045]");
    expect(walletViewSource).not.toContain("rounded-full px-2 py-0.5 text-[11px] font-medium");
    expect(walletViewSource).toContain("rounded-md border-0 bg-dls-surface-muted/[0.08] px-3 py-3 shadow-none");
    expect(walletViewSource).not.toContain("Preview only");

    expect(suiWorkflowSource).toContain('const SUI_PANEL_SECTION_CLASS = "matterhorn-rail-section grid gap-3 py-2"');
    expect(suiWorkflowSource).toContain('const SUI_PANEL_INPUT_CLASS = "h-8 rounded-md border-0');
    expect(suiWorkflowSource).toContain('const SUI_PANEL_TEXTAREA_CLASS = "min-h-[4.5rem] rounded-md border-0');
    expect(walletViewSource).toContain("phantomSui.detected");
    expect(walletViewSource).toContain("walletStandardPhantom");
    expect(walletViewSource).toContain("otherSuiWallets");
    expect(walletViewSource).toContain("Connect Phantom for Sui");
    expect(walletViewSource).toContain("Install or enable Phantom for Sui");
    expect(walletViewSource).toContain("https://phantom.app/download");
    expect(suiWorkflowSource).toContain("!directWalletAvailable || connectedAddress");
    expect(suiWorkflowSource).toContain("account?.address ?? phantomSui.address");
    expect(suiWorkflowSource).toContain("Phantom Sui is connected for public reads and transfer previews");
    expect(phantomProviderSource).toContain("phantom?.sui");
    expect(phantomProviderSource).toContain("requestAccount()");
    expect(phantomProviderSource).toContain("isValidSuiAddress");
    expect(providersSource).toContain("<PhantomSuiConnectionProvider>");
    expect(suiWorkflowSource).toContain("props.embedded");
    expect(suiWorkflowSource).not.toContain("Sui wallet workflow");
    expect(suiWorkflowSource).not.toContain("No custody");
  });

  test("compact wallet rail keeps reference detail behind progressive disclosure", () => {
    const source = readReactAppSource("domains/settings/pages/wallet-view.tsx");

    expect(source).toContain("if (props.compact && rows.length === 0) return null");
    expect(source).toContain("Safety activity");
    expect(source).toContain("Supported wallets and desks");
    expect(source).toContain("How signing works");
    expect(source).toContain('className="group matterhorn-rail-section"');
    expect(source).not.toContain("<WalletBoundaryList compact safetyCopy={capability.safetyCopy} />");
  });
});
