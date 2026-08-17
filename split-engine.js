// Splitter split engine — the core primitive.
// Takes an incoming payment and a split sheet, returns the outbound share payments.
// This module is ledger-agnostic: the same logic runs against the local simulator
// or the live XRPL testnet/mainnet.

const { xrpToDrops, dropsToXrp } = require("xrpl");

/**
 * Compute share payments for an incoming amount.
 * @param {string} amountDrops - incoming payment in drops (1 XRP = 1,000,000 drops)
 * @param {object} splitSheet  - { band, members: [{name, share}] }
 * @param {object} wallets     - role -> { address }
 * @returns {Array<{name, address, share, drops, xrp}>}
 */
function computeSplits(amountDrops, splitSheet, wallets) {
  const total = BigInt(amountDrops);
  const shares = splitSheet.members.map(m => ({
    name: m.name,
    address: wallets[m.name.toLowerCase()].address,
    share: m.share,
  }));

  const sum = shares.reduce((a, s) => a + s.share, 0);
  if (sum !== 100) throw new Error(`Split sheet shares sum to ${sum}, must be 100`);

  // Integer drop math; remainder (from rounding) goes to the first member
  let allocated = 0n;
  shares.forEach((s, i) => {
    if (i < shares.length - 1) {
      s.drops = (total * BigInt(s.share)) / 100n;
      allocated += s.drops;
    } else {
      s.drops = total - allocated; // last member absorbs rounding dust
    }
    s.xrp = dropsToXrp(s.drops.toString());
  });
  return shares.map(s => ({ ...s, drops: s.drops.toString() }));
}

/**
 * Build the outbound XRPL Payment transactions for a set of splits.
 * These are real, protocol-valid Payment transactions.
 */
function buildSplitPayments(bandAddress, splits, { sequence, fee = "12", lastLedgerSequence, memo }) {
  return splits.map((s, i) => {
    const tx = {
      TransactionType: "Payment",
      Account: bandAddress,
      Destination: s.address,
      Amount: s.drops,
      Fee: fee,
      Sequence: sequence + i,
      ...(lastLedgerSequence ? { LastLedgerSequence: lastLedgerSequence } : {}),
    };
    if (memo) {
      tx.Memos = [{ Memo: {
        MemoType: Buffer.from("splitter/split").toString("hex").toUpperCase(),
        MemoData: Buffer.from(memo).toString("hex").toUpperCase(),
      }}];
    }
    return tx;
  });
}

module.exports = { computeSplits, buildSplitPayments, xrpToDrops, dropsToXrp };
