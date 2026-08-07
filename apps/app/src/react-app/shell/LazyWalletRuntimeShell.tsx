/** @jsxImportSource react */
import type { ReactNode } from "react";
import { DAppKitProvider } from "@mysten/dapp-kit-react";
import { WagmiProvider } from "wagmi";

import { PhantomSuiConnectionProvider } from "../domains/wallet/phantom-sui-provider";
import { suiDAppKit } from "../infra/sui-dapp-kit";
import { wagmiConfig } from "../infra/wagmi-config";

export default function LazyWalletRuntimeShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <DAppKitProvider dAppKit={suiDAppKit}>
        <PhantomSuiConnectionProvider>
          {children}
        </PhantomSuiConnectionProvider>
      </DAppKitProvider>
    </WagmiProvider>
  );
}
