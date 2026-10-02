import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * EVCS 사업부 상세를 엑셀 한 장으로 내려준다 (2026-10-02 지시).
 *
 * 행은 보고용 · 대조직 · 대계정, 열은 1월부터 보고월까지 월 블록 + 끝에 26BP 예산과 누계 실적이다.
 * 금액은 EVCS로 배부된 몫만 쓴다 — 국내는 evcs_domestic_krw, 해외는 evcs_overseas_krw다.
 * (예산·실적 모두 HUMAX와 H.EV가 이미 합산된 값이라 둘을 가르지 않는다.)
 */
export const dynamic = "force-dynamic";

const BUDGET_TABLE = "26년 예산(BP)";
const COLS = "month,report_use_re,large_org,main_account_re,evcs_domestic_krw,evcs_overseas_krw";

type Row = {
  month: string;
  report_use_re: string | null;
  large_org: string | null;
  main_account_re: string | null;
  evcs_domestic_krw: number | null;
  evcs_overseas_krw: number | null;
};

const n = (v: number | null | undefined) => (v == null ? 0 : v);
const monthNum = (m: string) => parseInt(m.replace(/\D/g, ""), 10) || 0;

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

/** 보고용 → 대조직 → 대계정 차례. 대계정은 "11 급여"처럼 앞자리 숫자를 따른다. */
function acctNo(a: string) {
  const m = /^\s*(\d+)/.exec(a);
  return m ? parseInt(m[1], 10) : 999;
}

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data: tableName, error: rpcError } = await supabase.rpc("fc_latest_actual_table");
  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 });
  const actualTable = String(tableName);

  const [actual, budget] = await Promise.all([fetchAll(actualTable), fetchAll(BUDGET_TABLE)]);

  // EVCS로 배부된 몫이 있는 행만 본다 (국내·해외 둘 다 0이면 이 장과 무관하다).
  const hasEvcs = (r: Row) => n(r.evcs_domestic_krw) !== 0 || n(r.evcs_overseas_krw) !== 0;
  const act = actual.filter(hasEvcs);
  const bud = budget.filter(hasEvcs);

  // 보고월 = 실적이 있는 마지막 달. 열은 여기까지만 만든다.
  const lastMonth = Math.max(0, ...act.map((r) => monthNum(r.month)));
  const months = Array.from({ length: lastMonth }, (_, i) => `${i + 1}월`);

  type Cell = { dom: number; ovs: number };
  const blank = (): Cell => ({ dom: 0, ovs: 0 });
  const key = (r: Row) => [r.report_use_re ?? "", r.large_org ?? "", r.main_account_re ?? ""].join("\u0001");

  const actMap = new Map<string, Map<string, Cell>>();   // 행 -> 월 -> 금액
  const budMap = new Map<string, Map<string, Cell>>();
  const budYear = new Map<string, Cell>();               // 26BP 연간(12개월 전체)
  const add = (m: Map<string, Map<string, Cell>>, r: Row) => {
    const k = key(r);
    if (!m.has(k)) m.set(k, new Map());
    const byMonth = m.get(k)!;
    const c = byMonth.get(r.month) ?? blank();
    c.dom += n(r.evcs_domestic_krw);
    c.ovs += n(r.evcs_overseas_krw);
    byMonth.set(r.month, c);
  };
  for (const r of act) add(actMap, r);
  for (const r of bud) {
    add(budMap, r);
    const c = budYear.get(key(r)) ?? blank();
    c.dom += n(r.evcs_domestic_krw);
    c.ovs += n(r.evcs_overseas_krw);
    budYear.set(key(r), c);
  }

  const rowKeys = [...new Set([...actMap.keys(), ...budMap.keys()])].sort((a, b) => {
    const [ra, oa, ca] = a.split("\u0001");
    const [rb, ob, cb] = b.split("\u0001");
    return ra.localeCompare(rb, "ko") || oa.localeCompare(ob, "ko") || acctNo(ca) - acctNo(cb) || ca.localeCompare(cb, "ko");
  });

  // ── 엑셀 ────────────────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`${lastMonth}월 누계`, { views: [{ state: "frozen", xSplit: 3, ySplit: 2 }] });

  const NAVY = "FF1E3A8A";
  const head1: (string | null)[] = ["보고용", "대조직", "대계정"];
  const head2: string[] = ["", "", ""];
  const BLOCK = ["예산", "국내", "해외", "실적", "국내", "해외", "차이", "집행률"];
  for (const m of months) {
    head1.push(m, ...Array(BLOCK.length - 1).fill(null));
    head2.push(...BLOCK);
  }
  head1.push("26BP 예산", null, null, `${lastMonth}월 누계 실적`, null, null, "연간 집행률");
  head2.push("합계", "국내", "해외", "합계", "국내", "해외", "");

  ws.addRow(head1);
  ws.addRow(head2);
  // 월 머리글은 블록 전체에 걸친다.
  let col = 4;
  for (let i = 0; i < months.length; i++, col += BLOCK.length) ws.mergeCells(1, col, 1, col + BLOCK.length - 1);
  ws.mergeCells(1, col, 1, col + 2);
  ws.mergeCells(1, col + 3, 1, col + 5);
  ws.mergeCells(1, col + 6, 2, col + 6);
  for (let c = 1; c <= 3; c++) ws.mergeCells(1, c, 2, c);

  for (const r of [1, 2]) {
    ws.getRow(r).eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, color: { argb: NAVY }, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });
  }

  const rate = (a: number, b: number) => (b === 0 ? null : a / b);
  for (const k of rowKeys) {
    const [use, org, acct] = k.split("\u0001");
    const vals: (string | number | null)[] = [use, org, acct];
    let cumA = blank();
    for (const m of months) {
      const a = actMap.get(k)?.get(m) ?? blank();
      const b = budMap.get(k)?.get(m) ?? blank();
      cumA = { dom: cumA.dom + a.dom, ovs: cumA.ovs + a.ovs };
      const bt = b.dom + b.ovs;
      const at = a.dom + a.ovs;
      vals.push(bt, b.dom, b.ovs, at, a.dom, a.ovs, at - bt, rate(at, bt));
    }
    const by = budYear.get(k) ?? blank();
    vals.push(by.dom + by.ovs, by.dom, by.ovs, cumA.dom + cumA.ovs, cumA.dom, cumA.ovs,
              rate(cumA.dom + cumA.ovs, by.dom + by.ovs));
    const row = ws.addRow(vals);
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      if (c > 3) {
        const isRate = (c - 3) % BLOCK.length === 0 || c === vals.length;
        cell.numFmt = isRate ? "0%" : "#,##0";
      }
      cell.border = { top: { style: "hair" }, left: { style: "hair" }, bottom: { style: "hair" }, right: { style: "hair" } };
    });
  }

  ws.getColumn(1).width = 16;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 18;
  for (let c = 4; c <= head2.length; c++) ws.getColumn(c).width = 13;
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: head2.length } };

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
