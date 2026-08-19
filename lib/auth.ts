/**
 * 대시보드 열람 암호 — 미들웨어(Edge)와 로그인 API가 함께 쓴다.
 *
 * ⚠️ 암호를 코드에 적지 않는다. 이 저장소는 공개(public)라 적는 순간 GitHub에서 그대로 보인다.
 *    Vercel의 환경변수 `DASHBOARD_PASSWORD`에만 둔다.
 *
 * 쿠키에는 암호가 아니라 그 해시를 담는다 — 쿠키를 들여다봐도 암호를 알 수 없게 하고,
 * 암호를 모르면 값을 만들어낼 수도 없다. 암호를 바꾸면 해시가 달라져 기존 쿠키는 자동으로 무효가 된다.
 */
export const AUTH_COOKIE = "fc_auth";

/**
 * 로그인 유지 기간 5분 — 로그인한 뒤 5분이 아니라 **마지막으로 화면을 연 뒤 5분**이다.
 * 미들웨어가 통과시킬 때마다 쿠키를 다시 심어 만료 시각을 뒤로 민다(lib과 middleware가 같은 값을 쓴다).
 * 공용 PC에 자리를 뜬 뒤 링크가 그대로 열리는 일이 없도록 짧게 두되, 보는 동안 끊기지는 않게 한 것이다.
 *
 * 탭 전환·월 선택은 브라우저 안에서 처리되어 서버를 부르지 않으므로 만료 시각도 밀리지 않는다.
 * 즉 한 화면을 5분 넘게 열어둔 뒤 새로고침하면 다시 묻는다.
 */
export const AUTH_MAX_AGE = 60 * 5;

/** Edge 런타임에도 있는 Web Crypto만 쓴다 (node:crypto는 미들웨어에서 못 쓴다). */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 길이가 같은 두 16진 문자열을 앞에서부터 끊지 않고 비교한다 (맞은 자릿수로 암호를 좁히지 못하도록). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
