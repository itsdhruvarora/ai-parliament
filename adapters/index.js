import { OpenAICompatAdapter } from './openai-compat.js'
import { PARLIAMENT_CONFIG } from './parliament.config.js'

export function loadAdapters(selectedIds = null) {
  const configs = selectedIds
    ? PARLIAMENT_CONFIG.filter(c => selectedIds.includes(c.id))
    : PARLIAMENT_CONFIG

  const adapters = configs
    .filter(config => !!process.env[config.apiKeyEnv])
    .map(config => new OpenAICompatAdapter({
      id: config.id,
      name: config.name,
      model: config.model,
      provider: config.provider,
      apiKey: process.env[config.apiKeyEnv],
      baseURL: config.baseURL || null,
      identity: config.identity
    }))

  if (adapters.length < 2) {
    const needed = [...new Set(PARLIAMENT_CONFIG.map(c => c.apiKeyEnv))]
    throw new Error(
      `Need at least 2 models. Found ${adapters.length}.\n` +
      `Add API keys to .env:\n${needed.map(k => `  ${k}`).join('\n')}`
    )
  }

  console.log(`\nParliament assembled (${adapters.length} members):`)
  adapters.forEach(a => console.log(`  · ${a.name} — ${a.provider}`))
  console.log()

  return adapters
}

export function listAllModels() {
  return PARLIAMENT_CONFIG.map(c => ({
    id: c.id,
    name: c.name,
    model: c.model,
    provider: c.provider,
    requiresKey: c.apiKeyEnv,
    available: !!process.env[c.apiKeyEnv]
  }))
}
