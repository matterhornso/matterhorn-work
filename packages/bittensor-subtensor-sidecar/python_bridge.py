#!/usr/bin/env python3
"""Optional official-SDK bridge for the Matterhorn Bittensor sidecar.

The Node sidecar runs without Python dependencies in mock mode. Set
BITTENSOR_SIDECAR_MODE=python only in an environment that has the official
`bittensor` Python package installed and network access to the target Subtensor.

This bridge intentionally never accepts seed phrases, mnemonics, private keys,
SURI strings, or keyfiles. It only performs public reads, unsigned preview
normalization, and optional signed-payload submission when the surrounding
sidecar enables submission explicitly.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any


FORBIDDEN_KEY_PARTS = (
    "seed",
    "mnemonic",
    "private",
    "secret",
    "password",
    "passphrase",
    "keyfile",
    "suri",
)


def read_payload() -> dict[str, Any]:
    raw = sys.stdin.read().strip()
    if not raw:
      return {}
    return json.loads(raw)


def forbidden_key_path(value: Any, path: list[str] | None = None) -> str | None:
    path = path or []
    if isinstance(value, list):
        for index, item in enumerate(value):
            nested = forbidden_key_path(item, [*path, str(index)])
            if nested:
                return nested
        return None
    if not isinstance(value, dict):
        return None
    for key, child in value.items():
        if any(part in key.lower() for part in FORBIDDEN_KEY_PARTS):
            return ".".join([*path, key])
        nested = forbidden_key_path(child, [*path, key])
        if nested:
            return nested
    return None


def write(value: dict[str, Any]) -> None:
    print(json.dumps(value, separators=(",", ":")))


def import_bittensor():
    try:
        import bittensor as bt  # type: ignore

        return bt
    except Exception as exc:  # pragma: no cover - depends on local SDK install
        raise RuntimeError(
            "The official bittensor Python package is not installed or could not be imported. "
            "Install it and run the sidecar with BITTENSOR_SIDECAR_MODE=python."
        ) from exc


def get_subtensor():
    bt = import_bittensor()
    network = os.environ.get("BITTENSOR_NETWORK", "finney")
    try:
        return bt.subtensor(network=network)
    except TypeError:
        return bt.subtensor(network)


def metagraph(payload: dict[str, Any]) -> dict[str, Any]:
    netuid = int(payload.get("netuid", 0))
    subtensor = get_subtensor()
    mg = subtensor.metagraph(netuid=netuid)
    neurons = []
    hotkeys = list(getattr(mg, "hotkeys", []) or [])
    coldkeys = list(getattr(mg, "coldkeys", []) or [])
    uids = list(getattr(mg, "uids", []) or range(len(hotkeys)))
    stake = list(getattr(mg, "S", []) or getattr(mg, "stake", []) or [])
    trust = list(getattr(mg, "T", []) or getattr(mg, "trust", []) or [])
    validator_trust = list(getattr(mg, "Tv", []) or getattr(mg, "validator_trust", []) or [])
    dividends = list(getattr(mg, "D", []) or getattr(mg, "dividends", []) or [])
    emission = list(getattr(mg, "E", []) or getattr(mg, "emission", []) or [])
    validator_permit = list(getattr(mg, "validator_permit", []) or [])

    for index, hotkey in enumerate(hotkeys[:256]):
        neurons.append(
            {
                "uid": int(uids[index]) if index < len(uids) else index,
                "hotkey": str(hotkey),
                "coldkey": str(coldkeys[index]) if index < len(coldkeys) else None,
                "stake": float(stake[index]) if index < len(stake) else None,
                "trust": float(trust[index]) if index < len(trust) else None,
                "validator_trust": float(validator_trust[index]) if index < len(validator_trust) else None,
                "dividends": float(dividends[index]) if index < len(dividends) else None,
                "emission": float(emission[index]) if index < len(emission) else None,
                "active": True,
                "validator_permit": bool(validator_permit[index]) if index < len(validator_permit) else None,
            }
        )

    return {
        "network": os.environ.get("BITTENSOR_NETWORK", "finney"),
        "netuid": netuid,
        "block": int(getattr(mg, "block", 0) or 0),
        "n": int(getattr(mg, "n", len(neurons)) or len(neurons)),
        "neurons": neurons,
        "source": "bittensor-python-sdk",
    }


def wallet(payload: dict[str, Any]) -> dict[str, Any]:
    ss58 = str(payload.get("ss58Address") or "")
    subtensor = get_subtensor()
    balance = None
    try:
        raw_balance = subtensor.get_balance(ss58)
        balance = float(getattr(raw_balance, "tao", raw_balance))
    except Exception:
        balance = None
    return {
        "ss58Address": ss58,
        "taoBalance": balance,
        "stakePositions": [],
        "estimatedValueTao": balance,
        "providerStatus": "ok",
        "updatedAt": None,
        "message": "Loaded public wallet balance from the official Bittensor SDK. Stake-position expansion is handled by the sidecar contract and can be extended per SDK version.",
    }


def quote(payload: dict[str, Any]) -> dict[str, Any]:
    amount = payload.get("amountTao")
    try:
        amount_tao = float(amount) if amount is not None else None
    except Exception:
        amount_tao = None
    return {
        "action": payload.get("action", "stake"),
        "netuid": payload.get("netuid"),
        "amountTao": amount_tao,
        "expectedAlpha": None,
        "feeTao": None,
        "slippageBps": None,
        "warnings": [
            "Python SDK quote bridge is enabled, but exact Dynamic TAO quote expansion depends on the installed SDK version.",
            "Build an unsigned extrinsic preview and verify in an external signer before acting.",
        ],
        "requiresExternalSignature": True,
    }


def prepare(payload: dict[str, Any]) -> dict[str, Any]:
    quoted = quote(payload)
    unsigned = {
        "chain": "bittensor",
        "network": os.environ.get("BITTENSOR_NETWORK", "finney"),
        "action": payload.get("action"),
        "netuid": payload.get("netuid") or payload.get("originNetuid"),
        "originNetuid": payload.get("originNetuid"),
        "destinationNetuid": payload.get("destinationNetuid"),
        "amountTao": quoted.get("amountTao"),
        "coldkey": payload.get("coldkey"),
        "hotkey": payload.get("hotkey"),
        "destination": payload.get("destination"),
        "rateTolerance": payload.get("rateTolerance", 0.005),
        "safeMode": True,
        "sdkMode": "python",
    }
    return {
        **quoted,
        "unsignedPayload": unsigned,
        "warnings": [
            *quoted["warnings"],
            "Unsigned payload only. This bridge does not sign or receive key material.",
        ],
    }


def submit(_: dict[str, Any]) -> dict[str, Any]:
    raise RuntimeError(
        "Signed-payload submission through the Python bridge is intentionally not implemented yet. "
        "Add SDK-version-specific submission only after signed payload verification tests are in place."
    )


def main() -> int:
    action = sys.argv[1] if len(sys.argv) > 1 else ""
    payload = read_payload()
    forbidden = forbidden_key_path(payload)
    if forbidden:
        raise RuntimeError(f"Request contains forbidden key material field: {forbidden}")

    handlers = {
        "metagraph": metagraph,
        "wallet": wallet,
        "quote": quote,
        "prepare": prepare,
        "submit": submit,
    }
    if action not in handlers:
        raise RuntimeError(f"Unknown bridge action: {action}")
    write(handlers[action](payload))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
