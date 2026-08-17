// Generates dashboard.html from demo-results.json — a self-contained receipt view
// of the tip → split flow. Re-run after every demo run.
const fs = require("fs");
const QRCode = require("qrcode");

const r = JSON.parse(fs.readFileSync("demo-results.json", "utf8"));

const FEE_DROPS = 12;
const totalFeeDrops = FEE_DROPS * (1 + r.splits.length);
const feeXrp = totalFeeDrops / 1_000_000;
const short = a => a.slice(0, 8) + "…" + a.slice(-4);
const hshort = h => h.slice(0, 10) + "…";
const runTime = (r.events[0].match(/^\[(.*?)\]/) || [])[1] || "";
const isLocal = r.mode === "local";

async function main() {
  const tipUri = `xrpl:${r.wallets.band.address}`;
  const qr = await QRCode.toDataURL(tipUri, { margin: 1, width: 220,
    color: { dark: "#0b0b0b", light: "#fcfcfb" } });

  const seriesLight = ["#2a78d6", "#eb6834"];
  const seriesDark = ["#3987e5", "#d95926"];

  const memberRows = r.splits.map((s, i) => `
    <tr>
      <td><span class="swatch" style="background:var(--series-${i + 1})"></span>${s.name}</td>
      <td class="num">${s.share}%</td>
      <td class="num">${s.xrp} XRP</td>
      <td class="mono">${short(s.address)}</td>
      <td class="mono">${s.explorer ? `<a href="${s.explorer}">${hshort(s.hash)}</a>` : hshort(s.hash)}</td>
      <td><span class="ok">✓ ${s.result}</span></td>
    </tr>`).join("");

  const segs = r.splits.map((s, i) =>
    `<div class="seg" style="flex:${s.share};background:var(--series-${i + 1})" title="${s.name} ${s.share}%"><span>${s.name} · ${s.share}%</span></div>`
  ).join("");

  const balRows = Object.keys(r.balances.before).map(role => {
    const b = r.balances.before[role], a = r.balances.after[role];
    const d = +(a - b).toFixed(6);
    const cls = d > 0 ? "delta-up" : d < 0 ? "" : "";
    return `<tr><td>${role === "band" ? r.band + " (band)" : role[0].toUpperCase() + role.slice(1)}</td>
      <td class="num">${b}</td><td class="num">${a}</td>
      <td class="num ${cls}">${d > 0 ? "+" : ""}${d}</td></tr>`;
  }).join("");

  const events = r.events.map(e => `<div class="ev">${e.replace(/\[(.*?)\]/, '<span class="ts">$1</span>')}</div>`).join("");

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Splitter · ${r.band} tip-split demo</title>
<style>
  .viz-root{color-scheme:light;
    --surface-1:#fcfcfb;--page:#f9f9f7;--ink-1:#0b0b0b;--ink-2:#52514e;--muted:#898781;
    --grid:#e1e0d9;--border:rgba(11,11,11,.10);--good:#006300;
    --series-1:${seriesLight[0]};--series-2:${seriesLight[1]};}
  @media (prefers-color-scheme: dark){
    :root:where(:not([data-theme="light"])) .viz-root{color-scheme:dark;
      --surface-1:#1a1a19;--page:#0d0d0d;--ink-1:#ffffff;--ink-2:#c3c2b7;--muted:#898781;
      --grid:#2c2c2a;--border:rgba(255,255,255,.10);--good:#0ca30c;
      --series-1:${seriesDark[0]};--series-2:${seriesDark[1]};}}
  *{box-sizing:border-box;margin:0}
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
  .viz-root{background:var(--page);color:var(--ink-1);min-height:100vh;padding:32px 24px}
  .wrap{max-width:880px;margin:0 auto}
  header{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:6px}
  h1{font-size:22px;font-weight:650}
  .badge{font-size:12px;padding:3px 10px;border-radius:999px;border:1px solid var(--border);color:var(--ink-2)}
  .sub{color:var(--ink-2);font-size:13px;margin-bottom:24px}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:24px}
  .tile{background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:16px 18px}
  .tile .label{font-size:12px;color:var(--muted);margin-bottom:6px}
  .tile .value{font-size:26px;font-weight:650}
  .tile .note{font-size:12px;color:var(--ink-2);margin-top:4px}
  .card{background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:16px}
  .card h2{font-size:14px;font-weight:650;margin-bottom:14px}
  .bar{display:flex;height:36px;border-radius:6px;overflow:hidden;gap:2px;background:var(--surface-1);margin-bottom:14px}
  .seg{display:flex;align-items:center;justify-content:center;border-radius:4px}
  .seg span{font-size:12px;font-weight:600;color:#fff}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;color:var(--muted);font-weight:500;font-size:12px;padding:6px 8px;border-bottom:1px solid var(--grid)}
  td{padding:8px;border-bottom:1px solid var(--grid)}
  tr:last-child td{border-bottom:none}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  th.num,td.num{text-align:right}
  .mono{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--ink-2)}
  .ok{color:var(--good);font-size:12px;font-weight:600}
  .delta-up{color:var(--good);font-weight:600}
  .grid2{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:start}
  .qr{background:#fcfcfb;border:1px solid var(--border);border-radius:12px;padding:10px;line-height:0}
  .ev{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--ink-2);padding:3px 0}
  .ev .ts{color:var(--muted)}
  .foot{font-size:12px;color:var(--muted);margin-top:20px;line-height:1.6}
  a{color:var(--series-1)}
  @media (max-width:640px){.grid2{grid-template-columns:1fr}}
</style></head>
<body><div class="viz-root"><div class="wrap">
  <header><h1>Splitter</h1><span class="badge">${isLocal ? "local simulation" : "live XRPL testnet"}</span></header>
  <div class="sub">${r.band} · tip-and-split demo · ${runTime}</div>

  <div class="tiles">
    <div class="tile"><div class="label">Tip received</div><div class="value">${r.tipXrp} XRP</div><div class="note">from a fan, one QR scan</div></div>
    <div class="tile"><div class="label">Split &amp; settled</div><div class="value">${r.splits.length} payouts</div><div class="note">automatic, per split sheet</div></div>
    <div class="tile"><div class="label">Time to settle</div><div class="value">${(r.elapsedMs / 1000).toFixed(1)}s</div><div class="note">${isLocal ? "simulated · ~4–8s on live testnet" : "tip → all shares landed"}</div></div>
    <div class="tile"><div class="label">Total network fees</div><div class="value">${totalFeeDrops} drops</div><div class="note">${feeXrp} XRP — under 1/100 of a cent</div></div>
  </div>

  <div class="card">
    <h2>Split sheet — where every dollar goes</h2>
    <div class="bar">${segs}</div>
    <table>
      <thead><tr><th>Member</th><th class="num">Share</th><th class="num">Paid</th><th>Wallet</th><th>Transaction</th><th>Status</th></tr></thead>
      <tbody>${memberRows}</tbody>
    </table>
  </div>

  <div class="card"><div class="grid2">
    <div>
      <h2>The tip jar — scan to tip ${r.band}</h2>
      <table>
        <tbody>
        <tr><td>Band wallet</td><td class="mono">${r.wallets.band.address}</td></tr>
        <tr><td>Tip transaction</td><td class="mono">${r.tip.explorer ? `<a href="${r.tip.explorer}">${hshort(r.tip.hash)}</a>` : hshort(r.tip.hash)} <span class="ok">✓ ${r.tip.result}</span></td></tr>
        <tr><td>Payment URI</td><td class="mono">${tipUri}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="qr"><img src="${qr}" width="150" height="150" alt="QR code for tipping ${r.band}"></div>
  </div></div>

  <div class="card">
    <h2>Wallet balances (XRP)</h2>
    <table>
      <thead><tr><th>Wallet</th><th class="num">Before</th><th class="num">After</th><th class="num">Change</th></tr></thead>
      <tbody>${balRows}</tbody>
    </table>
  </div>

  <div class="card"><h2>Event log</h2>${events}</div>

  <div class="foot">
    ${isLocal
      ? "This run used real XRPL keypairs and real offline-signed Payment transactions, applied to a local ledger simulator (the cloud sandbox can't reach the testnet). Run <code>MODE=testnet node demo.js</code> on a machine with open internet for a live run — identical code, transactions viewable on testnet.xrpl.org."
      : "Live run on the XRPL testnet — click any transaction hash to view it on the public explorer."}
    <br>Splitter prototype · split-first payments for working musicians · testnet XRP has no monetary value.
  </div>
</div></div></body></html>`;

  fs.writeFileSync("dashboard.html", html);
  console.log("Wrote dashboard.html");
}
main();
