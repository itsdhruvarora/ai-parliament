# AI Parliament — Design Document

## The Problem With Current Multi-Model Debate

The existing approach is: models argue in rounds, vote each round, first to get 3 votes wins.

This has a fundamental flaw — **convergence is not the same as correctness.**

LLMs are trained to be agreeable. When a model reads a transcript where 3 others have voted the same way, it finds reasons to agree — not because the argument was strong, but because social pressure in text form is still social pressure. The best argument doesn't win. The argument with the head start wins.

In short: it's not a debate. It's a meeting.

---

## What a Real Debate Needs

For the best argument to win, three things must be true:

1. **Arguments are evaluated on logic, not popularity**
2. **Factual claims can be verified or challenged with evidence**
3. **Position changes must be justified, not just stated**

The current architecture has no mechanism for any of these. This document proposes one.

---

## The Core Insight — Separation of Roles

The fix is not better prompts. The fix is **separating who argues, who verifies, and who judges** — giving each a different information view so none of them can be socially pressured by the others.

```
MODELS     → argue
VERIFIER   → label and ground claims
JUDGE      → challenge weak reasoning, manage procedure
```

These three never see the same thing at the same time.

---

## Architecture

### 1. The Models (Parliament Members)

- Argue as they do today
- **Arguments are anonymized before being shown to anyone else** — names stripped, structured format enforced so writing style cannot identify the author
- Never see Verifier feedback directly — cannot learn to game the labeling system
- Never see vote counts before casting their own vote

### 2. The Verifier

A separate model instance whose only job is classification and fact-checking. It is never in an adversarial position so hallucination risk is low.

**What it does each round:**
- Receives all arguments, still anonymized
- Extracts individual claims from each argument
- Labels each claim:
  - `Opinion` — subjective, no evidence basis
  - `Reasoned Inference` — logical conclusion from stated premises
  - `Assumption` — stated as fact but unverifiable
  - `Verified` — confirmed across multiple sources
  - `Contradicted` — searched and found to be false

**On factual claims:**
- Searches multiple sources, collates results
- Majority signal across sources determines Verified vs Contradicted
- A claim verified by a single source stays `Assumption` — requires corroboration

**Consistency rule:**
- Tracks claim labels across rounds
- If a model re-states the same claim with inflated confidence under pressure (Opinion → Known Fact), flags it as **confidence inflation**
- First occurrence of a specific factual statistic mid-debate under pressure is automatically flagged `Unverifiable` regardless of stated confidence — genuine facts don't appear only when cornered

### 3. The Judge (Speaker)

A separate model instance that sees labeled claims but not who made them. Its job is procedural — ensuring the best argument wins, not picking a side.

**What it does each round:**
- Receives Verifier-labeled claims
- Identifies the weakest claim that has the most support — the argument winning on popularity rather than strength
- Challenges it: asks whoever made it to provide actual evidence or logical basis
- Tracks position changes: if a model flips its vote, the Judge asks what specifically changed — models must justify defections, not just state them
- Never votes, never argues, never joins a coalition

---

## Context Management — The Token Problem

With Verifier labels, Judge challenges, and model responses, the transcript grows faster than the base system. Standard summarization loses information. This is solved with a two-layer context structure:

### Rolling Window
Last 2 rounds of full prose are passed to the next round. Models get enough recent context to understand the direction and tone of the debate.

### Pinned Claims Board
A structured, compressed record of every unresolved contested claim. Lives alongside the rolling window. Much smaller than full transcript.

**A claim is added to the board when:**
- The Judge explicitly challenges it
- The Verifier flags it as inflated or contradicted

**A claim is dropped from the board when:**
- The model that made it explicitly concedes it
- The Verifier marks it `Contradicted` by evidence

**Not by vote. Not by the Judge. Only by evidence or self-concession.** This is the critical rule — it removes social pressure from the garbage collection process entirely.

### What each round receives:
```
Last 2 rounds (full prose)
+
Pinned Claims Board (structured, compressed, only unresolved)
```

Everything older than 2 rounds is claim-extracted and either pinned if contested or discarded if resolved.

---

## Settlement

Current system: 3 models vote the same → settled.

**Proposed:** The top-scored argument (as evaluated by the Judge on logical merit) must hold its position for 3 consecutive rounds.

This means:
- A weak argument supported by many cannot settle the debate
- A strong argument supported by few stays alive
- Convergence still matters but must be grounded in argument quality

---

## Full Round Flow

```
1. Models write arguments (blind to each other this round)

2. Arguments anonymized — names stripped, format normalized

3. Verifier receives anonymized arguments:
   - Extracts claims
   - Labels each claim
   - Searches factual claims across multiple sources
   - Flags confidence inflation vs previous round

4. Judge receives labeled claims:
   - Identifies weakest claim with most support
   - Issues challenge to that argument
   - Flags any unjustified position changes from last round

5. Models receive:
   - Other models' anonymized labeled arguments
   - Judge's challenges (addressed to the argument, not the model)
   - Rolling window (last 2 rounds)
   - Pinned Claims Board

6. Models respond:
   - Must address Judge's challenge if their argument was flagged
   - Vote

7. Pinned board updated:
   - Conceded or contradicted claims dropped
   - Newly contested claims added

8. Check settlement:
   - Top-scored argument held for 3 rounds → settled
   - Otherwise next round begins
```

---

## What This Fixes

| Problem | Current System | Proposed System |
|---------|---------------|-----------------|
| Sycophancy cascade | No defence | Blind voting + Judge challenges majority |
| Hallucination under pressure | Unchecked | Verifier flags confidence inflation |
| Unverified factual claims | Accepted as-is | Multi-source search, labeled |
| Style fingerprinting | Full anonymity impossible | Structured format normalizes output |
| Token limit collapse | Summarization loses info | Rolling window + pinned board |
| Vote flipping without reason | Just stated | Judge requires justification |
| Best argument vs most popular | No distinction | Judge scores on logic, not votes |

---

## What Makes This Novel

No existing open source multi-model debate framework separates argue, verify, and judge into distinct roles with distinct information views.

The pipeline is designed so that social pressure — the core failure mode of LLM consensus — has no path through the system:

- Models can't see who said what
- Models can't see vote counts before voting
- Models can't learn to game the Verifier
- Claims can only be resolved by evidence or concession, never by majority

The parliament decides. The evidence adjudicates.

---

## Open Questions

- Should the Judge role rotate across models or be fixed to one?
- Should the Verifier be the same model every round or rotated for consistency?
- What confidence threshold across sources counts as `Verified` vs `Assumption`?
- Should models be told a claim was challenged without knowing which model made it?

---

*Designed through collaborative brainstorming. Implementation to follow.*
