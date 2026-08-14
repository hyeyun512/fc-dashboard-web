/**
 * 배부 항목(STB ~ 건물)의 이름과 색 — Summary 시트 전체가 이 한 정의를 쓴다.
 *
 * Humax합계의 구성비 도넛과 Humax합계_상세의 월별 추이 그래프는 같은 배부 항목을 보여주므로,
 * 같은 항목이 시트마다 다른 색으로 나오면 안 된다. 색을 화면마다 따로 적어두면 한쪽만 고쳐져
 * 어긋나기 때문에, 도넛·추이 그래프·범례가 모두 여기서 색을 가져간다.
 *
 * 파랑 명도만 6단계로 나누면 인접 조각이 서로 구분되지 않아, 파랑을 기본 축으로 두되
 * 조각끼리는 색상(hue)까지 벌려 구분한다 — 보고서에서는 색이 예쁜 것보다 구분되는 게 우선이다.
 */
export const ALLOC_DONUT_LABELS = [
  "STB",
  "MOBILITY",
  "EVCS(국내)",
  "EVCS(해외)",
  "HUMAX(공통)",
  "건물",
];

/** ALLOC_DONUT_LABELS와 같은 순서 — STB 남색 / MOBILITY 보라 / EVCS(국내) 파랑 / EVCS(해외) 하늘 / HUMAX(공통) 청록 / 건물 앰버 */
export const ALLOC_DONUT_COLORS = ["#1e3a8a", "#7c3aed", "#2563eb", "#38bdf8", "#0d9488", "#f59e0b"];

/** Humax합계_상세의 추이 그래프가 그리는 3개 항목. */
export type AllocSeriesKey = "stb" | "humaxCommon" | "building";

/** 각 항목이 도넛의 몇 번째 조각인지 — 이름과 색을 위 배열에서 그대로 끌어오기 위한 연결고리. */
const DONUT_INDEX: Record<AllocSeriesKey, number> = {
  stb: 0,
  humaxCommon: 4,
  building: 5,
};

export const ALLOC_SERIES_LABEL: Record<AllocSeriesKey, string> = {
  stb: ALLOC_DONUT_LABELS[DONUT_INDEX.stb],
  humaxCommon: ALLOC_DONUT_LABELS[DONUT_INDEX.humaxCommon],
  building: ALLOC_DONUT_LABELS[DONUT_INDEX.building],
};

export const ALLOC_SERIES_COLOR: Record<AllocSeriesKey, string> = {
  stb: ALLOC_DONUT_COLORS[DONUT_INDEX.stb],
  humaxCommon: ALLOC_DONUT_COLORS[DONUT_INDEX.humaxCommon],
  building: ALLOC_DONUT_COLORS[DONUT_INDEX.building],
};

/** 추이 그래프에 그리는 순서 (도넛 조각 순서와 동일). */
export const ALLOC_TREND_SERIES: AllocSeriesKey[] = ["stb", "humaxCommon", "building"];
