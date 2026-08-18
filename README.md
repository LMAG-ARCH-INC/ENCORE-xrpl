# Splitter

**The payment rail for working musicians, built on a payment rail.** · [splitter.band](https://splitter.band)

*One payment in, every member fed.* Like the audio splitter that feeds one signal to every amp — and the splitter van that gets the whole band to the gig.

Splitter is split-first payments for bands on the [XRP Ledger](https://xrpl.org). For money with no costs attached — a tip — a band's **split sheet** (member wallets and percentages) divides it among the members in seconds. For gig money — a guarantee, the door — a band's **settlement template** runs the same waterfall a bandleader does in their head at 1 a.m.: expenses first, then the hired players' rates, then what's left splits among the owners — confirmed per gig, every line a real on-ledger payment with the reason in the memo, the whole thing exportable as a CSV for the accountant. The venue's guarantee can sit in the ledger's own escrow before downbeat, so the band knows it's getting paid before it plays and the leader never fronts the payroll. **The leader stops being the bank.**

**Strictly payments utility.** No token. No speculation. No custody — the band wallet is a rail, not a vault, and campaign pledges are held by the ledger's native escrow, never by Splitter.

## Proven on the live testnet

2026-08-11, run from a standard Windows machine: a 20 XRP tip was received and fully split 50/50 between two band members in **10.5 seconds**, total network fees **36 drops** (0.000036 XRP). Publicly verifiable:

- [Tip: fan → D2UR](https://testnet.xrpl.org/transactions/4D85AB31C5A48E07070F3D4663A2F585CB2107545BAD1EA865BD589A9D29EE9C)
- [Split: 50% → member 1](https://testnet.xrpl.org/transactions/14FB30C75F32370ADE13ACC17223497AC6BE52275C48912095C363445E0147C6)
- [Split: 50% → member 2](https://testnet.xrpl.org/transactions/2ABC94E0E99C593DB1F0AFD79A9F1EF58B7B86595918204328C3CF436B9CD087)

## Phase 1.5 — the settlement waterfall, also proven live

2026-08-18, same machine, both demo nights on the public testnet, every transaction `tesSUCCESS`:

- **Saturday at Times Change(d)** — the venue's 60 XRP guarantee [locked in ledger escrow before downbeat](https://testnet.xrpl.org/transactions/EB9B1D01188C2DAAB73966439BE063BA87F398B26C6ECF9B9FA3A4247293DC9F), [released at end of night](https://testnet.xrpl.org/transactions/B2E343485FEC9E9C191BA3DB986D6C1CC5C47F5B4D77AB37945464A141476F1E), plus [15 XRP in tips](https://testnet.xrpl.org/transactions/1918B62C1FBD1D0E1A956C62A686E48B5F50C2EDA7BCC61CC9A04043FE7C40C0); then the waterfall — [van rental](https://testnet.xrpl.org/transactions/6DA8CBB79EE0BAF85A9830B68963417ABA0A8171DECB36B25CEA6005D5F00610), [strings](https://testnet.xrpl.org/transactions/AC5E2DC377015BBE07E2F1CF686A873BDFA886A01C72C980FEA15298463CC874), [sub bassist](https://testnet.xrpl.org/transactions/07094DFA96A47BEAD7046BAF95B376ADBBEED05FB2C021F2B375A621431618FC), [sound tech](https://testnet.xrpl.org/transactions/4A9A6C6DC9078D216793227A87BDF22FC1E84917303EBC8DB3AE0A3636D8B9D3), [leader fee](https://testnet.xrpl.org/transactions/C1E9B2753F7A703F2879B601A1A116F1B48F991F8D77393ADA3467F3FC613582), and the residual split [50%](https://testnet.xrpl.org/transactions/D7D2DB0CAC5B710E3EBB8645FFBED86A56A26BD39895C64DEFA6F907AB233A30) / [50%](https://testnet.xrpl.org/transactions/2D3542B7414946F2EE33A7F09A8E66AEBADAE1BFF5D042A149159284A9879F2E). Settled in 69 s including the escrow's wait for "end of night."
- **The night the room didn't pay** — [tips only](https://testnet.xrpl.org/transactions/6B244752A49ABAD11FCF979CA0665A993E1A9DECBA09FC69666BF4F62D792255); [van reimbursed](https://testnet.xrpl.org/transactions/3A37DF8C49ADB448A08830D50CD5819B5137053A15B55F9FC2BAA909ADA84621), [sub paid 7 of 10](https://testnet.xrpl.org/transactions/668A441B321E50151D91190F514941803B7FC360BFE1C3998BF7CB1F1D5E5D45), sound tech and leader fee recorded as owed, owners nothing — a 16 XRP shortfall on the record instead of in the leader's pocket.

The band's settlement address ended both nights back at its starting balance minus fees: a rail, not a vault.

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
| `settlement-template.json` | **Phase 1.5** — the band's standing settlement shape: owners + shares, standing lines (e.g. leader fee), known payees + usual rates. |
| `events/*.json` | One confirmed settlement per gig: inflows (guarantee via escrow, tips) and this night's lines (expenses, rates). |
| `settlement-engine.js` | **The waterfall**: gross → expenses → rates (hired players before owners) → optional fee → residual → owners' split. Pays what it can when short and reports the rest. `exportCsv()` = the accounting trail. |
| `demo-settlement.js` | Two nights end-to-end: a normal Saturday (guarantee escrowed before downbeat, released at end of night, full waterfall) and the night the room didn't pay (honest shortfall). |
| `generate-settlement-dashboard.js` | Settlement statements as HTML — the settlement sheet, on-ledger. |
| `test-settlement.js` | Pure-math checks for the waterfall (conservation, dust, priority, overrides, fee, CSV). |
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

# Phase 1.5: the settlement waterfall (two nights) + the accounting trail
node test-settlement.js                 # engine checks
MODE=testnet node demo-settlement.js    # live (~1 min; guarantee escrow waits for end of night)
node demo-settlement.js                 # or offline simulation
node generate-settlement-dashboard.js   # then open settlement-dashboard.html; settlement.csv is for the accountant

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

Phase 1 (split engine + tipping) — **proven live**. Phase 1.5 (settlement waterfall + guarantee-in-escrow + CSV trail) — **proven live** (2026-08-18). Phase 2 (escrow fan-funding) — built; verification layer designed (release oracles via streaming/distributor APIs, pledge-weighted objection windows, bounded arbitration, crypto-condition key-reveal delivery). Ahead: per-member payout mix, NFT track sales with transfer fees, and a payout API for venues, ticketing, and platforms.

## Status & contact

Early prototype by a working musician who got tired of the way musicians get paid. Not production software; run it on testnet only.

An **LMAG Architects Inc.** project · Mike Isbister · D2UR · lmagarchinc@gmail.com

*Formerly developed under the working title "Encore" (Aug 2026); renamed Splitter on 2026-08-14.*

## License

[MIT](LICENSE)
