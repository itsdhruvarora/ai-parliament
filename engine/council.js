import { nanoid } from 'nanoid'
import { CoalitionManager } from './coalitions.js'
import { Anonymizer } from './anonymizer.js'
import { Verifier } from './verifier.js'
import { Judge } from './judge.js'
import { PinnedClaimsBoard } from './pinnedclaims.js'
import { parseVote, parseClarification, parsePreMortem, parseAnalysis } from './parser.js'
import {
  systemPrompt,
  clarificationRound1Prompt,
  clarificationRound2Prompt,
  preMortemPrompt,
  round1Prompt,
  debateRoundPrompt,
  deadlockFinalVotePrompt,
  whyTheyDisagreePrompt
} from './prompts.js'

const MAX_ROUNDS = parseInt(process.env.MAX_ROUNDS || '10')
const SETTLEMENT_THRESHOLD = parseInt(process.env.SETTLEMENT_THRESHOLD || '3')
const ROLLING_WINDOW = 2 // full rounds kept in context

export class Council {
  constructor(adapters, onEvent) {
    this.adapters = adapters
    this.onEvent = onEvent || (() => {})
    this.coalitionManager = new CoalitionManager()
    this.anonymizer = new Anonymizer(adapters)

    // Pick the most capable available adapter for Verifier and Judge
    const systemAdapter = adapters.find(a => a.id === 'claude-sonnet') ||
                          adapters.find(a => a.id === 'gpt-4o') ||
                          adapters[0]
    this.verifier = new Verifier(systemAdapter)
    this.judge = new Judge(systemAdapter)
    this.pinnedClaims = new PinnedClaimsBoard()

    this.debateId = nanoid(8)
    this.transcript = []
    this.roundTranscripts = []
    this.preMortems = []
    this.clarifications = []
    this.chairAnswers = null
    this.costTracker = { totalTokens: 0, estimatedCost: 0, byModel: {} }
  }

  emit(type, data) {
    this.onEvent({ type, ...data })
  }

  async queryAll(promptFn, maxTokens, phase) {
    this.emit('phase_start', { phase })

    const results = await Promise.all(
      this.adapters.map(async (adapter) => {
        this.emit('model_thinking', { adapterId: adapter.id, name: adapter.name, phase })
        try {
          const prompt = typeof promptFn === 'function' ? promptFn(adapter) : promptFn
          const response = await adapter.query(prompt, systemPrompt(adapter), maxTokens)
          this.emit('model_response', { adapterId: adapter.id, name: adapter.name, response, phase })
          return { adapter, response, error: null }
        } catch (err) {
          this.emit('model_error', { adapterId: adapter.id, name: adapter.name, error: err.message })
          return { adapter, response: null, error: err.message }
        }
      })
    )

    return results.filter(r => r.response !== null)
  }

  async runClarificationPhase(problemStatement) {
    this.emit('phase_start', { phase: 'clarification_1', message: 'Models asking clarifying questions...' })

    const round1Results = await this.queryAll(
      () => clarificationRound1Prompt(problemStatement),
      80,
      'clarification_1'
    )

    const round1Parsed = round1Results.map(({ adapter, response }) => ({
      adapterId: adapter.id,
      name: adapter.name,
      ...parseClarification(response),
      raw: response
    }))

    this.emit('clarification_questions', { questions: round1Parsed })

    this.emit('phase_start', { phase: 'clarification_2', message: 'Models reviewing each other\'s questions...' })

    const round2Results = await this.queryAll(
      (adapter) => clarificationRound2Prompt(problemStatement, round1Parsed),
      120,
      'clarification_2'
    )

    const round2Parsed = round2Results.map(({ adapter, response }) => ({
      adapterId: adapter.id,
      name: adapter.name,
      ...parseClarification(response),
      raw: response
    }))

    this.clarifications = { round1: round1Parsed, round2: round2Parsed }
    this.emit('clarification_complete', { clarifications: this.clarifications })

    return this.clarifications
  }

  async runPreMortem(problemStatement) {
    this.emit('phase_start', { phase: 'premortem', message: 'Models making their predictions...' })

    const results = await this.queryAll(
      () => preMortemPrompt(problemStatement),
      80,
      'premortem'
    )

    this.preMortems = results.map(({ adapter, response }) => ({
      adapterId: adapter.id,
      name: adapter.name,
      prediction: parsePreMortem(response)
    }))

    this.emit('premortem_complete', { preMortems: this.preMortems })
    return this.preMortems
  }

  // Returns rolling window (last N rounds full prose) + pinned claims board
  buildTranscriptContext(currentRound) {
    const windowStart = Math.max(0, currentRound - ROLLING_WINDOW)
    const recentRounds = this.roundTranscripts
      .slice(windowStart, currentRound)
      .map((round, i) => {
        const roundNum = windowStart + i + 1
        return `--- Round ${roundNum} ---\n` +
          round.map(r =>
            `${this.anonymizer.labelFor(r.adapterId)}:\n${this.anonymizer.anonymizeText(r.argument)}`
          ).join('\n\n')
      }).join('\n\n')

    const pinned = this.pinnedClaims.render()

    return `RECENT ROUNDS (last ${ROLLING_WINDOW}):\n${recentRounds}\n\n` +
           `CONTESTED CLAIMS BOARD (unresolved — must be conceded or contradicted by evidence to close):\n${pinned}`
  }

  async runDebate(problemStatement) {
    this.emit('debate_start', { debateId: this.debateId, adapters: this.adapters.map(a => ({ id: a.id, name: a.name })) })

    const previousVotes = {}
    this.adapters.forEach(a => { previousVotes[a.id] = 'None' })

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      this.emit('round_start', { round, maxRounds: MAX_ROUNDS })

      const transcriptContext = this.buildTranscriptContext(round - 1)
      const coalitionStatus = this.anonymizer.anonymizeCoalitions(this.coalitionManager.getStatus())
      const roundTokens = round === 1 ? 500 : 400

      // Attach active Judge challenge to the prompt if one exists
      const judgeChallenge = this.judge.activeChallenge
        ? `\nSPEAKER CHALLENGE: "${this.judge.activeChallenge.challenge}"\n(Address this if your argument was challenged.)\n`
        : ''

      const results = await this.queryAll(
        (adapter) => round === 1
          ? round1Prompt(problemStatement, this.chairAnswers)
          : debateRoundPrompt(
              problemStatement,
              round,
              transcriptContext,
              coalitionStatus,
              previousVotes[adapter.id],
              judgeChallenge
            ),
        roundTokens,
        `round_${round}`
      )

      const isOpeningRound = round === 1

      const roundData = results.map(({ adapter, response }) => {
        if (isOpeningRound) {
          const strippedResponse = response.split('=== VOTE ===')[0].split('=== FINAL VOTE ===')[0].trim()
          return {
            adapterId: adapter.id,
            name: adapter.name,
            argument: strippedResponse,
            vote: null,
            confidence: null,
            coalitionAction: { type: 'independent' },
            lobby: null,
            defection: null,
            raw: response
          }
        }
        const parsed = parseVote(response)
        let vote = parsed.vote
        if (vote === 'Abort' && round <= 3) vote = 'Pivot'
        previousVotes[adapter.id] = vote
        return {
          adapterId: adapter.id,
          name: adapter.name,
          argument: parsed.argument,
          vote,
          confidence: parsed.confidence,
          coalitionAction: parsed.coalitionAction,
          lobby: parsed.lobby,
          defection: parsed.defection,
          raw: response
        }
      })

      this.roundTranscripts.push(roundData)
      this.transcript.push({ round, responses: roundData })

      // ── Verifier pass ────────────────────────────────────────────────────
      let verifiedClaims = []
      if (!isOpeningRound) {
        try {
          verifiedClaims = await this.verifier.extractAndLabel(roundData, round)

          // Pin claims the Verifier marked Contradicted or that were Assumptions challenged last round
          for (const { adapterId, claims } of verifiedClaims) {
            for (const claim of claims) {
              if (claim.type === 'Contradicted') {
                this.pinnedClaims.contradict(claim.claim, round, claim.groundingEvidence)
              } else if (claim.type === 'Assumption') {
                this.pinnedClaims.pin(claim.claim, claim.type, adapterId, round)
              }
            }
          }

          // Check inflation on models that changed their vote
          for (const r of roundData) {
            if (previousVotes[r.adapterId] !== 'None' && previousVotes[r.adapterId] !== r.vote) {
              const inflations = await this.verifier.checkInflation(r.adapterId, r.argument, round)
              if (inflations.length > 0) {
                this.emit('inflation_detected', { adapterId: r.adapterId, name: r.name, inflations })
              }
            }
          }

          this.emit('verifier_complete', { round, verifiedClaims })
        } catch (e) {
          // verifier failures are non-fatal
        }
      }

      // ── Judge pass ───────────────────────────────────────────────────────
      if (!isOpeningRound) {
        try {
          const currentVoteCounts = roundData.reduce((acc, r) => {
            if (r.vote) acc[r.vote] = (acc[r.vote] || 0) + 1
            return acc
          }, {})

          const challenge = await this.judge.issueChallenge(verifiedClaims, currentVoteCounts, round)
          if (challenge) {
            this.pinnedClaims.pin(challenge.target, 'Challenged', 'judge', round)
            this.emit('judge_challenge', { round, challenge })
          }

          // Check defections
          for (const r of roundData) {
            const prev = previousVotes[r.adapterId]
            if (prev && prev !== 'None' && prev !== r.vote) {
              const defectionResult = await this.judge.checkDefection(r.adapterId, prev, r.vote, r.argument)
              if (defectionResult && !defectionResult.justified) {
                this.emit('unjustified_defection', { round, ...defectionResult })
              }
            }
          }

          // Score arguments
          const scoringInput = roundData.map(r => ({
            argument: this.anonymizer.anonymizeText(r.argument),
            claims: verifiedClaims.find(v => v.adapterId === r.adapterId)?.claims || []
          }))
          const scores = await this.judge.scoreRound(scoringInput, round)
          this.emit('round_scores', { round, scores })
        } catch (e) {
          // judge failures are non-fatal
        }
      }

      if (!isOpeningRound) {
        this.coalitionManager.update(roundData.map(r => ({
          adapterId: r.adapterId,
          vote: r.vote,
          confidence: r.confidence,
          coalitionAction: r.coalitionAction
        })))
      }

      const coalitionStatusAfter = isOpeningRound ? [] : this.coalitionManager.getStatus()

      this.emit('round_complete', {
        round,
        responses: roundData,
        coalitions: coalitionStatusAfter,
        votes: isOpeningRound ? [] : roundData.map(r => ({ name: r.name, vote: r.vote, confidence: r.confidence })),
        openingRound: isOpeningRound,
        pinnedClaims: this.pinnedClaims.getActive()
      })

      if (!isOpeningRound) {
        // Phase 5: argument-quality settlement takes priority over vote-count settlement
        if (this.judge.checkArgumentSettlement(SETTLEMENT_THRESHOLD)) {
          const topScores = this.judge.roundScores.at(-1)?.scores || []
          const top = topScores.length > 0 ? topScores.reduce((a, b) => a.total > b.total ? a : b) : null
          this.emit('argument_settlement', { round, notes: top?.notes })
          return { outcome: 'argument_settlement', round, notes: top?.notes }
        }

        const settlement = this.coalitionManager.checkSettlement(SETTLEMENT_THRESHOLD)
        if (settlement.settled) {
          this.emit('settlement', { round, vote: settlement.vote, count: settlement.count, coalition: settlement.coalition })
          return { outcome: 'settlement', round, vote: settlement.vote, coalition: settlement.coalition }
        }
      }

      if (round === MAX_ROUNDS) {
        return await this.runDeadlock(problemStatement)
      }
    }
  }

  async runDeadlock(problemStatement) {
    this.emit('deadlock', { message: `${MAX_ROUNDS} rounds complete. No majority. Calling final vote.` })

    const fullTranscript = this.buildTranscriptContext(MAX_ROUNDS)

    const results = await this.queryAll(
      () => deadlockFinalVotePrompt(problemStatement, fullTranscript),
      150,
      'deadlock_vote'
    )

    const finalVotes = results.map(({ adapter, response }) => {
      const parsed = parseVote(response)
      return {
        adapterId: adapter.id,
        name: adapter.name,
        vote: parsed.vote,
        confidence: parsed.confidence,
        sideWith: parsed.sideWith,
        reasoning: parsed.reasoning
      }
    })

    this.emit('deadlock_votes', { finalVotes })
    return { outcome: 'deadlock', finalVotes }
  }

  async runAnalysis(problemStatement, outcome) {
    this.emit('phase_start', { phase: 'analysis', message: 'Analyzing the debate...' })

    const fullTranscript = this.buildTranscriptText(this.roundTranscripts.length)
    const finalVotes = this.roundTranscripts[this.roundTranscripts.length - 1]?.map(r => ({
      name: r.name,
      vote: r.vote,
      confidence: r.confidence
    })) || []

    const analyzerAdapter = this.adapters.find(a => a.id === 'claude-sonnet') || this.adapters[0]

    try {
      const analysisRaw = await analyzerAdapter.query(
        whyTheyDisagreePrompt(problemStatement, fullTranscript, finalVotes),
        systemPrompt(analyzerAdapter),
        200
      )
      const analysis = parseAnalysis(analysisRaw)
      this.emit('analysis_complete', { analysis })
      return analysis
    } catch (e) {
      return null
    }
  }

  async run(problemStatement, chairAnswers = null) {
    this.chairAnswers = chairAnswers
    this.coalitionManager.reset()
    this.verifier.reset()
    this.judge.reset()
    this.pinnedClaims.reset()

    await this.runClarificationPhase(problemStatement)

    this.emit('awaiting_chair', { message: 'Waiting for Chair to answer questions or pass...' })

    await this.runPreMortem(problemStatement)

    const outcome = await this.runDebate(problemStatement)

    const analysis = await this.runAnalysis(problemStatement, outcome)

    const result = {
      debateId: this.debateId,
      problemStatement,
      chairAnswers,
      clarifications: this.clarifications,
      preMortems: this.preMortems,
      transcript: this.transcript,
      outcome,
      analysis,
      timestamp: new Date().toISOString()
    }

    this.emit('debate_complete', { result })
    return result
  }
}
