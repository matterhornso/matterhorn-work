Read `.claude/rules/web3-skills.md` completely first. Then execute ALL 4 tasks IN ORDER:

1. Create ALL 24 skill files under `.opencode/skills/web3/`. Create each file with the protocol name slug:
   - uniswap-v5.md, aave-v4.md, jupiter.md, drift.md, polymarket.md, eigenlayer.md, pendle.md, lido.md, cow-protocol.md, oneinch.md, chainlink.md, the-graph.md, arweave.md, livepeer.md, helium.md, render.md, filecoin.md, akash.md, debridge.md, rbf-protocol.md, neon-treasury.md, cover-agent.md, escrow3.md, x402.md

   Each file must include:
   - One sentence description
   - Supported chains
   - Contract addresses table (use well-known deployed addresses where available, mark unknown with 0x... placeholder)
   - 2-3 common operations with steps and encoding details
   - Gas considerations if relevant

2. Create `.opencode/skills/web3/INDEX.md` — catalog of all 24 skills grouped by category (DeFi, Derivatives & Trading, Staking, Infrastructure, DePIN, Payments, Bridges)

3. Verify the skill directory structure:
   ```
   ls .opencode/skills/web3/
   ```
   Should show 25 files (24 skills + INDEX.md)

4. Run `git checkout -b feat/web3-skills && git add .opencode/skills/web3/ && git commit -m "feat: 24 Web3 skill pack — DeFi, DePIN, payments, staking" && git push origin feat/web3-skills`

Make each skill file genuinely useful — include real contract addresses where they exist, describe the actual function signatures, and write steps as if you're teaching an agent that has access to wallet MCP tools.
