"use client";

import { useEffect, useRef } from "react";
import type { DashboardData } from "@/lib/types";
import { initDashboard } from "@/lib/dashboardClient";
import { ALLOC_SERIES_LABEL, ALLOC_SERIES_COLOR, ALLOC_TREND_SERIES } from "@/lib/allocPalette";

/**
 * 배부액 추이 그래프의 범례 — 선 색과 같은 정의(allocPalette)를 쓰므로 색이 따로 놀 수 없다.
 * Humax합계의 구성비 도넛과도 같은 팔레트다.
 */
function AllocTrendLegend() {
  return (
    <span className="legend">
      {ALLOC_TREND_SERIES.map((key) => (
        <span className="leg" key={key}>
          <span className="leg-line" style={{ borderColor: ALLOC_SERIES_COLOR[key] }} />
          {ALLOC_SERIES_LABEL[key]}
        </span>
      ))}
      {/* 점선은 계열이 아니라 '보정된 구간'이라 색 없이 회색으로 둔다. */}
      <span className="leg">
        <span className="leg-line dash" style={{ borderColor: "#94a3b8" }} />
        왜곡 수정
      </span>
    </span>
  );
}

/**
 * 경영진 보고용 Summary 박스 — 내용은 상단 '보고 월'에 따라 달라지므로 여기서는 빈 껍데기만 두고,
 * 월을 알고 있는 dashboardClient가 채운다. 문구가 없는 달에는 :empty 규칙으로 박스째 숨겨진다.
 * 문구 자체는 화면에서 고치지 않고 "Summary 작성용.xlsx"를 고쳐 동기화한다.
 */
function SummaryCommentBox({ id, accent, variant }: { id: string; accent: string; variant?: "side" | "cards" }) {
  // "cards"는 배부 항목(STB/HUMAX(공통)/건물)마다 상자를 따로 두는 형태 — 테두리는 항목 상자가 가지므로
  // 바깥 상자는 테두리 없이 자리만 잡는다.
  if (variant === "cards") return <div id={id} className="summary-cards-box" />;
  return (
    <div
      id={id}
      className={`summary-callout${variant === "side" ? " summary-callout-side" : ""}`}
      style={{ borderLeftColor: accent }}
    />
  );
}

export default function Dashboard({ data }: { data: DashboardData }) {
  const mounted = useRef(false);

  useEffect(() => {
    // React StrictMode in dev runs effects twice; guard so we don't double-init.
    const cleanup = initDashboard(data);
    mounted.current = true;
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
            고정비 실적 대시보드 2026
          </div>
          <div className="topbar-meta" id="topbarMeta">
            단위: 백만원
          </div>
        </div>
        <div className="topbar-right">
          <div className="filter-box">
            <label>보고 월</label>
            <select id="monthSelect" defaultValue={data.defaultMonth} />
          </div>
          <div className="filter-box" id="modeFilterBox">
            <label>보기</label>
            <div className="seg" id="modeToggle">
              <button className="seg-btn" data-mode="month" type="button">
                당월
              </button>
              <button className="seg-btn active" data-mode="cum" type="button">
                누계(YTD)
              </button>
            </div>
          </div>
          <span className="tag" id="genTag">
            Supabase 실시간 연동
          </span>
        </div>
      </div>

      <div className="tab-bar">
        <div className="tab tab-summary-lv active" data-tab="sum-total">
          Humax합계
        </div>
        <div className="tab tab-summary-lv" data-tab="sum-evcs">
          EVCS사업부
        </div>
        <div className="tab tab-summary-lv" data-tab="sum-detail">
          Humax합계_상세
        </div>
        <div className="tab tab-summary-lv" data-tab="sum-trend">
          배부액 추이
        </div>
        <div className="tab-sep" />
        <div className="tab tab-sub" data-tab="summary">
          Appendix A
        </div>
        <div className="tab tab-sub" data-tab="evcs">
          Appendix B
        </div>
        <div className="tab tab-sub" data-tab="category">
          Appendix C
        </div>
        <div className="tab tab-sub" data-tab="alloc">
          Appendix D
        </div>
      </div>

      {/* 보고 자리에서 탭을 슬라이드처럼 넘기는 줄. 내용은 dashboardClient가 채운다. */}
      <div className="slidenav" id="slidenav">
        <button id="prevSlide" type="button">
          ◀ 이전
        </button>
        <span id="slideCount">1 / 7</span>
        <button id="nextSlide" type="button">
          다음 ▶
        </button>
        <span className="sep" />
        <span className="navlbl">탭 선택</span>
        <select id="slideSelect" title="보고 싶은 탭을 고르세요" />
        <span className="sep" />
        <button id="fsBtn" type="button">
          ⛶ 슬라이드쇼
        </button>
        <span className="hint">← → 키로도 이동</span>
      </div>

      {/* ===================== SUMMARY① Humax합계 ===================== */}
      <div id="tab-sum-total" className="content active">
        <div className="sheet-hd">
          <div className="sheet-hd-bar" style={{ background: "#1d4ed8" }} />
          <div>
            <div className="sheet-eyebrow">Summary</div>
            <div className="sheet-title">Humax합계</div>
          </div>
        </div>
        <div className="sum-block">
          <div className="sum-block-row">
            <div className="tbl-box" style={{ marginBottom: 0 }}>
              <div className="tbl-hd">
                <span id="sumTotalMonthTitle" /> <span className="sub" id="sumTotalMonthSub" />
              </div>
              <div className="tbl-scroll">
                <div id="sumTotalMonthTable" />
              </div>
            </div>
            <div className="donut-box">
              <div className="donut-wrap">
                <canvas id="sumTotalMonthDonut" />
              </div>
              <ul className="donut-legend" id="sumTotalMonthDonutLegend" />
            </div>
          </div>
          <SummaryCommentBox id="sumTotalMonthComment" accent="#1d4ed8" variant="side" />
        </div>

        <div className="sum-block">
          <div className="sum-block-row">
            <div className="tbl-box" style={{ marginBottom: 0 }}>
              <div className="tbl-hd">
                <span id="sumTotalCumTitle" /> <span className="sub" id="sumTotalCumSub" />
              </div>
              <div className="tbl-scroll">
                <div id="sumTotalCumTable" />
              </div>
            </div>
            <div className="donut-box">
              <div className="donut-wrap">
                <canvas id="sumTotalCumDonut" />
              </div>
              <ul className="donut-legend" id="sumTotalCumDonutLegend" />
            </div>
          </div>
          <SummaryCommentBox id="sumTotalCumComment" accent="#1d4ed8" variant="side" />
        </div>
      </div>

      {/* ===================== SUMMARY② EVCS사업부 ===================== */}
      <div id="tab-sum-evcs" className="content">
        <div className="sheet-hd">
          <div className="sheet-hd-bar" style={{ background: "#1d4ed8" }} />
          <div>
            <div className="sheet-eyebrow">Summary</div>
            <div className="sheet-title">EVCS사업부</div>
          </div>
        </div>
        <SummaryCommentBox id="evcsComment" accent="#1d4ed8" />

        <div className="evcs-top">
          <div className="evcs-top-left">
            <div className="section-lead" style={{ marginTop: 0 }}>
              국내 · 해외 배부 현황 <span className="sub" id="evcsSplitSub" />
            </div>
            <div className="tbl-box" style={{ marginBottom: 0 }}>
              <div id="evcsSplitTable" />
            </div>
          </div>
          <div className="evcs-top-right">
            <div className="section-lead" style={{ marginTop: 0 }}>
              구분별 금액 규모 <span className="sub" id="sumEvcsSub" />
            </div>
            <div className="donut-pair">
              {(["Hq", "Corp"] as const).map((key) => (
                <div className="donut-box donut-card" key={key}>
                  <div className="donut-card-title">{key === "Hq" ? "본사" : "법인"}</div>
                  <div className="donut-card-body">
                    <div className="donut-wrap">
                      <canvas id={`evcsDonut${key}`} />
                    </div>
                    <ul className="donut-legend" id={`evcsDonut${key}Legend`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ===================== SUMMARY③ Humax합계_상세 ===================== */}
      <div id="tab-sum-detail" className="content">
        <div className="sheet-hd">
          <div className="sheet-hd-bar" style={{ background: "#1d4ed8" }} />
          <div>
            <div className="sheet-eyebrow">Summary</div>
            <div className="sheet-title">Humax합계_상세</div>
          </div>
        </div>
        {/* 2x2 — 위는 추이 두 개(원장 그대로 / 왜곡 수정ver)를 같은 눈금으로 나란히 두어 비교하게 하고,
            아래는 그 근거가 되는 표와 Summary를 좌우로 둔다. 아래 두 상자는 칸 높이를 꽉 채워
            아래 선이 한 줄로 맞는다 (칸만 늘리면 안쪽 상자가 짧아 선이 어긋나 보인다). */}
        {/* 좌: 배부 내역 표 / 우: 항목별 Summary. 두 상자는 칸 높이를 꽉 채워 아래 선이 한 줄로 끝난다
            (칸만 늘리고 안쪽 상자를 그대로 두면 짧은 쪽 선이 떠 보인다). */}
        <div className="detail-grid">
          <div className="tbl-box">
            <div className="tbl-hd">
              <span id="sumDetailTitle" /> <span className="sub" id="sumDetailSub" />
            </div>
            <div className="tbl-scroll">
              <div id="sumDetailTable" />
            </div>
            <div className="note" id="sumDetailNote" />
          </div>

          <SummaryCommentBox id="sumDetailComment" accent="#1d4ed8" variant="cards" />
        </div>
      </div>

      {/* ===================== SUMMARY④ 배부액 추이 ===================== */}
      <div id="tab-sum-trend" className="content">
        <div className="sheet-hd">
          <div className="sheet-hd-bar" style={{ background: "#1d4ed8" }} />
          <div>
            <div className="sheet-eyebrow">Summary</div>
            <div className="sheet-title">배부액 추이</div>
          </div>
        </div>
        {/* 원장 그대로의 추이 위에, 회계 처리 시기 오류로 튄 구간만 점선으로 겹쳐 그린다.
            보정 내역은 lib/trendAdjustments.ts에 선언해두고 차트와 메모가 같은 값을 쓰게 하며,
            점 위에 뜨는 메모 문구는 "Summary 작성용.xlsx"에서 관리한다 (SUMMARY_TREND_MEMOS). */}
        <div className="panel detail-trend-panel trend-panel-full">
          <div className="detail-trend-hd">
            <span className="detail-trend-title">월별 배부액 추이</span>
            <AllocTrendLegend />
          </div>
          <div className="detail-trend-wrap">
            <canvas id="detailAllocTrend" />
          </div>
          <div className="detail-trend-note" id="detailAllocTrendAdjNote" />
        </div>
        {/* 그래프에서 읽히는 것을 배부 항목별로 나눠 적는다 (STB / HUMAX(공통) / 건물). */}
        <SummaryCommentBox id="trendComment" accent="#1d4ed8" variant="cards" />
      </div>

      {/* ===================== APPENDIX A (구 Humax(전사) 상세) ===================== */}
      <div id="tab-summary" className="content">
        <div className="sheet-hd">
          <div className="sheet-hd-bar" />
          <div>
            <div className="sheet-eyebrow">Appendix A</div>
            <div className="sheet-title">전사 상세</div>
          </div>
        </div>
        {/* 요약 수치·추이·구성비를 한 줄에 둔다 — 부록은 훑어보는 장이라 세로로 쌓지 않는다. */}
        <div className="appx-top-row">
          <div id="summaryKpis" />
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-hd">
              <div>
                <div className="panel-title">월별 실적 추이 (예산 vs 실적)</div>
                <div className="panel-sub" id="summaryTrendSub">
                  &nbsp;
                </div>
              </div>
              <div className="legend">
                <span className="leg">
                  <span className="leg-dot" style={{ background: "#16a34a" }} />
                  집행률(%)
                </span>
                <span className="leg">
                  <span className="leg-dot" style={{ background: "#cbd5e1" }} />
                  예산
                </span>
                <span className="leg">
                  <span className="leg-dot" style={{ background: "#2563eb" }} />
                  실적
                </span>
              </div>
            </div>
            <div className="chart-wrap-lg">
              <canvas id="summaryTrendChart" />
            </div>
          </div>
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-hd">
              <div>
                <div className="panel-title">계정과목별 구성비</div>
                <div className="panel-sub" id="summaryDonutSub">
                  &nbsp;
                </div>
              </div>
            </div>
            <div className="chart-wrap-lg">
              <canvas id="summaryDonutChart" />
            </div>
          </div>
        </div>

        <div className="section-lead">
          보고용 부문별 상세<span className="sub">본사(사업/개발/SCM/Media/Staff) · 법인(해외법인별)</span>
        </div>
        <div className="tbl-box">
          <div id="deptTable" />
        </div>
      </div>

      {/* ===================== APPENDIX B (구 EVCS(사업부) 상세) ===================== */}
      <div id="tab-evcs" className="content">
        <div className="sheet-hd">
          <div className="sheet-hd-bar" />
          <div>
            <div className="sheet-eyebrow">Appendix B</div>
            <div className="sheet-title">EVCS(사업부) 상세</div>
          </div>
        </div>
        <div className="appx-top-row">
          <div id="evcsKpis" />
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-hd">
              <div>
                <div className="panel-title">월별 실적 추이 (예산 vs 실적)</div>
                <div className="panel-sub" id="evcsTrendComboSub">
                  &nbsp;
                </div>
              </div>
              <div className="legend">
                <span className="leg">
                  <span className="leg-dot" style={{ background: "#16a34a" }} />
                  집행률(%)
                </span>
                <span className="leg">
                  <span className="leg-dot" style={{ background: "#cbd5e1" }} />
                  예산
                </span>
                <span className="leg">
                  <span className="leg-dot" style={{ background: "#0891b2" }} />
                  실적
                </span>
              </div>
            </div>
            <div className="chart-wrap-lg">
              <canvas id="evcsTrendComboChart" />
            </div>
          </div>
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-hd">
              <div>
                <div className="panel-title">계정과목별 구성비</div>
                <div className="panel-sub" id="evcsDonutSub">
                  &nbsp;
                </div>
              </div>
            </div>
            <div className="chart-wrap-lg">
              <canvas id="evcsDonutChart" />
            </div>
          </div>
        </div>

        <div className="tbl-box">
          <div className="tbl-hd">
            구분별 상세 <span className="sub">EVCS 배부 금액(국내+해외) 기준</span>
          </div>
          <div className="tbl-scroll">
            <div id="evcsCatTable" />
          </div>
        </div>

        <div className="section-lead">
          대계정별 상세<span className="sub">EVCS 배부 금액(국내+해외) 기준 · 본사 · 법인 각각</span>
        </div>
        <div className="chart-2col">
          <div className="tbl-box" style={{ marginBottom: 0 }}>
            <div className="tbl-hd">
              본사 대계정별 상세 <span className="sub" id="evcsHqMainAccountTblSub" />
            </div>
            <div id="evcsHqMainAccountTable" />
          </div>
          <div className="tbl-box" style={{ marginBottom: 0 }}>
            <div className="tbl-hd">
              법인 대계정별 상세 <span className="sub" id="evcsCorpMainAccountTblSub" />
            </div>
            <div id="evcsCorpMainAccountTable" />
          </div>
        </div>

        <div className="section-lead">
          대계정 '인증대행료' 상세 관리<span className="sub">EVCS에 배부된 인증대행료 · 예산 대비 초과 집행 위험 모니터링</span>
        </div>
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-hd">
            <div>
              <div className="panel-title">인증대행료 월별 예산·실적·집행률</div>
              <div className="panel-sub" id="certComboSub">
                &nbsp;
              </div>
            </div>
            <div className="legend">
              <span className="leg">
                <span className="leg-dot" style={{ background: "#16a34a" }} />
                집행률(%)
              </span>
              <span className="leg">
                <span className="leg-dot" style={{ background: "#cbd5e1" }} />
                예산
              </span>
              <span className="leg">
                <span className="leg-dot" style={{ background: "#dc2626" }} />
                실적
              </span>
            </div>
          </div>
          <div className="cert-row">
            <div className="cert-chart">
              <canvas id="certComboChart" />
            </div>
            <div className="cert-side" id="certSide" />
          </div>
        </div>
      </div>

      {/* ===================== CATEGORY TAB (Appendix C) ===================== */}
      <div id="tab-category" className="content">
        <div className="sheet-hd">
          <div className="sheet-hd-bar" />
          <div>
            <div className="sheet-eyebrow">Appendix C</div>
            <div className="sheet-title">전사 계정별</div>
          </div>
        </div>
        <div className="tbl-box">
          <div className="tbl-hd">
            구분별 상세 <span className="sub" id="catTblSub" />
          </div>
          <div className="tbl-scroll">
            <div id="categoryTable" />
          </div>
        </div>
        <div className="section-lead">
          대계정별 상세<span className="sub">본사 · 법인 각각 전체 대계정 기준 실적/예산 · 구분 순으로 묶어서 표시</span>
        </div>
        <div className="chart-2col">
          <div className="tbl-box" style={{ marginBottom: 0 }}>
            <div className="tbl-hd">
              본사 대계정별 상세 <span className="sub" id="hqMainAccountTblSub" />
            </div>
            <div id="hqMainAccountTable" />
          </div>
          <div className="tbl-box" style={{ marginBottom: 0 }}>
            <div className="tbl-hd">
              법인 대계정별 상세 <span className="sub" id="corpMainAccountTblSub" />
            </div>
            <div id="corpMainAccountTable" />
          </div>
        </div>

        <div className="section-lead">
          지급수수료 상세 관리<span className="sub">주요 계정 기준 · 어디서 더 쓰고 덜 쓰는지 확인</span>
        </div>
        <div className="tbl-box">
          <div className="tbl-hd">
            조직별 지급수수료 현황{" "}
            <span className="sub">대상 계정: 지급수수료, 외주개발용역비, 인증대행료, 특허처리비 · 본사 부문별(Staff부문은 대조직까지 세분화) · 법인</span>
          </div>
          <div id="feeTable" />
        </div>
      </div>

      {/* ===================== ALLOCATION BOARD TAB (Appendix D) ===================== */}
      <div id="tab-alloc" className="content">
        <div className="sheet-hd">
          <div className="sheet-hd-bar" />
          <div>
            <div className="sheet-eyebrow">Appendix D</div>
            <div className="sheet-title">전사 배부판</div>
          </div>
        </div>
        <div id="allocTrendInsight" />

        <div className="section-lead">
          예산(BP) 배부 현황<span className="sub" id="allocBudgetSub" />
        </div>
        <div className="tbl-box">
          <div className="alloc-scroll">
            <div id="allocBudgetTable" />
          </div>
        </div>

        <div className="section-lead">
          실적 배부 현황<span className="sub" id="allocActualSub" />
        </div>
        <div className="tbl-box">
          <div className="alloc-scroll">
            <div id="allocActualTable" />
          </div>
        </div>

        <div className="section-lead">
          Diff(실적-예산) 배부 현황<span className="sub" id="allocDiffSub" />
        </div>
        <div className="tbl-box">
          <div className="alloc-scroll">
            <div id="allocDiffTable" />
          </div>
        </div>
      </div>

      <footer>
        고정비 실적 대시보드 2026 · Supabase 실시간 연동 (
        <span id="sourceTableTag">{data.sourceTable}</span>) · 생성 시각{" "}
        <span id="generatedAtTag">{new Date(data.generatedAt).toLocaleString("ko-KR")}</span>
      </footer>
    </>
  );
}
