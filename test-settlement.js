// Settlement engine checks — pure math, no ledger. Run: node test-settlement.js
const assert = require("assert");
const { computeSettlement, exportCsv } = require("./settlement-engine");

const addr = { mike: "rMIKE", diane: "rDIANE", "sub-bass": "rSUB", sound: "rSOUND", splitter: "rFEE" };
const template = {
  band: "T", owners: [{ name: "Mike", share: 50 }, { name: "Diane", share: 50 }],
  standingLines: [{ type: "rate", label: "Leader fee", payee: "Mike", amount: 5 }],
  fee: { label: "fee", percent: 0, payee: "splitter" },
};
const total = p => [...p.lines, ...p.shares].reduce((a, l) => a + BigInt(l.drops), 0n);

// 1. Conservation: everything in goes out, dust included.
let p = computeSettlement(template, { id: "e1", inflows: [{ amount: 75 }],
  lines: [{ type: "expense", label: "Van", payee: "Mike", amount: 8 }, { type: "rate", label: "Sub", payee: "sub-bass", amount: 10 }] }, addr);
assert.strictEqual(total(p).toString(), p.grossDrops);
assert.strictEqual(p.residualXrp, 52); assert.ok(p.ok);

// 2. Odd drops: dust lands on the last owner, nothing lost.
p = computeSettlement({ ...template, standingLines: [] }, { id: "e2", inflows: [{ amount: "0.000003" }], lines: [] }, addr);
assert.strictEqual(p.shares[0].drops, "1"); assert.strictEqual(p.shares[1].drops, "2");

// 3. Shortfall priority: expenses, then hired players, then owner rates; owners' shares last.
p = computeSettlement(template, { id: "e3", inflows: [{ amount: 15 }],
  lines: [{ type: "expense", label: "Van", payee: "Mike", amount: 8 }, { type: "rate", label: "Sub", payee: "sub-bass", amount: 10 }, { type: "rate", label: "Sound", payee: "sound", amount: 8 }] }, addr);
assert.deepStrictEqual(p.lines.map(l => [l.label, l.status]), [["Van", "PAID"], ["Sub", "PARTIAL"], ["Sound", "UNPAID"], ["Leader fee", "UNPAID"]]);
assert.strictEqual(p.shortfallXrp, 16); assert.strictEqual(p.residualDrops, "0"); assert.ok(!p.ok);
assert.strictEqual(total(p).toString(), p.grossDrops);

// 4. Explicit priority override wins.
p = computeSettlement(template, { id: "e4", inflows: [{ amount: 5 }],
  lines: [{ type: "expense", label: "Van", payee: "Mike", amount: 8 }, { type: "rate", label: "Sub", payee: "sub-bass", amount: 5, priority: -1 }] }, addr);
assert.strictEqual(p.lines[0].label, "Sub"); assert.strictEqual(p.lines[0].status, "PAID");

// 5. Per-event owner override (one member sat out) and a tips-only night = plain split.
p = computeSettlement({ ...template, standingLines: [] }, { id: "e5", inflows: [{ amount: 20 }], lines: [],
  ownerOverrides: [{ name: "Mike", share: 100 }] }, addr);
assert.strictEqual(p.shares.length, 1); assert.strictEqual(p.shares[0].drops, "20000000");
assert.throws(() => computeSettlement(template, { id: "x", inflows: [{ amount: 1 }], lines: [], ownerOverrides: [{ name: "Mike", share: 60 }] }, addr));

// 6. Routing fee applies to the residual only.
p = computeSettlement({ ...template, standingLines: [], fee: { label: "fee", percent: 1, payee: "splitter" } },
  { id: "e6", inflows: [{ amount: 100 }], lines: [{ type: "rate", label: "Sub", payee: "sub-bass", amount: 50 }] }, addr);
assert.strictEqual(p.lines.find(l => l.type === "fee").drops, "500000"); // 1% of 50 XRP
assert.strictEqual(p.residualDrops, "49500000");

// 7. CSV has a header, one row per inflow/paid line, and SHORT rows for owed balances.
const csv = exportCsv([{ plan: computeSettlement(template, { id: "e3", inflows: [{ amount: 15 }],
  lines: [{ type: "expense", label: "Van", payee: "Mike", amount: 8 }, { type: "rate", label: "Sub", payee: "sub-bass", amount: 10 }] }, addr),
  inflows: [{ source: "tips", from: "fan", drops: "15000000" }], payments: [] }]);
assert.ok(csv.startsWith("date,event_id,")); assert.ok(csv.includes('"SHORT"'));

console.log("settlement-engine: all checks passed");
