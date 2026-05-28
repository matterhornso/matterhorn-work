# Build Command — Web3 Skills

**PREREQUISITE CHECK:**
```bash
ls .opencode/skills/web3/usdc-transfer.md 2>/dev/null && echo "PREREQ OK: TX pipeline landed" || echo "PREREQ FAIL — Feature 3 (TX pipeline) should be merged first"
```
**Continue even if prereq fails — skills can be created independently.**

---

## Task 4.1: Create 24 skill files

Create all 24 files under `.opencode/skills/web3/`. Each file must include:
- One sentence description
- Supported chains
- Contract addresses table (use well-known addresses where available)
- 2-3 common operations with steps
- Gas considerations if relevant

The full list is in `.claude/rules/web3-skills.md`.

**For each skill file you create, verify it exists:**
```bash
ls .opencode/skills/web3/<slug>.md && echo "CREATED" || echo "MISSING"
```

**After creating all 24:**
```bash
ls .opencode/skills/web3/*.md | wc -l
# Expected: 25 (24 skills + INDEX.md if created)
```

---

## Task 4.2: Create skill index

Create `.opencode/skills/web3/INDEX.md` — catalog grouped by category:
DeFi, Derivatives & Trading, Staking & Restaking, Infrastructure & Data, DePIN, Payments & Infrastructure, Bridges

**VERIFY:**
```bash
cat .opencode/skills/web3/INDEX.md | head -20
# Expected: shows category headings with skill links
```

---

## Task 4.3: Final count

```bash
echo "Skills created: $(ls .opencode/skills/web3/ | wc -l | tr -d ' ') files"
# Expected: 25 files
```

---

## Task 4.4: Commit and push

```bash
git checkout dev && git pull origin dev
git checkout -b feat/web3-skills
git add .opencode/skills/web3/
git commit -m "feat: 24 Web3 skill pack — DeFi, DePIN, payments, staking"
git push origin feat/web3-skills
```
