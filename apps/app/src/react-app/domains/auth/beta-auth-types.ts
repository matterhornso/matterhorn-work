/** @jsxImportSource react */

/**
 * Clerk-compatible auth types for the Matterhorn Work Monday beta.
 *
 * This file defines a subset of the Clerk API surface so that beta UI code can
 * be written against a stable, provider-agnostic contract. The current
 * implementation is backed by the existing Den (Matterhorn Cloud) auth flow;
 * it can be swapped for real Clerk without changing call sites.
 *
 * No secrets, keys, or signing material are stored or accepted here.
 */

export type BetaAuthStatus = "checking" | "signed_in" | "signed_out";

export type BetaAuthError = {
  message: string;
  code?: string;
};

export type BetaUser = {
  id: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
};

export type BetaAuthState = {
  status: BetaAuthStatus;
  isSignedIn: boolean;
  isLoaded: boolean;
  user: BetaUser | null;
  error: BetaAuthError | null;
};

export type BetaAuthActions = {
  /**
   * Open the browser sign-in flow. In the current Den-backed implementation
   * this opens the Cloud control plane sign-in URL.
   */
  openSignIn: () => void;
  /**
   * Open the browser sign-up flow. In the current Den-backed implementation
   * this opens the Cloud control-plane sign-up URL.
   */
  openSignUp: () => void;
  /**
   * Sign the user out of their Matterhorn account. Local/offline workspaces
   * remain available.
   */
  signOut: () => Promise<void> | void;
};

export type BetaAuthStore = BetaAuthState & BetaAuthActions;

/**
 * Stub shape for `useClerk()` compatibility. Real Clerk exposes many more
 * methods; only the safe subset used by beta UI is declared here.
 */
export type BetaClerkStub = {
  loaded: boolean;
  user: BetaUser | null;
  openSignIn: () => void;
  openSignUp: () => void;
  signOut: () => Promise<void>;
};
