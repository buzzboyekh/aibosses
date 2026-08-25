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

Three of these already exist and are live (`sales_quote`, `doc_check`,
`ops_po`); two are new; the boss is new.

| # | key | name | Blueprint name | may draft | may see |
|---|---|---|---|---|---|
| 0 | `boss` | The Boss | Chief Executive Agent | `escalate_to_owner` | `routing` |
| 1 | `doc_check` | Customs & Documents | GCO | `flag_doc_mismatch`, `suggest_hs_code` | `docs`, `customs`, `suppliers` |
| 2 | `ops_po` | Procurement & Carriers | PNE | `send_rfq`, `send_po` | `suppliers`, `pricing`, `incoterms` |
| 3 | `dispatch` | Dispatch & Tracking | MDO | `send_status_update`, `propose_reroute` | `routes`, `schedules` |
| 4 | `sales_quote` | Client Experience | CXE | `send_quote`, `send_customer_email` | `pricing`, `incoterms`, `tone` |
| 5 | `supplier_trust` | Supplier Trust | SRM | `flag_supplier_risk` | `suppliers`, `history` |

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
2. Add the new action types to `ActionType` in `context/types.ts`.
3. Add `context_notes` rows for the new tags (`routes`, `schedules`,
   `customs`, `history`) so the new agents have facts to stand on.
4. Test one new agent end to end via `runAgent()` before writing the rest.

Step 4 first if time is short. One agent that works beats five that are
seeded but never called.
