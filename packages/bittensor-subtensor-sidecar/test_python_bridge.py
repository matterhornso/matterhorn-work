#!/usr/bin/env python3
"""Offline compatibility tests for the public-only Bittensor SDK bridge."""

from __future__ import annotations

import importlib.util
import io
import json
import sys
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from types import ModuleType, SimpleNamespace


BRIDGE_PATH = Path(__file__).with_name("python_bridge.py")
SPEC = importlib.util.spec_from_file_location("matterhorn_bittensor_bridge", BRIDGE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load python_bridge.py")
bridge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bridge)


class Balance:
    def __init__(self, tao: float):
        self.tao = tao
        self.rao = int(tao * 1_000_000_000)

    @classmethod
    def from_tao(cls, value: float):
        return cls(value)


class Subtensor:
    def __init__(self):
        self.calls = []

    def compose_call(self, **kwargs):
        self.calls.append(kwargs)
        return kwargs

    def get_extrinsic_fee(self, call, keypair):
        assert keypair == "public-keypair"
        assert call
        return Balance(0.0001)

    def get_stake_add_fee(self, amount, netuid):
        assert amount.rao == 100_000_000
        assert netuid == 14
        return Balance(0.00005)

    def get_unstake_fee(self, netuid, amount):
        assert netuid == 14
        assert amount.rao == 100_000_000
        return Balance(0.00004)


def install_module(name: str, **attributes):
    module = ModuleType(name)
    for key, value in attributes.items():
        setattr(module, key, value)
    sys.modules[name] = module
    return module


def install_hierarchy():
    install_module("bittensor")
    install_module("bittensor.core")
    install_module("bittensor.core.extrinsics")
    install_module("bittensor.utils")
    install_module("bittensor.utils.balance", Balance=Balance)


install_hierarchy()
bridge.public_keypair = lambda _: "public-keypair"


class StakingParams:
    @staticmethod
    def add_stake(**kwargs):
        return {"kind": "add", **kwargs}

    @staticmethod
    def unstake(**kwargs):
        return {"kind": "remove", **kwargs}


install_module("bittensor.core.extrinsics.params", StakingParams=StakingParams)
subtensor = Subtensor()
stake = {"action": "stake", "coldkey": "5sender", "hotkey": "5hotkey", "netuid": 14}
unstake = {**stake, "action": "unstake"}
assert bridge.network_fee_tao(subtensor, stake, 0.1) == 0.0001
assert bridge.network_fee_tao(subtensor, unstake, 0.1) == 0.0001
assert bridge.swap_fee_tao(subtensor, stake, 0.1) == 0.00005
assert bridge.swap_fee_tao(subtensor, unstake, 0.1) == 0.00004


class Pallet:
    def __init__(self, _subtensor):
        pass

    def add_stake(self, **kwargs):
        return {"kind": "pallet-add", **kwargs}

    def remove_stake(self, **kwargs):
        return {"kind": "pallet-remove", **kwargs}


install_module("bittensor.core.extrinsics.params")
install_module("bittensor.core.extrinsics.pallets", SubtensorModule=Pallet)
fallback_subtensor = Subtensor()
assert bridge.network_fee_tao(fallback_subtensor, stake, 0.1) == 0.0001
assert bridge.network_fee_tao(fallback_subtensor, unstake, 0.1) == 0.0001


modern = SimpleNamespace(Subtensor=lambda network: {"network": network})
bridge.import_bittensor = lambda: modern
assert bridge.get_subtensor() == {"network": "finney"}


class LiveSubtensor:
    def __init__(self):
        self.head_reads = 0

    def get_current_block(self):
        self.head_reads += 1
        return 9136713

    def all_subnets(self, block=None):
        assert block == 9136713
        return [SimpleNamespace(netuid=n, subnet_name=f"Subnet {n}") for n in range(128)]


live = LiveSubtensor()
bridge.get_subtensor = lambda: live
listing = bridge.subnets({"limit": 128})
assert len(listing["subnets"]) == 128
assert live.head_reads == 1
assert all(row["block"] == 9136713 for row in listing["subnets"])
assert listing["freshness"] == "live"

bridge.get_subtensor = lambda: SimpleNamespace()
for action in (bridge.health, bridge.subnets):
    try:
        action({})
        raise AssertionError("Unavailable chain must not be labelled live/healthy")
    except RuntimeError:
        pass

bridge.get_subtensor = lambda: SimpleNamespace(get_current_block=lambda: 9136713, all_subnets=lambda **_: [])
try:
    bridge.subnets({})
    raise AssertionError("An empty failed read must not be labelled live")
except RuntimeError:
    pass

def noisy_health(_payload):
    print("SDK diagnostic output")
    return {"ok": True, "block": 9136713}


original_argv, original_stdin, original_health = sys.argv, sys.stdin, bridge.health
out, err = io.StringIO(), io.StringIO()
try:
    sys.argv = [str(BRIDGE_PATH), "health"]
    sys.stdin = io.StringIO("{}")
    bridge.health = noisy_health
    with redirect_stdout(out), redirect_stderr(err):
        assert bridge.main() == 0
    assert json.loads(out.getvalue()) == {"ok": True, "block": 9136713}
    assert "SDK diagnostic output" in err.getvalue()
finally:
    sys.argv, sys.stdin, bridge.health = original_argv, original_stdin, original_health

print("Bittensor Python bridge compatibility tests passed.")
