# Roadmap: where we are, and how we get there

Written 2026-08-25. Two audiences: the team between now and Sep 6, and
whoever picks this up if it becomes a real company.

## The constraint that shapes everything

| date | who is where |
|---|---|
| Wed Sep 3 – Fri Sep 4 | Kun at SEMICON (interpreting) |
| **Fri Sep 4** | Hackathon opens, sponsor bounties revealed. Kun arrives in the evening |
| **Sat Sep 5** | **Build Day. Kun NOT available.** Eric and Tim only |
| **Sun Sep 6** | Submission 11:00. Demo day. Kun pitches |

The person who built the core is absent on the only full build day. So:

> **The demo must be finished and frozen before Saturday.** Saturday is for
> Eric and Tim to polish, rehearse and integrate, not to build anything the
> demo depends on.

That is not pessimism, it is the schedule. It also means the fallback video
must exist before Kun leaves for SEMICON.

## Where we actually are (2026-08-25)

Live at https://aibosses.vercel.app, 32 tests passing.

- Six capability agents, named by skill not job title, seeded from config
- A shared brain: one context assembler, role-scoped facts, and the snapshot
  stored on every decision so any action can be reconstructed
- Orchestration routes each inbound message to the right capability and logs why
- Prices computed in code, not by the model, from real sourcing data
- LINE approval loop: draft → owner's phone → tap → executed, double-tap safe
- Autonomy ladder: agents promote themselves after clean approvals, demote on rejection
- Append-only decision log, public landing page, key-gated operator dashboard
- `npm run demo` drives all three acts and prints what to say

Missing: the document upload page (Eric), the live activity stream (Tim), a
second business config, the pitch, and the fallback video.

## Who does what, and why them

Allocated to each person's actual advantage, not split evenly by line count.

### Eric — because he is there on Saturday

The only one present for all three days, including the one full build day
Kun misses. That is a structural advantage, so his work is the work that has
to happen on site.

- **`/documents`**: upload → extract → cross-check → approval card. The demo's
  second act, end to end.
- **Demo operator.** Owns the demo machine, drives `npm run demo` on stage
  while Kun talks. Must be able to run it alone, unprompted, by Sep 1.
- **On-site setup**: screen mirroring tested, two phones on 4G, fallback video
  cued and ready to play.
- **Saturday integration**: whatever needs fixing, he is the one who can fix it
  in the room.

He builds automations at work, so the upload-extract-store loop is squarely in
what he already does. And making his attendance the asset means the day Kun is
away is a strength rather than a hole.

### Tim — because he thinks in systems

He wrote the company blueprint unprompted. That is the skill to use, and these
tasks fit around a day job better than a build sprint does.

- **Merge PR #1.** Repo is his; unblocks everyone.
- **Live activity stream.** His own idea, and the screen the judges look at.
  `decision_log` already holds the data.
- **Second business config.** Same six capabilities pointed at a different
  industry. Conceptual work, little code, and it is what turns the platform
  claim into evidence.
- **The slide deck.** The vision framing, the org chart, the roadmap. He
  writes these well; Kun should not be writing slides the week he is pitching.

### Kun — because only he can do these

- **The pitch and the Q&A.** He is a debate coach. This is the highest-scoring
  thing left and nobody can hand it over.
- **Fallback video**, before SEMICON. He is the only voice that can narrate it.
- **Real data.** The sourcing numbers are his, and "we ran our real RFQs
  through this" is a sentence only he can say honestly.
- **Product calls**: what gets cut, which bounty is worth an hour, what goes
  on the slide.

### Deliberately not Kun

Everything he has been carrying that someone else can hold: the dashboard,
the activity stream, the deck, the on-site setup. He is absent for Build Day
and pitching on demo day, so anything only he understands is a single point of
failure. Handing work over now is a schedule requirement, not generosity.

## Phase 1 — finish and freeze (now → Sun Aug 31)

Everything the demo depends on lands this week. Nothing after this is
load-bearing.

| owner | deliverable | done when |
|---|---|---|
| **Tim** | Merge PR #1 | `main` runs the demo |
| **Tim** | Live activity stream on the dashboard | it updates while a demo runs |
| **Eric** | `/documents` upload → extract → mismatch → approval | two real PDFs produce a real flagged discrepancy |
| **Kun** | Pitch script + the three questions rehearsed verbatim | said out loud, twice, to a timer |
| **Kun** | **Fallback video recorded** — see `docs/RECORDING.md`, record interactively so the approvals are real | file exists, ~3 min, before SEMICON |
| **Kun** | LINE push quota checked, topped up if short | number known, not assumed |
| any | Second business config | 20 seconds of a different business running |

**Gate, Sun Aug 31:** one person can run `npm run demo` start to finish
without help, and the video exists. If a deliverable is not done by then, it
is cut, not carried into next week.

## Phase 2 — freeze (Mon Sep 1 → Fri Sep 4)

No new features. Kun is at SEMICON Wed to Fri.

- Mon/Tue: bug fixes only, and only for things that break the three acts
- Kun rehearses in the evenings, out loud, on a timer
- Eric and Tim each run the demo end to end alone, at least once
- Fri evening: hackathon opens, bounties revealed. **One** bounty may be
  added if it fits in an hour and cannot break the main path. Otherwise none

## Phase 3 — the event (Sat Sep 5 → Sun Sep 6)

**Saturday, without Kun.** Eric and Tim: integrate, rehearse, and run
`npm run demo:reset` after every rehearsal. Do not merge anything that touches
`context/`, `line/` or `agents/` unless the demo is broken without it.

**Sunday.** Submission closes 11:00 — submit at 10:00, not 10:55. Then:

- `npm run demo:reset` immediately before going on. Three clean rehearsals
  promote the agents and the approval card silently stops appearing.
- Both phones on 4G, never venue wifi. Screen mirroring tested before, not on stage.
- Kun pitches, one teammate drives, one holds the fallback video ready.

## The three-minute demo

1. **A customer messages the company on LINE.** Orchestration routes it to
   quoting. The price is computed in code: landed cost, margin and FX are on
   the card. Nothing has left the building. → operator approves on his phone
2. **Two documents disagree.** Orchestration sends it to Document
   Intelligence, which quotes both conflicting numbers. → approve
3. **A shipment slips and nobody asked.** Monitoring drafts the customer
   notice before the complaint arrives.
4. **Close on the decision log.** Every action, who took it, why. Then the
   ladder: approve enough times and an agent stops asking; reject once and it
   goes back to asking.

## Beyond the hackathon: getting to the real company

The vision is one AI boss, five departments, five agents each, one shared
brain, specialised entirely in logistics. Here is the honest path.

### The 5x5 question

Twenty-five agents is not twenty-five personas. A department is a capability;
its five agents are the distinct **actions** inside it. Document Intelligence,
fully staffed, is: extract, cross-check, classify, validate against
regulation, summarise for a human. That is five agents in the org chart and
five `action_types` in the schema.

This matters because it is the difference between a real system and a slide.
Adding depth to a capability is adding an action, its prompt and its
permission. It is a day of work per agent, not a rebuild.

**Sequence:** get one department to five agents before giving a second
department its second. Depth first proves the pattern; breadth first produces
twenty-five shallow things.

### Roadmap, in order of what unblocks what

1. **Depth in Document Intelligence** (weeks 1–4). Customs entries, certificates
   of origin, bills of lading. This is where the money is: a document error at
   a border costs real money, and it is the easiest value to prove.
2. **Real connections** (weeks 4–8). Carrier rate APIs, a real mailbox, real
   tracking feeds. Until then Monitoring is reacting to a script, not the world.
3. **Memory that compounds** (weeks 8–12). Relationship Memory becomes the
   moat: which supplier actually ships late, which customer always disputes the
   invoice. No competitor can copy your history.
4. **A second industry, seriously** (month 4). The config table in
   `AGENT_ROSTER.md` is the claim; a paying customer in another vertical is the
   proof.
5. **Autonomy in production** (ongoing). Ship every agent at Level 0. Let real
   operators promote them. The promotion data is the product's evidence, and
   nobody else will have it.

### What not to build, and why

- **Payments, credit, factoring.** An AI making money decisions needs a
  validated model, an audit regime and probably a licence. Out of scope, and
  it invites the one question with no good answer.
- **Duty and tax calculation.** Get it wrong once for a real shipper and the
  liability is theirs, but the blame is yours. Suggest the HS code; let a
  broker confirm it.
- **Free-form agent-to-agent chat.** Handoffs through shared state give the
  same behaviour, cost less, cannot loop, and leave a trail. Revisit only when
  there is a specific problem it solves.
- **"AGI".** Say what is true instead: one industry, every desk, deep.
