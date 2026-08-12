/** @jsxImportSource react */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  createDenClient,
  DenApiError,
  type DenPublicAuthConfig,
} from "../../../app/lib/den";
import {
  checkPublicCloudSession,
  type PublicCloudConfig,
} from "../../../app/lib/public-cloud-config";
import { publicWebAuthErrorMessage } from "./public-web-auth-errors";
import "./public-web-signin.css";

type PublicWebSigninPageProps = {
  config: PublicCloudConfig;
  onSignedIn: () => void;
};

type AuthMode =
  | "sign-in"
  | "sign-up"
  | "verify-email"
  | "request-reset"
  | "reset-password";

const AUTH_CONFIG_FAIL_CLOSED: DenPublicAuthConfig = {
  signupsAvailable: false,
  signupStatus: "setup_required",
  emailVerificationRequired: false,
  passwordResetAvailable: false,
  legalAcceptanceRequired: false,
  minimumPasswordLength: 12,
};

function authLocationValue(name: string): string | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const queryValue = url.searchParams.get(name)?.trim();
  if (queryValue) return queryValue;
  const fragment = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  return new URLSearchParams(fragment).get(name)?.trim() || null;
}

function initialAuthMode(): AuthMode {
  const mode = authLocationValue("mode");
  if (mode === "sign-up") return "sign-up";
  if (mode === "reset-password") return "reset-password";
  return "sign-in";
}

function initialResetToken(): string {
  return authLocationValue("token") ?? "";
}

export function PublicWebSigninPage({
  config,
  onSignedIn,
}: PublicWebSigninPageProps) {
  const [mode, setMode] = useState<AuthMode>(initialAuthMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [resetToken] = useState(initialResetToken);
  const [resetRequested, setResetRequested] = useState(false);
  const [sessionBusy, setSessionBusy] = useState(true);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [accountServiceAvailable, setAccountServiceAvailable] = useState<
    boolean | null
  >(null);
  const [publicAuthConfig, setPublicAuthConfig] =
    useState<DenPublicAuthConfig | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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
        return;
      }
      try {
        setPublicAuthConfig(await client.getPublicAuthConfig());
      } catch {
        // Keep established accounts usable during a rolling deployment, but
        // never infer that signup or recovery is safe from a missing config.
        setPublicAuthConfig(AUTH_CONFIG_FAIL_CLOSED);
      }
    } catch {
      if (signal?.aborted) return;
      setAccountServiceAvailable(false);
      setAuthError("Account access is temporarily unavailable on this preview.");
    } finally {
      if (!signal?.aborted) setSessionBusy(false);
    }
  }, [client, config, onSignedIn]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshSession(controller.signal);
    return () => controller.abort();
  }, [refreshSession]);

  useEffect(() => {
    if (mode !== "reset-password" || !resetToken) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("token");
    if (url.searchParams.get("mode") === "reset-password") {
      url.searchParams.delete("mode");
    }
    const fragment = new URLSearchParams(
      url.hash.startsWith("#") ? url.hash.slice(1) : url.hash,
    );
    fragment.delete("token");
    if (fragment.get("mode") === "reset-password") fragment.delete("mode");
    url.hash = fragment.toString();
    window.history.replaceState(
      {},
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [mode, resetToken]);

  useEffect(() => {
    if (mode !== "sign-up" || publicAuthConfig?.signupsAvailable !== false) return;
    setMode("sign-in");
    setStatusMessage(
      publicAuthConfig.signupStatus === "setup_required"
        ? "New account creation is waiting for secure deployment setup. Existing users can still sign in."
        : "New account creation is temporarily paused. Existing users can still sign in.",
    );
  }, [mode, publicAuthConfig]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    let frame: number | undefined;
    const keepActiveFieldVisible = () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        const active = document.activeElement;
        if (
          !(active instanceof HTMLElement) ||
          !active.closest(".public-auth-form")
        ) return;

        const rect = active.getBoundingClientRect();
        const visibleTop = viewport.offsetTop + 12;
        const visibleBottom = viewport.offsetTop + viewport.height - 12;
        if (rect.top < visibleTop || rect.bottom > visibleBottom) {
          active.scrollIntoView({
            block: "center",
            inline: "nearest",
            behavior: "auto",
          });
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
    setStatusMessage(null);
    setPassword("");
    setConfirmPassword("");
    setVerificationCode("");
    setLegalAccepted(false);
    setResetRequested(false);
  };

  const finishSignIn = async () => {
    if (!(await checkPublicCloudSession(config))) {
      throw new Error("Session cookie was not accepted.");
    }
    onSignedIn();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitBusy || accountServiceAvailable === false) return;
    setSubmitBusy(true);
    setAuthError(null);
    setStatusMessage(null);
    try {
      if (mode === "sign-up") {
        const result = await client.signUpEmail(email, password, legalAccepted);
        if (result.verificationRequired) {
          setEmail(result.email ?? email.trim());
          setPassword("");
          setMode("verify-email");
          setStatusMessage("We sent a six-digit verification code to your email.");
          return;
        }
        await finishSignIn();
        return;
      }
      if (mode === "sign-in") {
        await client.signInEmail(email, password);
        await finishSignIn();
        return;
      }
      if (mode === "verify-email") {
        await client.verifyEmail(email, verificationCode);
        await finishSignIn();
        return;
      }
      if (mode === "request-reset") {
        await client.requestPasswordReset(email);
        setResetRequested(true);
        setStatusMessage(
          "If an account exists for that email, a secure reset link is on its way.",
        );
        return;
      }
      if (!resetToken) {
        setAuthError("This password reset link is incomplete. Request a new one.");
        return;
      }
      if (password !== confirmPassword) {
        setAuthError("Passwords do not match.");
        return;
      }
      await client.confirmPasswordReset(resetToken, password);
      window.history.replaceState({}, "", `${window.location.pathname}?mode=sign-in`);
      setPassword("");
      setConfirmPassword("");
      setMode("sign-in");
      setStatusMessage("Password updated. Sign in with your new password.");
    } catch (error) {
      if (
        mode === "sign-in" &&
        error instanceof DenApiError &&
        error.code === "email_unverified"
      ) {
        setPassword("");
        setMode("verify-email");
        setStatusMessage("Verify your email to finish signing in.");
      } else {
        setAuthError(publicWebAuthErrorMessage(error));
      }
    } finally {
      setSubmitBusy(false);
    }
  };

  const resendVerification = async () => {
    if (submitBusy || !email.trim()) return;
    setSubmitBusy(true);
    setAuthError(null);
    setStatusMessage(null);
    try {
      await client.resendVerification(email);
      setVerificationCode("");
      setStatusMessage("If verification is still needed, a new code is on its way.");
    } catch (error) {
      setAuthError(publicWebAuthErrorMessage(error));
    } finally {
      setSubmitBusy(false);
    }
  };

  const signingUp = mode === "sign-up";
  const primaryMode = mode === "sign-in" || mode === "sign-up";
  const accountUnavailable = accountServiceAvailable === false;
  const signupsPaused = publicAuthConfig?.signupsAvailable === false;
  const passwordResetUnavailable =
    publicAuthConfig?.passwordResetAvailable === false;
  const accessDisabled = sessionBusy || submitBusy || accountUnavailable;
  const formTitle =
    mode === "verify-email"
      ? "Verify your email"
      : mode === "request-reset"
        ? "Reset your password"
        : mode === "reset-password"
          ? "Choose a new password"
          : null;

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
              aria-pressed={mode === "sign-in"}
              className={mode === "sign-in" ? "is-active" : ""}
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
              disabled={sessionBusy || accountUnavailable || signupsPaused}
            >
              Create account
            </button>
          </div>

          {formTitle ? <h2 className="public-auth-form-title">{formTitle}</h2> : null}
          {mode === "verify-email" ? (
            <p className="public-auth-form-intro">
              Enter the six-digit code sent to <strong>{email}</strong>.
            </p>
          ) : null}
          {mode === "request-reset" ? (
            <p className="public-auth-form-intro">
              We will email a secure reset link if an account exists.
            </p>
          ) : null}

          <form className="public-auth-form" onSubmit={submit}>
            {mode !== "reset-password" ? (
              <>
                <label htmlFor="matterhorn-auth-email">Email</label>
                <input
                  id="matterhorn-auth-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={accessDisabled || mode === "verify-email" || resetRequested}
                  required
                />
              </>
            ) : null}

            {primaryMode || mode === "reset-password" ? (
              <>
                <label htmlFor="matterhorn-auth-password">
                  {mode === "reset-password" ? "New password" : "Password"}
                </label>
                <input
                  id="matterhorn-auth-password"
                  name="password"
                  type="password"
                  autoComplete={signingUp || mode === "reset-password" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={accessDisabled}
                  minLength={signingUp || mode === "reset-password" ? 12 : undefined}
                  maxLength={256}
                  required
                />
                {signingUp || mode === "reset-password" ? (
                  <p className="public-auth-field-hint">Use at least 12 characters.</p>
                ) : null}
              </>
            ) : null}

            {mode === "reset-password" ? (
              <>
                <label htmlFor="matterhorn-auth-confirm-password">Confirm new password</label>
                <input
                  id="matterhorn-auth-confirm-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={accessDisabled}
                  minLength={12}
                  maxLength={256}
                  required
                />
              </>
            ) : null}

            {mode === "sign-up" ? (
              <label className="public-auth-legal" htmlFor="matterhorn-auth-legal">
                <input
                  id="matterhorn-auth-legal"
                  name="legalAccepted"
                  type="checkbox"
                  checked={legalAccepted}
                  onChange={(event) => setLegalAccepted(event.target.checked)}
                  disabled={accessDisabled}
                  required
                />
                <span>
                  I agree to the <a href="/terms" target="_blank" rel="noreferrer">Terms</a>
                  {" "}and acknowledge the <a href="/privacy" target="_blank" rel="noreferrer">Privacy notice</a>.
                </span>
              </label>
            ) : null}

            {mode === "verify-email" ? (
              <>
                <label htmlFor="matterhorn-auth-code">Verification code</label>
                <input
                  id="matterhorn-auth-code"
                  className="public-auth-code-input"
                  name="verificationCode"
                  type="text"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(event) =>
                    setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  disabled={accessDisabled}
                  required
                />
              </>
            ) : null}

            <button
              type="submit"
              className="public-auth-submit"
              disabled={accessDisabled || (mode === "request-reset" && resetRequested)}
            >
              {sessionBusy
                ? "Checking session..."
                : submitBusy
                  ? "Working..."
                  : accountUnavailable
                    ? "Account access unavailable"
                    : mode === "sign-up"
                      ? "Create account"
                      : mode === "sign-in"
                        ? "Sign in"
                        : mode === "verify-email"
                          ? "Verify and continue"
                          : mode === "request-reset"
                            ? resetRequested ? "Email sent" : "Send reset link"
                            : "Update password"}
            </button>
          </form>

          <div className="public-auth-secondary-actions">
            {mode === "sign-in" ? (
              <button
                type="button"
                onClick={() => selectMode("request-reset")}
                disabled={passwordResetUnavailable}
                title={passwordResetUnavailable ? "Password recovery is temporarily unavailable." : undefined}
              >
                Forgot password?
              </button>
            ) : null}
            {mode === "verify-email" ? (
              <button type="button" onClick={() => void resendVerification()} disabled={submitBusy}>
                Send a new code
              </button>
            ) : null}
            {!primaryMode ? (
              <button type="button" onClick={() => selectMode("sign-in")}>
                Back to sign in
              </button>
            ) : null}
          </div>

          <div
            className={`public-auth-status ${authError ? "public-auth-status-error" : ""}`}
            role={authError ? "alert" : "status"}
            aria-live="polite"
          >
            <span>
              {authError ??
                statusMessage ??
                (signupsPaused
                  ? "New accounts are paused. Existing users can sign in."
                  : "Your workspace stays private to your account.")}
            </span>
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
