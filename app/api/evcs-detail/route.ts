import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { STAFF_USE, staffGroupOf, staffRank } from "@/lib/staffGroups";

/**
 * EVCS 사업부 상세를 엑셀 한 장으로 내려준다.
 *
 * 행은 보고용 → 구분 → 대계정으로 내려가고, 구분·보고용·본사/법인·총합계마다 합계 줄이 선다.
 * 같은 이름이 줄마다 되풀이되지 않도록 묶음 첫 줄에만 적는다.
 *
 * 대조직은 '5. Staff부문'에서만 쓴다 — 보고가 Staff만 하위 조직까지 갈라 보기 때문이다.
 * 나머지 보고용은 대조직을 비워 두어 보고용 하나로 모인다(사업 그룹 + 품질관리팀 → 1. 사업 그룹).
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
  /** 대조직은 Staff부문만 세운다. 나머지는 빈칸이라 같은 보고용·구분·대계정끼리 저절로 합쳐진다. */
  const orgOf = (r: Row) => (r.report_use_re === STAFF_USE ? staffGroupOf(r.large_org ?? "") : "");
  const keyOf = (r: Row) =>
    [r.hq_corp ?? "", r.report_use_re ?? "", orgOf(r), r.category ?? "", r.main_account_re ?? ""].join(SEP);
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
      staffRank(oa) - staffRank(ob) ||
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
  // 제한된 보기에서는 엑셀이 수식을 계산하지 않고 파일에 담긴 값만 보여 준다 — 값을 같이
  // 저장하지 않으면 '편집 사용'을 누르기 전까지 표가 텅 비어 보인다. 편집을 켜면 아래 설정으로
  // 전체를 다시 계산하므로, 담아 둔 값이 낡을 일도 없다.
  wb.calcProperties.fullCalcOnLoad = true;
  // 시트 차례 — 요약이 먼저, 상세(팀별)가 뒤. 요약 탭은 빨갛게 칠해 눈에 먼저 띄게 한다.
  const sh = wb.addWorksheet("요약", {
    properties: { tabColor: { argb: "FFD93025" } },
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const ws = wb.addWorksheet("팀별", {
    views: [{ state: "frozen", xSplit: 4, ySplit: 5 }],
    pageSetup: { orientation: "landscape" },
    properties: { outlineProperties: { summaryBelow: false, summaryRight: true } },
  });

  const KEY_COLS = 4;   // 보고용 · 대조직 · 구분 · 대계정
  const BLOCK = 8;      // 예산(국내·해외·계) 실적(국내·해외·계) 차이 집행률
  /**
   * 블록 차례 — 월(1~보고월) → 누계(같은 기간끼리 예산 대비 실적) → 연간(26BP 대비 누계 실적).
   * 누계가 연간 앞에 서는 이유는, 같은 기간끼리 견주는 것이 먼저이고 연간은 진도율이기 때문이다.
   */
  type Block = {
    title: string; bud: string; act: string;
    kind: "month" | "cum" | "year";
    m?: number;      // 월 블록이 가리키는 달
    thru?: number;   // 누계 블록이 몇 월까지인지
  };
  const monthBlock = (m: number): Block => ({ title: `${m}월`, bud: "예산", act: "실적", kind: "month", m });
  const cumBlock = (m: number): Block => ({ title: `${m}월 누계`, bud: "누계 예산", act: "누계 실적", kind: "cum", thru: m });
  const yearBlock: Block = { title: "연간", bud: "26BP 예산", act: `${lastMonth}월 누계 실적`, kind: "year" };
  const blocks: Block[] = [...months.map((_, i) => monthBlock(i + 1)), cumBlock(lastMonth), yearBlock];
  const firstCol = KEY_COLS + 1;
  const lastCol = KEY_COLS + blocks.length * BLOCK;
  const L = (c: number) => ws.getColumn(c).letter;

  const FONT = "나눔고딕";
  const f = (o: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: FONT, size: 10, ...o });
  const NAVY = "FF1E3A8A", INK = "FF1A202C";
  const HEAD_DARK = "FF1E3A8A", HEAD_MID = "FFDBEAFE", HEAD_SOFT = "FFEFF6FF";
  const GRP_CAT = "FFF8FAFC", GRP_USE = "FFEFF6FF", GRP_HQ = "FFDBEAFE";
  const thin = { style: "thin" as const, color: { argb: "FFD7DBE2" } };
  const hair = { style: "hair" as const, color: { argb: "FFEDF0F3" } };
  const edge = { style: "medium" as const, color: { argb: "FF9DB2CE" } };   // 월과 월 사이
  const fill = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });

  // 금액은 백만원 단위로 보인다 — 값은 원 그대로라 합계가 어긋나지 않는다(쉼표 두 개가 '백만으로 줄여 보이기').
  // 음수는 빨강, 0은 '-'로 둔다.
  // 백만원 단위 표기(값은 원 단위 그대로라 합계·수식과 대시보드 숫자가 어긋나지 않는다).
  // 0은 '-'. 조건부 서식([>=500000] …)으로 반올림 0까지 '-'로 묶으려 해봤지만, 엑셀이 마지막 구역에
  // 부호를 따로 붙여 작은 음수가 '--'로 나온다 — 그래서 조건 없이 세 구역만 쓴다.
  const NUM = '#,##0,,;[Red]-#,##0,,;"-"';
  const PCT = '0%;[Red]-0%;"-"';

  // ── 제목 + 머리글 3줄 ───────────────────────────────────────────────────────
  ws.getCell(1, 1).value = `EVCS 사업부 ${lastMonth}월 누계 실적 상세`;
  ws.mergeCells(1, 1, 1, KEY_COLS);
  ws.getCell(1, 1).font = f({ bold: true, size: 13, color: { argb: NAVY } });
  ws.getRow(1).height = 24;
  ws.getCell(2, 1).value = "(단위: 백만원)";
  ws.getCell(2, 1).font = f({ bold: true, color: { argb: INK } });
  ws.getCell(2, 1).alignment = { horizontal: "left", vertical: "bottom" };
  ws.getRow(2).height = 16;

  const HR = 3;   // 머리글 첫 줄 (1=제목, 2=단위)
  const KEY_NAMES = ["보고용", "대조직", "구분", "대계정"];
  KEY_NAMES.forEach((v, i) => {
    ws.getCell(HR, i + 1).value = v;
    ws.mergeCells(HR, i + 1, HR + 2, i + 1);
  });
  blocks.forEach((b, bi) => {
    const c0 = firstCol + bi * BLOCK;
    ws.getCell(HR, c0).value = b.title;
    ws.mergeCells(HR, c0, HR, c0 + BLOCK - 1);
    ws.getCell(HR + 1, c0).value = b.bud;
    ws.mergeCells(HR + 1, c0, HR + 1, c0 + 2);
    ws.getCell(HR + 1, c0 + 3).value = b.act;
    ws.mergeCells(HR + 1, c0 + 3, HR + 1, c0 + 5);
    ws.getCell(HR + 1, c0 + 6).value = "차이";
    ws.mergeCells(HR + 1, c0 + 6, HR + 2, c0 + 6);
    ws.getCell(HR + 1, c0 + 7).value = "집행률";
    ws.mergeCells(HR + 1, c0 + 7, HR + 2, c0 + 7);
    ["국내", "해외", "계", "국내", "해외", "계"].forEach((v, i) => (ws.getCell(HR + 2, c0 + i).value = v));
  });
  for (let r = HR; r <= HR + 2; r++) {
    for (let c = 1; c <= lastCol; c++) {
      const cell = ws.getCell(r, c);
      const dark = r === HR || c <= KEY_COLS;
      cell.font = f({ bold: true, color: { argb: dark ? "FFFFFFFF" : NAVY } });
      cell.fill = fill(dark ? HEAD_DARK : r === HR + 1 ? HEAD_MID : HEAD_SOFT);
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      const off = c <= KEY_COLS ? -1 : (c - firstCol) % BLOCK;
      cell.border = {
        top: thin,
        bottom: thin,
        left: off === 0 || c === 1 ? edge : thin,
        right: off === BLOCK - 1 || c === KEY_COLS ? edge : thin,
      };
    }
  }
  ws.getRow(HR).height = 20;
  ws.getRow(HR + 1).height = 18;
  ws.getRow(HR + 2).height = 17;

  // ── 값 ──────────────────────────────────────────────────────────────────────
  type Pair = { bud: Cell; act: Cell };
  const dataOf = (k: string) => (b: Block): Pair => {
    if (b.kind === "month") {
      const m = `${b.m}월`;
      return { bud: budMap.get(k)?.get(m) ?? zero(), act: actMap.get(k)?.get(m) ?? zero() };
    }
    const thru = b.kind === "cum" ? b.thru! : lastMonth;
    const cumA = zero(), cumB = zero();
    for (let i = 1; i <= thru; i++) {
      const m = `${i}월`;
      const a = actMap.get(k)?.get(m);
      if (a) { cumA.dom += a.dom; cumA.ovs += a.ovs; }
      const bb = budMap.get(k)?.get(m);
      if (bb) { cumB.dom += bb.dom; cumB.ovs += bb.ovs; }
    }
    return { bud: b.kind === "cum" ? cumB : budYear.get(k) ?? zero(), act: cumA };
  };

  // 요약 장을 다 그린 뒤, 팀별 장의 '총 합계'가 정해지면 맨 아래에 검토 줄을 붙인다.
  let audit: {
    blocks: Block[]; first: number; SB: number; key: number; last: number; totalRow: number; vals: { b: number; a: number }[];
  } | null = null;

  // ── 요약 시트 ───────────────────────────────────────────────────────────────
  // 본사·법인을 구분(인건비…기타)으로만 접은 한 장. 팀별 시트가 '어디서 썼나'라면
  // 이 장은 '무엇에 썼나'다 — 참고 양식의 요약 시트와 같은 모양으로 맨 앞에 둔다.
  {
    const SB = 5;   // 예산 · 실적 · 차이 · 집행률 · 구성비
    const sKey = 2; // 구분 · 항목
    const sFirst = sKey + 1;
    const sHR = 3;  // 머리글 첫 줄 (1=제목, 2=단위)
    // 요약은 달마다 그 달까지의 누계를 끼고 간다 — 1월은 누계가 곧 그 달이라 뺀다.
    const sBlocks: Block[] = [];
    for (let m = 1; m <= lastMonth; m++) {
      sBlocks.push(monthBlock(m));
      if (m >= 2) sBlocks.push(cumBlock(m));
    }
    sBlocks.push(yearBlock);
    const sLast = sKey + sBlocks.length * SB;
    const S = (c: number) => sh.getColumn(c).letter;

    // 제목은 병합하지 않고 흘려 둔다 — 병합하면 두 칸 폭에 갇혀 글자가 잘린다.
    sh.getCell(1, 1).value = `▣ EVCS 사업부 ${lastMonth}월 누계 실적`;
    sh.getCell(1, 1).font = f({ bold: true, size: 13, color: { argb: NAVY } });
    sh.getRow(1).height = 24;
    sh.getCell(2, 1).value = "(단위: 백만원)";
    sh.getCell(2, 1).font = f({ bold: true, color: { argb: INK } });
    sh.getCell(2, 1).alignment = { horizontal: "left", vertical: "bottom" };
    sh.getRow(2).height = 16;

    ["구분", "항목"].forEach((v, i) => {
      sh.getCell(sHR, i + 1).value = v;
      sh.mergeCells(sHR, i + 1, sHR + 1, i + 1);
    });
    sBlocks.forEach((b, bi) => {
      const c0 = sFirst + bi * SB;
      sh.getCell(sHR, c0).value = b.title;
      sh.mergeCells(sHR, c0, sHR, c0 + SB - 1);
      // '26BP 예산'처럼 긴 머리글은 좁아진 칸에서 아무 데서나 접힌다('26BP 예'/'산').
      // 마지막 띄어쓰기에서 끊어 두 줄로 세운다.
      const head = (t: string) => t.replace(/ ([^ ]*)$/, "\n$1");
      [head(b.bud), head(b.act), "차이", "집행률", "구성비"].forEach((v, i) => (sh.getCell(sHR + 1, c0 + i).value = v));
    });
    for (let r = sHR; r <= sHR + 1; r++) {
      for (let c = 1; c <= sLast; c++) {
        const cell = sh.getCell(r, c);
        const dark = r === sHR || c <= sKey;
        cell.font = f({ bold: true, color: { argb: dark ? "FFFFFFFF" : NAVY } });
        cell.fill = fill(dark ? HEAD_DARK : HEAD_MID);
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        const off = c <= sKey ? -1 : (c - sFirst) % SB;
        cell.border = { top: thin, bottom: thin, left: off === 0 || c === 1 ? edge : thin, right: off === SB - 1 || c === sKey ? edge : thin };
      }
    }
    sh.getRow(sHR).height = 20;
    // '26BP 예산', '8월 누계 실적' 같은 머리글은 좁아진 칸에서 두 줄로 접힌다 — 줄 높이를 그만큼 준다.
    sh.getRow(sHR + 1).height = 30;

    // 구분별로 모은다 (본사/법인 × 구분).
    const sumBy = new Map<string, (b: Block) => Pair>();
    const catsOf = (hq: string) => {
      const set = new Set<string>();
      for (const k of keys) if ((parts(k)[0] === "본사") === (hq === "본사")) set.add(parts(k)[3]);
      return [...set].sort((a, b) => catRank(a) - catRank(b) || a.localeCompare(b, "ko"));
    };
    const pick = (hq: string, cat: string) =>
      keys.filter((k) => (parts(k)[0] === "본사") === (hq === "본사") && parts(k)[3] === cat);
    for (const hq of ["본사", "법인"]) {
      for (const cat of catsOf(hq)) {
        const ks = pick(hq, cat);
        sumBy.set(hq + SEP + cat, (b: Block) => {
          const bud = zero(), act = zero();
          for (const k of ks) {
            const v = dataOf(k)(b);
            bud.dom += v.bud.dom; bud.ovs += v.bud.ovs;
            act.dom += v.act.dom; act.ovs += v.act.ovs;
          }
          return { bud, act };
        });
      }
    }

    // 팀별과 같은 이유로, 요약도 수식마다 결과를 함께 담는다(제한된 보기 대비).
    type Duo = { b: number; a: number };
    const sVals = new Map<number, Duo[]>();
    const sDerive = (r: number, c0: number, d: Duo) => {
      sh.getCell(r, c0 + 2).value = { formula: `${S(c0 + 1)}${r}-${S(c0)}${r}`, result: d.a - d.b };
      sh.getCell(r, c0 + 3).value = {
        formula: `IF(${S(c0)}${r}=0,"",${S(c0 + 1)}${r}/${S(c0)}${r})`,
        result: d.b === 0 ? "" : d.a / d.b,
      };
    };

    let sr = sHR + 2;
    const subRows: number[] = [];
    for (const hq of ["본사", "법인"]) {
      const cats = catsOf(hq);
      const rowsHere: number[] = [];
      cats.forEach((cat, i) => {
        if (i === 0) sh.getCell(sr, 1).value = hq;
        sh.getCell(sr, 2).value = cat;
        const get = sumBy.get(hq + SEP + cat)!;
        const rv: Duo[] = [];
        sBlocks.forEach((b, bi) => {
          const c0 = sFirst + bi * SB;
          const v = get(b);
          const d: Duo = { b: Math.round(v.bud.dom + v.bud.ovs), a: Math.round(v.act.dom + v.act.ovs) };
          sh.getCell(sr, c0).value = d.b;
          sh.getCell(sr, c0 + 1).value = d.a;
          sDerive(sr, c0, d);
          rv.push(d);   // 구성비는 Total 줄이 정해진 뒤에 채운다
        });
        sVals.set(sr, rv);
        rowsHere.push(sr);
        sr++;
      });
      sh.getCell(sr, 1).value = hq;
      sh.getCell(sr, 2).value = "S-T";
      const stVals: Duo[] = [];
      sBlocks.forEach((_, bi) => {
        const c0 = sFirst + bi * SB;
        const d: Duo = { b: 0, a: 0 };
        for (const r of rowsHere) { d.b += sVals.get(r)![bi].b; d.a += sVals.get(r)![bi].a; }
        ([[0, "b"], [1, "a"]] as const).forEach(([off, key]) => {
          sh.getCell(sr, c0 + off).value = {
            formula: `SUM(${rowsHere.map((r) => `${S(c0 + off)}${r}`).join(",")})`,
            result: d[key],
          };
        });
        sDerive(sr, c0, d);
        stVals.push(d);
      });
      sVals.set(sr, stVals);
      for (let c = 1; c <= sLast; c++) {
        sh.getCell(sr, c).fill = fill(GRP_USE);
        sh.getCell(sr, c).font = f({ bold: true, color: { argb: NAVY } });
      }
      subRows.push(sr);
      sr++;
    }
    const totalRow = sr;
    sh.getCell(totalRow, 1).value = "Total";
    sh.mergeCells(totalRow, 1, totalRow, 2);
    const totVals: Duo[] = [];
    sBlocks.forEach((_, bi) => {
      const c0 = sFirst + bi * SB;
      const d: Duo = { b: 0, a: 0 };
      for (const r of subRows) { d.b += sVals.get(r)![bi].b; d.a += sVals.get(r)![bi].a; }
      ([[0, "b"], [1, "a"]] as const).forEach(([off, key]) => {
        sh.getCell(totalRow, c0 + off).value = {
          formula: `SUM(${subRows.map((r) => `${S(c0 + off)}${r}`).join(",")})`,
          result: d[key],
        };
      });
      sDerive(totalRow, c0, d);
      sh.getCell(totalRow, c0 + 4).value = {
        formula: `IF(${S(c0 + 1)}${totalRow}=0,"",1)`,
        result: d.a === 0 ? "" : 1,
      };
      totVals.push(d);
    });
    sVals.set(totalRow, totVals);
    for (let c = 1; c <= sLast; c++) {
      sh.getCell(totalRow, c).fill = fill(HEAD_DARK);
      sh.getCell(totalRow, c).font = f({ bold: true, size: 11, color: { argb: "FFFFFFFF" } });
    }
    // 구성비 — 그 줄의 실적이 Total 실적에서 차지하는 몫.
    for (let r = sHR + 2; r < totalRow; r++) {
      sBlocks.forEach((_, bi) => {
        const c0 = sFirst + bi * SB;
        const tot = totVals[bi].a;
        sh.getCell(r, c0 + 4).value = {
          formula: `IF(${S(c0 + 1)}$${totalRow}=0,"",${S(c0 + 1)}${r}/${S(c0 + 1)}$${totalRow})`,
          result: tot === 0 ? "" : sVals.get(r)![bi].a / tot,
        };
      });
    }

    for (let r = sHR + 2; r <= totalRow; r++) {
      for (let c = 1; c <= sLast; c++) {
        const cell = sh.getCell(r, c);
        if (!cell.font) cell.font = f({ color: { argb: INK } });
        if (c <= sKey) {
          cell.alignment = { horizontal: "left", vertical: "middle" };
          cell.border = { top: hair, bottom: hair, left: c === 1 ? edge : thin, right: c === sKey ? edge : thin };
        } else {
          const off = (c - sFirst) % SB;
          cell.numFmt = off === 3 || off === 4 ? PCT : NUM;
          cell.alignment = { horizontal: "right", vertical: "middle" };
          cell.border = { top: hair, bottom: hair, left: off === 0 ? edge : hair, right: off === SB - 1 ? edge : hair };
        }
      }
    }
    sh.getColumn(1).width = 7.5;
    sh.getColumn(2).width = 9.2;
    for (let c = sFirst; c <= sLast; c++) sh.getColumn(c).width = 9;
    // 보고월·보고월 누계·연간만 남기고 앞의 달들은 접어 둔다 — 필요하면 +를 눌러 펼친다.
    const openFrom = sFirst + sBlocks.findIndex((b) => b.kind === "month" && b.m === lastMonth) * SB;
    for (let c = sFirst; c < openFrom; c++) {
      const col = sh.getColumn(c);
      col.outlineLevel = 1;
      col.hidden = true;
      Object.defineProperty(col, "collapsed", { value: false, configurable: true });
    }
    Object.defineProperty(sh.getColumn(openFrom), "collapsed", { value: true, configurable: true });
    sh.properties.outlineLevelCol = 1;
    sh.views = [{ state: "frozen", xSplit: 2, ySplit: sHR + 1 }];

    audit = { blocks: sBlocks, first: sFirst, SB, key: sKey, last: sLast, totalRow, vals: totVals };
  }

  /**
   * 적어 넣은 숫자를 줄마다 기억해 둔다 — 수식에 담을 결과를 여기서 그대로 꺼내 쓴다.
   * 엑셀이 더할 값은 '반올림해서 적은 값'이므로, 결과도 같은 값으로 더해야 어긋나지 않는다.
   */
  type Quad = { bd: number; bo: number; ad: number; ao: number };
  const rowVals = new Map<number, Quad[]>();

  /** 한 블록에서 값이 아닌 칸(계·차이·집행률)을 수식으로 채운다. */
  function derive(row: number, c0: number, v: Quad) {
    const bt = v.bd + v.bo, at = v.ad + v.ao;
    ws.getCell(row, c0 + 2).value = { formula: `SUM(${L(c0)}${row}:${L(c0 + 1)}${row})`, result: bt };
    ws.getCell(row, c0 + 5).value = { formula: `SUM(${L(c0 + 3)}${row}:${L(c0 + 4)}${row})`, result: at };
    ws.getCell(row, c0 + 6).value = { formula: `${L(c0 + 5)}${row}-${L(c0 + 2)}${row}`, result: at - bt };
    ws.getCell(row, c0 + 7).value = {
      formula: `IF(${L(c0 + 2)}${row}=0,"",${L(c0 + 5)}${row}/${L(c0 + 2)}${row})`,
      result: bt === 0 ? "" : at / bt,
    };
  }
  /** 상세 줄 — 국내·해외만 값이고 나머지는 수식. */
  function writeNumbers(row: number, get: (b: Block) => Pair) {
    const rv: Quad[] = [];
    blocks.forEach((b, bi) => {
      const c0 = firstCol + bi * BLOCK;
      const p = get(b);
      const v: Quad = {
        bd: Math.round(p.bud.dom), bo: Math.round(p.bud.ovs),
        ad: Math.round(p.act.dom), ao: Math.round(p.act.ovs),
      };
      ws.getCell(row, c0).value = v.bd;
      ws.getCell(row, c0 + 1).value = v.bo;
      ws.getCell(row, c0 + 3).value = v.ad;
      ws.getCell(row, c0 + 4).value = v.ao;
      derive(row, c0, v);
      rv.push(v);
    });
    rowVals.set(row, rv);
  }
  /** 합계 줄 — 국내·해외는 아래 줄들을 더하고 나머지는 같은 수식. */
  function writeSum(row: number, srcRows: number[]) {
    const rv: Quad[] = [];
    blocks.forEach((_, bi) => {
      const c0 = firstCol + bi * BLOCK;
      const v: Quad = { bd: 0, bo: 0, ad: 0, ao: 0 };
      for (const r of srcRows) {
        const q = rowVals.get(r)![bi];
        v.bd += q.bd; v.bo += q.bo; v.ad += q.ad; v.ao += q.ao;
      }
      ([[0, "bd"], [1, "bo"], [3, "ad"], [4, "ao"]] as const).forEach(([off, key]) => {
        const col = L(c0 + off);
        ws.getCell(row, c0 + off).value = {
          formula: `SUM(${srcRows.map((r) => `${col}${r}`).join(",")})`,
          result: v[key],
        };
      });
      derive(row, c0, v);
      rv.push(v);
    });
    rowVals.set(row, rv);
  }
  /**
   * 접힘 표시. exceljs는 collapsed를 outlineLevel에서 유도하기만 해서 묶인 줄마다 켜 버리는데,
   * 엑셀은 묶음 바로 아래 '요약 줄'의 collapsed로 +/- 단추를 그린다 — 그래서 줄마다 직접 못 박는다.
   * 이게 없으면 상세가 숨겨진 채로도 단추가 '−'로 보여 한 번 눌러야 아무 일도 안 일어난다.
   */
  const setCollapsed = (r: number, v: boolean) =>
    Object.defineProperty(ws.getRow(r), "collapsed", { value: v, configurable: true });

  /** 합계 줄의 글자·바탕. */
  function paint(row: number, bg: string, color: string, size: number) {
    for (let c = 1; c <= lastCol; c++) {
      ws.getCell(row, c).fill = fill(bg);
      ws.getCell(row, c).font = f({ bold: true, size, color: { argb: color } });
    }
  }

  let row = HR + 3;
  const useRowsOf: Record<string, number[]> = { 본사: [], 법인: [] };
  const bigRows: number[] = [];

  const useOrder: string[] = [];
  const byUse = new Map<string, string[]>();
  for (const k of keys) {
    const u = parts(k)[0] + SEP + parts(k)[1];
    if (!byUse.has(u)) { byUse.set(u, []); useOrder.push(u); }
    byUse.get(u)!.push(k);
  }
  const hqUses = useOrder.filter((u) => u.split(SEP)[0] === "본사");
  const corpUses = useOrder.filter((u) => u.split(SEP)[0] !== "본사");

  /**
   * 보고용 한 덩이. 합계 줄이 묶음 위에 서고, 그 아래로 한 단씩 내려간다 —
   *   보고용 합계 → 구분 줄 → 대계정 상세
   * 엑셀 개요도 summaryBelow=false로 맞춰 두어 +/- 단추가 합계 줄에 붙는다.
   *
   * 파일은 2단계(상세가 접힌 모습)로 열리므로 접었을 때 보이는 줄은 구분 줄뿐이다.
   * 그래서 대조직도 구분 줄에 적는다 — 한 보고용 안에 '지급수수료'가 대조직만 달리해
   * 두 번 나오는 일이 있어서, 이게 없으면 접은 화면에서 둘을 구별할 수 없다.
   */
  function writeUseBlock(u: string) {
    const ks = byUse.get(u)!;
    const [hq, useName] = u.split(SEP);

    // 합계 줄이 위에 서므로 줄 번호를 먼저 잡아 둬야 한다 — 먼저 묶음을 쪼갠다.
    const groups: { org: string; cat: string; ks: string[] }[] = [];
    for (let i = 0; i < ks.length; ) {
      const [, , org, cat] = parts(ks[i]);
      const g: string[] = [];
      while (i < ks.length) {
        const [, , o2, c2] = parts(ks[i]);
        if (o2 !== org || c2 !== cat) break;
        g.push(ks[i]);
        i++;
      }
      groups.push({ org, cat, ks: g });
    }

    const useRow = row++;
    const catRows: number[] = [];
    let prevOrg = "";
    for (const g of groups) {
      const catRow = row++;
      const detailRows: number[] = [];
      for (const k of g.ks) {
        ws.getCell(row, 4).value = parts(k)[4];
        writeNumbers(row, dataOf(k));
        ws.getRow(row).outlineLevel = 2;
        ws.getRow(row).hidden = true;   // 2단계로 접힌 채 열린다
        setCollapsed(row, false);
        detailRows.push(row);
        row++;
      }
      if (g.org !== prevOrg) ws.getCell(catRow, 2).value = g.org;
      prevOrg = g.org;
      ws.getCell(catRow, 4).value = g.cat;
      writeSum(catRow, detailRows);
      paint(catRow, GRP_CAT, INK, 10);
      ws.getRow(catRow).outlineLevel = 1;
      setCollapsed(catRow, true);
      catRows.push(catRow);
    }
    ws.getCell(useRow, 1).value = `${useName} 합계`;
    ws.mergeCells(useRow, 1, useRow, 4);
    writeSum(useRow, catRows);
    paint(useRow, GRP_USE, NAVY, 10.5);
    useRowsOf[hq === "본사" ? "본사" : "법인"].push(useRow);
  }

  // 본사 묶음 → 본사 합계 → 법인 묶음 → 법인 합계 → 총 합계.
  for (const u of hqUses) writeUseBlock(u);
  for (const [label, key] of [["본사 합계", "본사"], ["법인 합계", "법인"]] as const) {
    if (label === "법인 합계") for (const u of corpUses) writeUseBlock(u);
    if (!useRowsOf[key].length) continue;
    ws.getCell(row, 1).value = label;
    ws.mergeCells(row, 1, row, 4);
    writeSum(row, useRowsOf[key]);
    paint(row, GRP_HQ, NAVY, 11);
    bigRows.push(row);
    row++;
  }
  ws.getCell(row, 1).value = "총 합계";
  ws.mergeCells(row, 1, row, 4);
  writeSum(row, bigRows);
  paint(row, HEAD_DARK, "FFFFFFFF", 11);
  const lastRow = row;

  // ── 모양 ────────────────────────────────────────────────────────────────────
  for (let r = HR + 3; r <= lastRow; r++) {
    for (let c = 1; c <= lastCol; c++) {
      const cell = ws.getCell(r, c);
      if (!cell.font) cell.font = f({ color: { argb: INK } });
      if (c <= KEY_COLS) {
        cell.alignment = { horizontal: "left", vertical: "middle", indent: c === 4 ? 1 : 0 };
        cell.border = { top: hair, bottom: hair, left: c === 1 ? edge : thin, right: c === KEY_COLS ? edge : thin };
      } else {
        const off = (c - firstCol) % BLOCK;
        cell.numFmt = off === 7 ? PCT : NUM;
        cell.alignment = { horizontal: "right", vertical: "middle" };
        // 월과 월 사이는 굵게, 예산과 실적 사이는 가늘게 — 눈이 블록을 바로 가른다.
        cell.border = {
          top: hair,
          bottom: hair,
          left: off === 0 ? edge : off === 3 ? thin : hair,
          right: off === BLOCK - 1 ? edge : hair,
        };
      }
    }
  }

  // 키 열은 들어갈 글자에 맞춰 재고, 데이터 열은 전부 한 폭으로 맞춘다 — 눈에 고르게 보여야 한다.
  // 폭은 엑셀 자동 맞춤으로 잰 '필요한 폭'에 여유만 얹은 값이다(데이터 열 최대 8.1 -> 8.5).
  // 1열은 보고용 합계가 A:D로 병합되므로 좁아도 글자가 잘리지 않는다. 3열은 구분 이름이
  // 대계정 칸에 적히므로 머리글만 들어가면 된다.
  ws.getColumn(1).width = 10;
  ws.getColumn(2).width = 11.5;
  ws.getColumn(3).width = 5.5;
  ws.getColumn(4).width = 20;
  for (let c = firstCol; c <= lastCol; c++) {
    const off = (c - firstCol) % BLOCK;
    const col = ws.getColumn(c);
    col.width = 9;
    // 국내·해외는 접은 채로 연다 — 펼치면 나뉜 금액이, 접으면 '계'만 보인다.
    // 접힘 표시는 묶음 바로 오른쪽('계')이 들고 있어야 +/- 단추가 맞게 그려진다.
    const grouped = off === 0 || off === 1 || off === 3 || off === 4;
    if (grouped) { col.outlineLevel = 1; col.hidden = true; }
    Object.defineProperty(col, "collapsed", { value: !grouped && (off === 2 || off === 5), configurable: true });
  }
  ws.properties.outlineLevelCol = 1;
  ws.properties.outlineLevelRow = 2;

  // ── 요약 맨 아래 검토 줄 ────────────────────────────────────────────────────
  // 요약의 Total이 팀별의 '총 합계'와 맞는지 엑셀이 직접 보게 한다. 두 장은 묶는 단위가 달라
  // (요약은 구분까지, 팀별은 대계정까지) 원 단위로는 반올림 때문에 몇 원씩 어긋날 수 있으므로,
  // 보이는 그대로 백만원으로 반올림해 견준다. 모든 칸이 0이면 일치다.
  if (audit) {
    const { blocks: sBlocks, first: sFirst, SB, key: sKey, last: sLast, totalRow } = audit;
    const S = (c: number) => sh.getColumn(c).letter;
    const aRow = totalRow + 2;
    /** 팀별 '총 합계' 줄에서 이 블록에 해당하는 칸들 (off 0=예산 계, 3=실적 계). */
    const teamRefs = (b: Block, off: number) => {
      const at = (bi: number) => `'팀별'!${L(firstCol + bi * BLOCK + off + 2)}$${lastRow}`;
      if (b.kind === "month") return [at(b.m! - 1)];
      if (b.kind === "year") return [at(blocks.length - 1)];
      return Array.from({ length: b.thru! }, (_, i) => at(i));
    };

    /** 팀별 '총 합계' 줄에 적힌 값 (off 0=예산 계, 3=실적 계). */
    const teamValue = (b: Block, off: number) => {
      const q = rowVals.get(lastRow)!;
      const at = (bi: number) => (off === 0 ? q[bi].bd + q[bi].bo : q[bi].ad + q[bi].ao);
      if (b.kind === "month") return at(b.m! - 1);
      if (b.kind === "year") return at(blocks.length - 1);
      let sum = 0;
      for (let i = 0; i < b.thru!; i++) sum += at(i);
      return sum;
    };
    /** 엑셀 ROUND와 같은 반올림(0에서 먼 쪽)으로 백만원 단위를 만든다. */
    const mil = (x: number) => (x < 0 ? -Math.round(-x / 1000000) : Math.round(x / 1000000));

    sh.getCell(aRow, 1).value = "검토";
    let worst = 0;
    sBlocks.forEach((b, bi) => {
      const c0 = sFirst + bi * SB;
      for (const off of [0, 1]) {
        const team = teamRefs(b, off === 0 ? 0 : 3);
        const diff = mil(audit.vals[bi][off === 0 ? "b" : "a"]) - mil(teamValue(b, off === 0 ? 0 : 3));
        worst = Math.max(worst, Math.abs(diff));
        sh.getCell(aRow, c0 + off).value = {
          formula: `ROUND(${S(c0 + off)}$${totalRow}/1000000,0)-ROUND(SUM(${team.join(",")})/1000000,0)`,
          result: diff,
        };
      }
    });
    sh.getCell(aRow, 2).value = {
      formula: `IF(SUMPRODUCT(ABS(${S(sKey + 1)}${aRow}:${S(sLast)}${aRow}))=0,"일치","불일치")`,
      result: worst === 0 ? "일치" : "불일치",
    };
    for (let c = 1; c <= sLast; c++) {
      const cell = sh.getCell(aRow, c);
      cell.fill = fill("FFFFF4D6");
      cell.font = f({ bold: true, color: { argb: INK } });
      cell.alignment = { horizontal: c <= sKey ? "left" : "right", vertical: "middle" };
      if (c > sKey) cell.numFmt = "0;[Red]-0;0";
      cell.border = { top: thin, bottom: thin, left: c === 1 || (c - sFirst) % SB === 0 ? edge : hair, right: c === sLast ? edge : hair };
    }
    sh.getCell(aRow + 1, 1).value = "※ 요약 Total − 팀별 '총 합계' (백만원). 모두 0이면 두 장의 숫자가 같다.";
    sh.getCell(aRow + 1, 1).font = f({ size: 9, italic: true, color: { argb: "FF6B7280" } });
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
