/** @jsxImportSource react */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";

type PhantomSuiAccountResponse = {
  publicKey: string | { toString(): string };
};

type PhantomInjectedSuiProvider = {
  isPhantom?: boolean;
  requestAccount(): Promise<PhantomSuiAccountResponse>;
  disconnect?: () => Promise<void> | void;
};

type PhantomSuiConnection = {
  detected: boolean;
  address: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshDetection: () => void;
};

const PhantomSuiContext = createContext<PhantomSuiConnection | null>(null);

function injectedPhantomSui(): PhantomInjectedSuiProvider | null {
  if (typeof window === "undefined") return null;
  const phantom = (window as typeof window & {
    phantom?: { sui?: PhantomInjectedSuiProvider };
  }).phantom?.sui;
  return phantom?.isPhantom ? phantom : null;
}

function phantomAccountAddress(response: PhantomSuiAccountResponse): string {
  const value = typeof response.publicKey === "string"
    ? response.publicKey
    : response.publicKey.toString();
  if (!isValidSuiAddress(value)) {
    throw new Error("Phantom did not return a valid Sui address.");
  }
  return normalizeSuiAddress(value);
}

export function PhantomSuiConnectionProvider({ children }: { children: ReactNode }) {
  const [detected, setDetected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshDetection = useCallback(() => {
    setDetected(Boolean(injectedPhantomSui()));
  }, []);

  useEffect(() => {
    refreshDetection();
    const firstCheck = window.setTimeout(refreshDetection, 350);
    const secondCheck = window.setTimeout(refreshDetection, 1_200);
    window.addEventListener("focus", refreshDetection);
    return () => {
      window.clearTimeout(firstCheck);
      window.clearTimeout(secondCheck);
      window.removeEventListener("focus", refreshDetection);
    };
  }, [refreshDetection]);

  const connect = useCallback(async () => {
    setError(null);
    const provider = injectedPhantomSui();
    if (!provider) {
      setDetected(false);
      setError("Phantom is not installed or its Sui provider is disabled.");
      return;
    }
    setDetected(true);
    setConnecting(true);
    try {
      const response = await provider.requestAccount();
      setAddress(phantomAccountAddress(response));
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Could not connect Phantom for Sui.");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setError(null);
    try {
      await injectedPhantomSui()?.disconnect?.();
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "Could not disconnect Phantom.");
    } finally {
      setAddress(null);
    }
  }, []);

  const value = useMemo<PhantomSuiConnection>(() => ({
    detected,
    address,
    connecting,
    error,
    connect,
    disconnect,
    refreshDetection,
  }), [address, connect, connecting, detected, disconnect, error, refreshDetection]);

  return <PhantomSuiContext.Provider value={value}>{children}</PhantomSuiContext.Provider>;
}

export function usePhantomSui(): PhantomSuiConnection {
  const value = useContext(PhantomSuiContext);
  if (!value) throw new Error("usePhantomSui must be used within PhantomSuiConnectionProvider");
  return value;
}
