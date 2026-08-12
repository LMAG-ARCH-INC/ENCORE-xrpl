// Generates campaign-dashboard.html from campaign-results.json.
const fs = require("fs");

const r = JSON.parse(fs.readFileSync("campaign-results.json", "utf8"));
const isLocal = r.mode === "local";
const short = a => a.slice(0, 8) + "…" + a.slice(-4);
const hlink = rec => rec.explorer
  ? `<a href="${rec.explorer}">${rec.hash.slice(0, 10)}…</a>`
  : rec.hash.slice(0, 10) + "…";
const runTime = (r.events[0].match(/^\[(.*?)\]/) || [])[1] || "";

const pledgedTotal = r.pledges.reduce((a, p) => a + p.xrp, 0);
const releasedTotal = r.releases.filter(x => x.backer).reduce((a, x) => a + x.xrp, 0);
const memberTotals = {};
r.releases.filter(x => x.split).forEach(x => memberTotals[x.split] = (memberTotals[x.split] || 0) + x.xrp);
const refundTotal = r.failed.refunds.reduce((a, x) => a + x.xrp, 0);

const pledgeRows = r.pledges.map(p => `
  <tr><td>${p.backer}</td><td class="num">${p.xrp} XRP</td><td>${p.milestone}</td>
  <td><span class="state released">✓ released</span></td>
  <td class="mono">${hlink(p)}</td></tr>`).join("");

const milestoneCards = r.milestones.map((m, i) => {
  const rel = r.releases.filter(x => x.backer && x.milestone === m.name);
  const spl = r.releases.filter(x => x.split && x.milestone === m.name);
  const relSum = rel.reduce((a, x) => a + x.xrp, 0);
  return `
  <div class="card">
    <h2>Milestone ${i + 1}: ${m.name} <span class="state released">✓ complete — ${relSum} XRP released</span></h2>
    <table>
      <thead><tr><th>Event</th><th class="num">XRP</th><th>Transaction</th></tr></thead>
      <tbody>
        ${rel.map(x => `<tr><td>Escrow released — ${x.backer}'s pledge → band</td><td class="num">${x.xrp}</td><td class="mono">${hlink(x)}</td></tr>`).join("")}
        ${spl.map(x => `<tr><td><span class="swatch" style="background:var(--series-${x.split === r.splitSheet.members[0].name ? 1 : 2})"></span>Split → ${x.split}</td><td class="num">${x.xrp}</td><td class="mono">${hlink(x)}</td></tr>`).join("")}
      </tbody>
    </table>
  </div>`;
}).join("");

const failedRows = r.failed.pledges.map(p => {
  const refund = r.failed.refunds.find(x => x.backer === p.backer);
  return `<tr><td>${p.backer}</td><td class="num">${p.xrp} XRP</td>
    <td><span class="state refunded">↩ refunded by the ledger</span></td>
    <td class="mono">${hlink(refund)}</td></tr>`;
}).join("");

const roleLabel = role => role === "band" ? `${r.splitSheet.band} (band)`
  : role.startsWith("fan") && role.length === 4 ? `Fan ${role[3].toUpperCase()}`
  : role[0].toUpperCase() + role.slice(1);
const balRows = Object.keys(r.balances.before).map(role => {
  const b = r.balances.before[role], a = r.balances.after[role];
  const d = +(a - b).toFixed(6);
  return `<tr><td>${roleLabel(role)}</td><td class="num">${b}</td><td class="num">${a}</td>
    <td class="num ${d > 0 ? "delta-up" : ""}">${d > 0 ? "+" : ""}${d}</td></tr>`;
}).join("");

const events = r.events.map(e => `<div class="ev">${e.replace(/\[(.*?)\]/, '<span class="ts">$1</span>')}</div>`).join("");

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Encore · ${r.campaign}</title>
<style>
  .viz-root{color-scheme:light;
    --surface-1:#fcfcfb;--page:#f9f9f7;--ink-1:#0b0b0b;--ink-2:#52514e;--muted:#898781;
    --grid:#e1e0d9;--border:rgba(11,11,11,.10);--good:#006300;--meter:#2a78d6;
    --series-1:#2a78d6;--series-2:#eb6834;}
  @media (prefers-color-scheme: dark){
    :root:where(:not([data-theme="light"])) .viz-root{color-scheme:dark;
      --surface-1:#1a1a19;--page:#0d0d0d;--ink-1:#ffffff;--ink-2:#c3c2b7;--muted:#898781;
      --grid:#2c2c2a;--border:rgba(255,255,255,.10);--good:#0ca30c;--meter:#3987e5;
      --series-1:#3987e5;--series-2:#d95926;}}
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
  .meter{height:14px;border-radius:7px;background:var(--grid);overflow:hidden;margin:6px 0 4px}
  .meter>div{height:100%;border-radius:7px;background:var(--meter)}
  .meter-label{font-size:12px;color:var(--ink-2);margin-bottom:10px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;color:var(--muted);font-weight:500;font-size:12px;padding:6px 8px;border-bottom:1px solid var(--grid)}
  td{padding:8px;border-bottom:1px solid var(--grid)}
  tr:last-child td{border-bottom:none}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  th.num,td.num{text-align:right}
  .mono{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--ink-2)}
  .state{font-size:12px;font-weight:600}
  .state.released{color:var(--good)}
  .state.refunded{color:var(--series-1)}
  .delta-up{color:var(--good);font-weight:600}
  .swatch{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:7px;vertical-align:baseline}
  .ev{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--ink-2);padding:3px 0}
  .ev .ts{color:var(--muted)}
  .foot{font-size:12px;color:var(--muted);margin-top:20px;line-height:1.6}
  a{color:var(--series-1)}
</style></head>
<body><div class="viz-root"><div class="wrap">
  <header><h1>Encore · Fan-Funding</h1><span class="badge">${isLocal ? "local simulation" : "live XRPL testnet"}</span></header>
  <div class="sub">${r.campaign} · ${runTime}</div>

  <div class="tiles">
    <div class="tile"><div class="label">Pledged into escrow</div><div class="value">${pledgedTotal} XRP</div><div class="note">goal ${r.goalXrp} XRP · ${r.pledges.length} escrows, ${new Set(r.pledges.map(p=>p.backer)).size} backers</div></div>
    <div class="tile"><div class="label">Released to the band</div><div class="value">${releasedTotal} XRP</div><div class="note">across ${r.milestones.length} completed milestones</div></div>
    <div class="tile"><div class="label">Paid to members</div><div class="value">${Object.values(memberTotals).reduce((a,v)=>a+v,0)} XRP</div><div class="note">${Object.entries(memberTotals).map(([k,v])=>`${k} ${v}`).join(" · ")}, via split sheet</div></div>
    <div class="tile"><div class="label">Auto-refunded</div><div class="value">${refundTotal} XRP</div><div class="note">stalled campaign — ledger repaid backers</div></div>
  </div>

  <div class="card">
    <h2>${r.campaign} — funding</h2>
    <div class="meter"><div style="width:${Math.min(100, pledgedTotal / r.goalXrp * 100)}%"></div></div>
    <div class="meter-label">${pledgedTotal} of ${r.goalXrp} XRP pledged (${Math.round(pledgedTotal / r.goalXrp * 100)}%) — every pledge locked on-ledger in escrow, one per milestone</div>
    <table>
      <thead><tr><th>Backer</th><th class="num">Slice</th><th>Milestone</th><th>Status</th><th>Escrow tx</th></tr></thead>
      <tbody>${pledgeRows}</tbody>
    </table>
  </div>

  ${milestoneCards}

  <div class="card">
    <h2>${r.failed.campaign} — stalled campaign, automatic refunds</h2>
    <table>
      <thead><tr><th>Backer</th><th class="num">Pledge</th><th>Outcome</th><th>Refund tx</th></tr></thead>
      <tbody>${failedRows}</tbody>
    </table>
    <p style="font-size:12px;color:var(--ink-2);margin-top:10px">No milestone completed before the deadline, so the ledger's escrow rules returned every pledge. Nobody — not the band, not Encore — could have kept the money.</p>
  </div>

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
      ? "This run used real XRPL keypairs and real offline-signed EscrowCreate / EscrowFinish / EscrowCancel transactions, applied to a local ledger simulator with simulated time. Run <code>MODE=testnet node demo-phase2.js</code> on a machine with open internet for a live run (~2 minutes — escrow deadlines wait in real time)."
      : "Live run on the XRPL testnet — click any transaction hash to view it on the public explorer."}
    <br>Encore prototype · Phase 2: escrow-backed fan-funding · testnet XRP has no monetary value.
  </div>
</div></div></body></html>`;

fs.writeFileSync("campaign-dashboard.html", html);
console.log("Wrote campaign-dashboard.html");
