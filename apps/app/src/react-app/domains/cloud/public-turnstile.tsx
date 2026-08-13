/** @jsxImportSource react */
import { useEffect, useRef, useState } from "react";

type TurnstileRenderOptions = {
  sitekey: string;
  action: "signup";
  theme: "auto";
  size: "flexible";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type PublicTurnstileProps = {
  siteKey: string;
  resetSignal: number;
  onTokenChange: (token: string | null) => void;
};

const SCRIPT_ID = "matterhorn-turnstile-script";
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const complete = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile did not initialize."));
    };
    const fail = () => reject(new Error("Turnstile could not load."));
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", complete, { once: true });
      existing.addEventListener("error", fail, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", complete, { once: true });
    script.addEventListener("error", fail, { once: true });
    document.head.append(script);
  }).catch((error) => {
    scriptPromise = null;
    throw error;
  });
  return scriptPromise;
}

export function PublicTurnstile({
  siteKey,
  resetSignal,
  onTokenChange,
}: PublicTurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const callbackRef = useRef(onTokenChange);
  const [loadError, setLoadError] = useState(false);

  callbackRef.current = onTokenChange;

  useEffect(() => {
    let active = true;
    setLoadError(false);
    callbackRef.current(null);
    void loadTurnstile()
      .then((turnstile) => {
        if (!active || !containerRef.current) return;
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action: "signup",
          theme: "auto",
          size: "flexible",
          callback: (token) => callbackRef.current(token),
          "expired-callback": () => callbackRef.current(null),
          "error-callback": () => callbackRef.current(null),
        });
      })
      .catch(() => {
        if (!active) return;
        setLoadError(true);
        callbackRef.current(null);
      });

    return () => {
      active = false;
      const widgetId = widgetIdRef.current;
      widgetIdRef.current = null;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  useEffect(() => {
    const widgetId = widgetIdRef.current;
    if (!widgetId || !window.turnstile) return;
    callbackRef.current(null);
    window.turnstile.reset(widgetId);
  }, [resetSignal]);

  return (
    <div className="public-auth-turnstile">
      <div ref={containerRef} />
      {loadError ? (
        <p role="alert">The security check could not load. Check your connection and refresh.</p>
      ) : null}
    </div>
  );
}
