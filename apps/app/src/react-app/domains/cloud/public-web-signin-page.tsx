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
  if (error instanceof DenApiError) {
    if (error.status >= 500) {
      return "Account access is temporarily unavailable on this preview.";
    }
    return error.message;
  }
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
  const [accountServiceAvailable, setAccountServiceAvailable] = useState<
    boolean | null
  >(null);
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
      const signedIn = await checkPublicCloudSession(config, signal);
      setAccountServiceAvailable(true);
      if (signedIn) {
        onSignedIn();
      }
    } catch {
      if (signal?.aborted) return;
      setAccountServiceAvailable(false);
      setAuthError("Account access is temporarily unavailable on this preview.");
    } finally {
      if (!signal?.aborted) setSessionBusy(false);
    }
  }, [config, onSignedIn]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshSession(controller.signal);
    return () => controller.abort();
  }, [refreshSession]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    let frame: number | undefined;
    const keepActiveFieldVisible = () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || !active.closest(".public-auth-form")) return;

        const rect = active.getBoundingClientRect();
        const visibleTop = viewport.offsetTop + 12;
        const visibleBottom = viewport.offsetTop + viewport.height - 12;
        if (rect.top < visibleTop || rect.bottom > visibleBottom) {
          active.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
        }
      });
    };

    viewport.addEventListener("resize", keepActiveFieldVisible);
    return () => {
      viewport.removeEventListener("resize", keepActiveFieldVisible);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, []);

  const selectMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setAuthError(null);
    setPassword("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitBusy || accountServiceAvailable === false) return;
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
      if (error instanceof DenApiError && error.status >= 500) {
        setAccountServiceAvailable(false);
      }
      setAuthError(readableAuthError(error));
    } finally {
      setSubmitBusy(false);
    }
  };

  const signingUp = mode === "sign-up";
  const accountUnavailable = accountServiceAvailable === false;
  const accessDisabled = sessionBusy || submitBusy || accountUnavailable;

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
              disabled={sessionBusy || accountUnavailable}
            >
              Sign in
            </button>
            <button
              type="button"
              aria-pressed={signingUp}
              className={signingUp ? "is-active" : ""}
              onClick={() => selectMode("sign-up")}
              disabled={sessionBusy || accountUnavailable}
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
              disabled={accessDisabled}
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
              disabled={accessDisabled}
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
              disabled={accessDisabled}
            >
              {sessionBusy
                ? "Checking session..."
                : submitBusy
                  ? signingUp
                    ? "Creating account..."
                    : "Signing in..."
                  : accountUnavailable
                    ? "Account access unavailable"
                    : signingUp
                      ? "Create account"
                      : "Sign in"}
            </button>
          </form>

          <div
            className={`public-auth-status ${
              authError ? "public-auth-status-error" : ""
            }`}
            role={authError ? "alert" : "status"}
            aria-live="polite"
          >
            <span>{authError ?? "Your workspace stays private to your account."}</span>
            {accountUnavailable && !sessionBusy ? (
              <button type="button" onClick={() => void refreshSession()}>
                Check again
              </button>
            ) : null}
          </div>

          <nav className="public-auth-trust" aria-label="Security and privacy">
            <a href="/security">Security</a>
            <a href="/privacy">Privacy</a>
          </nav>
        </section>

        <aside className="public-auth-context" aria-labelledby="public-auth-context-title">
          <h2 id="public-auth-context-title">Choose a desk. Ask for the outcome.</h2>
          <p className="public-auth-context-lead">
            Each desk gives your conversation the right working context, tools,
            and outputs from the first message.
          </p>
          <dl className="public-auth-desk-list">
            <div>
              <dt>Bittensor</dt>
              <dd>Explore subnets, compare validators, and inspect wallet activity.</dd>
            </div>
            <div>
              <dt>Hyperliquid</dt>
              <dd>Study markets, funding, open orders, and account risk.</dd>
            </div>
            <div>
              <dt>Polymarket</dt>
              <dd>Discover markets, compare outcomes, and inspect liquidity.</dd>
            </div>
            <div>
              <dt>Longevity</dt>
              <dd>Build a guided program and turn the work into clear outputs.</dd>
            </div>
          </dl>
          <p className="public-auth-control-boundary">
            <strong>You stay in control.</strong> Financial actions move to a separate
            wallet review. Matterhorn never holds your keys.
          </p>
        </aside>
      </div>
    </main>
  );
}
