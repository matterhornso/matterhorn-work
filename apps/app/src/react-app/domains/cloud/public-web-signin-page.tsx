/** @jsxImportSource react */
import { useCallback, useEffect, useState } from "react";

import {
  buildPublicCloudAuthUrl,
  checkPublicCloudSession,
  type PublicCloudConfig,
} from "../../../app/lib/public-cloud-config";
import "./public-web-signin.css";

type PublicWebSigninPageProps = {
  config: PublicCloudConfig;
  onSignedIn: () => void;
};

export function PublicWebSigninPage({
  config,
  onSignedIn,
}: PublicWebSigninPageProps) {
  const [sessionBusy, setSessionBusy] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const refreshSession = useCallback(async (signal?: AbortSignal) => {
    setSessionBusy(true);
    setAuthError(null);
    try {
      if (await checkPublicCloudSession(config, signal)) {
        onSignedIn();
      }
    } catch (error) {
      if (signal?.aborted) return;
      setAuthError(
        "Matterhorn Cloud could not be reached. Check your connection and try again.",
      );
    } finally {
      if (!signal?.aborted) setSessionBusy(false);
    }
  }, [config, onSignedIn]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshSession(controller.signal);
    return () => controller.abort();
  }, [refreshSession]);

  return (
    <main className="public-auth-shell">
      <div className="public-auth-layout">
        <section className="public-auth-primary" aria-labelledby="public-auth-title">
          <div className="public-auth-brand">
            <img src="/matterhorn-logo-square.svg" alt="" aria-hidden="true" />
            <span>Matterhorn Desks</span>
          </div>

          <p className="public-auth-kicker">Public beta</p>
          <h1 id="public-auth-title" className="public-auth-title">
            Your AI workspace for serious work.
          </h1>
          <p className="public-auth-description">
            Sign in to open your private workspace, focused protocol desks,
            saved evidence, notes, and review-first workflows.
          </p>

          <div className="public-auth-actions" aria-label="Matterhorn account actions">
            <button
              type="button"
              className="public-auth-action public-auth-action-primary"
              onClick={() =>
                window.location.assign(buildPublicCloudAuthUrl(config, "sign-in"))
              }
            >
              Sign in
            </button>
            <button
              type="button"
              className="public-auth-action"
              onClick={() =>
                window.location.assign(buildPublicCloudAuthUrl(config, "sign-up"))
              }
            >
              Create account
            </button>
          </div>

          <p
            className={`public-auth-status ${
              authError ? "public-auth-status-error" : ""
            }`}
            role={authError ? "alert" : "status"}
            aria-live="polite"
          >
            {authError
              ? authError
              : sessionBusy
                ? "Checking your Matterhorn session..."
                : "Your workspace remains private to your account."}
          </p>
        </section>

        <aside className="public-auth-context" aria-labelledby="public-auth-context-title">
          <p className="public-auth-kicker">Designed for accountable work</p>
          <h2 id="public-auth-context-title">
            Keep context, actions, and evidence in one place.
          </h2>
          <p className="public-auth-context-lead">
            Matterhorn helps you understand complex systems, prepare safe next
            steps, and turn useful conversations into durable project work.
          </p>
          <ol className="public-auth-principles">
            <li>
              <span className="public-auth-principle-index">01</span>
              <span><strong>Visible control.</strong> Approvals, memory, wallets, and final decisions stay with you.</span>
            </li>
            <li>
              <span className="public-auth-principle-index">02</span>
              <span><strong>Focused desks.</strong> Use purpose-built workflows for protocols, markets, and longevity.</span>
            </li>
            <li>
              <span className="public-auth-principle-index">03</span>
              <span><strong>Durable evidence.</strong> Keep outputs and receipts attached to the work that created them.</span>
            </li>
          </ol>
        </aside>
      </div>
    </main>
  );
}
