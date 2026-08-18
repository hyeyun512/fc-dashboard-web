"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 열람 암호 입력 화면. 암호 확인은 서버(/api/login)에서 하고, 여기서는 값을 보내고 결과만 보여준다
 * — 화면단에서 비교하면 암호가 브라우저 번들에 그대로 실린다.
 */
export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        // useSearchParams를 쓰면 이 화면이 서버에서 비어 나와 JS 로드 전까지 흰 화면이 된다.
        // 돌아갈 곳은 제출 시점에만 필요하므로 주소에서 직접 읽는다.
        const from = new URLSearchParams(window.location.search).get("from");
        // 열린 뒤에는 서버가 다시 그려야 하므로 replace + refresh 로 되돌아간다.
        router.replace(from && from.startsWith("/") ? from : "/");
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(
        body.error === "not_configured"
          ? "암호가 아직 설정되지 않았습니다. Vercel 환경변수 DASHBOARD_PASSWORD를 추가한 뒤 다시 배포해 주세요."
          : "암호가 올바르지 않습니다."
      );
    } catch {
      setError("연결에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-badge">
          <span className="login-dot" />
          CONFIDENTIAL
        </div>
        <h1 className="login-title">고정비 실적 대시보드 2026</h1>
        <p className="login-desc">
          이 대시보드는 열람 권한이 있는 경우에만 볼 수 있습니다.
          <br />
          전달받은 암호를 입력하세요.
        </p>

        <div className="login-field">
          <input
            id="pw"
            type={show ? "text" : "password"}
            placeholder="암호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
          />
          <button type="button" className="login-peek" onClick={() => setShow((v) => !v)}>
            {show ? "숨기기" : "보기"}
          </button>
        </div>

        <button type="submit" className="login-submit" disabled={busy || !password}>
          {busy ? "확인 중…" : "열기"}
        </button>

        {error ? <p className="login-error">{error}</p> : null}

        <p className="login-foot">무단 배포·복제를 금합니다. 암호를 분실한 경우 작성자에게 문의하세요.</p>
      </form>
    </div>
  );
}
