#!/usr/bin/env python3
"""Offline compatibility tests for the public-only Bittensor SDK bridge."""

from __future__ import annotations

import importlib.util
import sys
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

print("Bittensor Python bridge compatibility tests passed.")
