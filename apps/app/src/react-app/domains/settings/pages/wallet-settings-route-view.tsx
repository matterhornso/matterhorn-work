/** @jsxImportSource react */
import type { MatterhornServerClient } from "../../../../app/lib/matterhorn-server";
import { useWallet } from "../../wallet/WalletProvider";
import { WalletSettingsView } from "./wallet-view";

export function WalletSettingsRouteView(props: {
  compact?: boolean;
  matterhornServerClient: MatterhornServerClient | null;
  runtimeWorkspaceId: string | null;
}) {
  const walletProvider = useWallet();

  return (
    <WalletSettingsView
      compact={props.compact}
      store={walletProvider.store}
      matterhornServerClient={props.matterhornServerClient}
      runtimeWorkspaceId={props.runtimeWorkspaceId}
      onTxApprove={() => {}}
      onTxReject={() => {}}
    />
  );
}
