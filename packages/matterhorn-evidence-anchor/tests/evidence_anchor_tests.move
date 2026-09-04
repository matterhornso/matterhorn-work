#[test_only]
module matterhorn_evidence_anchor::evidence_anchor_tests;

use matterhorn_evidence_anchor::evidence_anchor;
use sui::test_scenario;

const WALLET: address = @0xA11CE;
const WALRUS_OBJECT: address = @0xB10B;

fun digest(byte: u8): vector<u8> {
    vector[
        byte, byte, byte, byte, byte, byte, byte, byte,
        byte, byte, byte, byte, byte, byte, byte, byte,
        byte, byte, byte, byte, byte, byte, byte, byte,
        byte, byte, byte, byte, byte, byte, byte, byte,
    ]
}
#[test]
fun stores_only_the_reviewed_non_content_fields() {
    let mut scenario = test_scenario::begin(WALLET);
    let anchor = evidence_anchor::new_for_testing(
        digest(1),
        digest(2),
        WALRUS_OBJECT,
        7,
        12,
        scenario.ctx(),
    );
    assert!(evidence_anchor::schema_version(&anchor) == 1);
    assert!(evidence_anchor::batch_id(&anchor) == &digest(1));
    assert!(evidence_anchor::merkle_root(&anchor) == &digest(2));
    assert!(evidence_anchor::walrus_object_id(&anchor) == WALRUS_OBJECT);
    assert!(evidence_anchor::certified_epoch(&anchor) == 7);
    assert!(evidence_anchor::valid_until_epoch(&anchor) == 12);
    evidence_anchor::destroy_for_testing(anchor);
    scenario.end();
}

#[test, expected_failure(abort_code = evidence_anchor::EInvalidBatchId)]
fun rejects_short_batch_id() {
    let mut scenario = test_scenario::begin(WALLET);
    let anchor = evidence_anchor::new_for_testing(
        vector[1], digest(2), WALRUS_OBJECT, 7, 12, scenario.ctx(),
    );
    evidence_anchor::destroy_for_testing(anchor);
    scenario.end();
}

#[test, expected_failure(abort_code = evidence_anchor::EInvalidMerkleRoot)]
fun rejects_short_merkle_root() {
    let mut scenario = test_scenario::begin(WALLET);
    let anchor = evidence_anchor::new_for_testing(
        digest(1), vector[2], WALRUS_OBJECT, 7, 12, scenario.ctx(),
    );
    evidence_anchor::destroy_for_testing(anchor);
    scenario.end();
}

#[test, expected_failure(abort_code = evidence_anchor::EInvalidEpochWindow)]
fun rejects_empty_epoch_window() {
    let mut scenario = test_scenario::begin(WALLET);
    let anchor = evidence_anchor::new_for_testing(
        digest(1), digest(2), WALRUS_OBJECT, 7, 7, scenario.ctx(),
    );
    evidence_anchor::destroy_for_testing(anchor);
    scenario.end();
}

#[test, expected_failure(abort_code = evidence_anchor::EInvalidEpochWindow)]
fun rejects_oversized_epoch_window() {
    let mut scenario = test_scenario::begin(WALLET);
    let anchor = evidence_anchor::new_for_testing(
        digest(1), digest(2), WALRUS_OBJECT, 7, 61, scenario.ctx(),
    );
    evidence_anchor::destroy_for_testing(anchor);
    scenario.end();
}
