import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync, existsSync, readdirSync } from 'fs'
import dotenv from 'dotenv'
import { loadAdapters, listAllModels } from '../adapters/index.js'
import { Council } from '../engine/council.js'
import { generateTranscripts } from '../engine/transcripts.js'

dotenv.config()

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(express.json())
app.use(express.static(join(__dirname, 'public')))

const PORT = process.env.PORT || 3000

let activeDebate = null
const sseClients = new Set()

function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`
  for (const client of sseClients) {
    client.write(msg)
  }
}

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  sseClients.add(res)
  req.on('close', () => sseClients.delete(res))
})

app.get('/api/status', (req, res) => {
  try {
    const adapters = loadAdapters()
    res.json({
      ready: true,
      parliament: adapters.map(a => ({ id: a.id, name: a.name, model: a.model, provider: a.provider })),
      allModels: listAllModels()
    })
  } catch (e) {
    res.json({ ready: false, error: e.message, allModels: listAllModels() })
  }
})

app.post('/api/debate/start', async (req, res) => {
  if (activeDebate) {
    return res.status(400).json({ error: 'A debate is already in progress' })
  }

  const { problemStatement } = req.body
  if (!problemStatement?.trim()) {
    return res.status(400).json({ error: 'Problem statement required' })
  }

  res.json({ status: 'started' })

  activeDebate = { problemStatement, waitingForChair: false, chairResolver: null }

  try {
    const adapters = loadAdapters()
    const council = new Council(adapters, (event) => {
      broadcast(event)

      if (event.type === 'awaiting_chair') {
        activeDebate.waitingForChair = true
      }
    })

    const clarifications = await council.runClarificationPhase(problemStatement)
    broadcast({ type: 'awaiting_chair', clarifications })
    activeDebate.waitingForChair = true
    activeDebate.council = council

  } catch (e) {
    broadcast({ type: 'error', message: e.message })
    activeDebate = null
  }
})

app.post('/api/debate/chair-answer', async (req, res) => {
  if (!activeDebate || !activeDebate.waitingForChair) {
    return res.status(400).json({ error: 'Not waiting for chair input' })
  }

  const { answers } = req.body
  activeDebate.waitingForChair = false
  res.json({ status: 'continuing' })

  try {
    const { council, problemStatement } = activeDebate
    council.chairAnswers = answers || null

    await council.runPreMortem(problemStatement)
    const outcome = await council.runDebate(problemStatement)
    const analysis = await council.runAnalysis(problemStatement, outcome)

    const result = {
      debateId: council.debateId,
      problemStatement,
      chairAnswers: answers,
      clarifications: council.clarifications,
      preMortems: council.preMortems,
      transcript: council.transcript,
      outcome,
      analysis,
      timestamp: new Date().toISOString()
    }

    const outputDir = generateTranscripts(result)
    broadcast({ type: 'debate_complete', result, outputDir })
    activeDebate = null

  } catch (e) {
    broadcast({ type: 'error', message: e.message })
    activeDebate = null
  }
})

app.get('/api/debates', (req, res) => {
  const outputDir = join(process.cwd(), 'output')
  if (!existsSync(outputDir)) return res.json([])

  const debates = readdirSync(outputDir).map(id => {
    const raw = join(outputDir, id, 'raw.json')
    if (!existsSync(raw)) return null
    try {
      const data = JSON.parse(readFileSync(raw, 'utf8'))
      return {
        debateId: data.debateId,
        problemStatement: data.problemStatement.substring(0, 100) + '...',
        outcome: data.outcome.outcome,
        vote: data.outcome.vote,
        timestamp: data.timestamp,
        rounds: data.transcript.length
      }
    } catch { return null }
  }).filter(Boolean)

  res.json(debates.reverse())
})

app.get('/api/debates/:id', (req, res) => {
  const raw = join(process.cwd(), 'output', req.params.id, 'raw.json')
  if (!existsSync(raw)) return res.status(404).json({ error: 'Not found' })
  res.json(JSON.parse(readFileSync(raw, 'utf8')))
})

app.listen(PORT, () => {
  console.log(`\nCouncil of AI running at http://localhost:${PORT}\n`)
})
