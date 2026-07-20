/** @jsxImportSource react */
import { lazy, Suspense, type ReactNode } from "react";

const LazyWalletRuntimeShell = lazy(() => import("./LazyWalletRuntimeShell"));

type LazyWalletRuntimeProviderProps = {
  children: ReactNode;
  enabled: boolean;
};

export function LazyWalletRuntimeProvider({
  children,
  enabled,
}: LazyWalletRuntimeProviderProps) {
  if (!enabled) return <>{children}</>;

  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          Loading Matterhorn Desks...
        </div>
      }
    >
      <LazyWalletRuntimeShell>{children}</LazyWalletRuntimeShell>
    </Suspense>
  );
}
