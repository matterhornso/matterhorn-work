#!/usr/bin/env python3
"""Optional official-SDK bridge for the Matterhorn Bittensor sidecar.

The Node sidecar runs without Python dependencies in mock mode. Set
BITTENSOR_SIDECAR_MODE=python only in an environment that has the official
`bittensor` Python package installed and network access to the target Subtensor.

This bridge intentionally never accepts seed phrases, mnemonics, private keys,
SURI strings, or keyfiles. It only performs public reads and unsigned preview
normalization. Submission is not implemented or configurable.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
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
    constructor = getattr(bt, "Subtensor", None) or getattr(bt, "subtensor", None)
    if not callable(constructor):
        raise RuntimeError("The installed Bittensor SDK does not expose a Subtensor constructor.")
    try:
        return constructor(network=network)
    except TypeError:
        return constructor(network)


def to_float(value: Any) -> float | None:
    if value is None:
        return None
    for attr in ("tao", "rao"):
        nested = getattr(value, attr, None)
        if nested is not None and nested is not value:
            try:
                parsed = float(nested)
                return parsed / 1_000_000_000 if attr == "rao" else parsed
            except Exception:
                pass
    try:
        return float(value)
    except Exception:
        return None


def get_any(value: Any, names: tuple[str, ...]) -> Any:
    if isinstance(value, dict):
        for name in names:
            if name in value:
                return value[name]
    for name in names:
        if hasattr(value, name):
            try:
                return getattr(value, name)
            except Exception:
                pass
    return None


def string_or_none(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value)
    return text if text and text != "None" else None


def sequence_or_empty(*values: Any) -> list[Any]:
    for value in values:
        if value is None:
            continue
        try:
            if hasattr(value, "tolist"):
                value = value.tolist()
        except Exception:
            pass
        if isinstance(value, (str, bytes)):
            return [value]
        try:
            items = list(value)
            if items:
                return items
        except TypeError:
            return [value]
    return []


def scalar_or_none(value: Any) -> Any | None:
    if value is None:
        return None
    try:
        if hasattr(value, "item"):
            return value.item()
    except Exception:
        pass
    try:
        if hasattr(value, "ravel"):
            flattened = value.ravel()
            if len(flattened) > 0:
                return scalar_or_none(flattened[0])
    except Exception:
        pass
    return value


def bool_or_none(value: Any) -> bool | None:
    scalar = scalar_or_none(value)
    if scalar is None:
        return None
    try:
        return bool(scalar)
    except Exception:
        return None


def int_or_none(value: Any) -> int | None:
    scalar = scalar_or_none(value)
    if scalar is None:
        return None
    try:
        return int(scalar)
    except Exception:
        return None


def bounded_limit(payload: dict[str, Any], default: int = 128, maximum: int = 512) -> int:
    try:
        value = int(payload.get("limit") or default)
    except Exception:
        value = default
    return max(1, min(value, maximum))


def current_block(subtensor: Any) -> int | None:
    for name in ("get_current_block", "block"):
        method = getattr(subtensor, name, None)
        if callable(method):
            try:
                return int(method())
            except Exception:
                pass
        elif method is not None:
            try:
                return int(method)
            except Exception:
                pass
    return None


def sdk_meta(source: str, subtensor: Any | None = None) -> dict[str, Any]:
    return {
        "network": os.environ.get("BITTENSOR_NETWORK", "finney"),
        "source": source,
        "fetchedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "block": current_block(subtensor) if subtensor is not None else None,
        "freshness": "live",
    }


def health(_: dict[str, Any]) -> dict[str, Any]:
    subtensor = get_subtensor()
    return {
        "ok": True,
        "status": "healthy",
        "mode": "python",
        "network": os.environ.get("BITTENSOR_NETWORK", "finney"),
        "sdkAvailable": True,
        "canRead": True,
        "canPrepare": True,
        "canSubmit": False,
        "block": current_block(subtensor),
        "message": "Official Bittensor SDK is available for public Finney reads. Submission remains disabled.",
    }


def get_dynamic_info(subtensor: Any, netuid: int) -> Any | None:
    attempts = (
        lambda: subtensor.subnet(netuid=netuid),
        lambda: subtensor.subnet(netuid),
        lambda: subtensor.get_subnet_dynamic_info(netuid=netuid),
        lambda: subtensor.get_subnet_dynamic_info(netuid),
    )
    for attempt in attempts:
        try:
            value = attempt()
            if value is not None:
                return value
        except Exception:
            pass
    return None


def serialize_dynamic_info(info: Any, netuid: int, subtensor: Any | None = None) -> dict[str, Any]:
    name = string_or_none(get_any(info, ("subnet_name", "name", "display_name"))) or f"Subnet {netuid}"
    symbol = string_or_none(get_any(info, ("symbol", "subnet_symbol", "ticker"))) or f"SN{netuid}"
    price = to_float(get_any(info, ("price", "moving_price", "alpha_price", "subnet_price")))
    description = string_or_none(get_any(info, ("description", "summary", "emission_summary"))) or ""
    return {
        **sdk_meta("bittensor-python-sdk", subtensor),
        "netuid": netuid,
        "name": name,
        "symbol": symbol,
        "category": "Live Bittensor subnet",
        "description": description,
        "priceTao": price,
        "emission": to_float(get_any(info, ("emission", "subnet_emission", "alpha_out_emission", "tao_in_emission"))),
        "tempo": to_float(get_any(info, ("tempo",))),
        "alphaIn": to_float(get_any(info, ("alpha_in", "alphaIn"))),
        "alphaOut": to_float(get_any(info, ("alpha_out", "alphaOut"))),
        "taoIn": to_float(get_any(info, ("tao_in", "taoIn"))),
        "ownerColdkey": string_or_none(get_any(info, ("owner_coldkey", "ownerColdkey", "coldkey"))),
        "ownerHotkey": string_or_none(get_any(info, ("owner_hotkey", "ownerHotkey", "hotkey"))),
        "warnings": [],
    }


def subnets(payload: dict[str, Any]) -> dict[str, Any]:
    subtensor = get_subtensor()
    limit = bounded_limit(payload)
    rows: list[Any] = []
    for attempt in (
        lambda: subtensor.all_subnets(),
        lambda: subtensor.get_all_subnets_info(),
    ):
        try:
            value = attempt()
            if value is not None:
                rows = list(value.values()) if isinstance(value, dict) else list(value)
                break
        except Exception:
            pass
    normalized = []
    for index, row in enumerate(rows[:limit]):
        raw_netuid = get_any(row, ("netuid", "uid", "id"))
        try:
            netuid = int(raw_netuid if raw_netuid is not None else index)
        except Exception:
            netuid = index
        normalized.append(serialize_dynamic_info(row, netuid, subtensor))
    return {
        **sdk_meta("bittensor-python-sdk", subtensor),
        "subnets": normalized,
        "warnings": [] if normalized else ["The SDK did not return subnet dynamic info for this network."],
    }


def dynamic_subnet(payload: dict[str, Any]) -> dict[str, Any]:
    netuid = int(payload.get("netuid", 0))
    subtensor = get_subtensor()
    info = get_dynamic_info(subtensor, netuid)
    if info is None:
        return {
            **sdk_meta("bittensor-python-sdk", subtensor),
            "netuid": netuid,
            "name": f"Subnet {netuid}",
            "symbol": f"SN{netuid}",
            "category": "Live Bittensor subnet",
            "description": "",
            "priceTao": None,
            "emission": None,
            "tempo": None,
            "alphaIn": None,
            "alphaOut": None,
            "taoIn": None,
            "ownerColdkey": None,
            "ownerHotkey": None,
            "warnings": ["The SDK did not return Dynamic TAO data for this subnet."],
        }
    return serialize_dynamic_info(info, netuid, subtensor)


def metagraph(payload: dict[str, Any]) -> dict[str, Any]:
    netuid = int(payload.get("netuid", 0))
    subtensor = get_subtensor()
    mg = subtensor.metagraph(netuid=netuid)
    neurons = []
    hotkeys = sequence_or_empty(getattr(mg, "hotkeys", None))
    coldkeys = sequence_or_empty(getattr(mg, "coldkeys", None))
    uids = sequence_or_empty(getattr(mg, "uids", None), range(len(hotkeys)))
    stake = sequence_or_empty(getattr(mg, "S", None), getattr(mg, "stake", None))
    trust = sequence_or_empty(getattr(mg, "T", None), getattr(mg, "trust", None))
    validator_trust = sequence_or_empty(getattr(mg, "Tv", None), getattr(mg, "validator_trust", None))
    dividends = sequence_or_empty(getattr(mg, "D", None), getattr(mg, "dividends", None))
    emission = sequence_or_empty(getattr(mg, "E", None), getattr(mg, "emission", None))
    validator_permit = sequence_or_empty(getattr(mg, "validator_permit", None))

    for index, hotkey in enumerate(hotkeys[:256]):
        neurons.append(
            {
                "uid": int_or_none(uids[index]) if index < len(uids) else index,
                "hotkey": str(hotkey),
                "coldkey": str(coldkeys[index]) if index < len(coldkeys) else None,
                "stake": float(stake[index]) if index < len(stake) else None,
                "trust": float(trust[index]) if index < len(trust) else None,
                "validator_trust": float(validator_trust[index]) if index < len(validator_trust) else None,
                "dividends": float(dividends[index]) if index < len(dividends) else None,
                "emission": float(emission[index]) if index < len(emission) else None,
                "active": True,
                "validator_permit": bool_or_none(validator_permit[index]) if index < len(validator_permit) else None,
            }
        )

    return {
        **sdk_meta("bittensor-python-sdk", subtensor),
        "network": os.environ.get("BITTENSOR_NETWORK", "finney"),
        "netuid": netuid,
        "block": int(getattr(mg, "block", 0) or 0),
        "n": int(getattr(mg, "n", len(neurons)) or len(neurons)),
        "neurons": neurons,
        "totalStake": sum(item["stake"] for item in neurons if item.get("stake") is not None),
        "warnings": [],
    }


def wallet(payload: dict[str, Any]) -> dict[str, Any]:
    ss58 = str(payload.get("ss58Address") or "")
    subtensor = get_subtensor()
    balance = None
    try:
        raw_balance = subtensor.get_balance(ss58)
        balance = to_float(raw_balance)
    except Exception:
        balance = None
    stake_positions = []
    for attempt in (
        lambda: subtensor.get_stake_info_for_coldkey(coldkey_ss58=ss58),
        lambda: subtensor.get_stake_info_for_coldkey(ss58),
        lambda: subtensor.get_stake(coldkey_ss58=ss58),
        lambda: subtensor.get_stake(ss58),
    ):
        try:
            raw_stakes = attempt()
            if raw_stakes:
                rows = raw_stakes.values() if isinstance(raw_stakes, dict) else raw_stakes
                for row in rows:
                    netuid_raw = get_any(row, ("netuid", "subnet_netuid", "subnet_id"))
                    try:
                        netuid = int(netuid_raw)
                    except Exception:
                        netuid = 0
                    stake_tao = to_float(get_any(row, ("stake", "tao_stake", "taoValue", "tao_value")))
                    stake_positions.append(
                        {
                            "netuid": netuid,
                            "subnetName": f"Subnet {netuid}",
                            "validatorHotkey": string_or_none(get_any(row, ("hotkey", "hotkey_ss58", "delegate_ss58"))),
                            "coldkey": ss58,
                            "alphaAmount": to_float(get_any(row, ("alpha", "alpha_stake", "stake"))),
                            "taoValue": stake_tao,
                            "slippageRisk": "unknown",
                            "source": "bittensor-python-sdk",
                        }
                    )
                break
        except Exception:
            pass
    staked_tao = sum(item["taoValue"] for item in stake_positions if item.get("taoValue") is not None)
    return {
        **sdk_meta("bittensor-python-sdk", subtensor),
        "ss58Address": ss58,
        "taoBalance": balance,
        "freeTao": balance,
        "stakedTao": staked_tao,
        "stakePositions": stake_positions,
        "estimatedValueTao": (balance or 0) + staked_tao if balance is not None or staked_tao else balance,
        "providerStatus": "ok",
        "updatedAt": None,
        "message": "Loaded public wallet balance and stake exposure from the official Bittensor SDK where available.",
        "warnings": [] if stake_positions else ["Stake positions were unavailable or empty from the installed SDK/network."],
    }


def balance_from_tao(amount_tao: float) -> Any:
    try:
        from bittensor.utils.balance import Balance  # type: ignore

        balance_cls = Balance
    except Exception:
        bt = import_bittensor()
        balance_cls = getattr(bt, "Balance", None)
    try:
        if balance_cls is not None and hasattr(balance_cls, "from_tao"):
            return balance_cls.from_tao(amount_tao)
    except Exception:
        pass
    return amount_tao


def call_alpha_quote(info: Any, method_name: str, amount_tao: float) -> Any:
    method = getattr(info, method_name, None)
    if not callable(method):
        return None
    for amount in (balance_from_tao(amount_tao), amount_tao):
        try:
            return method(amount)
        except Exception:
            pass
    return None


def public_keypair(ss58_address: str) -> Any:
    """Build a public-only keypair for fee queries; it cannot sign."""
    try:
        from substrateinterface import Keypair  # type: ignore

        return Keypair(ss58_address=ss58_address)
    except Exception:
        bt = import_bittensor()
        keypair_cls = getattr(bt, "Keypair", None)
        if keypair_cls is None:
            raise RuntimeError("The installed SDK cannot construct a public-only keypair for fee estimation.")
        return keypair_cls(ss58_address=ss58_address)


def compose_call(subtensor: Any, module: str, function: str, params: dict[str, Any]) -> Any:
    for target in (subtensor, getattr(subtensor, "substrate", None)):
        method = getattr(target, "compose_call", None)
        if not callable(method):
            continue
        try:
            return method(call_module=module, call_function=function, call_params=params)
        except TypeError:
            try:
                return method(module, function, params)
            except Exception:
                pass
        except Exception:
            pass
    raise RuntimeError("The installed SDK could not compose this unsigned Bittensor call.")


def network_fee_tao(subtensor: Any, payload: dict[str, Any], amount_tao: float) -> float | None:
    action = str(payload.get("action") or "")
    sender = str(payload.get("coldkey") or "")
    amount = balance_from_tao(amount_tao)
    try:
        if action == "transfer":
            rao = getattr(amount, "rao", None)
            if rao is None:
                rao = int(amount_tao * 1_000_000_000)
            call = compose_call(
                subtensor,
                "Balances",
                "transfer_keep_alive",
                {"dest": str(payload.get("destination") or ""), "value": int(rao)},
            )
        else:
            netuid = int(payload.get("netuid"))
            hotkey = str(payload.get("hotkey") or "")
            rao = getattr(amount, "rao", None)
            if rao is None:
                rao = int(amount_tao * 1_000_000_000)
            try:
                from bittensor.core.extrinsics.params import StakingParams  # type: ignore

                if action == "stake":
                    params = StakingParams.add_stake(netuid=netuid, hotkey_ss58=hotkey, amount=amount)
                    call = compose_call(subtensor, "SubtensorModule", "add_stake", params)
                elif action == "unstake":
                    params_method = getattr(StakingParams, "unstake", None) or getattr(StakingParams, "remove_stake", None)
                    if not callable(params_method):
                        raise AttributeError("No unstake parameter builder is available.")
                    params = params_method(netuid=netuid, hotkey_ss58=hotkey, amount=amount)
                    call = compose_call(subtensor, "SubtensorModule", "remove_stake", params)
                else:
                    return None
            except (ImportError, AttributeError):
                from bittensor.core.extrinsics.pallets import SubtensorModule  # type: ignore

                pallet = SubtensorModule(subtensor)
                if action == "stake":
                    call = pallet.add_stake(netuid=netuid, hotkey=hotkey, amount_staked=int(rao))
                elif action == "unstake":
                    call = pallet.remove_stake(netuid=netuid, hotkey=hotkey, amount_unstaked=int(rao))
                else:
                    return None
        fee = subtensor.get_extrinsic_fee(call, public_keypair(sender))
        return to_float(fee)
    except Exception:
        return None


def swap_fee_tao(subtensor: Any, payload: dict[str, Any], amount_tao: float) -> float | None:
    action = str(payload.get("action") or "")
    if action == "transfer":
        return None
    amount = balance_from_tao(amount_tao)
    netuid = int(payload.get("netuid"))
    method_name = "get_stake_add_fee" if action == "stake" else "get_unstake_fee"
    method = getattr(subtensor, method_name, None)
    if not callable(method):
        return None
    attempts = (
        (lambda: method(amount, netuid)) if action == "stake" else (lambda: method(netuid, amount)),
        (lambda: method(netuid, amount)) if action == "stake" else (lambda: method(amount, netuid)),
        lambda: method(amount=amount, netuid=netuid),
    )
    for attempt in attempts:
        try:
            return to_float(attempt())
        except Exception:
            pass
    return None


def quote(payload: dict[str, Any]) -> dict[str, Any]:
    amount = payload.get("amountTao")
    try:
        amount_tao = float(amount) if amount is not None else None
    except Exception:
        amount_tao = None
    netuid = payload.get("netuid")
    try:
        netuid_int = int(netuid) if netuid is not None else None
    except Exception:
        netuid_int = None
    subtensor = get_subtensor()
    info = get_dynamic_info(subtensor, netuid_int) if netuid_int is not None else None
    dynamic = serialize_dynamic_info(info, netuid_int, subtensor) if info is not None and netuid_int is not None else None
    ideal_alpha = None
    expected_alpha = None
    slippage_bps = None
    if info is not None and amount_tao is not None:
        ideal = call_alpha_quote(info, "tao_to_alpha", amount_tao)
        ideal_alpha = to_float(ideal)
        with_slippage = call_alpha_quote(info, "tao_to_alpha_with_slippage", amount_tao)
        if isinstance(with_slippage, (list, tuple)) and with_slippage:
            expected_alpha = to_float(with_slippage[0])
            if len(with_slippage) > 1:
                slippage_value = to_float(with_slippage[1])
                slippage_bps = slippage_value * 10_000 if slippage_value is not None and slippage_value < 1 else slippage_value
        else:
            expected_alpha = to_float(with_slippage)
        if expected_alpha is None:
            expected_alpha = ideal_alpha
    if expected_alpha is None and amount_tao is not None and dynamic and dynamic.get("priceTao"):
        price = float(dynamic["priceTao"])
        if price > 0:
            expected_alpha = amount_tao / price
            ideal_alpha = expected_alpha
    network_fee = network_fee_tao(subtensor, payload, amount_tao) if amount_tao is not None else None
    swap_fee = swap_fee_tao(subtensor, payload, amount_tao) if amount_tao is not None else None
    return {
        **sdk_meta("bittensor-python-sdk", subtensor),
        "action": payload.get("action", "stake"),
        "netuid": netuid_int,
        "amountTao": amount_tao,
        "priceTao": dynamic.get("priceTao") if dynamic else None,
        "idealAlpha": ideal_alpha,
        "expectedAlpha": expected_alpha,
        "networkFeeTao": network_fee,
        "swapFeeTao": swap_fee,
        "slippageBps": slippage_bps,
        "rateTolerance": payload.get("rateTolerance", 0.005),
        "dynamic": dynamic,
        "warnings": [
            "Python SDK quote bridge is enabled. Verify price and slippage in the external signer before acting.",
            "Build an unsigned extrinsic preview and verify in an external signer before acting.",
        ] if info is not None else [
            "Dynamic TAO subnet data was unavailable for this quote.",
            "Build an unsigned extrinsic preview and verify in an external signer before acting.",
        ],
        "requiresExternalSignature": True,
    }


def prepare(payload: dict[str, Any]) -> dict[str, Any]:
    quoted = quote(payload)
    sender = str(payload.get("coldkey") or "")
    public_wallet = wallet({"ss58Address": sender})
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
        "availableTao": public_wallet.get("freeTao"),
        "stakePositions": public_wallet.get("stakePositions", []),
        "unsignedPayload": unsigned,
        "warnings": [
            *quoted["warnings"],
            "Unsigned payload only. This bridge does not sign or receive key material.",
        ],
    }


def main() -> int:
    action = sys.argv[1] if len(sys.argv) > 1 else ""
    payload = read_payload()
    forbidden = forbidden_key_path(payload)
    if forbidden:
        raise RuntimeError(f"Request contains forbidden key material field: {forbidden}")

    handlers = {
        "health": health,
        "subnets": subnets,
        "dynamic_subnet": dynamic_subnet,
        "metagraph": metagraph,
        "wallet": wallet,
        "quote": quote,
        "prepare": prepare,
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
