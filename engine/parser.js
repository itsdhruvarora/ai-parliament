const VALID_VOTES = ['Proceed', 'Pivot', 'Stop', 'Abort', 'Recuse']
const VALID_CONFIDENCE = ['Low', 'Medium', 'High']

export function parseVote(rawResponse) {
  const voteSection = rawResponse.split('=== VOTE ===')[1] || rawResponse.split('=== FINAL VOTE ===')[1] || ''
  const argument = rawResponse.split('=== VOTE ===')[0] || rawResponse.split('=== FINAL VOTE ===')[0] || rawResponse

  const extract = (key) => {
    const regex = new RegExp(`${key}:\\s*(.+)`, 'i')
    const match = voteSection.match(regex)
    return match ? match[1].trim() : null
  }

  const rawVote = extract('Vote')
  const vote = VALID_VOTES.find(v => rawVote?.toLowerCase().includes(v.toLowerCase())) || 'Pivot'

  const rawConf = extract('Confidence')
  const confidence = VALID_CONFIDENCE.find(c => rawConf?.toLowerCase().includes(c.toLowerCase())) || 'Low'

  const direction = extract('Direction') || null
  const coalitionRaw = extract('Coalition') || 'Independent'
  const lobby = extract('Lobby') || null
  const defection = extract('Defection') || null
  const reasoning = extract('Reasoning') || null
  const sideWith = extract('Side_with') || null

  let coalitionAction = { type: 'independent' }
  if (coalitionRaw.toLowerCase().startsWith('propose:')) {
    coalitionAction = { type: 'propose', position: coalitionRaw.replace(/propose:/i, '').trim() }
  } else if (coalitionRaw.toLowerCase().startsWith('join:')) {
    coalitionAction = { type: 'join', name: coalitionRaw.replace(/join:/i, '').trim() }
  } else if (coalitionRaw.toLowerCase().startsWith('leave:')) {
    coalitionAction = { type: 'leave', name: coalitionRaw.replace(/leave:/i, '').trim() }
  }

  return {
    argument: argument.trim(),
    vote,
    direction: direction !== 'NONE' ? direction : null,
    confidence,
    coalitionAction,
    lobby: lobby !== 'NONE' ? lobby : null,
    defection: defection !== 'NONE' ? defection : null,
    reasoning,
    sideWith
  }
}

export function parseClarification(rawResponse) {
  const extract = (key) => {
    const regex = new RegExp(`${key}:\\s*(.+)`, 'i')
    const match = rawResponse.match(regex)
    return match ? match[1].trim() : null
  }

  return {
    question: extract('QUESTION'),
    assumption: extract('ASSUMPTION'),
    status: extract('STATUS') || 'KEEP',
    endorse: extract('ENDORSE'),
    followUp: extract('FOLLOW_UP'),
    raw: rawResponse
  }
}

export function parsePreMortem(rawResponse) {
  const match = rawResponse.match(/PREDICTION:\s*(.+)/i)
  return match ? match[1].trim() : rawResponse.trim()
}

export function parseAnalysis(rawResponse) {
  const extract = (key) => {
    const regex = new RegExp(`${key}:\\s*(.+)`, 'i')
    const match = rawResponse.match(regex)
    return match ? match[1].trim() : null
  }

  return {
    disagreementAxis: extract('DISAGREEMENT_AXIS'),
    assumptionConflict: extract('ASSUMPTION_CONFLICT'),
    decisionHingesOn: extract('DECISION_HINGES_ON'),
    biggestUncertainty: extract('BIGGEST_UNCERTAINTY'),
    bestSolutionProposed: extract('BEST_SOLUTION_PROPOSED'),
    whatToBuild: extract('WHAT_TO_BUILD'),
    fakeConsensus: extract('FAKE_CONSENSUS') === 'YES',
    fakeConsensusNote: extract('FAKE_CONSENSUS_NOTE')
  }
}
