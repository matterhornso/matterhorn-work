import { createDAppKit } from "@mysten/dapp-kit-react";
import { SuiGrpcClient } from "@mysten/sui/grpc";

export const SUI_GRPC_URLS = {
  testnet: "https://fullnode.testnet.sui.io:443",
  mainnet: "https://fullnode.mainnet.sui.io:443",
} as const;

export type SuiMatterhornNetwork = keyof typeof SUI_GRPC_URLS;

export const SUI_NETWORKS: SuiMatterhornNetwork[] = ["testnet", "mainnet"];

export const suiDAppKit = createDAppKit({
  autoConnect: false,
  networks: SUI_NETWORKS,
  defaultNetwork: "testnet",
  createClient: (network) => new SuiGrpcClient({ network, baseUrl: SUI_GRPC_URLS[network] }),
  slushWalletConfig: null,
  storageKey: "matterhorn:sui:selected-wallet-and-address",
});

declare module "@mysten/dapp-kit-react" {
  interface Register {
    dAppKit: typeof suiDAppKit;
  }
}
