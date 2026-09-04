import type {
  MatterhornCryptoAppActionAccess,
  MatterhornCoworkerProfile,
} from "@matterhorn-work/types/crypto-coworkers";

type CoworkerAppScope = Pick<
  MatterhornCoworkerProfile,
  "allowedActionIds" | "allowedAppIds" | "allowedNetworks"
>;

type ConnectableApp = {
  appId: string;
  authentication: { type: string };
  actions: ReadonlyArray<{
    id: string;
    access: MatterhornCryptoAppActionAccess;
    requiredScopes: readonly string[];
    walletSubmissionOnly: true;
    agentMaySubmit: false;
  }>;
  networks: ReadonlyArray<{ chainId: string }>;
};

export type CoworkerAppConnectionDraft = {
  appId: string;
  grantedActionIds: string[];
  grantedScopes: string[];
  grantedNetworks: string[];
};

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

/**
 * Produces the narrowest no-credential app connection the selected coworker
 * can use. The server remains authoritative and the user must separately save
 * the resulting connection into the coworker's resource sandbox.
 */
export function buildCoworkerAppConnectionDraft(
  coworker: CoworkerAppScope,
  app: ConnectableApp,
): CoworkerAppConnectionDraft | null {
  if (app.authentication.type !== "none" || !coworker.allowedAppIds.includes(app.appId)) return null;

  const allowedActions = app.actions.filter((action) => (
    action.walletSubmissionOnly
    && !action.agentMaySubmit
    && coworker.allowedActionIds.includes(action.id)
  ));
  const grantedActionIds = sortedUnique(allowedActions.map((action) => action.id));
  const grantedNetworks = sortedUnique(
    app.networks
      .map((network) => network.chainId)
      .filter((network) => coworker.allowedNetworks.includes(network)),
  );
  if (!grantedActionIds.length || !grantedNetworks.length) return null;

  return {
    appId: app.appId,
    grantedActionIds,
    grantedScopes: sortedUnique(allowedActions.flatMap((action) => action.requiredScopes)),
    grantedNetworks,
  };
}
