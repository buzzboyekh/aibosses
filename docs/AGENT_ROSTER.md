# Agent roster — draft spec

**Owner: Tim.** This is a starting table, not a finished decision. Built from
Tim's Company Master Blueprint, translated into the structure that is already
deployed. Edit freely; the prompts especially want a logistics person's eye.

Companion to `docs/COMPANY.md` (the vision) and `context/README.md` (how the
runtime works).

## The key idea: an agent is a row, not a service

In the deployed system an agent is one row in `agent_roles`:

| column | what it is |
|---|---|
| `key` | machine name |
| `name` | shown on the dashboard |
| `system_prompt` | the job description it works from |
| `action_types` | **the only actions it may draft** — its permission boundary |
| `context_tags` | which business facts it is allowed to see |
| `autonomy_level` | 0 = drafts only, 1 = acts alone |
| `promote_threshold` | clean approvals needed before it can act alone |

So the whole company is six rows. No new services, no new infrastructure. The
interesting design work is deciding **what each agent may and may not do**, not
writing six personas.

`action_types` is a real security boundary, enforced in `agents/run.ts` before
the model output is used: a role can only ever draft the actions its row
declares, so no prompt in a customer message can talk an agent into something
else.

## The roster

Named by **capability, not job title.** Team decision, 2026-08-25.

A job title locks an agent to one industry: "Customs Officer" is useless to a
school. A capability travels: *reading documents and cross-checking them* is
customs paperwork in freight, contracts in a law office, and marked homework in
a classroom. Same agent, different config.

It also changes what the pitch sounds like. Five job titles imply we are
replacing five employees, which invites the objection we least want. Five
capabilities sound like infrastructure.

Three of these are already live (`doc_check`, `ops_po`, `sales_quote`); the keys
stay as they are because deployed code and Eric's in-flight work reference them.
The **name** is what the dashboard and the pitch use.

| # | key | name (capability) | what it does | in logistics | may draft |
|---|---|---|---|---|---|
| 0 | `orchestrator` | **Orchestration** | routes work to the right capability, escalates what does not fit | assigns an inbound shipment task | `escalate_to_owner` |
| 1 | `doc_check` | **Document Intelligence** | reads documents, extracts fields, cross-checks them against each other | invoice vs packing list vs customs entry | `flag_doc_mismatch`, `suggest_hs_code` |
| 2 | `ops_po` | **Sourcing & Negotiation** | finds options, compares them on real criteria, drafts the ask | carrier rates, supplier quotes, POs | `send_rfq`, `send_po` |
| 3 | `monitoring` | **Monitoring & Exceptions** | watches state, notices deviation, proposes the fix before anyone asks | port delay, ETA slip, reroute | `send_status_update`, `propose_reroute` |
| 4 | `sales_quote` | **Outbound Communication** | drafts anything that leaves the building, in the right language and tone | quotes, delay notices, customer replies | `send_quote`, `send_customer_email` |
| 5 | `relationship_memory` | **Relationship Memory** | remembers how every counterparty behaves and holds us to it | supplier reliability, customer history | `flag_supplier_risk` |

### Why this is the platform proof

The same six capabilities, pointed at a different business by config alone:

| capability | freight forwarder | debate academy | barbershop |
|---|---|---|---|
| Document Intelligence | invoice vs packing list | marked essays against a rubric | supplier invoices |
| Sourcing & Negotiation | carrier rates | venue and printing quotes | product wholesale |
| Monitoring & Exceptions | ETA slipped | a student stopped attending | a no-show booking |
| Outbound Communication | delay notice to a customer | progress note to a parent | appointment reminder |
| Relationship Memory | which supplier ships late | which student needs pushing | which client tips |
| Orchestration | routes the shipment | routes the class admin | routes the day |

That table is the roadmap slide, and it is why the second-config cameo lands:
nothing in the roster is logistics-specific except the config we point it at.

### Deliberate exclusions, do not add these back

- **No duty or tax calculation.** HS codes are suggestions for a human to
  confirm. We cannot defend a duty figure to a judge who works in trade.
- **No trade finance, credit scoring, invoice factoring or loan
  pre-approval.** An AI making money decisions is outside logistics and
  unanswerable when asked how the model was validated. Agent 5 does supplier
  *reliability*, which is what the vision actually asked for.
- **No agent sends anything.** Every action type above produces a draft that
  a human approves. That is the product.

## How agents work together

Not a peer-to-peer mesh. Agents hand work to each other **through the shared
brain and the approval queue**.

Tim's own example, as we build it:

```
1. Procurement finds a cheaper route via a secondary port.
2. It writes the open question to shared state:
   "verify tariff differential, Port B vs Port A".
3. Customs picks it up, answers, writes the answer back.
4. Procurement drafts the booking. The owner approves it.
```

The activity stream shows exactly the conversation the blueprint describes.
The difference is underneath: every hop is durable, ordered, replayable and
logged, instead of live RPC between six models.

Why it matters here specifically: each hop is an LLM call, so a mesh is
seconds and real money per exchange, it can loop, and it cannot be
reconstructed afterwards. On a stage with one shot, deterministic wins.

## The Swarm Activity Stream already has its data

`decision_log` is the feed. It is append-only and every row carries actor,
action, reason and timestamp:

```
agent:sales_quote | drafted   | customer asked for a price on 500 units
owner             | approved  | approved from LINE
system            | executed  |
system            | promoted  | 3 clean approvals, now Level 1
```

Rendering that live is a frontend job, not a backend one.

## Suggested build order for the skeleton

1. Write the six rows into `db/seed.sql`, following the three that are there.
   Keep existing keys; set the new capability `name` on all six.
2. Add the new action types to `ActionType` in `context/types.ts`.
3. Add `context_notes` rows for the new tags (`routes`, `schedules`,
   `customs`, `history`) so the new agents have facts to stand on.
4. Test one new agent end to end via `runAgent()` before writing the rest.

Step 4 first if time is short. One agent that works beats five that are
seeded but never called.
