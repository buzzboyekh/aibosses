// Logic tests for the approval state machine, with an in-memory stand-in for
// the Supabase client. What is being proven here is OUR branching, not
// Postgres: the mock reproduces the one behaviour we depend on, that a guarded
// UPDATE (`.eq('state','pending_approval')`) matches zero rows the second time.
// Run: node test/decide.test.mjs

import assert from "node:assert/strict";

// ---- minimal supabase-shaped mock -----------------------------------------
function makeDb() {
  const tables = { businesses: [], agent_roles: [], approvals: [], decision_log: [] };
  const matches = (row, filters) =>
    filters.every(([col, val]) => JSON.stringify(row[col]) === JSON.stringify(val));

  const from = (table) => {
    const state = { filters: [], op: null, payload: null };
    const api = {
      select() { if (!state.op) state.op = "select"; return api; },
      eq(col, val) { state.filters.push([col, val]); return api; },
      update(payload) { state.op = "update"; state.payload = payload; return api; },
      insert(payload) { state.op = "insert"; state.payload = payload; return api; },
      single() {
        const row = tables[table].find((r) => matches(r, state.filters));
        return Promise.resolve({ data: row ?? null, error: row ? null : { message: "not found" } });
      },
      then(resolve) { return Promise.resolve(run()).then(resolve); },
    };
    function run() {
      if (state.op === "update") {
        const hit = tables[table].filter((r) => matches(r, state.filters));
        hit.forEach((r) => Object.assign(r, state.payload));
        return { data: hit, error: null };
      }
      if (state.op === "insert") {
        const row = { id: `${table}-${tables[table].length + 1}`, ...state.payload };
        tables[table].push(row);
        return { data: [row], error: null };
      }
      return { data: tables[table].filter((r) => matches(r, state.filters)), error: null };
    }
    return api;
  };
  return { from, _tables: tables };
}

// insert().select().single() needs its own shape, so wrap it
function withInsertSingle(db) {
  const orig = db.from;
  db.from = (table) => {
    const api = orig(table);
    const origInsert = api.insert.bind(api);
    api.insert = (payload) => {
      const chain = origInsert(payload);
      const origSelect = chain.select.bind(chain);
      chain.select = () => {
        const sel = origSelect();
        sel.single = async () => {
          const { data } = await chain;
          return { data: data[0], error: null };
        };
        return sel;
      };
      return chain;
    };
    return api;
  };
  return db;
}

const { draftApproval, decide, markExecuted } = await import("./decide.mjs");

function seed(db, { autonomy_level = 0, promote_threshold = 3, clean_approvals = 0 } = {}) {
  db._tables.businesses.push({ id: "biz-1", key: "demo-import", name: "Demo" });
  db._tables.agent_roles.push({
    id: "role-1", business_id: "biz-1", key: "sales_quote", name: "Sales & Quoting Agent",
    action_types: ["send_quote"], context_tags: ["pricing"],
    autonomy_level, promote_threshold, clean_approvals,
  });
}
const draftArgs = {
  businessId: "biz-1", roleId: "role-1", roleKey: "sales_quote",
  actionType: "send_quote", title: "Quote for 2 pallets", payload: { total: 1200 },
  snapshot: { role_key: "sales_quote" }, reason: "customer asked for a price",
};

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`  ok  ${name}`); };

// 1. draft queues, does not execute
await test("draft at Level 0 goes to pending_approval", async () => {
  const db = withInsertSingle(makeDb()); seed(db);
  const { approval, autoExecuted } = await draftApproval(db, draftArgs);
  assert.equal(approval.state, "pending_approval");
  assert.equal(autoExecuted, false);
  assert.equal(db._tables.decision_log.at(-1).action, "drafted");
});

// 2. THE critical one: double-tap must not transition twice
await test("double-tap Approve transitions once", async () => {
  const db = withInsertSingle(makeDb()); seed(db);
  const { approval } = await draftApproval(db, draftArgs);
  const first = await decide(db, approval.id, "approved", "looks right");
  const second = await decide(db, approval.id, "approved", "looks right");
  assert.equal(first.transitioned, true);
  assert.equal(second.transitioned, false);
  const approvals = db._tables.decision_log.filter((l) => l.action === "approved");
  assert.equal(approvals.length, 1, "approval logged exactly once");
});

// 3. promotion beat
await test("third clean approval promotes the role to Level 1", async () => {
  const db = withInsertSingle(makeDb()); seed(db, { clean_approvals: 2 });
  const { approval } = await draftApproval(db, draftArgs);
  await decide(db, approval.id, "approved", "fine");
  const role = db._tables.agent_roles[0];
  assert.equal(role.clean_approvals, 3);
  assert.equal(role.autonomy_level, 1);
  assert.ok(db._tables.decision_log.some((l) => l.action === "promoted"));
});

// 4. a promoted role skips the queue
await test("Level 1 role auto-executes instead of queueing", async () => {
  const db = withInsertSingle(makeDb()); seed(db, { autonomy_level: 1 });
  const { approval, autoExecuted } = await draftApproval(db, draftArgs);
  assert.equal(autoExecuted, true);
  assert.equal(approval.state, "auto_executed");
  assert.equal(db._tables.decision_log.at(-1).action, "auto_executed");
});

// 5. autonomy is per-role: only declared action types auto-execute
await test("Level 1 does not leak to an undeclared action type", async () => {
  const db = withInsertSingle(makeDb()); seed(db, { autonomy_level: 1 });
  const { autoExecuted } = await draftApproval(db, { ...draftArgs, actionType: "send_po" });
  assert.equal(autoExecuted, false, "send_po is not in this role's action_types");
});

// 6. rejection resets trust and demotes
await test("rejection resets the counter and demotes to draft-only", async () => {
  const db = withInsertSingle(makeDb()); seed(db, { autonomy_level: 1, clean_approvals: 5 });
  const { approval } = await draftApproval(db, { ...draftArgs, actionType: "send_customer_email" });
  await decide(db, approval.id, "rejected", "wrong incoterm");
  const role = db._tables.agent_roles[0];
  assert.equal(role.clean_approvals, 0);
  assert.equal(role.autonomy_level, 0);
  assert.ok(db._tables.decision_log.some((l) => l.action === "demoted"));
});

// 7. execution only after approval
await test("markExecuted only fires on an approved row", async () => {
  const db = withInsertSingle(makeDb()); seed(db);
  const { approval } = await draftApproval(db, draftArgs);
  assert.equal((await markExecuted(db, approval.id)).transitioned, false, "pending cannot execute");
  await decide(db, approval.id, "approved", null);
  assert.equal((await markExecuted(db, approval.id)).transitioned, true);
  assert.equal((await markExecuted(db, approval.id)).transitioned, false, "no double send");
});

console.log(`\n${passed}/7 passed`);
