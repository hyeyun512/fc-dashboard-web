/**
 * Humax합계_상세의 '월별 배부액 추이 (왜곡 수정ver)'에 적용하는 보정 내역.
 *
 * 회계 처리 시기 오류(기표를 뒤늦게 잡았다가 되돌리는 등)로 특정 월의 배부액이 실제 발생과
 * 다르게 튀는 경우가 있다. 원장(Supabase) 숫자는 그대로 두고, 이 화면에서 추세를 읽을 때만
 * 아래 보정을 얹어 "실제로는 이렇게 흘렀다"를 함께 보여준다.
 *
 * 보정은 반드시 한 건(case) 안에서 합이 0이어야 한다 — 월 사이를 옮기는 것이지 총액을
 * 바꾸는 게 아니기 때문이다. 합이 0이 아니면 화면에 그리지 않고 경고를 남긴다.
 *
 * 새 보정이 생기면 이 배열에만 추가하면 되고, 차트와 하단 설명이 함께 갱신된다.
 */
export type AllocSeriesKey = "stb" | "humaxCommon" | "building";

export type AllocTrendAdjustment = {
  /** 어느 선을 보정하는지 */
  series: AllocSeriesKey;
  /** 하단 설명에 쓰는 건 이름 */
  label: string;
  /** 월별 증감 (단위: 백만원). 합계는 0이어야 한다. */
  deltas: { month: string; amountMillion: number }[];
  /** 왜 이렇게 보정하는지 — 하단에 그대로 적힌다. */
  reason: string;
};

export const ALLOC_SERIES_LABEL: Record<AllocSeriesKey, string> = {
  stb: "STB",
  humaxCommon: "HUMAX(공통)",
  building: "건물",
};

export const ALLOC_TREND_ADJUSTMENTS: AllocTrendAdjustment[] = [
  {
    series: "stb",
    label: "STB License Fee/Nagra",
    deltas: [
      { month: "4월", amountMillion: -84 },
      { month: "5월", amountMillion: 84 },
    ],
    reason:
      "선급비용 조정 시기 오류 — 84백만원을 4월에 기표한 뒤 5월에 reverse 하여, 4월은 과대 5월은 과소로 잡혔습니다.",
  },
];
