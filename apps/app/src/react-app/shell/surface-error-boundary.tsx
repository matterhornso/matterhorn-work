/** @jsxImportSource react */

import { Component, type ErrorInfo, type ReactNode } from "react";

import { ErrorState } from "../domains/shell/error-state";
import { recordDebugLog } from "./debug-logger";

type SurfaceErrorBoundaryProps = {
  children: ReactNode;
  resetKey: string;
  title: string;
  detail?: string;
  source: string;
};

type SurfaceErrorBoundaryState = {
  error: Error | null;
};

export class SurfaceErrorBoundary extends Component<SurfaceErrorBoundaryProps, SurfaceErrorBoundaryState> {
  state: SurfaceErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): SurfaceErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    recordDebugLog({
      level: "uncaught",
      source: this.props.source,
      url: typeof window !== "undefined" ? window.location.pathname + window.location.search : undefined,
      message: error.message,
      stack: error.stack,
      extra: {
        componentStackPresent: Boolean(info.componentStack),
      },
    });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("matterhorn:surface-error", {
        detail: {
          message: "Surface render failed",
          source: this.props.source,
          componentStackPresent: Boolean(info.componentStack),
        },
      }));
    }
    console.error("[Matterhorn] surface render failed");
  }

  componentDidUpdate(previousProps: SurfaceErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-background px-6 py-8 text-dls-text">
        <section className="w-full max-w-sm rounded-lg bg-dls-surface-muted/[0.08] p-5">
          <ErrorState
            error={this.state.error}
            title={this.props.title}
            detail={this.props.detail ?? "The workspace is still running. Close and reopen this panel, or refresh the view."}
          />
        </section>
      </div>
    );
  }
}
