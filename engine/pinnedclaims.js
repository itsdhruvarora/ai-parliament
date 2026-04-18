export class PinnedClaimsBoard {
  constructor() {
    this.claims = [] // { id, claim, type, addedRound, source, status, groundingEvidence }
    this._nextId = 1
  }

  // Add a claim when the Judge challenges it or the Verifier flags it
  pin(claim, type, source, round, groundingEvidence = null) {
    const existing = this.claims.find(c => c.claim === claim && c.status === 'active')
    if (existing) return existing.id

    const id = this._nextId++
    this.claims.push({
      id,
      claim,
      type,
      source,
      addedRound: round,
      status: 'active',
      groundingEvidence
    })
    return id
  }

  // Drop a claim when the model that made it concedes
  concede(claimText, round) {
    const claim = this.claims.find(c => c.claim === claimText && c.status === 'active')
    if (claim) {
      claim.status = 'conceded'
      claim.resolvedRound = round
    }
  }

  // Drop a claim when the Verifier marks it Contradicted
  contradict(claimText, round, evidence) {
    const claim = this.claims.find(c => c.claim === claimText && c.status === 'active')
    if (claim) {
      claim.status = 'contradicted'
      claim.resolvedRound = round
      claim.groundingEvidence = evidence
    }
  }

  getActive() {
    return this.claims.filter(c => c.status === 'active')
  }

  // Render for injection into model context
  render() {
    const active = this.getActive()
    if (active.length === 0) return 'No contested claims on the board.'

    return active.map(c =>
      `[${c.id}] [${c.type}] "${c.claim}"${c.groundingEvidence ? `\n     Evidence: ${c.groundingEvidence}` : ''}`
    ).join('\n')
  }

  reset() {
    this.claims = []
    this._nextId = 1
  }
}
