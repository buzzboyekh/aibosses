#!/usr/bin/env bash
# Strips TS annotations from context/decide.ts into test/decide.mjs so the state
# machine can be tested with plain `node` (no build step, no deps). Temporary:
# once the code is inside the team monorepo, run the tests with the repo's own
# TS tooling and delete this.
set -euo pipefail
cd "$(dirname "$0")/.."

sed -e 's|^import { SupabaseClient } from "@supabase/supabase-js";||' \
    -e 's|^import type .*$||' \
    -e 's|: SupabaseClient||g' \
    context/decide.ts \
| perl -0pe 's/async function log\(\n(?:[^)]*)\)\s*\{/async function log(db, businessId, actor, action, reason, approvalId, meta = {}) {/s' \
| perl -0pe 's/export async function draftApproval\(\n  db,\n  args:\s*\{.*?\n  \}\n\): Promise<[^>]*>\s*\{/export async function draftApproval(db, args) {/s' \
| perl -0pe 's/export async function decide\(\n(?:[^)]*)\): Promise<[^>]*>\s*\{/export async function decide(db, approvalId, decision, reason, decidedBy = "owner") {/s' \
| perl -0pe 's/export async function markExecuted\(\n(?:[^)]*)\): Promise<[^>]*>\s*\{/export async function markExecuted(db, approvalId) {/s' \
| sed -e 's| as Approval||g' \
> test/decide.mjs

node --input-type=module -e "await import('./test/decide.mjs')" && echo "built test/decide.mjs"
