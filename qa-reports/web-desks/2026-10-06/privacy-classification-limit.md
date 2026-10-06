# Conservative wallet-intent false positive

The normal-account Polymarket QA request below required privacy consent before host approval, despite having no connected wallet or private attachments:

> Find three currently active Polymarket prediction markets about Bitcoin using public read tools. Summarize question, public probability, source, freshness, and data limitations. Read-only research: do not prepare or place a bet and do not access any wallet.

The keyword classifier in `apps/server/src/agent-privacy.ts` matches `place a bet and do not access any wallet`: `place` followed by `wallet` within 80 characters. It adds `transaction_intent` independently of a connected wallet. The existing anchored disclaimer filters do not cover this wording. Splitting the two negative instructions into sentences also matches because the classifier rejoins clauses and permits cross-sentence matches.

The built-in public-market starter ending `Do not prepare or place a bet.` does not trigger by itself; `bet` is not a matched destination noun, and no later wallet noun follows. The reported prompt and the starter were checked locally with the privacy classifier, without provider calls.

This change only replaces the definite consent reason `a proposed wallet action` with `text that may describe a wallet action`. Classification, consent requirements, host approval, provider privacy policy, and execution permissions remain unchanged. The original request still requires review; no consent was accepted to work around this result.

Any classifier correction is separate, security-reviewed work. Tests should cover this exact request, the standalone starter, split clauses, and adversarial combinations that append affirmative actions or use `but`/`except`. Explicit transaction mode, linked-wallet source labels, amounts/destinations, private attachments, selected memory, and secret blocking must retain their protections. Natural-language negation alone must not grant public-only treatment.
