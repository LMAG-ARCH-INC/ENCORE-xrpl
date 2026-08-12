# Encore Integration Interface (v0)

*How any external surface — a profile tile, a venue page, a ticketing site, a livestream overlay — connects a "Pay Me" button to a band's split sheet.*

## The core idea: the integration point is a payment

Encore deliberately has no API keys, no OAuth, and no SDK requirement in v0. A band's **Encore tip address** (an XRPL account watched by the Encore split listener) *is* the interface. Any surface that can send — or help a fan send — an XRPL payment to that address is fully integrated. Seconds later, every band member holds their share, per the band's split sheet. The integrating platform never touches the split logic, never holds funds, and never needs to know how many members the band has.

```
fan → [any surface: tile / page / QR poster] → XRPL Payment → band tip address
                                                                    │
                                              Encore split listener (listen.js)
                                                                    │
                                          member 1 ◄─── split ───► member 2 …
```

## What an integrator does (all of it)

1. **Obtain the band's tip address** — today: the band copies it from Encore; later: a lookup endpoint (see v1 sketch).
2. **Render a payment affordance** — any of:
   - a QR code / link encoding the payment URI: `xrpl:rBANDADDRESS?amount=5`
   - a wallet deep link (e.g. Xaman) for one-tap payment
   - a direct `Payment` transaction, if the surface has its own wallet UX (Monolith-style `Pay Me` buttons)
3. **(Recommended) Tag the payment with a source memo** so dashboards can attribute the tip — see memo convention below.

That's the whole integration. Steps 1–2 require zero coordination with Encore.

## Memo convention (attribution)

Encore reads and writes structured memos. For an incoming tip, integrators SHOULD attach:

| Memo field | Value (hex-encoded, per XRPL) |
|---|---|
| `MemoType` | `encore/tip` |
| `MemoData` | `src=<platform>;ref=<optional id>` — e.g. `src=monolith;ref=tile:1234` |

Outbound split payments carry `MemoType: encore/split` with `MemoData: <member>:<share>%`, so the full money trail — which surface produced which tip, and how it divided — is reconstructable from the public ledger alone. Missing or malformed memos never block a split; attribution is best-effort by design.

## Confirmation

Because everything settles on-ledger, an integrator can confirm end-to-end without any Encore endpoint: watch the band address (WebSocket `subscribe` on any public XRPL node) and observe (a) the tip arriving and (b) the split payments leaving within seconds, all with `tesSUCCESS` and public transaction hashes. A hosted status/webhook endpoint is a v1 feature, not a v0 requirement.

## Trying it on testnet (10 minutes)

1. `npm install`, then `node setup-wallets.js` with `MODE=testnet` conventions (or run `demo.js` once) to create a funded band + members and `wallets.json`.
2. Run the listener: `MODE=testnet node listen.js` — it subscribes to the band address and waits.
3. From any testnet wallet (or a second terminal using the fan wallet in `wallets.json`), send XRP to the band address.
4. Watch the listener log the tip and fire the splits; verify on https://testnet.xrpl.org.

`pay-button.html` in this repo is a self-contained example of the integrator side: a Pay-Me widget rendering the QR + payment URI for any address you configure.

## Boundaries (what stays on which side)

| Concern | Owner |
|---|---|
| Page, profile, discovery, payment UX | The surface (e.g. Monolith) |
| Split sheet, member wallets, payout currency mix | The band, via Encore |
| Split computation & execution | Encore split listener |
| Funds custody | **Nobody** — ledger only; the tip address is a rail, not a vault |
| Fees | Network fees only in v0; Encore routing-fee mechanics are a business-terms discussion, not an interface question |

## v1 sketch (when a real API earns its keep)

- `GET /bands/{handle}` → tip address + display metadata (lookup instead of copy-paste)
- `POST /splitsheets` → band onboarding from a partner surface
- Webhooks: `tip.received`, `split.completed` (convenience over ledger-watching)
- Signed payment-request generation (amount suggestions, currency preference hints)

v0 ships without any of this because the ledger already provides settlement, confirmation, and audit. The API adds convenience, not trust.

---

*Encore — the payment rail for working musicians, built on a payment rail. An LMAG Architects Inc. project.*
