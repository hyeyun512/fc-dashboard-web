import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, sha256Hex, timingSafeEqual } from "@/lib/auth";

/**
 * 암호를 통과하지 못하면 대시보드를 **서버에서** 막는다.
 *
 * 화면단에서 가리는 방식으로는 소용이 없다 — 이 대시보드는 Supabase에서 읽은 숫자를 서버에서
 * HTML로 그려 내려주므로, 화면만 가려도 '페이지 소스 보기'에 실적이 그대로 남는다.
 * 미들웨어에서 막으면 암호가 없는 요청에는 데이터가 담긴 HTML 자체가 만들어지지 않는다.
 *
 * 암호는 Vercel 환경변수 `DASHBOARD_PASSWORD`에 둔다. 값이 없으면 열어두지 않고 막는다 —
 * 설정을 빠뜨렸을 때 조용히 무방비로 공개되는 쪽이 훨씬 위험하기 때문이다(로그인 화면이 안내한다).
 */
export async function middleware(req: NextRequest) {
  const expected = process.env.DASHBOARD_PASSWORD;
  const cookie = req.cookies.get(AUTH_COOKIE)?.value;

  if (expected && cookie && timingSafeEqual(cookie, await sha256Hex(expected))) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  // 로그인 뒤 원래 보려던 곳으로 돌려보낸다.
  url.searchParams.set("from", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // 로그인 화면과 그 API, 정적 파일은 막지 않는다 (막으면 로그인 자체를 할 수 없다).
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};
