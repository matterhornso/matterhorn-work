/** @jsxImportSource react */

import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "../domains/shell/error-state";
import { recordDebugLog } from "./debug-logger";

type AppErrorBoundaryProps = {
  children: ReactNode;
  resetKey: string;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    recordDebugLog({
      level: "uncaught",
      source: "AppErrorBoundary",
      url: typeof window !== "undefined" ? window.location.pathname + window.location.search : undefined,
      message: error.message,
      stack: error.stack,
      extra: {
        componentStackPresent: Boolean(info.componentStack),
      },
    });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("matterhorn:route-error", {
        detail: {
          message: "Route render failed",
          componentStackPresent: Boolean(info.componentStack),
        },
      }));
    }
    console.error("[Matterhorn] route render failed");
  }

  componentDidUpdate(previousProps: AppErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-dls-text">
        <section className="w-full max-w-md space-y-5 rounded-lg bg-dls-surface-muted/[0.08] p-6">
          <ErrorState
            error={this.state.error}
            title="This Matterhorn view stopped working"
            detail="The rest of the app is still running. Reload this view or go back to Home."
            onRetry={() => {
              if (typeof window !== "undefined") window.location.reload();
            }}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (typeof window !== "undefined") window.location.assign("/session");
            }}
          >
            Back to Home
          </Button>
        </section>
      </main>
    );
  }
}
