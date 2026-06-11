/** @jsxImportSource react */
import { lazy, Suspense, type ReactNode } from "react";

const LazyWalletShell = lazy(() => import("./LazyWalletShell"));

export function LazyWalletProvider({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <LazyWalletShell>{children}</LazyWalletShell>
    </Suspense>
  );
}
