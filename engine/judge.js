const judgeSystemPrompt = `You are the Speaker of a parliamentary debate. You do not argue. You do not pick sides. You do not vote. Your only job is procedural: ensure the strongest argument wins, not the most popular one. You are ruthlessly fair.`

function challengePrompt(verifiedClaims, currentVoteCounts, round) {
  const claimSummary = verifiedClaims.map(({ adapterId, claims }) => {
    const weak = claims.filter(c => c.type === 'Opinion' || c.type === 'Assumption')
    if (weak.length === 0) return null
    return `${adapterId}:\n${weak.map(c => `  - [${c.type}] ${c.claim}`).join('\n')}`
  }).filter(Boolean).join('\n\n')

  const voteBlock = Object.entries(currentVoteCounts)
    .map(([vote, count]) => `  ${vote}: ${count} models`)
    .join('\n')

  return `You are the Speaker reviewing Round ${round} of a parliamentary debate.

CURRENT VOTE DISTRIBUTION (anonymous):
${voteBlock}

WEAK CLAIMS MADE THIS ROUND (already labeled by the Verifier):
${claimSummary || 'None flagged.'}

Your task:
1. Identify the weakest claim that is currently WINNING support — the argument that models are agreeing with despite being Opinion or Assumption level, not evidence.
2. Issue a direct challenge to that argument. Do not reveal which model made it.
3. If no weak claim has significant support, issue NO_CHALLENGE.

Respond in this format:

CHALLENGE_TARGET: [the exact claim being challenged, quoted]
CHALLENGE: [your direct question — what evidence or logical basis supports this claim?]
REASON: [one sentence — why this claim is dangerous to accept without scrutiny]

Or if nothing needs challenging:
NO_CHALLENGE`
}

function defectionChallengePrompt(adapterId, previousVote, currentVote, currentArgument) {
  return `A parliament member changed their vote this round.

Previous vote: ${previousVote}
Current vote: ${currentVote}

Their argument this round:
---
${currentArgument}
---

Did they provide a specific reason for changing their vote, or did they simply restate a new position?

Respond in this format:

JUSTIFIED: YES / NO
REASON: [one sentence — what specifically justified the change, or what was missing]
FOLLOW_UP: [if NO — one direct question the Speaker should ask them, else NONE]`
}

function scoreArgumentPrompt(allArguments, round) {
  const formatted = allArguments.map((a, i) =>
    `Argument ${i + 1}:\n${a.argument}\n\nClaims labeled:\n${
      a.claims.map(c => `  [${c.type}] ${c.claim}`).join('\n')
    }`
  ).join('\n\n---\n\n')

  return `You are scoring arguments from Round ${round} of a parliamentary debate. Arguments are anonymous.

${formatted}

Score each argument on:
1. Logic quality — does the conclusion follow from the premises?
2. Evidence quality — are claims Verified/Reasoned Inference, or just Opinion/Assumption?
3. Rebuttal quality — did it actually engage with opposing arguments?

Respond for each argument:

ARGUMENT: [number]
LOGIC_SCORE: 1-10
EVIDENCE_SCORE: 1-10
REBUTTAL_SCORE: 1-10
TOTAL: [sum]
NOTES: [one sentence]
---`
}

export class Judge {
  constructor(adapter) {
    this.adapter = adapter
    this.roundScores = [] // [{ round, scores: [{ argumentIndex, total, notes }] }]
    this.activeChallenge = null // { claim, challenge } | null
    this.consecutiveTopArgument = { argument: null, count: 0 }
  }

  async issueChallenge(verifiedClaims, currentVoteCounts, round) {
    try {
      const raw = await this.adapter.query(
        challengePrompt(verifiedClaims, currentVoteCounts, round),
        judgeSystemPrompt,
        200
      )

      if (raw.includes('NO_CHALLENGE')) {
        this.activeChallenge = null
        return null
      }

      const target = this._extract(raw, 'CHALLENGE_TARGET')
      const challenge = this._extract(raw, 'CHALLENGE')
      const reason = this._extract(raw, 'REASON')

      this.activeChallenge = { target, challenge, reason }
      return this.activeChallenge
    } catch {
      this.activeChallenge = null
      return null
    }
  }

  async checkDefection(adapterId, previousVote, currentVote, currentArgument) {
    if (previousVote === 'None' || previousVote === currentVote) return null

    try {
      const raw = await this.adapter.query(
        defectionChallengePrompt(adapterId, previousVote, currentVote, currentArgument),
        judgeSystemPrompt,
        150
      )

      const justified = this._extract(raw, 'JUSTIFIED') === 'YES'
      const reason = this._extract(raw, 'REASON')
      const followUp = this._extract(raw, 'FOLLOW_UP')

      return { adapterId, previousVote, currentVote, justified, reason, followUp: justified ? null : followUp }
    } catch {
      return null
    }
  }

  async scoreRound(allArguments, round) {
    if (allArguments.length === 0) return []

    try {
      const raw = await this.adapter.query(
        scoreArgumentPrompt(allArguments, round),
        judgeSystemPrompt,
        400
      )

      const scores = this._parseScores(raw)
      this.roundScores.push({ round, scores })

      // Track whether the top-scored argument has held for consecutive rounds
      if (scores.length > 0) {
        const top = scores.reduce((a, b) => a.total > b.total ? a : b)
        const topArgText = allArguments[top.argumentIndex - 1]?.argument || ''

        if (this.consecutiveTopArgument.argument === topArgText) {
          this.consecutiveTopArgument.count++
        } else {
          this.consecutiveTopArgument = { argument: topArgText, count: 1 }
        }
      }

      return scores
    } catch {
      return []
    }
  }

  // Returns true if the top-scored argument has held for `threshold` consecutive rounds
  checkArgumentSettlement(threshold = 3) {
    return this.consecutiveTopArgument.count >= threshold
  }

  _parseScores(raw) {
    const blocks = raw.split('---').map(b => b.trim()).filter(Boolean)
    return blocks.map(block => {
      const indexRaw = this._extract(block, 'ARGUMENT')
      const index = parseInt(indexRaw)
      const logic = parseInt(this._extract(block, 'LOGIC_SCORE')) || 0
      const evidence = parseInt(this._extract(block, 'EVIDENCE_SCORE')) || 0
      const rebuttal = parseInt(this._extract(block, 'REBUTTAL_SCORE')) || 0
      const total = parseInt(this._extract(block, 'TOTAL')) || (logic + evidence + rebuttal)
      const notes = this._extract(block, 'NOTES') || ''
      return { argumentIndex: index, logic, evidence, rebuttal, total, notes }
    }).filter(s => !isNaN(s.argumentIndex))
  }

  _extract(text, key) {
    const match = text.match(new RegExp(`${key}:\\s*(.+)`, 'i'))
    return match ? match[1].trim() : null
  }

  reset() {
    this.roundScores = []
    this.activeChallenge = null
    this.consecutiveTopArgument = { argument: null, count: 0 }
  }
}
