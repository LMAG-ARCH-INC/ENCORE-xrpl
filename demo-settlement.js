// Splitter Phase-1.5 demo: a gig settles as a waterfall, and the leader stops
// being the bank.
//
//   Night 1 — a normal Saturday: the venue locks the guarantee in ledger escrow
//             BEFORE downbeat; tips land during the set; at end of night the
//             escrow releases and the settlement runs: expenses → rates →
//             leader fee → residual split. Every line is an on-ledger payment.
//   Night 2 — the room "forgot" the guarantee: only tips came in. The waterfall
//             pays what it can in priority order and reports the shortfall
//             honestly instead of it quietly coming out of the leader's pocket.
//
//   MODE=local   (default) — offline against the local ledger simulator.
//   MODE=testnet — identical flow on the live XRPL testnet (~1 min; escrow
//                  FinishAfter waits in real time). Links resolve on testnet.xrpl.org.
//
// Outputs: settlement-results.json, settlement.csv (the accounting trail).
// Usage: node demo-settlement.js

const { Wallet, Client, xrpToDrops, dropsToXrp } = require("xrpl");
const fs = require("fs");
const { computeSettlement, buildSettlementPayments, exportCsv } = require("./settlement-engine");
const { buildEscrowFinish } = require("./escrow-engine");
const { LocalLedger, RIPPLE_EPOCH } = require("./ledger-local");

const MODE = process.env.MODE || "local";
const TESTNET = "wss://s.altnet.rippletest.net:51233";
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const template = JSON.parse(fs.readFileSync("settlement-template.json", "utf8"));
  const events = fs.readdirSync("events").filter(f => f.endsWith(".json")).sort()
    .map(f => JSON.parse(fs.readFileSync(`events/${f}`, "utf8")));

  // Roles = settlement address ("band") + every payee that can appear + payers.
  const payees = new Set([
    ...template.owners.map(o => o.name),
    ...(template.standingLines || []).map(l => l.payee),
    ...Object.keys(template.knownPayees || {}),
    ...(template.fee && template.fee.percent > 0 ? [template.fee.payee] : []),
    ...events.flatMap(e => e.lines.map(l => l.payee)),
  ].map(s => s.toLowerCase()));
  const payers = new Set(events.flatMap(e => e.inflows.map(i => i.from.toLowerCase())));
  const roles = ["band", ...payees, ...payers];

  const out = { mode: MODE, band: template.band, template, wallets: {}, events: [], balances: {}, runs: [] };
  let client = null;
  const local = new LocalLedger();
  const wallets = {};

  // ---- 1. Wallets ----
  if (MODE === "testnet") {
    client = new Client(TESTNET, { connectionTimeout: 20000 });
    await client.connect();
    for (const role of roles) {
      const { wallet } = await client.fundWallet();
      wallets[role] = wallet;
      log(out, `Funded ${role} on live testnet: ${wallet.address}`);
    }
  } else {
    for (const role of roles) {
      wallets[role] = Wallet.generate();
      local.fund(wallets[role].address, 100);
      log(out, `Generated + funded ${role}: ${wallets[role].address} (100 XRP, simulated faucet)`);
    }
  }
  const addr = {};
  for (const role of roles) { addr[role] = wallets[role].address; out.wallets[role] = { address: wallets[role].address }; }

  const nowRipple = () => MODE === "testnet" ? Math.floor(Date.now() / 1000) - RIPPLE_EPOCH : local.rippleNow();
  const snap = async (label) => {
    out.balances[label] = {};
    for (const role of roles) out.balances[label][role] = MODE === "testnet"
      ? Number(await client.getXrpBalance(wallets[role].address)) : local.balanceXrp(wallets[role].address);
  };
  await snap("before");

  // ---- 2. One night at a time ----
  for (const ev of events) {
    log(out, `======== ${ev.name} (${ev.date}) ========`);
    const run = { plan: null, inflows: [], payments: [], escrow: null };
    const t0 = Date.now();

    // Inflows: guarantee via escrow (locked before downbeat), tips via payment.
    for (const inflow of ev.inflows) {
      const drops = xrpToDrops(inflow.amount);
      const from = wallets[inflow.from.toLowerCase()];
      if (inflow.via === "escrow") {
        const finishAfter = nowRipple() + (MODE === "testnet" ? 20 : 4 * 3600); // "end of night"
        const cancelAfter = finishAfter + (MODE === "testnet" ? 600 : 24 * 3600); // safety valve
        const rec = await submitTx(from, w => ({
          TransactionType: "EscrowCreate", Account: w.address, Destination: addr.band,
          Amount: drops, FinishAfter: finishAfter, CancelAfter: cancelAfter,
          Fee: "12", Sequence: seqOf(w),
          Memos: [{ Memo: { MemoType: hex("splitter/guarantee"), MemoData: hex(`event=${ev.id};source=${inflow.source}`) } }],
        }));
        run.escrow = { owner: from.address, offerSequence: rec.tx.Sequence, finishAfter, drops, create: pick(rec) };
        log(out, `GUARANTEE LOCKED: ${inflow.from} escrowed ${inflow.amount} XRP to the band before downbeat  [${rec.hash}]`);
      } else {
        const rec = await submitTx(from, w => ({
          TransactionType: "Payment", Account: w.address, Destination: addr.band, Amount: drops,
          Fee: "12", Sequence: seqOf(w),
          Memos: [{ Memo: { MemoType: hex("splitter/tip"), MemoData: hex(`event=${ev.id};source=${inflow.source}`) } }],
        }));
        run.inflows.push({ source: inflow.source, from: inflow.from, address: from.address, drops, ...pick(rec), note: inflow.note });
        log(out, `IN: ${inflow.source} from ${inflow.from} = ${inflow.amount} XRP  [${rec.hash}]`);
      }
    }

    // End of night: release the guarantee (anyone can submit; the band does).
    if (run.escrow) {
      await reach(run.escrow.finishAfter, "END OF NIGHT: releasing the guarantee from escrow");
      const rec = await submitTx(wallets.band, w => buildEscrowFinish(w.address, run.escrow.owner, run.escrow.offerSequence, { sequence: seqOf(w), fee: "12" }));
      const g = ev.inflows.find(i => i.via === "escrow");
      run.inflows.unshift({ source: g.source, from: g.from, address: run.escrow.owner, drops: run.escrow.drops, ...pick(rec), note: "released from escrow" });
      run.escrow.finish = pick(rec);
      log(out, `RELEASED: ${dropsToXrp(run.escrow.drops)} XRP guarantee → band  [${rec.hash}]`);
    }

    // The leader confirms the settlement; the waterfall runs.
    const plan = computeSettlement(template, ev, addr);
    run.plan = plan;
    log(out, `SETTLE: gross ${plan.grossXrp} XRP → ${plan.lines.length} lines → residual ${plan.residualXrp} XRP → ${plan.shares.length} owners` +
             (plan.ok ? "" : `  ⚠ SHORT ${plan.shortfallXrp} XRP`));
    const built = buildSettlementPayments(addr.band, plan, { sequence: seqOf(wallets.band) ?? 0 });
    for (const { line, tx } of built) {
      const rec = await submitTx(wallets.band, w => ({ ...tx, Sequence: seqOf(w) }));
      run.payments.push({ line, ...pick(rec) });
      log(out, `  ${line.type.toUpperCase().padEnd(7)} ${line.label.padEnd(40)} → ${line.payee.padEnd(9)} ${dropsToXrp(line.drops).toString().padStart(8)} XRP  ${line.status !== "PAID" ? line.status : ""} [${rec.hash}]`);
    }
    for (const l of plan.lines.filter(l => BigInt(l.short) > 0n))
      log(out, `  ${l.type.toUpperCase().padEnd(7)} ${l.label.padEnd(40)} → ${l.payee.padEnd(9)} ${dropsToXrp(l.short).toString().padStart(8)} XRP  OWED (unpaid)`);
    if (BigInt(plan.residualDrops) === 0n)
      log(out, `  SHARE   (nothing left for the owners — the shortfall is on the record, not in the leader's pocket)`);
    run.elapsedMs = Date.now() - t0;
    log(out, `Settled in ${(run.elapsedMs / 1000).toFixed(1)}s` + (MODE === "testnet" ? " (incl. escrow wait)" : ""));
    out.runs.push(run);
  }

  await snap("after");
  if (client) await client.disconnect();

  fs.writeFileSync("settlement-results.json", JSON.stringify(out, null, 2));
  fs.writeFileSync("settlement.csv", exportCsv(out.runs));
  console.log("\nWrote settlement-results.json and settlement.csv (the accounting trail)");

  // ---- helpers ----
  function hex(s) { return Buffer.from(s).toString("hex").toUpperCase(); }
  function seqOf(w) { return MODE === "testnet" ? undefined : local.getSequence(w.address); }
  async function reach(absoluteRippleTime, message) {
    if (MODE === "testnet") {
      const waitMs = Math.max(0, (absoluteRippleTime - nowRipple() + 3) * 1000);
      if (waitMs > 0) { log(out, `(waiting ${(waitMs / 1000).toFixed(0)}s for ledger time...)`); await sleep(waitMs); }
    } else if (absoluteRippleTime > local.rippleNow()) {
      local.advanceTime(absoluteRippleTime - local.rippleNow() + 1);
    }
    log(out, message);
  }
  async function submitTx(wallet, buildFn) {
    if (MODE === "testnet") {
      const raw = buildFn(wallet);
      delete raw.Sequence; delete raw.Fee;
      Object.keys(raw).forEach(k => raw[k] === undefined && delete raw[k]);
      const prepared = await client.autofill(raw);
      const signed = wallet.sign(prepared);
      const res = await client.submitAndWait(signed.tx_blob);
      return { hash: res.result.hash, ledgerIndex: res.result.ledger_index, result: res.result.meta.TransactionResult,
               closeTime: new Date().toISOString(), tx: prepared,
               explorer: `https://testnet.xrpl.org/transactions/${res.result.hash}` };
    }
    const tx = buildFn(wallet);
    const signed = wallet.sign(tx);
    const rec = local.submit(signed.tx_blob);
    return { ...rec, explorer: null };
  }
  function pick(rec) { return { hash: rec.hash, ledgerIndex: rec.ledgerIndex, result: rec.result, closeTime: rec.closeTime, explorer: rec.explorer }; }
}

function log(out, msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  out.events.push(line);
}

main().catch(e => { console.error(e); process.exit(1); });
