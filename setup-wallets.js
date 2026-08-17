// Splitter prototype — step 1: create and fund XRPL testnet wallets
// Creates: the D2UR band wallet (receives tips), one wallet per member, and a "fan" wallet.
const { Client } = require("xrpl");
const fs = require("fs");

const TESTNET = "wss://s.altnet.rippletest.net:51233";

async function main() {
  const splitSheet = JSON.parse(fs.readFileSync("split-sheet.json", "utf8"));
  const client = new Client(TESTNET);
  await client.connect();
  console.log("Connected to XRPL testnet");

  const wallets = {};
  const roles = ["band", ...splitSheet.members.map(m => m.name.toLowerCase()), "fan"];

  for (const role of roles) {
    const { wallet, balance } = await client.fundWallet();
    wallets[role] = { address: wallet.address, seed: wallet.seed, initialBalance: balance };
    console.log(`Funded ${role.padEnd(6)} ${wallet.address}  (${balance} XRP)`);
  }

  fs.writeFileSync("wallets.json", JSON.stringify(wallets, null, 2));
  console.log("Saved wallets.json");
  await client.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
