/// Immutable, non-content integrity anchors for encrypted Matterhorn evidence.
///
/// The object deliberately contains no account, workspace, coworker, wallet,
/// prompt, filename, transaction intent, key reference, or plaintext hash.
/// The connected wallet that invokes `anchor` is the only transaction signer;
/// Matterhorn never signs or submits this call.
module matterhorn_evidence_anchor::evidence_anchor;

use sui::object::{Self, UID};
use sui::tx_context::TxContext;

const SCHEMA_VERSION: u16 = 1;
const DIGEST_BYTES: u64 = 32;
const MAX_STORAGE_EPOCHS: u64 = 53;

#[error(code = 0)]
const EInvalidBatchId: vector<u8> = b"batch id must be 32 bytes";
#[error(code = 1)]
const EInvalidMerkleRoot: vector<u8> = b"merkle root must be 32 bytes";
#[error(code = 2)]
const EInvalidEpochWindow: vector<u8> = b"invalid Walrus epoch window";

/// A permanently immutable link between one Merkle batch and one certified
/// Walrus Blob object. `walrus_object_id` is public storage metadata, not a
/// Matterhorn tenant or wallet identifier.
public struct EvidenceAnchor has key, store {
    id: UID,
    schema_version: u16,
    batch_id: vector<u8>,
    merkle_root: vector<u8>,
    walrus_object_id: address,
    certified_epoch: u64,
    valid_until_epoch: u64,
}

/// Creates and freezes one evidence anchor. Freezing prevents the caller,
/// Matterhorn, or any later agent from mutating the reviewed proof metadata.
public fun anchor(
    batch_id: vector<u8>,
    merkle_root: vector<u8>,
    walrus_object_id: address,
    certified_epoch: u64,
    valid_until_epoch: u64,
    ctx: &mut TxContext,
) {
    let anchor = new_anchor(
        batch_id,
        merkle_root,
        walrus_object_id,
        certified_epoch,
        valid_until_epoch,
        ctx,
    );
    sui::transfer::freeze_object(anchor);
}

fun new_anchor(
    batch_id: vector<u8>,
    merkle_root: vector<u8>,
    walrus_object_id: address,
    certified_epoch: u64,
    valid_until_epoch: u64,
    ctx: &mut TxContext,
): EvidenceAnchor {
    assert!(batch_id.length() == DIGEST_BYTES, EInvalidBatchId);
    assert!(merkle_root.length() == DIGEST_BYTES, EInvalidMerkleRoot);
    assert!(valid_until_epoch > certified_epoch, EInvalidEpochWindow);
    assert!(valid_until_epoch - certified_epoch <= MAX_STORAGE_EPOCHS, EInvalidEpochWindow);
    EvidenceAnchor {
        id: object::new(ctx),
        schema_version: SCHEMA_VERSION,
        batch_id,
        merkle_root,
        walrus_object_id,
        certified_epoch,
        valid_until_epoch,
    }
}

public fun schema_version(anchor: &EvidenceAnchor): u16 { anchor.schema_version }
public fun batch_id(anchor: &EvidenceAnchor): &vector<u8> { &anchor.batch_id }
public fun merkle_root(anchor: &EvidenceAnchor): &vector<u8> { &anchor.merkle_root }
public fun walrus_object_id(anchor: &EvidenceAnchor): address { anchor.walrus_object_id }
public fun certified_epoch(anchor: &EvidenceAnchor): u64 { anchor.certified_epoch }
public fun valid_until_epoch(anchor: &EvidenceAnchor): u64 { anchor.valid_until_epoch }

#[test_only]
public fun new_for_testing(
    batch_id: vector<u8>,
    merkle_root: vector<u8>,
    walrus_object_id: address,
    certified_epoch: u64,
    valid_until_epoch: u64,
    ctx: &mut TxContext,
): EvidenceAnchor {
    new_anchor(
        batch_id,
        merkle_root,
        walrus_object_id,
        certified_epoch,
        valid_until_epoch,
        ctx,
    )
}

#[test_only]
public fun destroy_for_testing(anchor: EvidenceAnchor) {
    let EvidenceAnchor { id, schema_version: _, batch_id: _, merkle_root: _,
        walrus_object_id: _, certified_epoch: _, valid_until_epoch: _ } = anchor;
    id.delete();
}
