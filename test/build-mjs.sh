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

# LINE verify module (same trick, for test/line.test.mjs)
python3 - <<'PY'
src = open('line/verify.ts').read()
src = src.replace('rawBody: string,', 'rawBody,')
src = src.replace('signature: string | null | undefined,', 'signature,')
src = src.replace('channelSecret: string\n): boolean {', 'channelSecret\n) {')
src = src.replace('action: "approve" | "reject", approvalId: string): string {', 'action, approvalId) {')
src = src.replace('  data: string\n): { action: "approve" | "reject"; approvalId: string } | null {', '  data\n) {')
open('test/line-verify.mjs','w').write(src)
PY
echo "built test/line-verify.mjs"

# LLM parser (for test/llm.test.mjs)
python3 - <<'PY'
import re
src = open('agents/llm.ts').read()
src = src[src.index('export function parseDraft'):]
src = src.replace('export function parseDraft(raw: string): LlmDraft {', 'export function parseDraft(raw) {')
src = re.sub(r'\(m\):\s*m is string\s*=>', '(m) =>', src)
src = re.sub(r'^\s*let obj: Record<string, unknown>;', '  let obj;', src, flags=re.M)
open('test/llm-parse.mjs','w').write(src)
PY
echo "built test/llm-parse.mjs"

# pricing module — compiled properly with tsc rather than regex-stripped.
# The hand-rolled strippers above predate this and are left alone because they
# work; anything new should come through the compiler.
npx --yes tsc agents/pricing.ts --outDir test/gen --module esnext \
  --target es2022 --moduleResolution bundler --skipLibCheck >/dev/null
cp test/gen/pricing.js test/pricing.mjs
echo "built test/pricing.mjs"
