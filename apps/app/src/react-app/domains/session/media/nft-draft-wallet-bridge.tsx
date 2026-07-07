/** @jsxImportSource react */
import { useCallback, useMemo, useState } from "react";
import {
  useCurrentAccount,
  useCurrentWallet,
  useWalletConnection,
  useWallets,
} from "@mysten/dapp-kit-react";

import type {
  MatterhornNftReceiptRequest,
} from "@matterhorn-work/types/generated-media";
import { suiDAppKit } from "../../../infra/sui-dapp-kit";
import { NftDraftPanel, type NftDraftPanelProps, type NftWalletExecutionState } from "./nft-draft-panel";
import {
  buildKioskListingTransactionFromPlan,
  buildMintTransactionFromPlan,
  receiptFromSuiWalletResult,
  suiNetworkFromNftPlan,
  type MatterhornSuiWalletExecutionReceipt,
} from "./sui-nft-transaction-plan";

export type NftDraftWalletBridgeProps = Omit<NftDraftPanelProps, "walletExecution">;

export function NftDraftWalletBridge(props: NftDraftWalletBridgeProps) {
  const connection = useWalletConnection();
  const wallets = useWallets();
  const account = useCurrentAccount();
  const wallet = useCurrentWallet();
  const [walletError, setWalletError] = useState<string | null>(null);
  const [connectingWalletId, setConnectingWalletId] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [lastMintReceipt, setLastMintReceipt] = useState<MatterhornSuiWalletExecutionReceipt | null>(null);
  const [lastListingReceipt, setLastListingReceipt] = useState<MatterhornSuiWalletExecutionReceipt | null>(null);

  const walletOptions = useMemo(() => (
    wallets.slice(0, 3).map((availableWallet) => ({
      id: walletOptionId(availableWallet.name, availableWallet.version),
      name: availableWallet.name,
      icon: availableWallet.icon,
    }))
  ), [wallets]);

  const connectWallet = useCallback(async (walletId: string) => {
    const nextWallet = wallets.find((availableWallet) => walletOptionId(availableWallet.name, availableWallet.version) === walletId);
    if (!nextWallet) {
      setWalletError("Sui wallet was not found.");
      return;
    }

    setWalletError(null);
    setConnectingWalletId(walletId);
    try {
      await suiDAppKit.connectWallet({ wallet: nextWallet });
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : "Could not connect Sui wallet.");
    } finally {
      setConnectingWalletId(null);
    }
  }, [wallets]);

  const disconnectWallet = useCallback(async () => {
    setWalletError(null);
    setConnectingWalletId("disconnect");
    try {
      await suiDAppKit.disconnectWallet();
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : "Could not disconnect Sui wallet.");
    } finally {
      setConnectingWalletId(null);
    }
  }, []);

  const signMint = useCallback(async () => {
    const preview = props.mintPreview;
    const transactionPlan = preview?.transactionPlan;
    if (!transactionPlan) {
      setWalletError("Prepare a mint preview before signing.");
      return;
    }
    if (!account?.address) {
      setWalletError("Connect the Sui wallet that will mint this NFT.");
      return;
    }
    if (transactionPlan.sender && transactionPlan.sender.toLowerCase() !== account.address.toLowerCase()) {
      setWalletError("The connected Sui wallet does not match the mint preview sender.");
      return;
    }

    setWalletError(null);
    setLastMintReceipt(null);
    setSigning(true);
    try {
      const transaction = buildMintTransactionFromPlan(transactionPlan, account.address);
      const result = await suiDAppKit.signAndExecuteTransaction({
        transaction,
        account,
        network: suiNetworkFromNftPlan(transactionPlan),
      });
      const receipt = receiptFromSuiWalletResult(result);
      setLastMintReceipt(receipt);
      if (receipt.status === "failure") {
        setWalletError(receipt.error || "The Sui wallet returned a failed transaction.");
        return;
      }
      if (!receipt.objectId) {
        setWalletError("The wallet returned a digest, but not the minted object id. Paste the object id below to record the receipt.");
        return;
      }

      const request: MatterhornNftReceiptRequest = {
        transactionDigest: receipt.digest,
        objectId: receipt.objectId,
        network: transactionPlan.network,
        packageId: preview.handoff.packageId,
      };
      await props.onRecordMintReceipt(request);
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : "Could not sign mint transaction.");
    } finally {
      setSigning(false);
    }
  }, [account, props]);

  const signListing = useCallback(async () => {
    const preview = props.listingPreview;
    const transactionPlan = preview?.transactionPlan;
    if (!transactionPlan) {
      setWalletError("Prepare a listing preview before signing.");
      return;
    }
    if (!account?.address) {
      setWalletError("Connect the Sui wallet that owns this Kiosk.");
      return;
    }
    if (transactionPlan.sender && transactionPlan.sender.toLowerCase() !== account.address.toLowerCase()) {
      setWalletError("The connected Sui wallet does not match the listing preview sender.");
      return;
    }

    setWalletError(null);
    setLastListingReceipt(null);
    setSigning(true);
    try {
      const transaction = buildKioskListingTransactionFromPlan(transactionPlan, account.address);
      const result = await suiDAppKit.signAndExecuteTransaction({
        transaction,
        account,
        network: suiNetworkFromNftPlan(transactionPlan),
      });
      const receipt = receiptFromSuiWalletResult(result);
      setLastListingReceipt(receipt);
      if (receipt.status === "failure") {
        setWalletError(receipt.error || "The Sui wallet returned a failed listing transaction.");
        return;
      }

      const request: MatterhornNftReceiptRequest = {
        transactionDigest: receipt.digest,
        objectId: transactionPlan.nftObjectId,
        network: transactionPlan.network,
        kioskId: transactionPlan.kioskId,
        transferPolicyId: transactionPlan.transferPolicyId,
      };
      await props.onRecordListingReceipt(request);
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : "Could not sign listing transaction.");
    } finally {
      setSigning(false);
    }
  }, [account, props]);

  const walletExecution: NftWalletExecutionState = {
    directWalletAvailable: true,
    connectedAddress: account?.address ?? null,
    walletName: wallet?.name ?? null,
    walletOptions,
    isConnecting: connection.isConnecting || Boolean(connectingWalletId),
    isSigning: signing,
    error: walletError,
    lastMintReceipt,
    lastListingReceipt,
    onConnectWallet: connectWallet,
    onDisconnectWallet: disconnectWallet,
    onSignMint: signMint,
    onSignListing: signListing,
  };

  return <NftDraftPanel {...props} walletExecution={walletExecution} />;
}

function walletOptionId(name: string, version?: string) {
  return `${name}::${version ?? "unknown"}`;
}
