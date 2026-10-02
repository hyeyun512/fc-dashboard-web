/**
 * Staff부문 하위 조직 묶음 — 대시보드 개발안 맨 아래에 적힌 매핑 기준.
 *
 * 원장(large_org)에는 열몇 개로 흩어져 있어 그대로 세우면 표가 너무 길어진다.
 * 대시보드와 EVCS 상세 엑셀이 같은 기준으로 묶도록 여기 한 곳에 둔다.
 */
export const STAFF_USE = "5. Staff부문";

/** 보고에서 세우는 차례. */
export const PREFERRED_STAFF_SUBORG_ORDER = ["CEO", "Staff(CEO)", "경영지원실", "HR실"];

export const STAFF_SUBORG_MEMBERS: Record<string, string[]> = {
  "CEO": ["CEO"],
  "Staff(CEO)": ["EVCS부문장", "IT팀", "Staff(CEO)", "법무팀", "회계팀", "투자관리팀"],
  "경영지원실": ["경영지원실", "재무팀", "경영관리팀"],
  "HR실": ["HR실장", "HR팀", "업무지원팀"],
};

const STAFF_SUBORG_OF = new Map<string, string>(
  Object.entries(STAFF_SUBORG_MEMBERS).flatMap(([group, members]) => members.map((m) => [m, group] as const))
);

/** 원장의 조직 이름 -> 보고에서 세우는 묶음 이름. 기준에 없는 이름은 그대로 둔다. */
export function staffGroupOf(largeOrg: string): string {
  return STAFF_SUBORG_OF.get(largeOrg) ?? largeOrg;
}

/** 정렬용 — 기준에 없는 묶음은 뒤로 민다. */
export function staffRank(group: string): number {
  const i = PREFERRED_STAFF_SUBORG_ORDER.indexOf(group);
  return i < 0 ? PREFERRED_STAFF_SUBORG_ORDER.length : i;
}
