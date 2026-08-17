# Splitter

**The payment rail for working musicians, built on a payment rail.** · [splitter.band](https://splitter.band)

*One payment in, every member fed.* Like the audio splitter that feeds one signal to every amp — and the splitter van that gets the whole band to the gig.

Splitter is split-first payments for bands on the [XRP Ledger](https://xrpl.org). A band writes its revenue deal down once as a **split sheet** — member wallets and percentages — and from then on, every payment that touches the band's wallet divides and settles automatically: tips, crowdfunding releases, sales. One inbound payment becomes N outbound member payments in seconds, for fractions of a cent, with the reason stamped on-ledger in transaction memos.

**Strictly payments utility.** No token. No speculation. No custody — the band wallet is a rail, not a vault, and campaign pledges are held by the ledger's native escrow, never by Splitter.

## Proven on the live testnet

2026-08-11, run from a standard Windows machine: a 20 XRP tip was received and fully split 50/50 between two band members in **10.5 seconds**, total network fees **36 drops** (0.000036 XRP). Publicly verifiable:

- [Tip: fan → D2UR](https://testnet.xrpl.org/transactions/4D85AB31C5A48E07070F3D4663A2F585CB2107545BAD1EA865BD589A9D29EE9C)
- [Split: 50% → member 1](https://testnet.xrpl.org/transactions/14FB30C75F32370ADE13ACC17223497AC6BE52275C48912095C363445E0147C6)
- [Split: 50% → member 2](https://testnet.xrpl.org/transactions/2ABC94E0E99C593DB1F0AFD79A9F1EF58B7B86595918204328C3CF436B9CD087)

## What's in this repo

| File | What it does |
|---|---|
| `split-sheet.json` | The band's revenue deal as data. Edit shares freely (must sum to 100). |
| `split-engine.js` | Phase 1 core: computes shares in integer drops, builds real XRPL Payment transactions. |
| `demo.js` | Tip-and-split flow: fund wallets → fan tips → engine splits → report. |
| `campaign.json` | A fan-funding campaign: goal, milestones, backers. |
| `escrow-engine.js` | Phase 2 core: builds EscrowCreate / EscrowFinish / EscrowCancel for milestone-based pledges. |
| `demo-phase2.js` | Two campaigns end-to-end: one succeeds (milestones release → splits), one stalls (ledger auto-refunds every backer). |
| `ledger-local.js` | Offline ledger simulator (payments, escrows, simulated time) for running without network access. |
| `generate-dashboard.js` / `generate-campaign-dashboard.js` | Render self-contained HTML dashboards from demo results. |
| `setup-wallets.js` | Standalone testnet wallet funding. |
| `listen.js` | **The split listener** — subscribes to the band's tip address on testnet; any incoming payment from any surface auto-splits per the split sheet. The live service form of the engine. |
| `pay-button.html` | Example integrator widget: a self-contained Pay-Me button + QR for any tip address. |
| `INTEGRATION.md` | **The integration interface** — how any external surface (tile, venue page, ticketing) connects a Pay-Me button to a split sheet. |

## Run it

Requires [Node.js](https://nodejs.org) (free). **Testnet XRP has no monetary value — nothing here touches real money.**

```bash
npm install

# Phase 1: tip → split
MODE=testnet node demo.js 20        # live XRPL testnet (PowerShell: $env:MODE="testnet"; node demo.js 20)
node demo.js 20                     # or offline simulation
node generate-dashboard.js          # then open dashboard.html

# Phase 2: escrow fan-funding (two scenarios)
MODE=testnet node demo-phase2.js    # live (~2 min; escrow deadlines wait in real time)
node demo-phase2.js                 # or offline simulation
node generate-campaign-dashboard.js # then open campaign-dashboard.html
```

In `MODE=testnet`, wallets are funded from the public faucet and every transaction links to the [testnet explorer](https://testnet.xrpl.org). In local mode, keys and transaction signatures are real (xrpl.js, offline signing); only consensus and time are simulated by `ledger-local.js`.

## Design principles

- **A rail, not a vault.** Money moves through; it never rests. No float, deliberately.
- **Non-custodial.** Escrowed pledges are held by the ledger itself. Nobody — including Splitter — can block a stalled campaign's refunds.
- **Utility, never investment.** Fans pay for music; musicians get paid for music.
- **Members choose their exposure.** Payout currency (XRP / RLUSD / a mix) is a per-member preference, not a platform opinion.

## Roadmap

Phase 1 (split engine + tipping) — **proven live**. Phase 2 (escrow fan-funding) — built; verification layer designed (release oracles via streaming/distributor APIs, pledge-weighted objection windows, bounded arbitration, crypto-condition key-reveal delivery). Ahead: per-member payout mix, NFT track sales with transfer fees, and a payout API for venues, ticketing, and platforms.

## Status & contact

Early prototype by a working musician who got tired of the way musicians get paid. Not production software; run it on testnet only.

An **LMAG Architects Inc.** project · Mike Isbister · D2UR · lmagarchinc@gmail.com

*Formerly developed under the working title "Encore" (Aug 2026); renamed Splitter on 2026-08-14.*

## License

[MIT](LICENSE)
