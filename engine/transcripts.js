import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

export function generateTranscripts(result) {
  const dir = join(process.cwd(), 'output', result.debateId)
  mkdirSync(dir, { recursive: true })

  writeFileSync(join(dir, 'raw.json'), JSON.stringify(result, null, 2))

  writeFileSync(join(dir, 'full_transcript.md'), buildFullTranscript(result))

  for (const adapter of getUniqueAdapters(result)) {
    writeFileSync(
      join(dir, `individual_${adapter.id}.md`),
      buildIndividualTranscript(result, adapter)
    )
  }

  writeFileSync(join(dir, 'coalition_story.md'), buildCoalitionStory(result))

  writeFileSync(join(dir, 'analysis.md'), buildAnalysis(result))

  return dir
}

function getUniqueAdapters(result) {
  const seen = new Set()
  const adapters = []
  for (const round of result.transcript) {
    for (const r of round.responses) {
      if (!seen.has(r.adapterId)) {
        seen.add(r.adapterId)
        adapters.push({ id: r.adapterId, name: r.name })
      }
    }
  }
  return adapters
}

function buildFullTranscript(result) {
  const lines = []
  lines.push(`# Council of AI — Full Transcript`)
  lines.push(`**Debate ID:** ${result.debateId}`)
  lines.push(`**Date:** ${new Date(result.timestamp).toLocaleString()}`)
  lines.push(`**Outcome:** ${result.outcome.outcome.toUpperCase()}${result.outcome.vote ? ` — ${result.outcome.vote}` : ''}`)
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## Problem Statement')
  lines.push('')
  lines.push(result.problemStatement)
  lines.push('')

  if (result.chairAnswers) {
    lines.push('## Chair\'s Answers')
    lines.push('')
    lines.push(result.chairAnswers)
    lines.push('')
  }

  lines.push('---')
  lines.push('')
  lines.push('## Clarification Phase')
  lines.push('')
  lines.push('### Round 1 — Blind Questions')
  for (const q of result.clarifications.round1) {
    lines.push(`**${q.name}**`)
    lines.push(`- Question: ${q.question}`)
    lines.push(`- Assumption: ${q.assumption}`)
    lines.push('')
  }

  lines.push('### Round 2 — After Seeing All Questions')
  for (const q of result.clarifications.round2) {
    lines.push(`**${q.name}**`)
    lines.push(`- Status: ${q.status}`)
    if (q.endorse && q.endorse !== 'NONE') lines.push(`- Endorses: ${q.endorse}`)
    lines.push(`- Updated assumption: ${q.assumption}`)
    if (q.followUp && q.followUp !== 'NONE') lines.push(`- Follow-up: ${q.followUp}`)
    lines.push('')
  }

  lines.push('---')
  lines.push('')
  lines.push('## Pre-Mortem Predictions')
  lines.push('')
  for (const pm of result.preMortems) {
    lines.push(`**${pm.name}:** ${pm.prediction}`)
  }
  lines.push('')

  lines.push('---')
  lines.push('')
  lines.push('## The Debate')
  lines.push('')

  for (const round of result.transcript) {
    lines.push(`## Round ${round.round}`)
    lines.push('')
    for (const r of round.responses) {
      lines.push(`### ${r.name}`)
      lines.push('')
      lines.push(r.argument)
      lines.push('')
      lines.push(`> **Vote:** ${r.vote} | **Confidence:** ${r.confidence}`)
      if (r.direction) lines.push(`> → *${r.direction}*`)
      if (r.defection) lines.push(`> ⚡ *Defection: ${r.defection}*`)
      if (r.lobby) lines.push(`> 🗣 *Lobby: ${r.lobby}*`)
      lines.push('')
    }
    lines.push('---')
    lines.push('')
  }

  if (result.outcome.outcome === 'deadlock') {
    lines.push('## Final Deadlock Vote')
    lines.push('')
    for (const v of result.outcome.finalVotes) {
      lines.push(`**${v.name}:** ${v.vote} (${v.confidence})`)
      if (v.sideWith) lines.push(`  Sides with: ${v.sideWith}`)
      if (v.reasoning) lines.push(`  ${v.reasoning}`)
      lines.push('')
    }
  }

  return lines.join('\n')
}

function buildIndividualTranscript(result, adapter) {
  const lines = []
  lines.push(`# ${adapter.name} — Individual Transcript`)
  lines.push(`**Debate:** ${result.debateId}`)
  lines.push('')
  lines.push('## Pre-Mortem Prediction')
  const pm = result.preMortems.find(p => p.adapterId === adapter.id)
  lines.push(pm ? pm.prediction : 'N/A')
  lines.push('')

  lines.push('## Round by Round')
  lines.push('')

  for (const round of result.transcript) {
    const response = round.responses.find(r => r.adapterId === adapter.id)
    if (!response) continue

    lines.push(`### Round ${round.round}`)
    lines.push('')
    lines.push(response.argument)
    lines.push('')
    lines.push(`**Vote:** ${response.vote} | **Confidence:** ${response.confidence}`)
    if (response.defection) lines.push(`\n⚡ **Defected:** ${response.defection}`)
    if (response.lobby) lines.push(`\n🗣 **Lobbying:** ${response.lobby}`)
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

function buildCoalitionStory(result) {
  const lines = []
  lines.push('# Coalition Story')
  lines.push(`**Debate:** ${result.debateId}`)
  lines.push('')

  const coalitionEvents = []
  const seen = new Set()

  for (const round of result.transcript) {
    for (const r of round.responses) {
      if (r.defection) {
        coalitionEvents.push(`Round ${round.round}: **${r.name}** defected — "${r.defection}"`)
      }
      if (r.lobby) {
        coalitionEvents.push(`Round ${round.round}: **${r.name}** lobbied — "${r.lobby}"`)
      }
    }
  }

  if (coalitionEvents.length === 0) {
    lines.push('*No coalitions formed during this debate.*')
  } else {
    for (const event of coalitionEvents) {
      lines.push(`- ${event}`)
    }
  }

  lines.push('')
  lines.push('## Final Outcome')
  lines.push('')
  if (result.outcome.outcome === 'settlement') {
    lines.push(`Settlement reached in Round ${result.outcome.round}: **${result.outcome.vote}**`)
    if (result.outcome.coalition) {
      lines.push(`Winning coalition: ${result.outcome.coalition.name}`)
    }
  } else {
    lines.push('**DEADLOCK** — No majority after 10 rounds.')
  }

  return lines.join('\n')
}

function buildAnalysis(result) {
  const a = result.analysis
  if (!a) return '# Analysis\n\nAnalysis unavailable.'

  const lines = []
  lines.push('# Debate Analysis')
  lines.push('')
  lines.push(`**Core disagreement:** ${a.disagreementAxis}`)
  lines.push('')
  lines.push(`**Assumption conflict:** ${a.assumptionConflict}`)
  lines.push('')
  lines.push(`**Decision hinges on:** ${a.decisionHingesOn}`)
  lines.push('')
  lines.push(`**Biggest uncertainty:** ${a.biggestUncertainty}`)
  lines.push('')
  if (a.bestSolutionProposed) {
    lines.push(`**Best solution proposed:** ${a.bestSolutionProposed}`)
    lines.push('')
  }
  if (a.whatToBuild) {
    lines.push('## → What to Build Next')
    lines.push('')
    lines.push(`**${a.whatToBuild}**`)
    lines.push('')
  }
  if (a.fakeConsensus) {
    lines.push(`⚠️ **Superficial agreement detected:** ${a.fakeConsensusNote}`)
  } else {
    lines.push('✅ Agreement appears genuine — models converged for consistent reasons.')
  }

  lines.push('')
  lines.push('## Pre-Mortem vs Reality')
  lines.push('')
  for (const pm of result.preMortems) {
    lines.push(`**${pm.name} predicted:** ${pm.prediction}`)
  }
  lines.push('')
  lines.push(`**Actual outcome:** ${result.outcome.outcome} — ${result.outcome.vote || 'deadlocked'}`)

  return lines.join('\n')
}
