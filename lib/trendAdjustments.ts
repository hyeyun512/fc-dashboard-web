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
 * ⚠️ 여기 들어갈 수 있는 건 "기표 시기가 틀려서 그 달 숫자 자체가 실제 발생과 다른" 경우뿐이다.
 *    제 달에 제대로 기표됐지만 반복되지 않을 뿐인 일회성 비용(감사 착수금, 주식선택권 취소 등)은
 *    보정 대상이 아니다 — 숫자가 틀린 게 아니라서 옮기면 원장과 화면이 어긋난다.
 *    그런 건은 "Summary 작성용.xlsx"의 '월별 배부액 추이' 행에 적어 그래프 하단 '참고'로 내보낸다.
 *
 * 새 보정이 생기면 이 배열에만 추가하면 되고, 차트와 하단 설명이 함께 갱신된다.
 */
import type { AllocSeriesKey } from "./allocPalette";

export type AllocTrendAdjustment = {
  /** 어느 선을 보정하는지 */
  series: AllocSeriesKey;
  /** 하단 설명에 쓰는 건 이름 */
  label: string;
  /** 월별 증감 (단위: 백만원). 합계는 0이어야 한다. */
  deltas: { month: string; amountMillion: number }[];
  /** 왜 이렇게 보정하는지 — 하단 보정 내역 줄 끝에 괄호로 붙는다. 문장이 아니라 단어형으로 적는다. */
  reason: string;
};

export const ALLOC_TREND_ADJUSTMENTS: AllocTrendAdjustment[] = [
  {
    series: "stb",
    label: "STB License Fee/Nagra",
    deltas: [
      { month: "4월", amountMillion: -84 },
      { month: "5월", amountMillion: 84 },
    ],
    reason: "선급비용 결산 조정 지연",
  },
];
