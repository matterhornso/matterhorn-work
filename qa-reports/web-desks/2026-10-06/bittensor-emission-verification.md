# Bittensor emission verification

QA-only verification, 2026-10-06. SDK execution succeeded; the remaining issue is an unsupported interpretation in the model's answer, not a failed public-chain read.

## Evidence and method

- Read the existing isolated sidecar with `GET http://127.0.0.1:60914/subnets?limit=3`. It returned HTTP 200, source `bittensor-python-sdk`, freshness `live`, block **9220069**, and fetched-at `2026-10-05T23:36:27.175838Z` (UTC).
- Independently queried the same Finney block using the pinned **bittensor 10.5.0** SDK in `/private/tmp/matterhorn-bittensor-qa.XPfoE0/venv`: `with bittensor.Subtensor(network="finney") as subtensor: rows = subtensor.all_subnets(block=9220069)`.
- The independent process used `env -i PATH=/usr/bin:/bin READ_ONLY=1 PYTHONDONTWRITEBYTECODE=1` and printed only the netuids and selected numeric emission attributes for 0, 1 and 2. No wallet, signing, submission, inference or private credential was used. The sidecar and active QA application were not restarted or changed.

## Observed values

| Netuid | SDK `emission.rao` | Sidecar `emission` | SDK `alpha_out_emission` (alpha units) | SDK `tao_in_emission` (TAO) |
| --- | ---: | ---: | ---: | ---: |
| 0 | 0 | 0 | 0 | 0 |
| 1 | 0 | 0 | 1 | 0.000037529 |
| 2 | 0 | 0 | 1 | 0.000000189 |

All three SDK objects had an explicit `emission` attribute with both `rao = 0` and `tao = 0`. The other columns are distinct metrics, not substitute values for that field. SDK `Balance.tao` is the 1e9-scaled numeric accessor; the alpha metric retains its subnet alpha unit, not TAO.

## Source check and interpretation

- Installed SDK `bittensor/core/chain_data/dynamic_info.py` declares `emission: Balance` and decodes the mandatory `decoded["emission"]` with `Balance.from_rao`; it does not default a missing emission to zero.
- Repository `packages/bittensor-subtensor-sidecar/python_bridge.py`, `serialize_dynamic_info`, selects the first present field from `emission`, `subnet_emission`, `alpha_out_emission`, `tao_in_emission`. `get_any` retains an explicit zero; `to_float` converts it without substituting a default.
- `apps/server/src/tools/bittensor.ts`, `normalizeSubnet`, preserves that numeric `emission` field. This verification found no normalization-induced zero.

The defensible statement is: **the SDK's specific `emission` field was zero at the verified block**. It is not evidence that all subnet emissions were zero. The model's **“likely snapshot artifact”** explanation was not established by these checks and must not be endorsed. Why the chain exposes zero in that specific field was not investigated here.

This spot check used block 9220069; it did not replay the browser answer's earlier block 9220062. There were no product changes.
