import OpenAI from 'openai'
import { BaseAdapter } from './base.js'

export class OpenAICompatAdapter extends BaseAdapter {
  constructor({ id, name, model, provider, apiKey, baseURL, identity }) {
    super()
    this._id = id
    this._name = name
    this._model = model
    this._provider = provider
    this._identity = identity
    this._client = apiKey
      ? new OpenAI({ apiKey, baseURL: baseURL || undefined })
      : null
  }

  get id() { return this._id }
  get name() { return this._name }
  get model() { return this._model }
  get provider() { return this._provider }
  get identity() { return this._identity }
  get available() { return !!this._client }

  async query(prompt, systemPrompt, maxTokens = 350) {
    const response = await this._client.chat.completions.create({
      model: this._model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ]
    })
    return response.choices[0].message.content
  }
}
