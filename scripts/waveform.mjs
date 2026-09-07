// Renders a year of GitHub contributions as an audio waveform.
// No API token: reads the public contributions calendar HTML.
//
//   node scripts/waveform.mjs <login> [outfile]

import { writeFile } from "node:fs/promises";

const login = process.argv[2] || process.env.GITHUB_REPOSITORY_OWNER || "lxrdmami0";
const out = process.argv[3] || "assets/waveform.svg";

const W = 880;
const H = 200;
const PAD = 20;
const TOP = 44;          // header band
const MID = TOP + 68;    // waveform centre line
const AMP = 58;          // max half-height of a bar

const res = await fetch(`https://github.com/users/${login}/contributions`, {
  headers: { "user-agent": "waveform.mjs", accept: "text/html" },
});
if (!res.ok) throw new Error(`contributions fetch failed: ${res.status}`);
const html = await res.text();

// id -> exact count, taken from the tooltip text ("3 contributions on ...")
const counts = new Map();
for (const m of html.matchAll(/<tool-tip[^>]*\sfor="(contribution-day-component-\d+-\d+)"[^>]*>([^<]*)/g)) {
  const n = /^No contributions/.test(m[2]) ? 0 : parseInt(m[2], 10);
  counts.set(m[1], Number.isFinite(n) ? n : 0);
}

const days = [];
for (const m of html.matchAll(/data-date="(\d{4}-\d{2}-\d{2})"\s+id="(contribution-day-component-\d+-\d+)"\s+data-level="(\d)"/g)) {
  days.push({ date: m[1], count: counts.get(m[2]) ?? Number(m[3]) });
}
days.sort((a, b) => a.date.localeCompare(b.date));
if (days.length < 30) throw new Error(`only parsed ${days.length} days — page format changed?`);

const samples = days.slice(-364);
const total = samples.reduce((a, d) => a + d.count, 0);
const peak = Math.max(1, ...samples.map((d) => d.count));
const peakDay = samples.find((d) => d.count === peak);
const active = samples.filter((d) => d.count > 0).length;

const span = W - PAD * 2;
const step = span / samples.length;
const bw = Math.max(1.1, step * 0.62);

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const fmt = (iso) => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};

let bars = "";
samples.forEach((d, i) => {
  const x = +(PAD + i * step).toFixed(2);
  // sqrt keeps quiet days visible without flattening the loud ones
  const norm = d.count === 0 ? 0 : Math.sqrt(d.count / peak);
  const h = +(Math.max(1.2, norm * AMP)).toFixed(2);
  const op = d.count === 0 ? 0.14 : +(0.34 + norm * 0.66).toFixed(2);
  const delay = (i * 0.0022).toFixed(3);
  bars +=
    `<rect class="b" x="${x}" y="${+(MID - h).toFixed(2)}" width="${bw.toFixed(2)}" height="${(h * 2).toFixed(2)}"` +
    ` rx="${(bw / 2).toFixed(2)}" opacity="${op}" style="animation-delay:${delay}s"/>`;
});

const peakX = +(PAD + samples.indexOf(peakDay) * step).toFixed(2);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="contributions rendered as an audio waveform">
  <defs>
    <linearGradient id="head" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.10"/>
    </linearGradient>
  </defs>
  <style>
    .mono { font-family: "JetBrains Mono","SFMono-Regular",Consolas,"Liberation Mono",monospace }
    .lbl { fill:#6e7681; font-size:10.5px; letter-spacing:1.6px }
    .val { fill:#e6e6e6; font-size:10.5px; letter-spacing:1.6px }
    .b { fill:#d8dde2; transform-origin:center; animation: lift .5s ease-out both }
    @keyframes lift { from { transform:scaleY(.06); opacity:0 } to { transform:scaleY(1) } }
    .play { animation: play 11s linear infinite }
    @keyframes play { from { transform:translateX(0) } to { transform:translateX(${span.toFixed(0)}px) } }
    .pk { animation: pulse 2.6s ease-in-out infinite }
    @keyframes pulse { 0%,100% { opacity:.35 } 50% { opacity:1 } }
  </style>

  <rect x="0" y="0" width="${W}" height="${H}" rx="8" fill="#08090b"/>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="8" fill="none" stroke="#1b1f24"/>

  <text class="mono lbl" x="${PAD}" y="24">TRACK</text>
  <text class="mono val" x="${PAD + 54}" y="24">contributions_${samples.at(-1).date.slice(0, 4)}.wav</text>
  <text class="mono lbl" x="${W - PAD}" y="24" text-anchor="end">${samples.length} SAMPLES &#183; ${active} ACTIVE &#183; ${total} TOTAL &#183; PEAK ${peak}</text>
  <rect x="${PAD}" y="34" width="${span}" height="1" fill="#161a1f"/>

  <line x1="${PAD}" y1="${MID}" x2="${W - PAD}" y2="${MID}" stroke="#20252b" stroke-width="1"/>
  <g>${bars}</g>

  <g class="pk">
    <line x1="${peakX}" y1="${MID - AMP - 8}" x2="${peakX}" y2="${MID + AMP + 8}" stroke="#ffffff" stroke-width=".8" stroke-dasharray="2 3"/>
  </g>

  <g class="play">
    <rect x="${PAD - 90}" y="${TOP}" width="90" height="${AMP * 2 + 20}" fill="url(#head)"/>
    <rect x="${PAD}" y="${TOP}" width="1.4" height="${AMP * 2 + 20}" fill="#ffffff" opacity=".85"/>
  </g>

  <text class="mono lbl" x="${PAD}" y="${H - 14}">${esc(fmt(samples[0].date))}</text>
  <text class="mono lbl" x="${W / 2}" y="${H - 14}" text-anchor="middle">PEAK ${esc(fmt(peakDay.date))} &#183; ${peak} COMMITS</text>
  <text class="mono lbl" x="${W - PAD}" y="${H - 14}" text-anchor="end">${esc(fmt(samples.at(-1).date))}</text>
</svg>
`;

await writeFile(out, svg, "utf8");
console.log(`${out} — ${samples.length} samples, total ${total}, peak ${peak} on ${peakDay.date}`);
