export class Anonymizer {
  constructor(adapters) {
    this._idToLabel = new Map()
    this._nameVariantsToLabel = new Map()

    adapters.forEach((a, i) => {
      const label = `Model ${String.fromCharCode(65 + i)}` // Model A, B, C...
      this._idToLabel.set(a.id, label)

      // Store name variants that might appear in argument text
      this._nameVariantsToLabel.set(a.name.toLowerCase(), label)
      this._nameVariantsToLabel.set(a.id.toLowerCase(), label)
      // Common shorthand — e.g. "gpt-4o" → also match "gpt4o"
      const noHyphen = a.id.toLowerCase().replace(/-/g, '')
      if (noHyphen !== a.id.toLowerCase()) {
        this._nameVariantsToLabel.set(noHyphen, label)
      }
    })
  }

  labelFor(adapterId) {
    return this._idToLabel.get(adapterId) || adapterId
  }

  // Replace any mention of real model names/ids inside argument text
  anonymizeText(text) {
    if (!text) return text
    let result = text
    // Sort by length descending so longer matches replace before substrings
    const variants = [...this._nameVariantsToLabel.entries()]
      .sort((a, b) => b[0].length - a[0].length)

    for (const [variant, label] of variants) {
      result = result.replace(new RegExp(variant, 'gi'), label)
    }
    return result
  }

  // Anonymize adapter IDs inside coalition member lists
  anonymizeCoalitions(coalitions) {
    return coalitions.map(c => ({
      ...c,
      members: c.members.map(id => this.labelFor(id))
    }))
  }
}
