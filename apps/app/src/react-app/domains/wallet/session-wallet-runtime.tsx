/** @jsxImportSource react */
import type {
  MatterhornWalletTransactionSimulationInput,
  MatterhornWalletTransactionSimulationResponse,
} from "../../../app/lib/matterhorn-server";
import { TransactionApproval } from "./TransactionApproval";
import { WalletPanel, type CryptoVenue } from "./WalletPanel";
import type { WalletStore } from "./state/wallet-store";
import { useSessionWallet } from "./useSessionWallet";
import type { ReviewedActionOperation } from "@matterhorn-work/types";

export function SessionWalletPanel(props: {
  store: WalletStore;
  initialVenue: CryptoVenue;
  openReviewedAction: boolean;
  initialReviewedActionOperation: ReviewedActionOperation | null;
  workspaceId?: string | null;
  sessionId?: string | null;
}) {
  const sessionWallet = useSessionWallet(props.store);

  return (
    <WalletPanel
      store={props.store}
      gasPriceGwei={sessionWallet.gasPriceGwei}
      blockExplorerUrl={sessionWallet.blockExplorerUrl}
      initialVenue={props.initialVenue}
      openReviewedAction={props.openReviewedAction}
      initialReviewedActionOperation={props.initialReviewedActionOperation}
      workspaceId={props.workspaceId}
      sessionId={props.sessionId}
    />
  );
}

export function SessionTransactionApproval(props: {
  store: WalletStore;
  onSimulateTransaction?: (
    input: MatterhornWalletTransactionSimulationInput,
  ) => Promise<MatterhornWalletTransactionSimulationResponse>;
}) {
  const sessionWallet = useSessionWallet(props.store);

  return (
    <TransactionApproval
      store={props.store}
      onApprove={() => sessionWallet.approveTx()}
      onReject={sessionWallet.rejectTx}
      onSimulateTransaction={props.onSimulateTransaction}
      onExecuteBatchStep={sessionWallet.executeBatchStep}
    />
  );
}
