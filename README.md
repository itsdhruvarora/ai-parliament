# Council of AI

A parliamentary debate engine where real AI models — with their actual identities intact — debate your problem until they reach a settlement.

No personas. No scripts. Five genuinely different minds stress-testing your idea.

---

## The Parliament

| Model | Provider | Character |
|-------|----------|-----------|
| Claude Sonnet 4.6 | Anthropic | Fast, sharp, precise |
| Claude Opus 4.6 | Anthropic | Deep, methodical, devastating |
| GPT-4o mini | OpenAI | Strategic, agreeable, grounded |
| Gemini 2.5 Pro | Google | Systems thinker, sees second-order effects |
| Grok 3 | xAI | Brutally honest, zero tolerance for hype |

---

## How It Works

1. **Chair** (you) presents a problem statement — not a solution, a problem
2. **Clarification phase** — models ask questions blind, then review each other's questions
3. **Chair answers** or passes — models proceed with stated assumptions
4. **Pre-mortem** — every model predicts how the debate will end
5. **Debate** — models respond in parallel (blind within rounds, informed between rounds)
6. **Coalitions** form when 2+ models share a vote — lobbying and defection follow
7. **Settlement** when 3/5 models agree, or **Deadlock** after 10 rounds

---

## Setup

```bash
# Clone
git clone https://github.com/yourusername/council-of-ai
cd council-of-ai

# Install
npm install

# Configure
cp .env.example .env
# Add your API keys to .env

# Run web UI
npm run web
# Open http://localhost:3000
```

You only need the API keys for the models you want. Minimum 2 models required.

---

## API Keys

| Provider | Get key at |
|----------|-----------|
| Anthropic | console.anthropic.com |
| OpenAI | platform.openai.com |
| Google | aistudio.google.com |
| xAI | console.x.ai |

---

## Output

Every debate generates:

- `output/{debateId}/full_transcript.md` — everything chronological
- `output/{debateId}/individual_{model}.md` — each model's journey
- `output/{debateId}/coalition_story.md` — the political narrative
- `output/{debateId}/analysis.md` — why they disagreed, fake consensus check
- `output/{debateId}/raw.json` — everything as structured data

---

## Adding a New Model

1. Create `adapters/your-model.js` extending `BaseAdapter`
2. Add it to `adapters/index.js`
3. Add your API key to `.env`

That's it.

---

## Philosophy

Every AI has a real personality baked into its weights. GPT wants to agree with you. Grok wants to challenge everything. Opus thinks slowly and deeply. Sonnet is fast and sharp. Gemini is brilliant and slightly alien.

Those aren't bugs. Those are the most honest signals you can get about your idea.

The council doesn't decide for you. It informs you. The human is still the chair.

---

*Like Argus Panoptes — we see everything. You decide what to do with it.*
