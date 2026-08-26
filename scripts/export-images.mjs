/**
 * 메일에 붙여 넣을 Summary 시트 이미지를 뽑는다.
 *
 *     npm run export:images              # 배포본에서 최신 월을 뽑는다
 *     npm run export:images -- --month 6월
 *     npm run export:images -- --url http://127.0.0.1:3111
 *
 * 화면을 캡처해서 붙여 넣으면 두 번 손해를 본다 — 창 크기에 맞춰 찍힌 그림이 메일에서 다시
 * 늘어나며 흐려지고(1,154px 그림을 1,354px로 넣으면 그만큼 뭉갠다), 받는 쪽 읽기 창이 좁으면
 * 또 줄어들며 글씨가 작아진다. 그래서 여기서는
 *   · 시트 폭에 딱 맞는 크기로 그리고 (남는 여백 없이 = 같은 글씨가 그림에서 더 크다)
 *   · 화소는 2배로 찍은 뒤 (DPI 192로 표기해 워드가 절반 크기로 넣는다 = 늘어나지 않는다)
 * 붙여 넣기만 하면 되는 PNG를 만든다.
 *
 * 크기는 세 값이 정한다 — 헷갈리기 쉬우니 역할을 나눠 둔다.
 *   · WIDTH : 배치 폭. 키우면 칸이 옆으로 펼쳐져 세로가 짧아지고, 글씨는 폭 대비 작아진다.
 *   · ZOOM  : 통째로 확대. 가로·세로가 같은 비율로 커지고 생김새는 그대로다(글씨도 같이 커짐).
 *   · SCALE : 화소만 늘림. 보이는 크기는 그대로 두고 선명해진다.
 * 붙였을 때 보이는 폭 = WIDTH × ZOOM, 파일 화소 = 거기에 × SCALE.
 *
 * 브라우저 창 대신 헤드리스 크롬을 쓰므로 이 PC의 화면 배율·창 크기와 무관하게 매달 같은 그림이 나온다.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32 } from "node:zlib";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));

// ── 옵션 ──────────────────────────────────────────────────────────────────────
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const URL_ = arg("url", "https://fc-dashboard-web.vercel.app/");
const WANT_MONTH = arg("month", "");
const OUT_ROOT = arg("out", join(REPO, "보고 이미지"));
/**
 * 시트를 그릴 폭(css px). 표·도넛·항목별 Summary가 좌우로 벌어질 자리를 정한다.
 * 넓게 쓰고 싶으면 ZOOM이 아니라 이걸 키운다 — 그래야 세로가 같이 길어지지 않는다.
 */
const WIDTH = Number(arg("width", "1300"));
/** 그림을 통째로 키우는 배율. 가로·세로가 같은 비율로 커지고 칸 배치는 달라지지 않는다. */
const ZOOM = Number(arg("zoom", "1.15"));
/** 화소 배율. 2배로 찍고 DPI를 2배로 적어, 워드가 원래 크기로 넣으면서 선명하게 보이게 한다. */
const SCALE = Number(arg("scale", "2"));

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];
const CHROME = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!CHROME) throw new Error("크롬(또는 엣지)을 찾지 못했습니다.");

const SHEETS = [
  { tab: "sum-total", name: "1-Humax합계" },
  { tab: "sum-evcs", name: "2-EVCS사업부" },
  { tab: "sum-detail", name: "3-Humax합계_상세" },
  { tab: "sum-trend", name: "4-배부액추이" },
];

/** 열람 암호 — .env.local의 DASHBOARD_PASSWORD를 쓴다 (쿠키에는 해시만 담긴다). */
function readPassword() {
  if (process.env.DASHBOARD_PASSWORD) return process.env.DASHBOARD_PASSWORD;
  for (const f of [".env.local", ".env"]) {
    const p = join(REPO, f);
    if (!existsSync(p)) continue;
    const hit = readFileSync(p, "utf8").split(/\r?\n/).find((l) => l.startsWith("DASHBOARD_PASSWORD="));
    if (hit) return hit.slice("DASHBOARD_PASSWORD=".length).trim();
  }
  throw new Error("DASHBOARD_PASSWORD를 찾지 못했습니다 (.env.local 확인).");
}

/**
 * 메일용 손질 — 화면에만 필요한 것(상단 바·탭·슬라이드 버튼)을 걷어내고,
 * 글씨를 한 단계 키우고, 표가 남는 폭을 다 쓰도록 늘린다.
 * 칸 배치(표 옆에 도넛·Summary)는 화면 그대로 두어 세로를 짧게 유지한다.
 */
const EXPORT_CSS = `
  body{background:#fff}
  .topbar,.tab-bar,.slidenav,footer{display:none!important}
  .content{max-width:none!important;width:${WIDTH}px!important;padding:16px 18px 18px!important;margin:0!important}
  /* 좁게 그린 만큼 글씨를 키운다 — 폭 대비 글자가 커야 메일 창에서 줄어들어도 읽힌다. */
  .sheet-title{font-size:22px}
  .tbl-hd{font-size:15.5px}
  .tbl-hd .sub{font-size:13px}
  .section-lead{font-size:15px}
  .section-lead .sub{font-size:13px}
  .pl-tbl th{font-size:12.5px!important}
  .pl-tbl td{font-size:15px!important}
  .pl-tbl .fee-sub td:first-child{font-size:14px}
  .summary-callout .summary-comment-list{font-size:15px}
  .summary-callout .summary-comment-list li.summary-comment-sub{font-size:14.5px}
  .summary-callout .summary-comment-list li.summary-comment-detail{font-size:14px}
  .summary-callout-title{font-size:12.5px}
  /* 항목별 카드는 셋이 나란히 서서 한 장이 좁다 — 여기는 조금만 키운다. */
  .summary-card .summary-comment-list{font-size:13.5px}
  .summary-card .summary-comment-list li.summary-comment-sub{font-size:13px}
  .summary-card-hd{font-size:12.5px}
  /* 표 옆 도넛은 그대로 두되, 폭이 모자라면 범례가 잘리므로 조금만 줄인다. */
  .donut-wrap{width:118px;height:118px}
  .donut-legend li{font-size:12.5px}
  .donut-card-title{font-size:13px}
  /* 표와 도넛은 화면에서처럼 나란히 둔다 — 폭이 넉넉해야 세로가 짧아지고 메일에서 읽기 좋다.
     표는 남는 폭을 다 쓰게 늘리고, 도넛은 제 크기만 차지하게 둔다. */
  .sum-block,.sum-block-row{width:100%!important;max-width:none!important}
  .sum-block-row .tbl-box{flex:1 1 auto;width:auto!important;max-width:none!important;min-width:0}
  .sum-block-row .donut-box{flex:0 0 auto}
  #tab-sum-total .sum-tbl{width:100%!important}
  /* EVCS 상단(표 + 도넛 2장)과 상세(표 + 항목별 Summary)도 화면과 같이 좌우로 둔다. */
  .evcs-top{grid-template-columns:minmax(0,1fr) minmax(0,1.15fr)!important;gap:14px}
  #tab-sum-evcs .tbl-box{width:100%!important;max-width:none!important}
  #tab-sum-evcs .pl-tbl{width:100%!important}
  .detail-grid{grid-template-columns:minmax(0,1fr) minmax(330px,0.62fr)!important}
  .detail-grid > .tbl-box,.detail-grid > .summary-cards-box{height:auto!important}
  #tab-sum-detail .tbl-box{width:100%!important;max-width:none!important}
  #tab-sum-detail .sum-tbl{width:100%!important}
  /* EVCS 표 머리말의 설명이 길어 두 줄로 접힌다 — 그 줄만 한 단계 줄여 한 줄에 넣는다. */
  #tab-sum-evcs .section-lead .sub{font-size:11.5px}
  .detail-trend-wrap{height:320px}
  /* 마지막 요소 아래 여백은 그림 밑에 빈 띠로 남는다. */
  .content > *:last-child{margin-bottom:0!important}
  .sum-block:last-child{margin-bottom:0!important}
`;

// ── PNG DPI 표기 ──────────────────────────────────────────────────────────────
/**
 * PNG에 pHYs(해상도) 조각을 넣어 "이 그림은 2배로 찍은 것"이라고 알린다.
 * 워드·아웃룩은 이 값을 보고 절반 크기로 넣으므로, 붙여 넣자마자 늘어나 뭉개지는 일이 없다.
 */
function setPngDpi(buf, dpi) {
  const perMetre = Math.round(dpi * 39.3700787);
  const data = Buffer.alloc(9);
  data.writeUInt32BE(perMetre, 0);
  data.writeUInt32BE(perMetre, 4);
  data.writeUInt8(1, 8); // 단위 = 미터
  const type = Buffer.from("pHYs", "latin1");
  const chunk = Buffer.concat([
    Buffer.alloc(4), type, data, Buffer.alloc(4),
  ]);
  chunk.writeUInt32BE(data.length, 0);
  chunk.writeUInt32BE(crc32(Buffer.concat([type, data])) >>> 0, 4 + 4 + data.length);

  // IHDR(고정 25바이트) 바로 뒤에 넣는다. 이미 pHYs가 있으면 그 자리를 갈아끼운다.
  const headEnd = 8 + 25;
  let rest = buf.subarray(headEnd);
  if (rest.subarray(4, 8).toString("latin1") === "pHYs") {
    const len = rest.readUInt32BE(0);
    rest = rest.subarray(12 + len);
  }
  return Buffer.concat([buf.subarray(0, headEnd), chunk, rest]);
}

// ── CDP ───────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const userDataDir = mkdtempSync(join(tmpdir(), "fc-export-"));
const DEBUG_PORT = 9500 + (process.pid % 200);
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${userDataDir}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });

async function targetWs() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then((r) => r.json());
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(300);
  }
  throw new Error("크롬이 뜨지 않았습니다.");
}

const ws = new WebSocket(await targetWs());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++msgId;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
};
/**
 * 배치는 항상 WIDTH(css px)로 하고, 화소만 ZOOM×SCALE배로 찍는다.
 * ZOOM은 "그림을 통째로 키우는 배율", SCALE은 "선명하게 찍는 배율"이라 역할이 다르다.
 */
const setViewport = (width, height) =>
  send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: ZOOM * SCALE, mobile: false });

// ── 실행 ──────────────────────────────────────────────────────────────────────
await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.setCookie", {
  name: "fc_auth",
  value: createHash("sha256").update(readPassword()).digest("hex"),
  domain: new URL(URL_).hostname,
  path: "/",
  secure: URL_.startsWith("https"),
});
await setViewport(WIDTH, 1200);
await send("Page.navigate", { url: URL_ });

// 표·그래프는 Supabase에서 받아온 뒤 그려지므로, 첫 시트의 표가 채워질 때까지 기다린다.
for (let i = 0; i < 60; i++) {
  const ready = await evaluate(`!!document.querySelector('#sumTotalCumTable table')`).catch(() => false);
  if (ready) break;
  await sleep(500);
}
await sleep(1500);

await evaluate(`(() => {
  const s = document.createElement('style');
  s.id = 'fc-export-css';
  s.textContent = ${JSON.stringify(EXPORT_CSS)};
  document.head.appendChild(s);
})()`);

const month = await evaluate(`(() => {
  const sel = document.getElementById('monthSelect');
  const want = ${JSON.stringify(WANT_MONTH)};
  if (want && [...sel.options].some(o => o.value === want)) {
    sel.value = want;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return sel.value;
})()`);
await sleep(1200);

const outDir = join(OUT_ROOT, month);
mkdirSync(outDir, { recursive: true });
console.log(`보고 월 ${month} · 배치 ${WIDTH}px × 확대 ${ZOOM}배 = 붙이면 ${Math.round(WIDTH * ZOOM)}px 폭 (화소 ${SCALE}배) → ${outDir}`);

const pasteBlocks = [];

for (const sheet of SHEETS) {
  await evaluate(`document.querySelector('.tab[data-tab=${JSON.stringify(sheet.tab)}]').click()`);
  // 탭을 열 때 그려지는 그래프가 있어, 그리기가 끝날 때까지 한 박자 기다린다.
  await sleep(2200);

  const size = await evaluate(`(() => {
    const c = document.getElementById('tab-${sheet.tab}');
    return { w: Math.ceil(c.scrollWidth), h: Math.ceil(c.getBoundingClientRect().height) };
  })()`);
  // 시트 높이에 맞춰 창을 늘려 통째로 담는다 (스크롤로 잘리지 않게).
  await setViewport(Math.max(WIDTH, size.w), size.h);
  await sleep(700);

  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const png = setPngDpi(Buffer.from(shot.data, "base64"), 96 * SCALE);
  const dest = join(outDir, `${sheet.name}.png`);
  writeFileSync(dest, png);
  // 실제 화소 = 배치 폭 × 확대배율 × 화소배율. 붙였을 때 보이는 크기는 여기서 화소배율만 뺀 값이다.
  const px = {
    w: Math.round(Math.max(WIDTH, size.w) * ZOOM * SCALE),
    h: Math.round(size.h * ZOOM * SCALE),
  };
  const shown = { w: Math.round(px.w / SCALE), h: Math.round(px.h / SCALE) };
  console.log(`  ${sheet.name}.png  ${px.w}×${px.h}px (붙이면 ${shown.w}×${shown.h})  ${(png.length / 1024).toFixed(0)}KB`);
  pasteBlocks.push(
    `<p style="margin:0 0 18px"><img src="data:image/png;base64,${png.toString("base64")}"` +
    ` width="${shown.w}" height="${shown.h}" alt="${sheet.name}"></p>`
  );

  await setViewport(WIDTH, 1200);
  await sleep(300);
}

/**
 * 한 번에 붙여 넣는 용도의 페이지.
 *
 * 파일을 그대로 끌어다 넣으면 아웃룩이 편지지 폭(624px)에 맞춰 줄여버려 글씨가 작아진다.
 * 여기서는 img 태그에 붙일 크기(${WIDTH}px)를 직접 적어 두었으므로, 이 페이지를 열어
 * 전체 선택(Ctrl+A) → 복사(Ctrl+C) → 메일에 붙여 넣으면 네 장이 제 크기로 들어간다.
 */
const pasteHtml =
  `<!doctype html><html lang="ko"><head><meta charset="utf-8">` +
  `<title>${month} 보고 이미지 — 붙여넣기용</title></head>` +
  `<body style="font-family:'Malgun Gothic',sans-serif;margin:24px">` +
  `<p style="font-size:13px;color:#64748b;margin:0 0 16px" data-skip="1">` +
  `아래를 전체 선택(Ctrl+A) → 복사(Ctrl+C) 해서 메일에 붙여 넣으세요. 네 장이 ${WIDTH}px 크기로 들어갑니다.</p>` +
  pasteBlocks.join("\n") +
  `</body></html>`;
const pastePath = join(outDir, "붙여넣기용.html");
writeFileSync(pastePath, pasteHtml, "utf8");
console.log(`  붙여넣기용.html  (${(pasteHtml.length / 1024 / 1024).toFixed(1)}MB) — 열어서 Ctrl+A → Ctrl+C → 메일에 붙여넣기`);

console.log(`\n완료 — PNG를 하나씩 붙이거나, '붙여넣기용.html'로 네 장을 한 번에 붙여 넣으면 됩니다.`);
ws.close();
chrome.kill();
process.exit(0);
