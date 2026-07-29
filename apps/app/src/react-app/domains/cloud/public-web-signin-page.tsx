/** @jsxImportSource react */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { createDenClient, DenApiError } from "../../../app/lib/den";
import {
  checkPublicCloudSession,
  type PublicCloudConfig,
} from "../../../app/lib/public-cloud-config";
import "./public-web-signin.css";

type PublicWebSigninPageProps = {
  config: PublicCloudConfig;
  onSignedIn: () => void;
};

type AuthMode = "sign-in" | "sign-up";

function initialAuthMode(): AuthMode {
  if (typeof window === "undefined") return "sign-in";
  return new URLSearchParams(window.location.search).get("mode") === "sign-up"
    ? "sign-up"
    : "sign-in";
}

function readableAuthError(error: unknown): string {
  if (error instanceof DenApiError) return error.message;
  if (error instanceof Error && /timed out/i.test(error.message)) {
    return "The request took too long. Check your connection and try again.";
  }
  return "Matterhorn could not complete that request. Please try again.";
}

export function PublicWebSigninPage({
  config,
  onSignedIn,
}: PublicWebSigninPageProps) {
  const [mode, setMode] = useState<AuthMode>(initialAuthMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sessionBusy, setSessionBusy] = useState(true);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const client = useMemo(
    () =>
      createDenClient({
        baseUrl: config.baseUrl,
        apiBaseUrl: config.apiBaseUrl,
      }),
    [config.apiBaseUrl, config.baseUrl],
  );

  const refreshSession = useCallback(async (signal?: AbortSignal) => {
    setSessionBusy(true);
    setAuthError(null);
    try {
      if (await checkPublicCloudSession(config, signal)) {
        onSignedIn();
      }
    } catch {
      if (signal?.aborted) return;
      setAuthError(
        "Matterhorn could not reach the account service. Check your connection and try again.",
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

  const selectMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setAuthError(null);
    setPassword("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitBusy) return;
    setSubmitBusy(true);
    setAuthError(null);
    try {
      if (mode === "sign-up") {
        await client.signUpEmail(email, password);
      } else {
        await client.signInEmail(email, password);
      }
      if (!(await checkPublicCloudSession(config))) {
        throw new Error("Session cookie was not accepted.");
      }
      onSignedIn();
    } catch (error) {
      setAuthError(readableAuthError(error));
    } finally {
      setSubmitBusy(false);
    }
  };

  const signingUp = mode === "sign-up";

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
            Serious work deserves more than a chat.
          </h1>
          <p className="public-auth-description">
            Open a private workspace for focused AI desks, tools, and durable
            project evidence.
          </p>

          <div className="public-auth-mode" aria-label="Account access">
            <button
              type="button"
              aria-pressed={!signingUp}
              className={!signingUp ? "is-active" : ""}
              onClick={() => selectMode("sign-in")}
            >
              Sign in
            </button>
            <button
              type="button"
              aria-pressed={signingUp}
              className={signingUp ? "is-active" : ""}
              onClick={() => selectMode("sign-up")}
            >
              Create account
            </button>
          </div>

          <form className="public-auth-form" onSubmit={submit}>
            <label htmlFor="matterhorn-auth-email">Email</label>
            <input
              id="matterhorn-auth-email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={sessionBusy || submitBusy}
              required
            />

            <label htmlFor="matterhorn-auth-password">Password</label>
            <input
              id="matterhorn-auth-password"
              name="password"
              type="password"
              autoComplete={signingUp ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={sessionBusy || submitBusy}
              minLength={signingUp ? 12 : undefined}
              maxLength={256}
              required
            />
            {signingUp ? (
              <p className="public-auth-field-hint">
                Use at least 12 characters.
              </p>
            ) : null}

            <button
              type="submit"
              className="public-auth-submit"
              disabled={sessionBusy || submitBusy}
            >
              {sessionBusy
                ? "Checking session..."
                : submitBusy
                  ? signingUp
                    ? "Creating account..."
                    : "Signing in..."
                  : signingUp
                    ? "Create account"
                    : "Sign in"}
            </button>
          </form>

          <p
            className={`public-auth-status ${
              authError ? "public-auth-status-error" : ""
            }`}
            role={authError ? "alert" : "status"}
            aria-live="polite"
          >
            {authError ?? "Your workspace stays private to your account."}
          </p>
        </section>

        <aside className="public-auth-context" aria-labelledby="public-auth-context-title">
          <p className="public-auth-kicker">Designed for accountable work</p>
          <h2 id="public-auth-context-title">
            Keep context, actions, and evidence in one place.
          </h2>
          <p className="public-auth-context-lead">
            Matterhorn turns useful conversations into durable project work
            while keeping approvals and final decisions with you.
          </p>
          <ol className="public-auth-principles">
            <li>
              <span className="public-auth-principle-index">01</span>
              <span><strong>Visible control.</strong> Review actions before they happen.</span>
            </li>
            <li>
              <span className="public-auth-principle-index">02</span>
              <span><strong>Focused desks.</strong> Work with tools built for each domain.</span>
            </li>
            <li>
              <span className="public-auth-principle-index">03</span>
              <span><strong>Durable evidence.</strong> Keep outputs attached to their work.</span>
            </li>
          </ol>
        </aside>
      </div>
    </main>
  );
}
