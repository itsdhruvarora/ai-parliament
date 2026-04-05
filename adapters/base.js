export class BaseAdapter {
  get id() { throw new Error('id required') }
  get name() { throw new Error('name required') }
  get model() { throw new Error('model required') }
  get provider() { throw new Error('provider required') }
  get available() { return false }

  async query(prompt, systemPrompt, maxTokens = 350) {
    throw new Error('query() must be implemented')
  }
}
