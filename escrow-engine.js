// Encore escrow engine — Phase 2 core.
// Builds real XRPL EscrowCreate / EscrowFinish / EscrowCancel transactions for
// fan-funding campaigns. A pledge = one escrow per milestone, locked on-ledger:
// - milestone completes  -> EscrowFinish releases that slice to the band
// - deadline lapses      -> EscrowCancel returns the slice to the backer
// The ledger itself enforces both outcomes; Encore (or anyone) just submits.

const { xrpToDrops } = require("xrpl");

/** Split a backer's pledge across milestones, integer drops, dust to last. */
function pledgeSlices(pledgeXrp, milestones) {
  const total = BigInt(xrpToDrops(pledgeXrp));
  let allocated = 0n;
  return milestones.map((m, i) => {
    let drops;
    if (i < milestones.length - 1) {
      drops = (total * BigInt(m.pct)) / 100n;
      allocated += drops;
    } else {
      drops = total - allocated;
    }
    return { milestone: m.name, pct: m.pct, drops: drops.toString() };
  });
}

/** Build an EscrowCreate: backer locks a slice for the band. */
function buildEscrowCreate(backerAddress, bandAddress, drops, { sequence, finishAfter, cancelAfter, fee = "12", memo }) {
  const tx = {
    TransactionType: "EscrowCreate",
    Account: backerAddress,
    Destination: bandAddress,
    Amount: drops,
    Fee: fee,
    Sequence: sequence,
  };
  if (finishAfter) tx.FinishAfter = finishAfter;
  if (cancelAfter) tx.CancelAfter = cancelAfter;
  if (memo) tx.Memos = [{ Memo: {
    MemoType: Buffer.from("encore/pledge").toString("hex").toUpperCase(),
    MemoData: Buffer.from(memo).toString("hex").toUpperCase(),
  }}];
  return tx;
}

/** Build an EscrowFinish: release a held slice to the band (milestone done). */
function buildEscrowFinish(submitterAddress, ownerAddress, offerSequence, { sequence, fee = "330" }) {
  return {
    TransactionType: "EscrowFinish",
    Account: submitterAddress,
    Owner: ownerAddress,
    OfferSequence: offerSequence,
    Fee: fee,
    Sequence: sequence,
  };
}

/** Build an EscrowCancel: return a held slice to the backer (deadline lapsed). */
function buildEscrowCancel(submitterAddress, ownerAddress, offerSequence, { sequence, fee = "12" }) {
  return {
    TransactionType: "EscrowCancel",
    Account: submitterAddress,
    Owner: ownerAddress,
    OfferSequence: offerSequence,
    Fee: fee,
    Sequence: sequence,
  };
}

module.exports = { pledgeSlices, buildEscrowCreate, buildEscrowFinish, buildEscrowCancel };
