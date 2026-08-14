# 고정비 실적 대시보드 2026 (Vercel 배포용)

Supabase의 `26년 예산(BP)` / `26년 실적_N월 누계` 테이블을 매 요청마다 실시간으로 조회해서
그리는 Next.js 대시보드입니다. **Supabase에 새 실적을 올리고 사이트를 새로고침하면 바로 반영됩니다** —
매달 파일을 다시 만들어 배포할 필요가 없습니다.

## 구조

- `app/page.tsx` — 서버 컴포넌트. 요청마다 `lib/aggregate.ts`로 Supabase에서 데이터를 가져옵니다 (`force-dynamic`, 캐시 없음).
- `lib/supabaseAdmin.ts` — `service_role` 키로 Supabase에 접속하는 서버 전용 클라이언트. **절대 클라이언트 컴포넌트에서 import하지 마세요.**
- `lib/aggregate.ts` — 실적/예산 원본 행을 가져와 Summary/계정별/EVCS 탭에 필요한 형태로 집계합니다.
- `components/Dashboard.tsx` + `lib/dashboardClient.ts` — 브라우저에서 그려지는 실제 대시보드 UI (탭, 월 선택, 당월/누계 토글, 차트).
- `app/globals.css` — 디자인(휴맥스 결산 대시보드 스타일 참고).
- `코멘트 작성용.xlsx` + `scripts/sync-comments.ps1` — Summary 코멘트 원본과 동기화 스크립트 (아래 "Summary 코멘트 관리" 참고).

## 왜 "서버 경유"인가

`SUPABASE_SERVICE_ROLE_KEY`는 Supabase의 RLS(행 수준 보안)를 우회하는 강력한 키라서 브라우저에 노출되면 안 됩니다.
이 프로젝트는 이 키를 서버 컴포넌트(`app/page.tsx`)에서만 사용하고, 브라우저에는 최종 집계된 숫자만 내려줍니다.
`NEXT_PUBLIC_` 접두사가 붙지 않은 환경변수는 Next.js가 자동으로 브라우저 번들에서 제외합니다.

## 로컬 실행

```bash
npm install
cp .env.local.example .env.local
# .env.local 을 열어 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 입력
npm run dev
# http://localhost:3000 접속
```

`SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`는 Supabase 대시보드 → 해당 프로젝트 → **Project Settings → API**
에서 확인할 수 있습니다 (Project URL / service_role secret).

## GitHub에 올리기

```bash
cd fc-dashboard-web   # 이 폴더
git init
git add .
git commit -m "고정비 실적 대시보드 2026 초기 커밋"
git branch -M main
git remote add origin <당신의 GitHub 저장소 URL>
git push -u origin main
```

`.gitignore`에 `node_modules`, `.env`, `.env.local`이 이미 포함되어 있어 민감한 키가 실수로 커밋되지 않습니다.

## Vercel 배포

1. [vercel.com](https://vercel.com) 에서 방금 만든 GitHub 저장소를 Import 합니다 (New Project → Import Git Repository).
2. **Environment Variables**에 아래 두 개를 추가합니다 (Production / Preview / Development 모두 체크 권장):
   - `SUPABASE_URL` = `https://acpfapffygogtdufssko.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = (Supabase 대시보드에서 복사한 service_role 키)
3. Deploy 클릭. 빌드가 끝나면 `https://<프로젝트명>.vercel.app` 형태의 URL이 생깁니다.
4. 이후 Supabase에 새 월 실적을 업로드한 뒤 이 URL을 새로고침하면, 서버가 매 요청마다 최신 데이터를 다시 조회하므로 바로 반영됩니다.

### 접근 권한

현재는 "링크를 아는 사람 누구나" 볼 수 있도록 별도 인증 없이 배포됩니다. 나중에 접근을 제한하고 싶어지면:

- 가장 간단한 방법: Vercel 프로젝트 Settings → **Deployment Protection → Password Protection** (Vercel Pro 플랜 필요)
- 또는 이메일 기반 제한: Vercel의 **Authentication** 기능 사용
- 직접 구현: `middleware.ts`를 추가해 쿠키/헤더 기반 간단한 비밀번호 체크를 넣을 수 있습니다 (필요하시면 말씀해주세요, 이어서 만들어드리겠습니다).

## 월별 실적 테이블 자동 탐색

`26년 실적_N월 누계` 테이블은 매달 새 이름으로 만들어질 수 있습니다. 이를 위해 Supabase에 아래 함수를 만들어 두었습니다
(이미 적용되어 있어 별도 작업 불필요, 참고용):

```sql
create or replace function public.fc_latest_actual_table()
returns text language sql stable security definer set search_path = public as $$
  select table_name from information_schema.tables
  where table_schema = 'public' and table_name ~ '^26년 실적_[0-9]+월 누계$'
  order by (regexp_match(table_name, '_([0-9]+)월'))[1]::int desc
  limit 1;
$$;
```

`lib/aggregate.ts`가 매 요청마다 이 함수를 호출해 가장 최근 테이블을 자동으로 찾습니다.
즉, 다음 달 실적을 새 테이블(`26년 실적_6월 누계` 등)로 올리기만 하면 대시보드가 알아서 그 테이블을 사용합니다.
(만약 앞으로는 같은 테이블에 계속 append 하는 방식으로 바뀌어도 이 함수는 문제없이 동작합니다.)

## Summary 코멘트 관리

Summary① ~ ③ 탭의 파란 [Summary] 박스 문구는 데이터에서 자동 계산되는 값이 아니라 **사람이 쓰는 보고용 문장**입니다.
이 문장은 프로젝트 루트의 **`코멘트 작성용.xlsx`** 에서 관리하고, 스크립트로 `lib/summaryComments.ts`에 반영합니다.

### 엑셀 시트 형식

첫 번째 시트(`코멘트`)에 헤더 1행 + 코멘트 박스 1개당 1행:

| 탭 | 기간 | 구분 | 코멘트 |
| --- | --- | --- | --- |
| Humax합계 | 6월 | | `- 첫 번째 문장`<br>`- 두 번째 문장` |
| Humax합계 | 6월 누계 | | `- …` |
| EVCS사업부 | 6월 누계 | | `- …` |
| Humax합계_상세 | 6월 누계 | STB | `- …` |
| Humax합계_상세 | 6월 누계 | HUMAX(공통) | `- …` |
| Humax합계_상세 | 6월 누계 | 건물 | `- …` |

- **탭** — `Humax합계` / `EVCS사업부` / `Humax합계_상세` 중 하나. `①` 같은 기호나 앞뒤 공백은 무시됩니다.
- **기간** — `누계`가 들어가면 누계(YTD) 박스, 아니면 당월 박스로 들어갑니다.
  `Humax합계`는 당월·누계 두 박스가 따로 있으므로 두 행 모두 필요합니다.
- **구분** — `Humax합계_상세`에서만 씁니다. 이 값이 화면에서 굵은 소제목(STB / HUMAX(공통) / 건물)이 되고,
  **시트에 적힌 순서 그대로** 화면에 표시됩니다. 나머지 탭은 비워 둡니다.
- **코멘트** — 한 셀 안에서 `Alt+Enter`로 줄을 나누면 각 줄이 불릿 한 개가 됩니다.
  줄머리의 `-`, `·`, `•`, `*` 는 있어도 없어도 되고, 빈 줄은 무시됩니다.

줄 수는 자유지만, 인쇄 레이아웃 기준으로 박스당 **3줄 이내**(상세는 구분당 2줄)가 적당합니다.

### 반영하기

엑셀을 저장한 뒤 (엑셀을 닫지 않아도 됩니다):

```bash
npm run sync:comments
```

`lib/summaryComments.ts`가 다시 생성되고, `npm run dev` 또는 다음 배포부터 화면에 반영됩니다.
시트 형식이 잘못됐으면 어느 행이 문제인지 알려주며 **파일을 건드리지 않고 중단**하므로, 반쯤 깨진 상태가 되지 않습니다.

> `lib/summaryComments.ts`는 자동 생성 파일입니다. 직접 고치면 다음 동기화 때 덮어써집니다.

## 대시보드 구성

- 상단: 월 선택 콤보박스(항상 최신월이 기본 선택) + 당월/누계(YTD) 토글
- ① **Humax(전사)**: 전체 KPI, 월별 실적 추이(예산 vs 실적 + 집행률 콤보 차트), 계정과목별 구성비(도넛), 본사·법인 비교, 보고용(re) 부문별 상세
- ② **계정별**: 구분별(6개 카테고리) 실적 vs 예산, 지급수수료 상세(대계정별) + 추이
- ③ **EVCS**: 국내/해외 KPI, 월별 실적 추이(콤보), 계정과목별 구성비(도넛), 국내·해외 추이, 구분별 상세, 인증대행료 상세 + 초과집행 경고

차트는 Chart.js를 npm 패키지로 정식 사용합니다(오프라인 걱정 없음). 차트 생성이 실패해도 표/KPI는 항상 먼저 렌더링되도록
설계되어 있어 화면이 통째로 비어 보이는 문제가 생기지 않습니다.
