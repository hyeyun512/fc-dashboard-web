/**
 * 배부판·상세에 세우는 법인 행의 차례와 묶음 (2026-10-02 지시).
 *
 * HDG는 HUK에 합산하고, 비중이 작은 법인은 '기타' 한 줄로 모은다. 여기 적힌 차례가
 * Summary 상세 · App1 · App3에 그대로 나간다 — 장마다 따로 정렬하면 서로 어긋난다.
 *
 * 서버(aggregate)와 화면(dashboardClient)이 함께 보는 값이라 따로 떼어 두었다.
 * aggregate.ts를 그대로 들여오면 Supabase 서버 클라이언트까지 브라우저 번들에 딸려 온다.
 */
export const CORP_GROUPS: { label: string; codes: string[] }[] = [
  { label: "HUK(HDG포함)", codes: ["HUK", "HDG"] },
  { label: "HUS", codes: ["HUS"] },
  { label: "HJP", codes: ["HJP"] },
  { label: "HUG", codes: ["HUG"] },
  { label: "HSZ", codes: ["HSZ"] },
  { label: "HBR", codes: ["HBR"] },
];

/** 위 묶음에 들지 않은 법인은 모두 여기로 — 어떤 법인인지는 표 아래 각주가 밝힌다. */
export const CORP_OTHER_LABEL = "기타";

/** 각주에 적을 '기타'의 구성. 묶음에 없는 법인이 새로 생기면 그 법인도 '기타'로 들어간다. */
export const CORP_OTHER_CODES = ["HMX", "HTR", "HID", "HAU"];
