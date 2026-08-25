# Database

Apply in the Supabase SQL editor, in order:

1. `schema.sql` — tables, indexes, RLS.
2. `seed.sql` — demo business, agent roles, starter business facts.

Both are safe to re-run (`create table if not exists`, seeds use
`on conflict do nothing`).

## Tables

| Table | Purpose |
|---|---|
| `businesses` | One row per business the platform serves. |
| `agent_roles` | The agent workforce for a business, with its autonomy state. |
| `approvals` | The approval queue. Holds the drafted action **and** the context snapshot behind it. |
| `decision_log` | Append-only audit trail. Never update or delete. |
| `documents` | Index of files in the `docs` storage bucket + their extracted fields. |
| `context_notes` | Business facts agents are allowed to know, tagged per role. |

## Integration note for Tim

`documents.extracted` is where the invoice-parsing output lands. If you keep a
separate `extracted_invoices` table, we should decide in review which one is
canonical, so the context assembler reads one place, not two.
