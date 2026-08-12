// Encore Phase-2 demo: escrow-backed fan-funding.
//
// Scenario A — "D2UR — Debut Album" (success):
//   3 fans pledge 100 XRP total. Each pledge is locked on-ledger as one escrow
//   per milestone. As each milestone completes, its escrows are released to the
//   band — and the Phase-1 split engine immediately pays every member their
//   share. Fans are never asked to trust anyone: the ledger holds the money.
//
// Scenario B — "D2UR — Tour Bus Fund" (stalls):
//   2 fans pledge, no milestone completes, the deadline passes, and the ledger
//   returns every pledge to its backer. Nobody can prevent the refund.
//
//   MODE=local   (default) — offline; simulated consensus, simulated time.
//   MODE=testnet — live XRPL testnet; real escrows, real waits (~2 minutes).
//
// Usage: node demo-phase2.js

const { Wallet, Client, dropsToXrp } = require("xrpl");
const fs = require("fs");
const { computeSplits, buildSplitPayments } = require("./split-engine");
const { pledgeSlices, buildEscrowCreate, buildEscrowFinish, buildEscrowCancel } = require("./escrow-engine");
const { LocalLedger, RIPPLE_EPOCH } = require("./ledger-local");

const MODE = process.env.MODE || "local";
const TESTNET = "wss://s.altnet.rippletest.net:51233";
const sleep = ms => new Promise(res => setTimeout(res, ms));

// Milestone timing (seconds from start). Local mode fast-forwards; testnet waits.
const T = MODE === "testnet"
  ? { m1: 20, m2: 40, failCancel: 30, successCancel: 3600 }
  : { m1: 3600, m2: 7200, failCancel: 1800, successCancel: 86400 }; // sim: an hour, two hours, etc.

async function main() {
  const cfg = JSON.parse(fs.readFileSync("campaign.json", "utf8"));
  const splitSheet = JSON.parse(fs.readFileSync("split-sheet.json", "utf8"));
  const memberRoles = splitSheet.members.map(m => m.name.toLowerCase());
  const backerRoles = cfg.backers.map(b => b.name.toLowerCase().replace(/\s+/g, ""));
  const roles = ["band", ...memberRoles, ...backerRoles];

  const out = { mode: MODE, campaign: cfg.campaign, goalXrp: cfg.goalXrp,
    milestones: cfg.milestones, splitSheet, wallets: {}, events: [],
    pledges: [], releases: [], refunds: [], balances: {} };

  let client = null;
  const local = new LocalLedger();
  const wallets = {};

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
  for (const role of roles) out.wallets[role] = { address: wallets[role].address };

  const nowRipple = () => MODE === "testnet"
    ? Math.floor(Date.now() / 1000) - RIPPLE_EPOCH
    : local.rippleNow();

  const snap = async (label) => {
    out.balances[label] = {};
    for (const role of roles) {
      out.balances[label][role] = MODE === "testnet"
        ? Number(await client.getXrpBalance(wallets[role].address))
        : local.balanceXrp(wallets[role].address);
    }
  };
  await snap("before");
  const t0 = nowRipple();

  // ============ SCENARIO A: the album campaign (success) ============
  log(out, `--- CAMPAIGN: ${cfg.campaign} — goal ${cfg.goalXrp} XRP ---`);

  // 1) Backers pledge: one escrow per milestone slice.
  for (let bi = 0; bi < cfg.backers.length; bi++) {
    const backer = cfg.backers[bi];
    const role = backerRoles[bi];
    const slices = pledgeSlices(backer.pledgeXrp, cfg.milestones);
    for (let mi = 0; mi < slices.length; mi++) {
      const s = slices[mi];
      const finishAfter = t0 + (mi === 0 ? T.m1 : T.m2);
      const cancelAfter = t0 + T.successCancel;
      const rec = await submitTx(wallets[role], w => buildEscrowCreate(
        w.address, wallets.band.address, s.drops,
        { sequence: seqOf(w), finishAfter, cancelAfter, memo: `${cfg.campaign}|${s.milestone}` }));
      out.pledges.push({ backer: backer.name, milestone: s.milestone,
        xrp: Number(dropsToXrp(s.drops)), owner: wallets[role].address,
        offerSequence: rec.tx.Sequence, ...pick(rec) });
      log(out, `PLEDGE: ${backer.name} locked ${dropsToXrp(s.drops)} XRP in escrow for "${s.milestone}"  [${rec.hash}]`);
    }
  }
  await snap("pledged");
  log(out, `Campaign fully funded: ${cfg.goalXrp} XRP locked on-ledger. The band can't touch it yet; the fans can't pull it back. The ledger holds it.`);

  // 2) Milestone 1 completes → release its escrows → split to members.
  await reach(T.m1, `Milestone 1 "${cfg.milestones[0].name}" reached`);
  await releaseMilestone(0);
  await snap("milestone1");

  // 3) Milestone 2 completes → release the rest → split.
  await reach(T.m2, `Milestone 2 "${cfg.milestones[1].name}" reached`);
  await releaseMilestone(1);
  await snap("milestone2");

  // ============ SCENARIO B: the stalled campaign (auto-refund) ============
  const fc = cfg.failedCampaign;
  out.failed = { campaign: fc.campaign, pledges: [], refunds: [] };
  log(out, `--- CAMPAIGN: ${fc.campaign} — this one stalls ---`);
  const tf0 = nowRipple();
  for (let bi = 0; bi < fc.backers.length; bi++) {
    const backer = fc.backers[bi];
    const role = backerRoles[bi]; // reuse Fan A / Fan B wallets
    const drops = String(BigInt(Math.round(backer.pledgeXrp * 1_000_000)));
    const rec = await submitTx(wallets[role], w => buildEscrowCreate(
      w.address, wallets.band.address, drops,
      { sequence: seqOf(w), finishAfter: tf0 + Math.floor(T.failCancel / 2), cancelAfter: tf0 + T.failCancel, memo: fc.campaign }));
    out.failed.pledges.push({ backer: backer.name, xrp: backer.pledgeXrp,
      owner: wallets[role].address, offerSequence: rec.tx.Sequence, ...pick(rec) });
    log(out, `PLEDGE: ${backer.name} locked ${backer.pledgeXrp} XRP for "${fc.campaign}"  [${rec.hash}]`);
  }
  await snap("failedPledged");

  await reach(nowRipple() - t0 + T.failCancel + 2, `No milestones completed — deadline passed for "${fc.campaign}"`, tf0 + T.failCancel);
  for (const p of out.failed.pledges) {
    const role = backerRoles[fc.backers.findIndex(b => b.name === p.backer)];
    const rec = await submitTx(wallets[role], w => buildEscrowCancel(
      w.address, p.owner, p.offerSequence, { sequence: seqOf(w) }));
    out.failed.refunds.push({ backer: p.backer, xrp: p.xrp, ...pick(rec) });
    log(out, `REFUND: ledger returned ${p.xrp} XRP to ${p.backer}  [${rec.hash}]`);
  }
  await snap("after");

  if (client) await client.disconnect();
  fs.writeFileSync("campaign-results.json", JSON.stringify(out, null, 2));
  console.log("\nWrote campaign-results.json");

  // ---------------- helpers ----------------

  async function releaseMilestone(mi) {
    const name = cfg.milestones[mi].name;
    const due = out.pledges.filter(p => p.milestone === name);
    let releasedDrops = 0n;
    for (const p of due) {
      const rec = await submitTx(wallets.band, w => buildEscrowFinish(
        w.address, p.owner, p.offerSequence, { sequence: seqOf(w), fee: "12" }));
      releasedDrops += BigInt(Math.round(p.xrp * 1_000_000));
      out.releases.push({ milestone: name, backer: p.backer, xrp: p.xrp, ...pick(rec) });
      log(out, `RELEASE: ${p.backer}'s ${p.xrp} XRP for "${name}" released to the band  [${rec.hash}]`);
    }
    // The Phase-1 split engine takes it from here.
    const splits = computeSplits(releasedDrops.toString(), splitSheet, out.wallets);
    for (const s of splits) {
      const rec = await submitTx(wallets.band, w => {
        const [tx] = buildSplitPayments(w.address, [{ address: s.address, drops: s.drops }],
          { sequence: seqOf(w), memo: `encore/split:${s.name}:${s.share}%|${name}` });
        return tx;
      });
      out.releases.push({ milestone: name, split: s.name, xrp: Number(s.xrp), ...pick(rec) });
      log(out, `SPLIT: ${s.share}% → ${s.name} = ${s.xrp} XRP  [${rec.hash}]`);
    }
  }

  async function reach(secondsFromStart, message, absoluteRippleTime) {
    if (MODE === "testnet") {
      const target = absoluteRippleTime ?? (t0 + secondsFromStart);
      const waitMs = Math.max(0, (target - nowRipple() + 3) * 1000);
      if (waitMs > 0) { log(out, `(waiting ${(waitMs / 1000).toFixed(0)}s for ledger time...)`); await sleep(waitMs); }
    } else {
      const target = absoluteRippleTime ?? (t0 + secondsFromStart);
      if (target > local.rippleNow()) local.advanceTime(target - local.rippleNow() + 1);
    }
    log(out, message);
  }

  function seqOf(wallet) {
    return MODE === "testnet" ? undefined : local.getSequence(wallet.address);
  }

  async function submitTx(wallet, buildFn) {
    if (MODE === "testnet") {
      const raw = buildFn(wallet);
      delete raw.Sequence; delete raw.Fee; // let the live network fill these
      Object.keys(raw).forEach(k => raw[k] === undefined && delete raw[k]);
      const prepared = await client.autofill(raw);
      const signed = wallet.sign(prepared);
      const res = await client.submitAndWait(signed.tx_blob);
      return { hash: res.result.hash, ledgerIndex: res.result.ledger_index,
        result: res.result.meta.TransactionResult, tx: prepared,
        explorer: `https://testnet.xrpl.org/transactions/${res.result.hash}` };
    }
    const tx = buildFn(wallet);
    const signed = wallet.sign(tx);
    const rec = local.submit(signed.tx_blob);
    return { ...rec, explorer: null };
  }

  function pick(rec) {
    return { hash: rec.hash, ledgerIndex: rec.ledgerIndex, result: rec.result, explorer: rec.explorer };
  }
}

function log(out, msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  out.events.push(line);
}

main().catch(e => { console.error(e); process.exit(1); });
