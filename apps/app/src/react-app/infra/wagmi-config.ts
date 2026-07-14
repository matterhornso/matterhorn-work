import { http, createConfig } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";

const walletConnectProjectId =
  typeof import.meta.env?.VITE_WALLETCONNECT_PROJECT_ID === "string"
    ? import.meta.env.VITE_WALLETCONNECT_PROJECT_ID.trim()
    : "";

const evmConnectors = [
  injected({
    target: "metaMask",
  }),
  coinbaseWallet({
    appName: "Matterhorn Work",
  }),
  injected(),
  ...(walletConnectProjectId
    ? [
        walletConnect({
          projectId: walletConnectProjectId,
        }),
      ]
    : []),
];

export const wagmiConfig = createConfig({
  chains: [baseSepolia, base],
  connectors: evmConnectors,
  transports: {
    [baseSepolia.id]: http("https://sepolia.base.org"),
    [base.id]: http("https://mainnet.base.org"),
  },
});
