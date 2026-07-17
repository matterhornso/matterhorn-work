/** @jsxImportSource react */
import {
  createContext,
  use,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

import {
  buildDenAuthUrl,
  clearDenSession,
  createDenClient,
  readDenBootstrapConfig,
  readDenSettings,
  type DenUser,
} from "@/app/lib/den";
import { isPublicBetaWebDeployment } from "@/app/lib/matterhorn-deployment";
import { usePlatform } from "@/react-app/kernel/platform";
import { useDenAuth } from "@/react-app/domains/cloud/den-auth-provider";
import type { BetaAuthStore, BetaClerkStub, BetaUser } from "./beta-auth-types";

const BetaAuthContext = createContext<BetaAuthStore | undefined>(undefined);

export type BetaAuthProviderProps = {
  children: ReactNode;
};

function denUserToBetaUser(denUser: DenUser | null | undefined): BetaUser | null {
  if (!denUser) return null;
  const id = denUser.id?.trim();
  if (!id) return null;
  return {
    id,
    email: denUser.email?.trim() ?? null,
    name: denUser.name?.trim() ?? null,
    imageUrl: null,
  };
}

/**
 * Beta auth provider.
 *
 * Wraps the existing Den (Matterhorn Cloud) auth provider and exposes a
 * Clerk-compatible API surface. This lets beta UI code use a stable contract
 * (`useAuth`, `useUser`, `useClerk`) while the backend auth method stays
 * swappable.
 *
 * The provider never stores or accepts secrets, wallet signing keys, recovery phrases, or
 * provider credentials. Signing in/out is always delegated to the browser-based Cloud
 * control plane or the Den session store.
 */
export function BetaAuthProvider({ children }: BetaAuthProviderProps) {
  const platform = usePlatform();
  const denAuth = useDenAuth();

  const openSignIn = useCallback(() => {
    const baseUrl = readDenBootstrapConfig().baseUrl;
    const url = buildDenAuthUrl(baseUrl, "sign-in");
    if (isPublicBetaWebDeployment() && typeof window !== "undefined") {
      window.location.assign(url);
      return;
    }
    platform.openLink(url);
  }, [platform]);

  const openSignUp = useCallback(() => {
    const baseUrl = readDenBootstrapConfig().baseUrl;
    const url = buildDenAuthUrl(baseUrl, "sign-up");
    if (isPublicBetaWebDeployment() && typeof window !== "undefined") {
      window.location.assign(url);
      return;
    }
    platform.openLink(url);
  }, [platform]);

  const signOut = useCallback(async () => {
    if (isPublicBetaWebDeployment()) {
      const settings = readDenSettings();
      await createDenClient({
        baseUrl: settings.baseUrl,
        apiBaseUrl: settings.apiBaseUrl,
      }).signOut().catch(() => undefined);
    }
    clearDenSession();
    await denAuth.refresh();
  }, [denAuth]);

  const user = denUserToBetaUser(denAuth.user ?? undefined);

  const value = useMemo<BetaAuthStore>(
    () => ({
      status: denAuth.status,
      isSignedIn: denAuth.isSignedIn,
      isLoaded: denAuth.status !== "checking",
      user,
      error: denAuth.error ? { message: denAuth.error } : null,
      openSignIn,
      openSignUp,
      signOut,
    }),
    [denAuth.error, denAuth.isSignedIn, denAuth.status, openSignIn, openSignUp, signOut, user],
  );

  return (
    <BetaAuthContext.Provider value={value}>{children}</BetaAuthContext.Provider>
  );
}

export function useBetaAuth(): BetaAuthStore {
  const context = use(BetaAuthContext);
  if (!context) {
    throw new Error("useBetaAuth must be used within a BetaAuthProvider");
  }
  return context;
}

/**
 * Clerk-compatible `useAuth()` hook.
 *
 * Returns `{ isLoaded, isSignedIn, userId }` so existing Clerk patterns work.
 */
export function useAuth(): {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
} {
  const auth = useBetaAuth();
  return {
    isLoaded: auth.isLoaded,
    isSignedIn: auth.isSignedIn,
    userId: auth.user?.id ?? null,
  };
}

/**
 * Clerk-compatible `useUser()` hook.
 *
 * Returns `{ isLoaded, isSignedIn, user }` where `user` has a Clerk-like shape.
 */
export function useUser(): {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: BetaUser | null;
} {
  const auth = useBetaAuth();
  return {
    isLoaded: auth.isLoaded,
    isSignedIn: auth.isSignedIn,
    user: auth.user,
  };
}

/**
 * Clerk-compatible `useClerk()` stub.
 *
 * Returns a minimal Clerk instance object. Expand the stub shape in
 * `beta-auth-types.ts` if more Clerk methods are needed.
 */
export function useClerk(): BetaClerkStub {
  const auth = useBetaAuth();
  return {
    loaded: auth.isLoaded,
    user: auth.user,
    openSignIn: auth.openSignIn,
    openSignUp: auth.openSignUp,
    signOut: async () => {
      await auth.signOut();
    },
  };
}
