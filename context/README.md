# Context system

The layer that decides **what an agent knows** and **what it is allowed to do**.
Owner: Kun. Read this before wiring anything to the agents.

## The one rule

Agents never read the database directly. Every agent call goes through
`buildContext(db, businessKey, roleKey, task)`, and the context it assembled is
saved onto the approval row as `context_snapshot`.

That gives us the thing judges ask about: every AI action can be reconstructed
later, including *what the agent knew when it decided*. It is also our audit
trail for the demo.

## Files

| File | What it is |
|---|---|
| `types.ts` | The shared contract. Frontend, backend and agents all import these. Change only by PR. |
| `buildContext.ts` | Assembles business → role → permitted facts → recent documents. Returns `systemPrompt` + `contextBlock` to send to the LLM. |
| `decide.ts` | Approval lifecycle: `draftApproval()`, `decide()`, `markExecuted()`. Every transition writes to `decision_log`. |
| `config/import-export.ts` | The business config: roles, their prompts, what each may draft. A second vertical = a second file like this. |

## How a request flows

1. Message arrives (LINE webhook or upload).
2. `buildContext(...)` for the role that handles it.
3. Call the LLM with `systemPrompt` + `contextBlock`.
4. `draftApproval(...)` with the result → lands in the approval queue,
   unless the role has earned autonomy, in which case it executes and is logged
   as `auto_executed`.
5. Owner taps Approve/Reject → `decide(...)` → `markExecuted(...)` when sent.

## Autonomy ladder (the demo beat)

Roles start at `autonomy_level = 0` (draft-only). After `promote_threshold`
clean approvals the role promotes itself to level 1 and its next action skips
the queue. One rejection resets the counter and demotes it. All four events
(`promoted`, `demoted`, `auto_executed`, `approved`) are in `decision_log`.

## Rules that must not be broken

- **Service key is server-side only.** RLS is ON with no policies, so the anon
  key can read nothing. All access goes through server code.
- **Nothing outbound without an approval row.** Even auto-executed actions
  create one, so the log is complete.
- **`decision_log` is append-only.** Never UPDATE or DELETE a row in it.
- **HS codes are suggestions for a human to confirm. Never compute duty
  amounts** — we cannot defend the numbers on stage.

## Tests

```bash
./test/build-mjs.sh && node test/decide.test.mjs
```

7 tests over the state machine, no dependencies needed. Covers double-tap
idempotency (an owner tapping Approve twice must not send twice), promotion,
demotion, and auto-execute scoping.

## Needed from the app scaffold

`npm i @supabase/supabase-js`, plus `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` in the environment (see `.env.example`).
