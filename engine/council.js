import { nanoid } from 'nanoid'
import { CoalitionManager } from './coalitions.js'
import { parseVote, parseClarification, parsePreMortem, parseAnalysis } from './parser.js'
import {
  systemPrompt,
  clarificationRound1Prompt,
  clarificationRound2Prompt,
  preMortemPrompt,
  round1Prompt,
  debateRoundPrompt,
  deadlockFinalVotePrompt,
  whyTheyDisagreePrompt,
  summarizerPrompt
} from './prompts.js'

const MAX_ROUNDS = parseInt(process.env.MAX_ROUNDS || '10')
const SETTLEMENT_THRESHOLD = parseInt(process.env.SETTLEMENT_THRESHOLD || '3')
const SUMMARIZE_AFTER_ROUND = 5

export class Council {
  constructor(adapters, onEvent) {
    this.adapters = adapters
    this.onEvent = onEvent || (() => {})
    this.coalitionManager = new CoalitionManager()
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

  buildTranscriptText(upToRound) {
    return this.roundTranscripts
      .slice(0, upToRound)
      .map((round, i) =>
        `--- Round ${i + 1} ---\n` +
        round.map(r => `${r.name}:\n${r.argument}`).join('\n\n')
      ).join('\n\n')
  }

  async runDebate(problemStatement) {
    this.emit('debate_start', { debateId: this.debateId, adapters: this.adapters.map(a => ({ id: a.id, name: a.name })) })

    const previousVotes = {}
    this.adapters.forEach(a => { previousVotes[a.id] = 'None' })

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      this.emit('round_start', { round, maxRounds: MAX_ROUNDS })

      let transcriptContext = this.buildTranscriptText(round - 1)

      if (round > SUMMARIZE_AFTER_ROUND) {
        try {
          const summaryAdapter = this.adapters.find(a => a.id === 'gpt') || this.adapters[0]
          const summary = await summaryAdapter.query(
            summarizerPrompt(transcriptContext, round - 1),
            systemPrompt(summaryAdapter),
            400
          )
          transcriptContext = `[Summary of rounds 1-${round - 1}]:\n${summary}`
        } catch (e) {
          // fall back to full transcript
        }
      }

      const coalitionStatus = this.coalitionManager.getStatus()
      const roundTokens = round === 1 ? 500 : 350

      const results = await this.queryAll(
        (adapter) => round === 1
          ? round1Prompt(problemStatement, this.chairAnswers)
          : debateRoundPrompt(
              problemStatement,
              round,
              transcriptContext,
              coalitionStatus,
              previousVotes[adapter.id]
            ),
        roundTokens,
        `round_${round}`
      )

      const isOpeningRound = round === 1

      const roundData = results.map(({ adapter, response }) => {
        if (isOpeningRound) {
          // Strip any vote block the model wrote despite being told not to
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
        openingRound: isOpeningRound
      })

      if (!isOpeningRound) {
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

    const fullTranscript = this.buildTranscriptText(MAX_ROUNDS)

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
