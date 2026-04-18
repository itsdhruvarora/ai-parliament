const COALITION_ARCHETYPES = {
  'Proceed': ['The Sprint Caucus', 'The Forward Bloc', 'The Builders'],
  'Pivot': ['The Realists', 'The Bridge Coalition', 'The Course-Correctors'],
  'Stop': ['The Structuralists', 'The Pause Bloc', 'The Critics'],
  'Abort': ['The Skeptics', 'The Clean Slate Coalition', 'The Hard Stop']
}

let usedNames = new Set()

function getCoalitionName(vote) {
  const options = COALITION_ARCHETYPES[vote] || ['The Coalition']
  const available = options.filter(n => !usedNames.has(n))
  const name = available.length > 0 ? available[0] : `${vote} Coalition`
  usedNames.add(name)
  return name
}

export class CoalitionManager {
  constructor() {
    this.coalitions = new Map()
    this.memberCoalitions = new Map()
  }

  update(votes) {
    const voteGroups = {}
    for (const { adapterId, vote, confidence, coalitionAction } of votes) {
      if (vote === 'Recuse') continue
      if (!voteGroups[vote]) voteGroups[vote] = []
      voteGroups[vote].push({ adapterId, confidence, coalitionAction })
    }

    for (const [vote, members] of Object.entries(voteGroups)) {
      if (members.length >= 2) {
        const existingCoalition = [...this.coalitions.values()].find(c => c.vote === vote)

        if (existingCoalition) {
          for (const { adapterId } of members) {
            if (!existingCoalition.members.includes(adapterId)) {
              existingCoalition.members.push(adapterId)
              existingCoalition.joinHistory.push({ adapterId, round: existingCoalition.roundsActive + 1 })
            }
            this.memberCoalitions.set(adapterId, existingCoalition.name)
          }
          existingCoalition.roundsActive++
        } else {
          const name = getCoalitionName(vote)
          const coalition = {
            name,
            vote,
            members: members.map(m => m.adapterId),
            confidence: members.map(m => m.confidence),
            roundsActive: 1,
            joinHistory: members.map(m => ({ adapterId: m.adapterId, round: 1 })),
            defections: []
          }
          this.coalitions.set(name, coalition)
          for (const { adapterId } of members) {
            this.memberCoalitions.set(adapterId, name)
          }
        }
      }
    }

    for (const [name, coalition] of this.coalitions.entries()) {
      const currentVoters = votes.filter(v => v.vote === coalition.vote).map(v => v.adapterId)
      const defectors = coalition.members.filter(m => !currentVoters.includes(m))

      for (const defector of defectors) {
        coalition.defections.push({ adapterId: defector, round: coalition.roundsActive })
        coalition.members = coalition.members.filter(m => m !== defector)
        this.memberCoalitions.delete(defector)
      }

      if (coalition.members.length < 2) {
        this.coalitions.delete(name)
      }
    }
  }

  getStability(coalitionName) {
    const coalition = this.coalitions.get(coalitionName)
    if (!coalition) return 'Unknown'
    const lowConf = coalition.confidence.filter(c => c === 'Low').length
    const ratio = lowConf / coalition.confidence.length
    if (ratio > 0.5) return 'High'
    if (ratio > 0.25) return 'Medium'
    return 'Low'
  }

  getStatus() {
    return [...this.coalitions.values()].map(c => ({
      name: c.name,
      vote: c.vote,
      members: c.members,
      stability: this.getStability(c.name),
      roundsActive: c.roundsActive,
      defections: c.defections
    }))
  }

  getMemberCoalition(adapterId) {
    return this.memberCoalitions.get(adapterId) || null
  }

  checkSettlement(threshold = 3) {
    const voteCounts = {}
    for (const [, coalition] of this.coalitions.entries()) {
      // Pivot is a working state, not a conclusion — never triggers settlement
      // Only Proceed and Stop can end a debate
      if (coalition.vote === 'Pivot' || coalition.vote === 'Recuse') continue
      voteCounts[coalition.vote] = (voteCounts[coalition.vote] || 0) + coalition.members.length
    }

    for (const [vote, count] of Object.entries(voteCounts)) {
      if (count >= threshold) {
        return {
          settled: true,
          vote,
          count,
          coalition: [...this.coalitions.values()].find(c => c.vote === vote)
        }
      }
    }
    return { settled: false }
  }

  reset() {
    this.coalitions = new Map()
    this.memberCoalitions = new Map()
    usedNames = new Set()
  }
}