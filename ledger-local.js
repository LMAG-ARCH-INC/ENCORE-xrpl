// Local XRPL ledger simulator — used when MODE=local (no network available).
// Mimics the parts of the ledger the demos touch: account balances, sequences,
// payment application, escrows (create/finish/cancel), ledger indices, and
// close times. Transactions submitted here are REAL signed XRPL transaction
// blobs (signed offline with xrpl.js); only the consensus/validation step is
// simulated.

const { decode } = require("xrpl");
const crypto = require("crypto");

const RIPPLE_EPOCH = 946684800; // 2000-01-01T00:00:00Z in unix seconds

class LocalLedger {
  constructor() {
    this.accounts = new Map(); // address -> { balanceDrops: BigInt, sequence: number }
    this.escrows = new Map();  // `${owner}:${seq}` -> escrow record
    this.ledgerIndex = 1_000_000;
    this.transactions = [];
    // Simulated ledger close time (ripple seconds). Starts "now".
    this.now = Math.floor(Date.now() / 1000) - RIPPLE_EPOCH;
  }

  fund(address, xrp = 100) {
    this.accounts.set(address, { balanceDrops: BigInt(xrp) * 1_000_000n, sequence: 1 });
    return { address, balance: xrp };
  }

  getSequence(address) { return this.accounts.get(address).sequence; }
  balanceXrp(address) { return Number(this.accounts.get(address).balanceDrops) / 1_000_000; }
  rippleNow() { return this.now; }

  // Fast-forward simulated time (seconds) — stands in for waiting in real life.
  advanceTime(seconds) { this.now += seconds; }

  submit(signedBlob) {
    const tx = decode(signedBlob);
    const src = this.accounts.get(tx.Account);
    if (!src) throw new Error(`Unknown source ${tx.Account}`);
    if (!tx.TxnSignature && !tx.Signers) throw new Error("Transaction is not signed");
    if (tx.Sequence !== src.sequence) throw new Error(`Bad sequence: tx ${tx.Sequence} vs account ${src.sequence}`);

    const fee = BigInt(tx.Fee);
    const reserve = 1_000_000n; // 1 XRP base reserve (testnet-like)

    switch (tx.TransactionType) {
      case "Payment": {
        const dst = this.accounts.get(tx.Destination);
        if (!dst) throw new Error(`Unknown destination ${tx.Destination}`);
        const amount = BigInt(tx.Amount);
        if (src.balanceDrops - amount - fee < reserve) throw new Error("Insufficient balance");
        src.balanceDrops -= amount + fee;
        dst.balanceDrops += amount;
        break;
      }
      case "EscrowCreate": {
        const amount = BigInt(tx.Amount);
        if (!this.accounts.get(tx.Destination)) throw new Error(`Unknown destination ${tx.Destination}`);
        if (src.balanceDrops - amount - fee < reserve) throw new Error("Insufficient balance");
        if (tx.CancelAfter && tx.FinishAfter && tx.CancelAfter <= tx.FinishAfter)
          throw new Error("CancelAfter must be after FinishAfter");
        src.balanceDrops -= amount + fee; // amount locked in escrow, off the balance
        this.escrows.set(`${tx.Account}:${tx.Sequence}`, {
          owner: tx.Account, destination: tx.Destination, amountDrops: amount,
          finishAfter: tx.FinishAfter || null, cancelAfter: tx.CancelAfter || null,
          state: "HELD", createdSeq: tx.Sequence,
        });
        break;
      }
      case "EscrowFinish": {
        const key = `${tx.Owner}:${tx.OfferSequence}`;
        const esc = this.escrows.get(key);
        if (!esc || esc.state !== "HELD") throw new Error(`No held escrow at ${key}`);
        if (esc.finishAfter && this.now < esc.finishAfter)
          throw new Error("Too early: FinishAfter not reached (tecNO_PERMISSION)");
        if (src.balanceDrops - fee < reserve) throw new Error("Insufficient balance for fee");
        src.balanceDrops -= fee;
        this.accounts.get(esc.destination).balanceDrops += esc.amountDrops;
        esc.state = "RELEASED";
        break;
      }
      case "EscrowCancel": {
        const key = `${tx.Owner}:${tx.OfferSequence}`;
        const esc = this.escrows.get(key);
        if (!esc || esc.state !== "HELD") throw new Error(`No held escrow at ${key}`);
        if (!esc.cancelAfter || this.now < esc.cancelAfter)
          throw new Error("Too early: CancelAfter not reached (tecNO_PERMISSION)");
        if (src.balanceDrops - fee < reserve) throw new Error("Insufficient balance for fee");
        src.balanceDrops -= fee;
        this.accounts.get(esc.owner).balanceDrops += esc.amountDrops;
        esc.state = "REFUNDED";
        break;
      }
      default:
        throw new Error(`Simulator does not support ${tx.TransactionType}`);
    }

    src.sequence += 1;
    this.ledgerIndex += 1;

    const hash = crypto.createHash("sha512")
      .update(Buffer.concat([Buffer.from("54584E00", "hex"), Buffer.from(signedBlob, "hex")]))
      .digest("hex").slice(0, 64).toUpperCase();

    const record = { hash, ledgerIndex: this.ledgerIndex,
      closeTime: new Date((this.now + RIPPLE_EPOCH) * 1000).toISOString(),
      result: "tesSUCCESS", tx };
    this.transactions.push(record);
    return record;
  }
}

module.exports = { LocalLedger, RIPPLE_EPOCH };
