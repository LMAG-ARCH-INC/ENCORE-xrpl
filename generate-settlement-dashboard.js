// Generates settlement-dashboard.html from settlement-results.json — one
// settlement statement per event, the way a bandleader would want to see it
// at the end of the night. Re-run after every demo-settlement run.
const fs = require("fs");
const { dropsToXrp } = require("xrpl");

const r = JSON.parse(fs.readFileSync("settlement-results.json", "utf8"));
const short = a => a ? a.slice(0, 8) + "…" + a.slice(-4) : "";
const hshort = h => h ? h.slice(0, 10) + "…" : "";
const link = (p) => p.explorer ? `<a href="${p.explorer}">${hshort(p.hash)}</a>` : `<span class="mono">${hshort(p.hash)}</span>`;
const isLocal = r.mode === "local";
const XRP = d => Number(dropsToXrp(d)).toLocaleString(undefined, { maximumFractionDigits: 6 });

const statements = r.runs.map(run => {
  const p = run.plan;
  const inRows = run.inflows.map(i => `
    <tr><td><span class="tag in">${i.source}</span></td><td>${i.from}${i.note ? ` <span class="muted">· ${i.note}</span>` : ""}</td>
        <td class="num">${XRP(i.drops)}</td><td>${link(i)}</td><td><span class="ok">✓</span></td></tr>`).join("");
  const outRows = [...p.lines, ...p.shares].map(l => {
    const pay = run.payments.find(x => x.line.line === l.line);
    const st = l.status === "PAID" ? `<span class="ok">✓ paid</span>`
      : l.status === "PARTIAL" ? `<span class="warn">partial · ${XRP(l.short)} owed</span>`
      : l.status === "UNPAID" ? `<span class="bad">unpaid · ${XRP(l.short)} owed</span>`
      : `<span class="muted">nothing left</span>`;
    return `<tr class="${l.type}"><td><span class="tag ${l.type}">${l.type}</span></td>
      <td>${l.label}<div class="muted">→ ${l.payee} · <span class="mono">${short(l.address)}</span>${l.note ? ` · ${l.note}` : ""}</div></td>
      <td class="num">${XRP(l.drops)}</td><td>${pay ? link(pay) : ""}</td><td>${st}</td></tr>`;
  }).join("");
  const escrow = run.escrow ? `<div class="pill">Guarantee held in ledger escrow before downbeat · locked ${link(run.escrow.create)} · released ${link(run.escrow.finish)}</div>` : "";
  return `
  <section class="card">
    <div class="head"><div><div class="ev">${p.event.name}</div><div class="muted">${p.event.date} · ${p.event.venue}</div></div>
      <div class="totals"><div><span class="k">Gross</span><span class="v">${p.grossXrp} XRP</span></div>
        <div><span class="k">Lines</span><span class="v">${XRP(BigInt(p.grossDrops) - BigInt(p.residualDrops))} XRP</span></div>
        <div><span class="k">Residual to owners</span><span class="v">${p.residualXrp} XRP</span></div>
        ${p.ok ? "" : `<div class="short"><span class="k">Shortfall</span><span class="v">${p.shortfallXrp} XRP</span></div>`}</div></div>
    ${escrow}
    <table><thead><tr><th></th><th>In</th><th class="num">XRP</th><th>Tx</th><th></th></tr></thead><tbody>${inRows}</tbody></table>
    <table><thead><tr><th></th><th>Out — the waterfall</th><th class="num">XRP</th><th>Tx</th><th>Status</th></tr></thead><tbody>${outRows}</tbody></table>
    <div class="muted foot">Settled in ${(run.elapsedMs / 1000).toFixed(1)} s${p.ok ? "" : " · shortfall is on the record: nothing came out of the leader's pocket"}</div>
  </section>`;
}).join("");

const events = r.events.map(e => `<div class="evline">${e.replace(/\[(.*?)\]/, '<span class="ts">$1</span>')}</div>`).join("");

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Splitter · ${r.band} settlement statements</title>
<style>
  body{margin:0;background:#141414;color:#F4F4F1;font:14px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:28px}
  h1{font-size:22px;letter-spacing:2px;margin:0 0 4px}
  .sub{color:#B8B8B2;margin-bottom:22px}
  .card{background:#1E1E1E;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:18px 20px;margin-bottom:22px}
  .head{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:12px}
  .ev{font-size:18px;font-weight:700}
  .totals{display:flex;gap:22px}.totals .k{display:block;font-size:11px;color:#B8B8B2;letter-spacing:1px;text-transform:uppercase}
  .totals .v{font-size:18px;font-weight:700;color:#F28B2B}.totals .short .v{color:#ff6b6b}
  table{width:100%;border-collapse:collapse;margin-top:10px}th{text-align:left;font-size:11px;color:#B8B8B2;letter-spacing:1px;text-transform:uppercase;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.1)}
  td{padding:8px;border-bottom:1px solid rgba(255,255,255,.06);vertical-align:top}.num{text-align:right;font-variant-numeric:tabular-nums}
  .tag{display:inline-block;font-size:11px;padding:2px 8px;border-radius:999px;background:#333;text-transform:uppercase;letter-spacing:1px}
  .tag.in{background:#1f3a1f;color:#7CFF6B}.tag.expense{background:#3a2a1f;color:#F28B2B}.tag.rate{background:#1f2e3a;color:#7cc4ff}.tag.share{background:#2e1f3a;color:#d9a6ff}.tag.fee{background:#333}
  .muted{color:#8f8f88;font-size:12px}.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}
  .ok{color:#7CFF6B}.warn{color:#F28B2B}.bad{color:#ff6b6b}a{color:#7cc4ff}
  .pill{display:inline-block;background:#0f2a12;color:#7CFF6B;border-radius:999px;padding:4px 12px;font-size:12px;margin:4px 0 8px}
  .foot{margin-top:10px}
  .log{background:#0f0f0f;border-radius:10px;padding:12px 14px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;max-height:320px;overflow:auto}
  .ts{color:#666}
</style></head><body>
<h1>SPLITTER · ${r.band} — SETTLEMENT STATEMENTS</h1>
<div class="sub">${isLocal ? "Local ledger simulation (real signed transactions, simulated consensus)" : "Live XRPL testnet — every hash links to the explorer"} · template: ${r.template.owners.map(o => `${o.name} ${o.share}%`).join(" / ")} · the accounting trail is in <code>settlement.csv</code></div>
${statements}
<section class="card"><div class="ev" style="margin-bottom:8px">Event log</div><div class="log">${events}</div></section>
</body></html>`;
fs.writeFileSync("settlement-dashboard.html", html);
console.log("Wrote settlement-dashboard.html");
