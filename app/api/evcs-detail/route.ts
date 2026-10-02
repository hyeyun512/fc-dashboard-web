import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * EVCS 사업부 상세를 엑셀 한 장으로 내려준다.
 *
 * 행은 보고용 → 대조직 → 구분 → 대계정으로 내려가고, 구분·보고용·본사/법인·총합계마다 합계 줄이 선다.
 * 같은 이름이 줄마다 되풀이되지 않도록 묶음 첫 줄에만 적는다.
 *
 * 열은 1월부터 보고월까지 월 블록 + 끝에 연간(26BP 예산 / 누계 실적) 블록이다.
 * 한 블록은 [예산 국내·해외·계][실적 국내·해외·계][차이][집행률]로, 예산과 실적이 상위에 서고
 * 국내·해외가 그 아래 붙는다. 국내·해외 열은 엑셀 그룹으로 묶어 접으면 '계'만 남는다.
 *
 * 숫자는 '국내·해외 실측치'만 값으로 넣고 나머지는 전부 수식이다 — 계·차이·집행률·소계·합계.
 * 받는 쪽에서 한 칸을 고치면 위로 다 따라 바뀐다.
 *
 * 금액은 EVCS로 배부된 몫만 쓴다(evcs_domestic_krw / evcs_overseas_krw). 예산·실적 모두 HUMAX와
 * H.EV가 이미 합산된 값이라 둘을 가르지 않는다.
 */
export const dynamic = "force-dynamic";

const BUDGET_TABLE = "26년 예산(BP)";
const COLS = "month,hq_corp,report_use_re,large_org,category,main_account_re,evcs_domestic_krw,evcs_overseas_krw";
/** 구분 표기 차례 — 보고서가 늘 이 순서로 읽는다 (lib/aggregate.ts와 같은 차례). */
const CATEGORY_ORDER = ["인건비", "여비교통비", "지급수수료", "광고선전비", "감가상각비", "기타"];

type Row = {
  month: string;
  hq_corp: string | null;
  report_use_re: string | null;
  large_org: string | null;
  category: string | null;
  main_account_re: string | null;
  evcs_domestic_krw: number | null;
  evcs_overseas_krw: number | null;
};

const n = (v: number | null | undefined) => (v == null ? 0 : v);
const monthNum = (m: string) => parseInt(m.replace(/\D/g, ""), 10) || 0;
const acctNo = (a: string) => {
  const m = /^\s*(\d+)/.exec(a);
  return m ? parseInt(m[1], 10) : 999;
};
const catRank = (c: string) => {
  const i = CATEGORY_ORDER.indexOf(c);
  return i < 0 ? CATEGORY_ORDER.length : i;
};

async function fetchAll(table: string): Promise<Row[]> {
  const supabase = getSupabaseAdmin();
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(COLS).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    out.push(...(data as unknown as Row[]));
    if (data.length < 1000) break;
  }
  return out;
}

type Cell = { dom: number; ovs: number };
const zero = (): Cell => ({ dom: 0, ovs: 0 });

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data: tableName, error: rpcError } = await supabase.rpc("fc_latest_actual_table");
  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 });

  const [actual, budget] = await Promise.all([fetchAll(String(tableName)), fetchAll(BUDGET_TABLE)]);
  const hasEvcs = (r: Row) => n(r.evcs_domestic_krw) !== 0 || n(r.evcs_overseas_krw) !== 0;
  const act = actual.filter(hasEvcs);
  const bud = budget.filter(hasEvcs);

  const lastMonth = Math.max(0, ...act.map((r) => monthNum(r.month)));
  const months = Array.from({ length: lastMonth }, (_, i) => `${i + 1}월`);

  // ── 모으기 ──────────────────────────────────────────────────────────────────
  const SEP = "\u0001";
  const keyOf = (r: Row) =>
    [r.hq_corp ?? "", r.report_use_re ?? "", r.large_org ?? "", r.category ?? "", r.main_account_re ?? ""].join(SEP);
  const actMap = new Map<string, Map<string, Cell>>();
  const budMap = new Map<string, Map<string, Cell>>();
  const budYear = new Map<string, Cell>();
  const push = (m: Map<string, Map<string, Cell>>, r: Row) => {
    const k = keyOf(r);
    if (!m.has(k)) m.set(k, new Map());
    const byMonth = m.get(k)!;
    const c = byMonth.get(r.month) ?? zero();
    c.dom += n(r.evcs_domestic_krw);
    c.ovs += n(r.evcs_overseas_krw);
    byMonth.set(r.month, c);
  };
  for (const r of act) push(actMap, r);
  for (const r of bud) {
    push(budMap, r);
    const y = budYear.get(keyOf(r)) ?? zero();
    y.dom += n(r.evcs_domestic_krw);
    y.ovs += n(r.evcs_overseas_krw);
    budYear.set(keyOf(r), y);
  }

  const keys = [...new Set([...actMap.keys(), ...budMap.keys()])];
  const parts = (k: string) => k.split(SEP);
  const isHq = (k: string) => parts(k)[0] === "본사";
  keys.sort((a, b) => {
    const [ha, ua, oa, ca, ma] = parts(a);
    const [hb, ub, ob, cb, mb] = parts(b);
    return (
      (isHq(a) ? 0 : 1) - (isHq(b) ? 0 : 1) ||
      ua.localeCompare(ub, "ko") ||
      oa.localeCompare(ob, "ko") ||
      catRank(ca) - catRank(cb) ||
      ca.localeCompare(cb, "ko") ||
      acctNo(ma) - acctNo(mb) ||
      ma.localeCompare(mb, "ko")
    );
  });

  // ── 엑셀 틀 ─────────────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator = "고정비 실적 대시보드";
  const ws = wb.addWorksheet(`EVCS ${lastMonth}월 누계`, {
    views: [{ state: "frozen", xSplit: 4, ySplit: 3 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const KEY_COLS = 4;                 // 보고용 · 대조직 · 구분 · 대계정
  const BLOCK = 8;                    // 예산(국내·해외·계) 실적(국내·해외·계) 차이 집행률
  const blocks = [...months.map((m) => ({ title: m, bud: "예산", act: "실적" })),
                  { title: "연간", bud: "26BP 예산", act: `${lastMonth}월 누계 실적` }];
  const firstCol = KEY_COLS + 1;
  const lastCol = KEY_COLS + blocks.length * BLOCK;
  const L = (c: number) => ws.getColumn(c).letter;

  // 색 — 대시보드가 이미 쓰는 값만 쓴다.
  const NAVY = "FF1E3A8A", INK = "FF1A202C", MUTE = "FF94A3B8";
  const HEAD_DARK = "FF1E3A8A", HEAD_MID = "FFDBEAFE", HEAD_SOFT = "FFEFF6FF";
  const GRP_CAT = "FFF8FAFC", GRP_USE = "FFEFF6FF", GRP_HQ = "FFDBEAFE";
  const thin = { style: "thin" as const, color: { argb: "FFD7DBE2" } };
  const hair = { style: "hair" as const, color: { argb: "FFE8EBEF" } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };

  // ── 머리글 3줄 ──────────────────────────────────────────────────────────────
  const KEY_NAMES = ["보고용", "대조직", "구분", "대계정"];
  KEY_NAMES.forEach((v, i) => {
    ws.getCell(1, i + 1).value = v;
    ws.mergeCells(1, i + 1, 3, i + 1);
  });
  blocks.forEach((b, bi) => {
    const c0 = firstCol + bi * BLOCK;
    ws.getCell(1, c0).value = b.title;
    ws.mergeCells(1, c0, 1, c0 + BLOCK - 1);
    ws.getCell(2, c0).value = b.bud;
    ws.mergeCells(2, c0, 2, c0 + 2);
    ws.getCell(2, c0 + 3).value = b.act;
    ws.mergeCells(2, c0 + 3, 2, c0 + 5);
    ws.getCell(2, c0 + 6).value = "차이";
    ws.mergeCells(2, c0 + 6, 3, c0 + 6);
    ws.getCell(2, c0 + 7).value = "집행률";
    ws.mergeCells(2, c0 + 7, 3, c0 + 7);
    ["국내", "해외", "계", "국내", "해외", "계"].forEach((v, i) => (ws.getCell(3, c0 + i).value = v));
  });
  for (let r = 1; r <= 3; r++) {
    for (let c = 1; c <= lastCol; c++) {
      const cell = ws.getCell(r, c);
      const isKey = c <= KEY_COLS;
      const dark = r === 1 || isKey;
      cell.font = { bold: true, size: 10, color: { argb: dark ? "FFFFFFFF" : NAVY } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark ? HEAD_DARK : r === 2 ? HEAD_MID : HEAD_SOFT } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = box;
    }
  }
  ws.getRow(1).height = 20;
  ws.getRow(2).height = 18;
  ws.getRow(3).height = 17;

  // ── 값 채우기 ───────────────────────────────────────────────────────────────
  /** 한 줄의 숫자 칸을 채운다. 국내·해외만 값이고 계·차이·집행률은 수식이다. */
  function writeNumbers(row: number, get: (bi: number) => { bud: Cell; act: Cell }) {
    blocks.forEach((_, bi) => {
      const c0 = firstCol + bi * BLOCK;
      const v = get(bi);
      ws.getCell(row, c0).value = Math.round(v.bud.dom);
      ws.getCell(row, c0 + 1).value = Math.round(v.bud.ovs);
      ws.getCell(row, c0 + 2).value = { formula: `SUM(${L(c0)}${row}:${L(c0 + 1)}${row})` };
      ws.getCell(row, c0 + 3).value = Math.round(v.act.dom);
      ws.getCell(row, c0 + 4).value = Math.round(v.act.ovs);
      ws.getCell(row, c0 + 5).value = { formula: `SUM(${L(c0 + 3)}${row}:${L(c0 + 4)}${row})` };
      ws.getCell(row, c0 + 6).value = { formula: `${L(c0 + 5)}${row}-${L(c0 + 2)}${row}` };
      ws.getCell(row, c0 + 7).value = {
        formula: `IF(${L(c0 + 2)}${row}=0,"",${L(c0 + 5)}${row}/${L(c0 + 2)}${row})`,
      };
    });
  }
  /** 합계 줄 — 국내·해외는 아래 줄들을 더하고, 나머지는 같은 수식을 다시 쓴다. */
  function writeSum(row: number, srcRows: number[]) {
    blocks.forEach((_, bi) => {
      const c0 = firstCol + bi * BLOCK;
      for (const off of [0, 1, 3, 4]) {
        const col = L(c0 + off);
        ws.getCell(row, c0 + off).value = { formula: `SUM(${srcRows.map((r) => `${col}${r}`).join(",")})` };
      }
      ws.getCell(row, c0 + 2).value = { formula: `SUM(${L(c0)}${row}:${L(c0 + 1)}${row})` };
      ws.getCell(row, c0 + 5).value = { formula: `SUM(${L(c0 + 3)}${row}:${L(c0 + 4)}${row})` };
      ws.getCell(row, c0 + 6).value = { formula: `${L(c0 + 5)}${row}-${L(c0 + 2)}${row}` };
      ws.getCell(row, c0 + 7).value = {
        formula: `IF(${L(c0 + 2)}${row}=0,"",${L(c0 + 5)}${row}/${L(c0 + 2)}${row})`,
      };
    });
  }
  const dataOf = (k: string) => (bi: number) => {
    if (bi < months.length) {
      const m = months[bi];
      return { bud: budMap.get(k)?.get(m) ?? zero(), act: actMap.get(k)?.get(m) ?? zero() };
    }
    const cum = zero();
    for (const m of months) {
      const a = actMap.get(k)?.get(m);
      if (a) { cum.dom += a.dom; cum.ovs += a.ovs; }
    }
    return { bud: budYear.get(k) ?? zero(), act: cum };
  };

  let row = 4;
  const hqUseRows: number[] = [];      // 본사 보고용 합계 줄
  const corpUseRows: number[] = [];    // 법인 보고용 합계 줄

  // 보고용 단위로 끊어 내려간다.
  const useOrder: string[] = [];
  const byUse = new Map<string, string[]>();
  for (const k of keys) {
    const u = parts(k)[0] + SEP + parts(k)[1];
    if (!byUse.has(u)) { byUse.set(u, []); useOrder.push(u); }
    byUse.get(u)!.push(k);
  }

  for (const u of useOrder) {
    const ks = byUse.get(u)!;
    const [hq, useName] = u.split(SEP);
    const catRows: number[] = [];
    let prevOrg = "";
    const blockFirstRow = row;   // 보고용 이름은 이 묶음의 첫 줄에만 적는다
    // 구분 단위로 다시 끊는다 (대조직이 바뀌어도 구분 묶음은 대조직 안에서 센다).
    let i = 0;
    while (i < ks.length) {
      const [, , org, cat] = parts(ks[i]);
      const group: string[] = [];
      while (i < ks.length) {
        const [, , o2, c2] = parts(ks[i]);
        if (o2 !== org || c2 !== cat) break;
        group.push(ks[i]);
        i++;
      }
      const detailRows: number[] = [];
      group.forEach((k, j) => {
        const [, , , , acct] = parts(k);
        if (j === 0 && org !== prevOrg) ws.getCell(row, 2).value = org;
        if (j === 0) ws.getCell(row, 3).value = cat;
        ws.getCell(row, 4).value = acct;
        writeNumbers(row, dataOf(k));
        detailRows.push(row);
        row++;
        prevOrg = org;
      });
      // 구분 소계
      ws.getCell(row, 4).value = `${cat} 소계`;
      writeSum(row, detailRows);
      ws.getRow(row).eachCell({ includeEmpty: true }, (c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRP_CAT } };
        c.font = { bold: true, size: 10, color: { argb: INK } };
      });
      catRows.push(row);
      row++;
    }
    ws.getCell(blockFirstRow, 1).value = useName;
    // 보고용 합계
    ws.getCell(row, 1).value = `${useName} 합계`;
    ws.mergeCells(row, 1, row, 4);
    writeSum(row, catRows);
    ws.getRow(row).eachCell({ includeEmpty: true }, (c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRP_USE } };
      c.font = { bold: true, size: 10.5, color: { argb: NAVY } };
    });
    (hq === "본사" ? hqUseRows : corpUseRows).push(row);
    row++;
  }

  // 본사 합계 / 법인 합계 / 총 합계
  const bigRows: number[] = [];
  for (const [label, src] of [["본사 합계", hqUseRows], ["법인 합계", corpUseRows]] as const) {
    if (!src.length) continue;
    ws.getCell(row, 1).value = label;
    ws.mergeCells(row, 1, row, 4);
    writeSum(row, src);
    ws.getRow(row).eachCell({ includeEmpty: true }, (c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRP_HQ } };
      c.font = { bold: true, size: 11, color: { argb: NAVY } };
    });
    bigRows.push(row);
    row++;
  }
  ws.getCell(row, 1).value = "총 합계";
  ws.mergeCells(row, 1, row, 4);
  writeSum(row, bigRows);
  ws.getRow(row).eachCell({ includeEmpty: true }, (c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_DARK } };
    c.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  });
  const lastRow = row;

  // ── 모양 ────────────────────────────────────────────────────────────────────
  for (let r = 4; r <= lastRow; r++) {
    for (let c = 1; c <= lastCol; c++) {
      const cell = ws.getCell(r, c);
      cell.border = c <= KEY_COLS ? box : { ...box, left: hair, right: hair };
      if (c <= KEY_COLS) {
        cell.alignment = { horizontal: c === 4 ? "left" : "left", vertical: "middle", indent: c === 4 ? 1 : 0 };
      } else {
        const off = (c - firstCol) % BLOCK;
        cell.numFmt = off === 7 ? "0%" : "#,##0";
        cell.alignment = { horizontal: "right", vertical: "middle" };
        if (!cell.font) cell.font = { size: 10 };
      }
    }
    // 블록 사이에 굵은 세로선을 둬 월 경계를 눈으로 잡게 한다.
    blocks.forEach((_, bi) => {
      const c0 = firstCol + bi * BLOCK;
      ws.getCell(r, c0).border = { ...ws.getCell(r, c0).border, left: thin };
      ws.getCell(r, c0 + 2).border = { ...ws.getCell(r, c0 + 2).border, left: hair, right: thin };
      ws.getCell(r, c0 + 5).border = { ...ws.getCell(r, c0 + 5).border, left: hair, right: thin };
    });
  }
  // 작은 글씨로 두는 상세 줄 (합계 줄은 위에서 이미 굵게 칠했다).
  for (let r = 4; r <= lastRow; r++) {
    const f = ws.getCell(r, 1).font;
    if (!f?.bold) {
      for (let c = 1; c <= KEY_COLS; c++) ws.getCell(r, c).font = { size: 10, color: { argb: INK } };
    }
  }

  // 열 그룹을 쓰면 시트 머리의 outlineLevelCol도 함께 올라가야 한다 — 0으로 남으면 엑셀이
  // 파일을 고장난 것으로 보고 복구 창을 띄운다.
  ws.properties.outlineLevelCol = 1;
  ws.getColumn(1).width = 15;
  ws.getColumn(2).width = 13;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 20;
  for (let c = firstCol; c <= lastCol; c++) {
    const off = (c - firstCol) % BLOCK;
    const col = ws.getColumn(c);
    // '계'와 '차이'는 자릿수가 가장 크다 — 좁으면 ####로 가려지므로 한 단계 넓게 둔다.
    col.width = off === 7 ? 8 : off === 2 || off === 5 || off === 6 ? 14.5 : 12.5;
    // 국내·해외는 접을 수 있게 묶는다 — 접으면 '계'만 남아 한눈에 들어온다.
    if (off === 0 || off === 1 || off === 3 || off === 4) col.outlineLevel = 1;
  }

  const buf = await wb.xlsx.writeBuffer();
  const name = encodeURIComponent(`EVCS ${lastMonth}월 누계 실적 상세.xlsx`);
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${name}`,
      "Cache-Control": "no-store",
    },
  });
}
