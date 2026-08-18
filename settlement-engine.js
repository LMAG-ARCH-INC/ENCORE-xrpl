// Splitter settlement engine — Phase 1.5 core.
//
// A gig settles as a WATERFALL, not a pie:
//   gross inflows → expenses (reimbursements / vendors) → rates (hired players,
//   leader fee) → optional routing fee → residual → owners' percentage split.
//
// The band keeps a settlement TEMPLATE (owners + shares, standing lines, known
// payees) and CONFIRMS a settlement per EVENT (this gig's inflows and lines).
// The template is "set once"; the event is "confirmed per gig". Tips with no
// cost lines collapse to the plain split the Phase-1 engine already proved.
//
// Every output line is a real XRPL Payment with a memo naming the event and the
// line, so the settlement IS the receipts. exportCsv() turns a run into a
// spreadsheet an accountant can use.
//
// Ledger-agnostic: same math against the local simulator or live testnet.

const { xrpToDrops, dropsToXrp } = require("xrpl");

const D = 1_000_000n; // drops per XRP

/** Sum a list of XRP amounts as drops. */
function sumDrops(items, key = "amount") {
  return items.reduce((a, x) => a + BigInt(xrpToDrops(x[key])), 0n);
}

/**
 * Compute the settlement plan for one event. Pure function, no ledger.
 * @param {object} template - settlement-template.json
 * @param {object} event    - events/<id>.json (already-confirmed inflows + lines)
 * @param {object} addr     - payee key (lower-case) -> XRPL address
 * @param {object} [opts]   - { includeStandingLines=true }
 * @returns settlement plan
 */
function computeSettlement(template, event, addr, opts = {}) {
  const includeStanding = opts.includeStandingLines !== false;

  const gross = sumDrops(event.inflows);
  const lines = [
    ...(includeStanding ? (template.standingLines || []) : []),
    ...(event.lines || []),
  ];

  // Priority when money is short (the rule a decent bandleader already follows):
  //   0 expenses  — money already spent, often out of someone's pocket
  //   1 rates to hired players — people who were promised a number and don't own the band
  //   2 rates to owners (e.g. the leader fee) — owners eat the shortfall before hired hands do
  //   (then the optional fee, then the residual split)
  // A line may set "priority" explicitly to override.
  const ownerNames = new Set(template.owners.map(o => o.name.toLowerCase()));
  const rank = l => l.priority ?? (l.type === "expense" ? 0
                    : l.type === "rate" ? (ownerNames.has(String(l.payee).toLowerCase()) ? 2 : 1) : 9);
  const queued = lines
    .map((l, i) => ({ ...l, seq: i }))
    .sort((a, b) => rank(a) - rank(b) || a.seq - b.seq);

  let remaining = gross;
  const paid = [];
  let n = 0;
  for (const l of queued) {
    const want = BigInt(xrpToDrops(l.amount));
    const got = want <= remaining ? want : remaining;      // pay what we can
    remaining -= got;
    paid.push({
      line: ++n, type: l.type, label: l.label, payee: l.payee,
      address: resolve(addr, l.payee),
      wantDrops: want.toString(), drops: got.toString(),
      short: (want - got).toString(),
      status: got === want ? "PAID" : got === 0n ? "UNPAID" : "PARTIAL",
      note: l.note || "",
    });
  }

  // Optional routing fee on the residual (0 on testnet).
  let fee = null;
  if (template.fee && template.fee.percent > 0 && remaining > 0n) {
    const feeDrops = (remaining * BigInt(Math.round(template.fee.percent * 100))) / 10_000n;
    remaining -= feeDrops;
    fee = { line: ++n, type: "fee", label: template.fee.label, payee: template.fee.payee,
            address: resolve(addr, template.fee.payee), drops: feeDrops.toString(),
            wantDrops: feeDrops.toString(), short: "0", status: "PAID", note: "" };
    paid.push(fee);
  }

  // Residual → owners. Per-event override of shares allowed (e.g. one member
  // sat out, or a leader bump this gig); otherwise the template shares.
  const owners = (event.ownerOverrides || template.owners).map(o => ({ ...o }));
  const sum = owners.reduce((a, o) => a + o.share, 0);
  if (sum !== 100) throw new Error(`Owner shares sum to ${sum}, must be 100`);
  let allocated = 0n;
  const shares = owners.map((o, i) => {
    const drops = i < owners.length - 1
      ? (remaining * BigInt(o.share)) / 100n
      : remaining - allocated;                              // dust to last owner
    allocated += drops;
    return { line: ++n, type: "share", label: `${o.name} ${o.share}%`, payee: o.name,
             address: resolve(addr, o.name), share: o.share,
             drops: drops.toString(), wantDrops: drops.toString(), short: "0",
             status: remaining > 0n ? "PAID" : "NOTHING LEFT", note: "" };
  });

  const shortfall = paid.reduce((a, p) => a + BigInt(p.short), 0n);
  return {
    event: { id: event.id, name: event.name, date: event.date, venue: event.venue },
    grossDrops: gross.toString(), grossXrp: dropsToXrp(gross.toString()),
    lines: paid, shares,
    residualDrops: remaining.toString(), residualXrp: dropsToXrp(remaining.toString()),
    shortfallDrops: shortfall.toString(), shortfallXrp: dropsToXrp(shortfall.toString()),
    ok: shortfall === 0n,
  };
}

function resolve(addr, payee) {
  const a = addr[String(payee).toLowerCase()];
  if (!a) throw new Error(`No address for payee "${payee}"`);
  return typeof a === "string" ? a : a.address;
}

/** Memo for a settlement line: short, parseable, on-ledger. */
function lineMemo(eventId, l) {
  return `event=${eventId};line=${l.line};type=${l.type};label=${l.label}`.slice(0, 200);
}

/**
 * Build the outbound Payment transactions for a computed settlement.
 * Skips zero-drop lines (nothing to pay). Real, protocol-valid Payments.
 */
function buildSettlementPayments(settlementAddress, plan, { sequence, fee = "12", lastLedgerSequence }) {
  const all = [...plan.lines, ...plan.shares].filter(l => BigInt(l.drops) > 0n);
  return all.map((l, i) => ({
    line: l,
    tx: {
      TransactionType: "Payment",
      Account: settlementAddress,
      Destination: l.address,
      Amount: l.drops,
      Fee: fee,
      Sequence: sequence + i,
      ...(lastLedgerSequence ? { LastLedgerSequence: lastLedgerSequence } : {}),
      Memos: [{ Memo: {
        MemoType: Buffer.from("splitter/settle").toString("hex").toUpperCase(),
        MemoData: Buffer.from(lineMemo(plan.event.id, l)).toString("hex").toUpperCase(),
      }}],
    },
  }));
}

/** Parse a splitter/settle memo back into fields. */
function parseSettleMemo(memoData) {
  const s = Buffer.from(memoData, "hex").toString("utf8");
  return Object.fromEntries(s.split(";").map(kv => { const i = kv.indexOf("="); return [kv.slice(0, i), kv.slice(i + 1)]; }));
}

/**
 * CSV export — the accounting trail. One row per inflow and per paid line.
 * @param {Array} runs - [{ plan, inflows:[{source,from,drops,hash,ledgerIndex,closeTime}], payments:[{line,hash,ledgerIndex,closeTime,result}] }]
 */
function exportCsv(runs) {
  const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["date", "event_id", "event", "venue", "direction", "type", "label", "counterparty", "address",
                "amount_xrp", "amount_drops", "status", "tx_hash", "ledger_index", "close_time", "note"];
  const rows = [head.join(",")];
  for (const r of runs) {
    const e = r.plan.event;
    for (const i of r.inflows || []) {
      rows.push([e.date, e.id, e.name, e.venue, "in", i.source, i.source, i.from, i.address || "",
        dropsToXrp(i.drops), i.drops, i.result || "PAID", i.hash || "", i.ledgerIndex || "", i.closeTime || "", i.note || ""]
        .map(esc).join(","));
    }
    for (const p of r.payments || []) {
      const l = p.line;
      rows.push([e.date, e.id, e.name, e.venue, "out", l.type, l.label, l.payee, l.address,
        dropsToXrp(l.drops), l.drops, l.status, p.hash || "", p.ledgerIndex || "", p.closeTime || "", l.note || ""]
        .map(esc).join(","));
    }
    // Unpaid/short lines still appear — the accountant needs to see them.
    for (const l of r.plan.lines.filter(l => BigInt(l.short) > 0n)) {
      rows.push([e.date, e.id, e.name, e.venue, "out", l.type, l.label, l.payee, l.address,
        dropsToXrp(l.short), l.short, "SHORT", "", "", "", "unpaid balance owed"]
        .map(esc).join(","));
    }
  }
  return rows.join("\n") + "\n";
}

module.exports = { computeSettlement, buildSettlementPayments, lineMemo, parseSettleMemo, exportCsv, xrpToDrops, dropsToXrp };
