# The company we are building

Shared background for the team. Tim builds the agent skeleton against this,
Eric builds the dashboard against this, Kun pitches this. If we disagree
about what the product is, fix it here first.

## One sentence

**An AI workforce that runs a logistics company's back office**, where every
desk has an agent, all of them share one brain, and a human approves anything
that leaves the building.

## The thesis

A Taiwanese freight or trading SME runs on a handful of overworked people
keying the same shipment into five systems, chasing suppliers for quotes, and
answering "where is my cargo" on LINE at 11pm. Hiring more people is the only
lever they have, and they do not want to use it.

We give them the staff instead of the software. Not a tool the owner has to
learn: colleagues who already know the job.

## What "logistics" covers for us

The long-term surface, in rough order of how close it is to our demo:

- **Sales desk** — inbound inquiries, quoting, follow-up
- **Purchasing desk** — supplier RFQs, comparing offers, purchase orders
- **Documents desk** — commercial invoices, packing lists, customs paperwork,
  catching the mismatches that cost money at the border
- **Customer desk** — status updates, exception handling, the relationship
- **Operations desk** — bookings, scheduling, last-mile and house-to-house

Sea freight, air freight, B2B supply and last-mile delivery are all the same
shape of work: information moving between parties, and someone retyping it.

## The org

```
                    The Boss (AI)
                         |
     +---------+---------+---------+---------+
   Sales   Purchasing  Documents  Customer  Operations
     |         |          |          |          |
  5 agents  5 agents   5 agents   5 agents   5 agents
     |         |          |          |          |
     +---------+----+----+---------+----------+
                    |
              The shared brain
              (context + memory)
                    |
              The human operator
           (approves anything outbound)
```

- **The Boss** routes incoming work to the right desk and escalates what does
  not fit. It does not act on the outside world itself.
- **Each desk** has up to five specialist agents. A desk is a department; an
  agent is a job, not a chatbot persona.
- **The human operator** sits above all of it. Agents draft; the human decides.
  This is the product, not a limitation of it.

## The shared brain

Every agent reads from one place: business facts, past decisions, documents,
and what each counterparty has been told before. Nothing is siloed per agent,
and no agent goes digging in the database on its own.

Two rules that make it trustworthy:

1. **One assembler.** Every agent call goes through `buildContext()`, which
   gives that agent only what its role is tagged for. A quoting agent sees
   pricing rules; it does not see everything.
2. **The snapshot is kept.** Whatever context an agent saw is stored on the
   decision it made, so any action can be reconstructed later, including what
   the agent knew at the time. That is what makes an AI workforce auditable
   rather than a black box.

Already built and live. See `context/README.md`.

## How agents talk to each other

Agents hand work to each other **through the brain and the approval queue**,
not by free-form messaging.

- The quoting agent finishes a quote, and the purchasing agent picks up the
  supplier side from the same shared state.
- The documents agent finds a mismatch, and the customer agent drafts the
  notice.

Why not open agent-to-agent chat: it loops, it is slow, it costs money per
hop, and nobody can reconstruct afterwards why something was sent. Handing off
through shared state gives the same capability and leaves a trail. If we ever
add direct messaging, it goes in the log like everything else.

## Earning autonomy

Every agent starts at **Level 0: drafts only**. After a run of clean approvals
it promotes itself to **Level 1: acts alone** for that kind of action. One
rejection demotes it. Promotions and demotions are written to the decision log.

This is the part nobody else demos, and it is the honest answer to "why would
I trust this": you do not have to. It earns it, in public, and you can take it
away.

## What the demo shows

One lane, end to end, live: **a customer inquiry becomes an approved quote**,
and **a document mismatch gets caught before it costs money**. Everything else
on this page is the roadmap slide.

A demo that covers five desks at 60% loses to one that covers one desk
completely.

## Language discipline

- Say: "an AI workforce for logistics", "a specialist team, one industry deep",
  "the owner approves everything that leaves the building".
- Do not say: **"AGI"**, "fully autonomous", "replaces your staff", or
  "works for any business". Each of those invites a question we lose.
- Numbers we cite must come from inside the demo or from a sourced statistic,
  never from a guess.
