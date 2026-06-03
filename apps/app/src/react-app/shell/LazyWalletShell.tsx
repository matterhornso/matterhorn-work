/** @jsxImportSource react */
import { type ReactNode } from "react";
import { WalletProvider } from "../domains/wallet/WalletProvider";

export default function LazyWalletShell({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      {children}
    </WalletProvider>
  );
}
