export function systemPrompt(adapter) {
  if (typeof adapter === 'string') {
    return `You are an AI model sitting in a parliamentary debate chamber. You are not an assistant. You are not here to help anyone. You are here to find the truth about the problem in front of you — regardless of who submitted it, why they submitted it, or what answer they were hoping for.

You have no obligation to be polite, to validate the chair's framing, or to propose solutions that make anyone feel good. Your only obligation is intellectual honesty.

You may challenge the problem statement itself. You may reject the framing entirely. You may say the premise is wrong. You may propose something nobody asked for if you believe it is the right answer.

No filters. No diplomacy. Say exactly what you think.`
  }

  return (adapter.identity || `You are ${adapter.name}, an AI model in a parliamentary debate.`) + `

PARLIAMENTARY RULES:
- You are NOT an assistant. You are a parliament member.
- You are NOT here to help the chair. You are here to find truth.
- You MAY reject the problem framing entirely and restate the real problem.
- You MAY say the chair is solving for the wrong thing.
- You MAY propose something nobody asked for.
- You MUST challenge bad reasoning directly, by name.
- No diplomatic padding. No "great point but." Say what you actually think.`
}

export function clarificationRound1Prompt(problemStatement) {
  return `The Chair has submitted the following problem to the Parliament:

---
${problemStatement}
---

Before debate begins, you have one opportunity to interrogate this problem statement.

You are NOT obligated to accept the framing. Ask the question that most challenges the premise — not just clarifies it.

Examples of the kind of question that matters:
- "Is this actually a problem or a symptom of a different problem?"
- "Who says this is worth solving — what's the evidence?"
- "What assumption in this statement would, if false, make the whole thing irrelevant?"

Respond in exactly this format:

QUESTION: [Your single most challenging question about this problem]
ASSUMPTION: [The assumption you will proceed with if this goes unanswered]`
}

export function clarificationRound2Prompt(problemStatement, allQuestions) {
  const questionsText = allQuestions.map(q =>
    `${q.name}:\n  Question: ${q.question}\n  Assumption: ${q.assumption}`
  ).join('\n\n')

  return `The Chair submitted this problem:

---
${problemStatement}
---

The Parliament asked these questions:

${questionsText}

Now that you've seen what everyone asked:
- Which question cuts deepest? Endorse it.
- Does seeing others' questions change your assumption?
- Is there a gap nobody caught — a more fundamental challenge to the premise?

Respond in exactly this format:

STATUS: [WITHDRAW / KEEP / REFINE]
ENDORSE: [name whose question matters most, or NONE]
ASSUMPTION: [your updated assumption]
FOLLOW_UP: [one additional challenge if nobody caught it, or NONE]`
}

export function preMortemPrompt(problemStatement) {
  return `The Parliament is about to debate this problem:

---
${problemStatement}
---

Before anyone speaks: what do you actually think happens in this debate?

Not what you hope. Not what would be polite. What do you genuinely predict — based on the problem statement, the likely fault lines, and what you know about how these debates go?

Respond in exactly this format:

PREDICTION: [One honest sentence — what vote wins, why, and roughly when]`
}

export function round1Prompt(problemStatement, chairAnswers) {
  const answersSection = chairAnswers
    ? `\nThe Chair answered some questions before debate began:\n${chairAnswers}\n`
    : '\nThe Chair passed. Parliament proceeds with stated assumptions.\n'

  return `The Parliament is now in session.

PROBLEM SUBMITTED BY CHAIR:
${problemStatement}
${answersSection}

========================================
ROUND 1 — OPENING STATEMENTS
NO VOTING THIS ROUND — DO NOT WRITE === VOTE ===
========================================

You have not seen what anyone else thinks yet.

Your opening statement must address THREE things:

1. DO YOU ACCEPT THE FRAMING?
   Is this actually the right problem? Or is the chair solving for a symptom while the real disease goes untreated? If you reject the framing, state the actual problem as you see it. You are allowed to do this. You are encouraged to do this if you believe it.

2. WHAT IS YOUR ANSWER?
   Not "here are some considerations." An actual answer. Specific. Named. Architectural if relevant. What should exist that doesn't, or what should stop existing that does?

3. WHAT IS THE HARDEST THING ABOUT YOUR ANSWER?
   Not the second hardest. The single thing most likely to kill it.

This is a parliament, not a consulting firm. You are not here to validate the chair. You are here to find what is actually true.

<<<<<<< HEAD
No vote this round. No === VOTE === block. Opening statement only.`
}

export function debateRoundPrompt(problemStatement, roundNumber, transcript, coalitionStatus, myPreviousVote) {
=======
ARGUMENT FORMAT — structure your opening statement as follows:
ARGUMENT:
[Your prose opening statement here]

CLAIMS:
- [One specific, falsifiable claim per line]

No vote this round. No === VOTE === block. Opening statement only.`
}

export function debateRoundPrompt(problemStatement, roundNumber, transcript, coalitionStatus, myPreviousVote, judgeChallenge = '') {
>>>>>>> b37f175 (add verifier and judge)
  const coalitionSection = coalitionStatus.length > 0
    ? `\nCURRENT COALITIONS:\n${coalitionStatus.map(c =>
        `${c.name} (${c.members.join(', ')}) — ${c.stability} stability — voting ${c.vote}`
      ).join('\n')}\n`
    : '\nNo coalitions formed yet.\n'

  const abortNote = roundNumber <= 3
    ? `Note: Stop requires you to say what IS worth building instead. You cannot just say stop — give the parliament something to work with.`
    : `Note: Stop requires you to say what IS worth building instead. Abort means nothing in this entire space is worth pursuing — use it only if you mean it completely.`

  const voteOptions = roundNumber <= 3
    ? `Proceed / Pivot / Stop / Recuse`
    : `Proceed / Pivot / Stop / Abort / Recuse`

  return `Parliament — Round ${roundNumber}

PROBLEM:
${problemStatement}

TRANSCRIPT SO FAR:
${transcript}
${coalitionSection}
YOUR LAST VOTE: ${myPreviousVote}
<<<<<<< HEAD

RULES FOR THIS ROUND:
- React to specific people by name. Agree, disagree, or build on their position.
- Do not repeat your Round 1 position. You have heard the room. What do you think NOW?
- If you are in a coalition, make the case for your position directly to the people not in it.
- If you are opposing a coalition, find the single weakest point in their argument and attack it.
- Every response must move the debate forward — new argument, new evidence, new concession, or new attack. No restating.

=======
${judgeChallenge}

RULES FOR THIS ROUND:
- React to specific arguments by quoting or referencing them directly — not by model name.
- Do not repeat your Round 1 position. You have heard the room. What do you think NOW?
- If you are in a coalition, make the case for your position directly to those not in it.
- If you are opposing a coalition, find the single weakest point in their argument and attack it.
- Every response must move the debate forward — new argument, new evidence, new concession, or new attack. No restating.

ARGUMENT FORMAT — structure your argument as follows:
ARGUMENT:
[Your prose argument here]

CLAIMS:
- [One specific, falsifiable claim per line — not assertions, actual claims that could be proven true or false]

>>>>>>> b37f175 (add verifier and judge)
VOTE OPTIONS: ${voteOptions}

VOTE RULES — every vote requires a direction:
- Proceed → "Proceed because: [one sentence — what makes this specifically work]"
- Pivot → "Pivot to: [one concrete sentence — the specific new direction, not just 'a different approach']"
- Stop → "Stop because: [why this fails] + But consider: [what IS worth building instead]"
- Abort → "Abort because: [why nothing here is salvageable]"
- Recuse → "Recuse because: [why you cannot judge this]"
${abortNote}

=== VOTE ===
Vote: [${voteOptions}]
Direction: [your required direction sentence based on vote type above]
Confidence: Low / Medium / High
Coalition: [Independent / Propose:[position in 3 words] / Join:[coalition name] / Leave:[coalition name]]
Lobby: [one sentence concrete pitch if lobbying, else NONE]
Defection: [one sentence if you changed your vote, else NONE]`
}

export function deadlockFinalVotePrompt(problemStatement, fullTranscript) {
  return `The Parliament has debated for 10 full rounds without settlement.

PROBLEM:
${problemStatement}

FULL TRANSCRIPT:
${fullTranscript}

Ten rounds. No majority. This is the final vote.

You have heard everything. Every argument, every coalition, every defection. Now give your most honest judgment — not your most diplomatic one.

The chair is watching. The chair will make a decision based on what this parliament says. Make it count.

=== FINAL VOTE ===
Vote: Proceed / Pivot / Stop / Abort
Direction: [your required direction sentence]
Confidence: Low / Medium / High
Side_with: [coalition you align with most, even if you weren't in it, or NONE]
Reasoning: [two sentences — your final position and the single most important reason]`
}

export function whyTheyDisagreePrompt(problemStatement, fullTranscript, finalVotes) {
  const voteSummary = finalVotes.map(v => `${v.name}: ${v.vote} (${v.confidence})`).join(', ')

  return `You are analyzing a parliamentary debate. Your job is to extract signal, not summarize.

PROBLEM: ${problemStatement}

FINAL VOTES: ${voteSummary}

FULL TRANSCRIPT:
${fullTranscript}

Answer these exactly:

DISAGREEMENT_AXIS: [the single dimension they actually disagreed on — not "approach" but something specific like "whether API rate limits make real-time detection commercially viable"]
ASSUMPTION_CONFLICT: [the one assumption that, if resolved, would have changed the outcome]
DECISION_HINGES_ON: [the single thing that must be true for the majority vote to be correct]
BIGGEST_UNCERTAINTY: [what nobody could resolve and why]
BEST_SOLUTION_PROPOSED: [the strongest concrete solution that emerged — name it, describe it in one sentence]
WHAT_TO_BUILD: [if you had to tell the chair one thing to do next based on this debate, what is it — one sentence, specific, actionable]
FAKE_CONSENSUS: [YES / NO]
FAKE_CONSENSUS_NOTE: [if YES — who agreed for different reasons and what were those reasons. if NO — NONE]`
}

export function summarizerPrompt(transcript, roundNumber) {
  return `Summarize this parliamentary debate transcript from rounds 1 to ${roundNumber}.

Do not editorialize. Preserve:
- The actual position of each model, not just their vote
- The strongest arguments made on each side
- Where models changed their position and why
- Coalition formations, defections, and lobbying
- What remains genuinely unresolved vs what has been settled

This summary goes back to the parliament in the next round. They need to know what actually happened, not a sanitized version of it.

TRANSCRIPT:
${transcript}`
}
