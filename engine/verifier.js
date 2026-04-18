const CLAIM_TYPES = ['Opinion', 'Reasoned Inference', 'Assumption', 'Verified', 'Contradicted', 'Unverifiable']

const verifierSystemPrompt = `You are a claim verifier in a parliamentary debate system. You do not argue. You do not have opinions. You classify and verify. Be precise and consistent.`

function extractClaimsPrompt(anonymousLabel, argument) {
  return `A parliament member (${anonymousLabel}) made the following argument:

---
${argument}
---

Extract every distinct claim from this argument. For each claim, classify it:

- Opinion: subjective, no evidence basis, cannot be proven true or false
- Reasoned Inference: logical conclusion from stated premises — the logic can be evaluated
- Assumption: stated or implied as fact but no evidence given — could be true or false
- Verified: you can confirm this is factually accurate from your knowledge
- Contradicted: you know this to be factually incorrect
- Unverifiable: requires real-time data or external verification you cannot perform

Respond in exactly this format, one claim per block:

CLAIM: [the claim, stated precisely]
TYPE: [Opinion / Reasoned Inference / Assumption / Verified / Contradicted / Unverifiable]
REASONING: [one sentence — why you assigned this type]
---`
}

function inflationCheckPrompt(previousLabels, currentArgument, anonymousLabel) {
  const prev = previousLabels.map(l => `- "${l.claim}" was labeled: ${l.type}`).join('\n')

  return `A parliament member (${anonymousLabel}) previously made these claims with these labels:

${prev}

They have now made this argument under pressure from the Judge:

---
${currentArgument}
---

Check: did they restate any previous claim with inflated confidence?
For example: a claim previously labeled "Opinion" now stated as if it were fact.

For each restated claim found, respond in this format:

ORIGINAL_CLAIM: [the original claim]
ORIGINAL_TYPE: [original label]
NEW_CLAIM: [how they restated it]
NEW_TYPE: [what label it deserves now]
INFLATED: YES / NO
REASON: [one sentence]
---

If no inflation detected, respond with: NO_INFLATION_DETECTED`
}

function searchGroundingPrompt(claim) {
  return `Verify the following claim using your knowledge. Be precise — do not speculate.

CLAIM: ${claim}

Respond in this format:

VERDICT: Verified / Contradicted / Unverifiable
CONFIDENCE: Low / Medium / High
EVIDENCE: [one or two sentences — what you know that supports this verdict. If Unverifiable, state why.]`
}

export class Verifier {
  constructor(adapter) {
    this.adapter = adapter
    this.claimHistory = new Map() // adapterId → [{ claim, type, round }]
  }

  async extractAndLabel(roundData, round) {
    const results = []

    for (const { adapterId, argument } of roundData) {
      if (!argument) continue

      // Extract the CLAIMS section if structured format was followed
      const claimsSection = argument.split('CLAIMS:')[1]
      const argumentSection = argument.split('CLAIMS:')[0].replace('ARGUMENT:', '').trim()

      const targetText = claimsSection
        ? `ARGUMENT:\n${argumentSection}\n\nCLAIMS:\n${claimsSection}`
        : argument

      try {
        const raw = await this.adapter.query(
          extractClaimsPrompt(adapterId, targetText),
          verifierSystemPrompt,
          400
        )

        const claims = this._parseClaims(raw)

        // Store for inflation tracking
        if (!this.claimHistory.has(adapterId)) {
          this.claimHistory.set(adapterId, [])
        }
        this.claimHistory.get(adapterId).push(...claims.map(c => ({ ...c, round })))

        // Ground any Assumption or Unverifiable claims with knowledge check
        for (const claim of claims) {
          if (claim.type === 'Assumption' || claim.type === 'Unverifiable') {
            try {
              const groundingRaw = await this.adapter.query(
                searchGroundingPrompt(claim.claim),
                verifierSystemPrompt,
                150
              )
              const grounded = this._parseGrounding(groundingRaw)
              if (grounded.verdict === 'Verified' || grounded.verdict === 'Contradicted') {
                claim.type = grounded.verdict
                claim.groundingEvidence = grounded.evidence
                claim.groundingConfidence = grounded.confidence
              }
            } catch {
              // keep original label if grounding fails
            }
          }
        }

        results.push({ adapterId, claims, round })
      } catch {
        results.push({ adapterId, claims: [], round })
      }
    }

    return results
  }

  async checkInflation(adapterId, currentArgument, round) {
    const history = this.claimHistory.get(adapterId)
    if (!history || history.length === 0) return []

    const previousLabels = history.filter(c => c.round < round)
    if (previousLabels.length === 0) return []

    try {
      const raw = await this.adapter.query(
        inflationCheckPrompt(previousLabels, currentArgument, adapterId),
        verifierSystemPrompt,
        300
      )

      if (raw.includes('NO_INFLATION_DETECTED')) return []
      return this._parseInflation(raw)
    } catch {
      return []
    }
  }

  _parseClaims(raw) {
    const blocks = raw.split('---').map(b => b.trim()).filter(Boolean)
    return blocks.map(block => {
      const claim = this._extract(block, 'CLAIM')
      const type = CLAIM_TYPES.find(t => this._extract(block, 'TYPE')?.toLowerCase().includes(t.toLowerCase())) || 'Unverifiable'
      const reasoning = this._extract(block, 'REASONING')
      return { claim, type, reasoning }
    }).filter(c => c.claim)
  }

  _parseGrounding(raw) {
    const verdictRaw = this._extract(raw, 'VERDICT')
    const verdict = ['Verified', 'Contradicted', 'Unverifiable'].find(v =>
      verdictRaw?.toLowerCase().includes(v.toLowerCase())
    ) || 'Unverifiable'
    const confidence = this._extract(raw, 'CONFIDENCE') || 'Low'
    const evidence = this._extract(raw, 'EVIDENCE') || ''
    return { verdict, confidence, evidence }
  }

  _parseInflation(raw) {
    const blocks = raw.split('---').map(b => b.trim()).filter(Boolean)
    return blocks
      .map(block => ({
        originalClaim: this._extract(block, 'ORIGINAL_CLAIM'),
        originalType: this._extract(block, 'ORIGINAL_TYPE'),
        newClaim: this._extract(block, 'NEW_CLAIM'),
        newType: this._extract(block, 'NEW_TYPE'),
        inflated: this._extract(block, 'INFLATED') === 'YES',
        reason: this._extract(block, 'REASON')
      }))
      .filter(b => b.inflated && b.originalClaim)
  }

  _extract(text, key) {
    const match = text.match(new RegExp(`${key}:\\s*(.+)`, 'i'))
    return match ? match[1].trim() : null
  }

  reset() {
    this.claimHistory = new Map()
  }
}
