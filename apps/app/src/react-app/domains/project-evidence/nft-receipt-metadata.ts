import type { MatterhornProjectEvidenceMetadata } from "@matterhorn-work/types/project-evidence";

export type NftReceiptMetadata = {
  kind?: "mint" | "listing" | string;
  network?: string;
  transactionDigest?: string;
  objectId?: string;
  packageId?: string;
  kioskId?: string;
  transferPolicyId?: string;
  custody?: boolean;
  containsSignatureMaterial?: boolean;
};

function stringField(metadata: MatterhornProjectEvidenceMetadata | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanField(metadata: MatterhornProjectEvidenceMetadata | undefined, key: string): boolean | undefined {
  const value = metadata?.[key];
  return typeof value === "boolean" ? value : undefined;
}

export function nftReceiptMetadataFromEvidence(
  metadata: MatterhornProjectEvidenceMetadata | undefined,
): NftReceiptMetadata | undefined {
  const receipt: NftReceiptMetadata = {
    kind: stringField(metadata, "nftReceiptKind"),
    network: stringField(metadata, "nftNetwork"),
    transactionDigest: stringField(metadata, "nftTransactionDigest"),
    objectId: stringField(metadata, "nftObjectId"),
    packageId: stringField(metadata, "nftPackageId"),
    kioskId: stringField(metadata, "nftKioskId"),
    transferPolicyId: stringField(metadata, "nftTransferPolicyId"),
    custody: booleanField(metadata, "custody"),
    containsSignatureMaterial: booleanField(metadata, "containsSignatureMaterial"),
  };

  return Object.values(receipt).some((value) => value !== undefined) ? receipt : undefined;
}

export function compactNftReceiptValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function nftReceiptKindLabel(kind: NftReceiptMetadata["kind"]): string {
  if (kind === "listing") return "Listing";
  if (kind === "mint") return "Mint";
  return "NFT";
}
