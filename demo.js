// Splitter Phase-1 demo: a fan tips D2UR, the split engine pays Mike & Diane in seconds.
//
//   MODE=local   (default) — runs entirely offline against the local ledger simulator.
//                Wallets and transaction signatures are REAL; consensus is simulated.
//   MODE=testnet — identical flow against the live XRPL testnet (needs open internet):
//                funds wallets from the faucet, submits for real, links resolve on
//                https://testnet.xrpl.org
//
// Usage: node demo.js [tip-amount-xrp]

const { Wallet, Client, xrpToDrops, dropsToXrp } = require("xrpl");
const fs = require("fs");
const { computeSplits, buildSplitPayments } = require("./split-engine");
const { LocalLedger } = require("./ledger-local");

const MODE = process.env.MODE || "local";
const TIP_XRP = Number(process.argv[2] || 20);
const TESTNET = "wss://s.altnet.rippletest.net:51233";

async function main() {
  const splitSheet = JSON.parse(fs.readFileSync("split-sheet.json", "utf8"));
  const roles = ["band", ...splitSheet.members.map(m => m.name.toLowerCase()), "fan"];
  const out = { mode: MODE, band: splitSheet.band, splitSheet, tipXrp: TIP_XRP,
                wallets: {}, events: [], balances: {} };

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
      wallets[role] = Wallet.generate();           // real secp256k1/ed25519 keypair
      local.fund(wallets[role].address, 100);      // simulated faucet: 100 XRP
      log(out, `Generated + funded ${role}: ${wallets[role].address} (100 XRP, simulated faucet)`);
    }
  }
  for (const role of roles) out.wallets[role] = { address: wallets[role].address };

  const snap = async (label) => {
    out.balances[label] = {};
    for (const role of roles) {
      out.balances[label][role] = MODE === "testnet"
        ? Number(await client.getXrpBalance(wallets[role].address))
        : local.balanceXrp(wallets[role].address);
    }
  };
  await snap("before");

  // ---- 2. The fan tips the band (this is what the QR code triggers) ----
  const t0 = Date.now();
  const tipDrops = xrpToDrops(TIP_XRP);
  const tipResult = await pay(wallets.fan, wallets.band.address, tipDrops, "splitter/tip");
  log(out, `TIP: fan → ${splitSheet.band} for ${TIP_XRP} XRP  [${tipResult.hash}]`);
  out.tip = tipResult;

  // ---- 3. Split engine reacts: compute shares, pay them out ----
  const splits = computeSplits(tipDrops, splitSheet, out.wallets);
  out.splits = [];
  for (const s of splits) {
    const r = await pay(wallets.band, s.address, s.drops, `splitter/split:${s.name}:${s.share}%`);
    log(out, `SPLIT: ${s.share}% → ${s.name} = ${s.xrp} XRP  [${r.hash}]`);
    out.splits.push({ ...s, ...r });
  }
  out.elapsedMs = Date.now() - t0;
  log(out, `Tip received and fully split in ${(out.elapsedMs / 1000).toFixed(1)}s`);

  await snap("after");
  if (client) await client.disconnect();

  fs.writeFileSync("demo-results.json", JSON.stringify(out, null, 2));
  console.log("\nWrote demo-results.json");

  // ---- helpers ----
  async function pay(fromWallet, toAddress, drops, memo) {
    if (MODE === "testnet") {
      const prepared = await client.autofill({
        TransactionType: "Payment", Account: fromWallet.address,
        Destination: toAddress, Amount: drops,
      });
      const signed = fromWallet.sign(prepared);
      const res = await client.submitAndWait(signed.tx_blob);
      return { hash: res.result.hash, ledgerIndex: res.result.ledger_index,
               result: res.result.meta.TransactionResult,
               explorer: `https://testnet.xrpl.org/transactions/${res.result.hash}` };
    }
    const seq = local.getSequence(fromWallet.address);
    const [tx] = buildSplitPayments(fromWallet.address, [{ address: toAddress, drops }],
                                    { sequence: seq, memo });
    const signed = fromWallet.sign(tx);            // real offline XRPL signature
    const rec = local.submit(signed.tx_blob);      // simulated consensus
    return { hash: rec.hash, ledgerIndex: rec.ledgerIndex, result: rec.result,
             signedBlob: signed.tx_blob.slice(0, 40) + "…", explorer: null };
  }
}

function log(out, msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  out.events.push(line);
}

main().catch(e => { console.error(e); process.exit(1); });
