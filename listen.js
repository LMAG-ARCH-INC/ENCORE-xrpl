// Encore split listener — the live service form of the split engine.
//
// Subscribes to the band's tip address on the XRPL testnet. Whenever ANY
// payment arrives — from a QR scan, a Pay-Me button on an external surface,
// or a wallet transfer — it automatically splits the delivered amount among
// the band members per split-sheet.json and submits the payouts.
//
// This is the whole integration surface: if a payment can reach the band
// address, the sender is integrated. See INTEGRATION.md.
//
// Usage:
//   MODE=testnet node listen.js         (PowerShell: $env:MODE="testnet"; node listen.js)
//
// Requires wallets.json (run demo.js or setup-wallets.js first) — the
// listener needs the band wallet's key to send the split payments, and the
// member addresses come from the split sheet roles in wallets.json.
// Testnet only. Never run this pattern on mainnet without a security review.

const { Client, Wallet, dropsToXrp } = require("xrpl");
const fs = require("fs");
const { computeSplits } = require("./split-engine");

const TESTNET = "wss://s.altnet.rippletest.net:51233";

function loadConfig() {
  const splitSheet = JSON.parse(fs.readFileSync("split-sheet.json", "utf8"));
  const wallets = JSON.parse(fs.readFileSync("wallets.json", "utf8"));
  if (!wallets.band?.seed) throw new Error("wallets.json missing band wallet — run demo.js or setup-wallets.js first");
  for (const m of splitSheet.members) {
    const role = m.name.toLowerCase();
    if (!wallets[role]?.address) throw new Error(`wallets.json missing member wallet for "${m.name}"`);
  }
  return { splitSheet, wallets };
}

function parseSourceMemo(tx) {
  try {
    for (const m of tx.Memos || []) {
      const type = Buffer.from(m.Memo.MemoType || "", "hex").toString();
      if (type === "encore/tip") {
        return Buffer.from(m.Memo.MemoData || "", "hex").toString(); // e.g. "src=monolith;ref=tile:1234"
      }
    }
  } catch { /* attribution is best-effort by design */ }
  return null;
}

// Exported for testing: given a delivered amount, compute and submit splits.
async function handleTip(client, bandWallet, splitSheet, walletsByRole, deliveredDrops, sourceTag) {
  const memberAddresses = {};
  for (const m of splitSheet.members) {
    memberAddresses[m.name.toLowerCase()] = { address: walletsByRole[m.name.toLowerCase()].address };
  }
  const splits = computeSplits(deliveredDrops, splitSheet, memberAddresses);
  const results = [];
  for (const s of splits) {
    const memoData = `${s.name}:${s.share}%` + (sourceTag ? `|via:${sourceTag}` : "");
    const prepared = await client.autofill({
      TransactionType: "Payment",
      Account: bandWallet.address,
      Destination: s.address,
      Amount: s.drops,
      Memos: [{ Memo: {
        MemoType: Buffer.from("encore/split").toString("hex").toUpperCase(),
        MemoData: Buffer.from(memoData).toString("hex").toUpperCase(),
      }}],
    });
    const signed = bandWallet.sign(prepared);
    const res = await client.submitAndWait(signed.tx_blob);
    results.push({ name: s.name, xrp: s.xrp, hash: res.result.hash, result: res.result.meta.TransactionResult });
    console.log(`  SPLIT ${s.share}% → ${s.name} = ${s.xrp} XRP  [${res.result.hash}]  ${res.result.meta.TransactionResult}`);
  }
  return results;
}

async function main() {
  if ((process.env.MODE || "") !== "testnet") {
    console.log("The listener runs against the live testnet. Start it with: MODE=testnet node listen.js");
    process.exit(1);
  }
  const { splitSheet, wallets } = loadConfig();
  const bandWallet = Wallet.fromSeed(wallets.band.seed);

  const client = new Client(TESTNET, { connectionTimeout: 20000 });
  await client.connect();
  await client.request({ command: "subscribe", accounts: [bandWallet.address] });

  console.log(`Encore split listener — ${splitSheet.band}`);
  console.log(`Watching tip address: ${bandWallet.address}`);
  console.log(`Split sheet: ${splitSheet.members.map(m => `${m.name} ${m.share}%`).join(" · ")}`);
  console.log(`Send testnet XRP to the address above and watch it split.\n`);

  client.on("transaction", async (ev) => {
    try {
      const tx = ev.tx_json || ev.transaction;
      if (!tx || tx.TransactionType !== "Payment") return;
      if (tx.Destination !== bandWallet.address) return;      // only inbound
      if (tx.Account === bandWallet.address) return;          // never our own outbound
      if (ev.meta?.TransactionResult !== "tesSUCCESS") return;
      const delivered = ev.meta.delivered_amount;
      if (typeof delivered !== "string") return;              // XRP only in v0 (issued-token tips: v1)

      const src = parseSourceMemo(tx);
      const hash = ev.hash || tx.hash;
      console.log(`TIP received: ${dropsToXrp(delivered)} XRP from ${tx.Account}${src ? `  (via ${src})` : ""}  [${hash}]`);
      await handleTip(client, bandWallet, splitSheet, wallets, delivered, src);
      console.log("");
    } catch (e) {
      console.error("Error handling incoming transaction:", e.message);
    }
  });

  client.on("error", (e) => console.error("Connection error:", e?.message || e));
  // Keep the process alive; Ctrl+C to stop.
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { handleTip, parseSourceMemo };
