<#
  "Summary 작성용.xlsx" → lib/summaryComments.ts 동기화.

  엑셀에서 Summary 문구를 고친 뒤 이 스크립트를 돌리면 대시보드가 쓰는 TS 파일이 다시 만들어진다.
      npm run sync:comments

  엑셀 시트(첫 번째 시트) 형식 — 헤더 1행 + 박스 1개당 1행:
      탭 | 기간 | 구분 | Summary
    · 탭     : Humax합계 / EVCS사업부 / Humax합계_상세 / 배부액 추이
    · 기간   : "6월"처럼 당월이면 당월 박스, "6월 누계"처럼 '누계'가 들어가면 누계 박스
    · 구분   : Humax합계_상세와 배부액 추이에서 사용 (STB / HUMAX(공통) / 건물). 나머지는 비워둔다
    · Summary: 한 셀 안에 Alt+Enter로 줄바꿈, 줄마다 "- "로 시작 (하이픈은 있어도 없어도 된다)

  [셀 안에서 쓰는 표기]
    · -   : 그 줄은 바로 윗줄의 하위 메모 — 한 칸 들여 짧은 선으로 표시한다
            (한 셀의 모든 줄이 '-'로 시작하면 예전 방식의 줄머리 기호로 보고 전부 상위로 둔다)
    · *   : 그 줄은 상세 코멘트 — 마커 없이 연한 회색으로 흐리게 깔린다 (가장 아래 단계)
    · []  : 그 자리에서 줄을 바꾼다 (한 항목 안에서 줄만 나뉘고, 새 항목이 되지는 않는다)

  추이 그래프의 보정 지점 메모도 여기서 관리한다 — 구분에 '월별 배부액 추이'를 적고
  줄마다 아래 형식으로 쓰면 SUMMARY_TREND_MEMOS로 나간다.
      [STB] 4월, 5월: STB License Fee/Nagra 4월 -84백만, 5월 +84백만 (선급비용 결산 조정 지연)
       ^계열  ^월(쉼표로 여러 개)  ^그 점에 커서를 올리면 뜨는 메모
  계열 이름은 그래프 범례와 같게 적는다 (STB / HUMAX(공통) / 건물). 이 행에서 '*'로 시작하는
  줄은 작성자용 메모로 보고 화면에 내보내지 않는다. 그래프 아래 '보정 내역' 머리글은
  lib/trendAdjustments.ts 값에서 자동 생성된다.

  엑셀 의존성 없이 xlsx(=zip+xml)를 직접 읽으므로, 파일이 엑셀에서 열려 있어도 동작한다.

  [문구 작성 기준] Summary에는 **수치로 확인되는 현상만** 적는다.
  'STB는 Closing 중', 'EVCS 국내는 철수 중', '사옥 이전에 따른 감소', '관리가 필요' 처럼
  사업 방향성·계획·처방을 적지 않는다 — 숫자로 확인할 수 없는 내용이고, 보고 문서에
  사업 방향을 단정해 적으면 안 되기 때문이다.
    O  1~3월 평균 278백만 → 4~6월 평균 126백만으로 4월부터 계단식으로 낮아졌습니다.
    X  1~3월 평균 278백만 → 4~6월 평균 126백만으로 사옥 이전에 따른 계단식 감소가 확인됩니다.
  원인을 적을 때도 조직·계정처럼 원장에서 집계되는 것만 쓴다.

  [문장 형태] 문장형이 아니라 **단어형**으로 적는다. '~입니다/~합니다'로 끝내지 않고 명사로 끊는다.
  절은 ' · ', 부연은 ' — ', 나열은 쉼표로 구분한다 (가운뎃점을 나열에도 쓰면 인쇄에서 하이픈처럼 보인다).
    O  누계 실적 15,549백만(집행률 97%) — 예산 내 집행
    O  본사 11,065백만(집행률 92%) 예산 대비 미달 · 법인 4,484백만(집행률 112%) 초과 — 방향 엇갈림
    O  항목별 집행률: 예산 초과 HUMAX(공통) 119%, EVCS(국내) 108% / 예산 미달 건물 67%, STB 90%
    X  누계 실적 15,549백만(집행률 97%)으로 예산 내에서 집행 중입니다.

  [표기 형식] 비율은 '집행률 N%'로 쓴다 ('예산 대비 N%'는 쓰지 않는다 — 초과/미달 표현과 헷갈린다).
  초과·미달을 말하는 문장에는 '예산 대비'(또는 '예산을')를 넣어 무엇과 비교한 것인지 남긴다.
    O  누계 실적 3,666백만(집행률 119%)으로 예산을 586백만 초과했습니다.
    O  본사 11,065백만(집행률 92%)은 예산 대비 미달, 법인 4,484백만(집행률 112%)은 초과로 방향이 엇갈립니다.
    O  항목별 집행률에서는 HUMAX(공통) 119%, EVCS(국내) 108%로 예산을 초과하였고, 건물 67%는 예산을 밑돕니다.
    X  누계 실적 3,666백만(예산 대비 119%) / 본사 11,065백만(집행률 92%)은 미달

  [매월 고정] 월이 바뀌어도 아래는 그대로 간다 (2026-08-25 확정).
    · MOBILITY는 항목별 집행률의 초과·미달 목록에서 뺀다 — 누계 300백만대라 집행률이 150%를 넘어도
      보고에서 다룰 규모가 아니다. 초과는 HUMAX(공통)·EVCS(국내), 미달은 건물·STB·EVCS(해외)가 기본이다.
    · EVCS 박스의 '개발 그룹 리소스 투입 변화: 해외→국내' 줄은 계속 유지한다 — 비중이 한두 %p
      오르내려도 1Q(국내 24%) 대비 구조가 바뀐 상태가 이어진다는 뜻이라 지우지 않는다.
    · 건물 상세의 'Ex 6월 …' 용인/분당 비용 구조 예시는 다시 계산해 갈아끼우지 않는다. 직접 쓴 예측이라
      그대로 두고, 그 달 증감 한 줄만 위에 덧붙인다.
#>
param(
  [string]$Xlsx,
  [string]$Out
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $Xlsx) { $Xlsx = Join-Path $repoRoot "Summary 작성용.xlsx" }
if (-not $Out) { $Out = Join-Path $repoRoot "lib\summaryComments.ts" }

if (-not (Test-Path -LiteralPath $Xlsx)) { throw "엑셀 파일을 찾을 수 없습니다: $Xlsx" }

# 엑셀에서 열어둔 채로 돌려도 되도록 항상 임시 복사본을 읽는다 (원본은 쓰기 잠금 상태일 수 있음).
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("fc-comments-" + [guid]::NewGuid().ToString("N") + ".xlsx")
Copy-Item -LiteralPath $Xlsx -Destination $tmp -Force

try {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($tmp)

  function Read-ZipEntry([string]$name) {
    $entry = $zip.Entries | Where-Object { $_.FullName -eq $name }
    if (-not $entry) { return $null }
    $reader = New-Object System.IO.StreamReader($entry.Open(), [System.Text.Encoding]::UTF8)
    try { return $reader.ReadToEnd() } finally { $reader.Close() }
  }

  # <si>/<t> 는 xml:space 속성 유무에 따라 문자열이거나 XmlElement 라서 양쪽 다 받아준다.
  function Get-XmlText($node) {
    if ($null -eq $node) { return "" }
    if ($node -is [string]) { return $node }
    if ($node.'#text') { return [string]$node.'#text' }
    return [string]$node.InnerText
  }

  $shared = New-Object System.Collections.Generic.List[string]
  $sharedXml = Read-ZipEntry "xl/sharedStrings.xml"
  if ($sharedXml) {
    foreach ($si in ([xml]$sharedXml).sst.si) {
      if ($si.r) {
        # 셀 안에서 서식이 나뉜 경우 조각(run)들을 이어붙인다.
        $shared.Add((($si.r | ForEach-Object { Get-XmlText $_.t }) -join ""))
      } else {
        $shared.Add((Get-XmlText $si.t))
      }
    }
  }

  # 첫 번째 시트를 관계(rels)로 찾아 실제 xml 경로를 얻는다.
  $wb = [xml](Read-ZipEntry "xl/workbook.xml")
  $rels = [xml](Read-ZipEntry "xl/_rels/workbook.xml.rels")
  $firstSheet = @($wb.workbook.sheets.sheet)[0]
  $relId = $firstSheet.GetAttribute("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
  $target = ($rels.Relationships.Relationship | Where-Object { $_.Id -eq $relId }).Target
  if (-not $target) { $target = "worksheets/sheet1.xml" }
  $target = $target -replace "^/xl/", "" -replace "^\.\./", ""

  $sheetXml = Read-ZipEntry ("xl/" + $target)
  if (-not $sheetXml) { throw "시트를 읽지 못했습니다: xl/$target" }

  # 시트를 행 순서대로 (행번호 + 열문자→값) 형태로 펼친다.
  # ※ [ordered]@{}는 정수 키를 '위치 인덱스'로 해석하므로 여기서는 리스트를 쓴다.
  $rows = New-Object System.Collections.Generic.List[object]
  foreach ($row in ([xml]$sheetXml).worksheet.sheetData.row) {
    $cells = @{}
    foreach ($c in $row.c) {
      $value = ""
      if ($c.t -eq "s") {
        $idx = [int](Get-XmlText $c.v)
        if ($idx -ge 0 -and $idx -lt $shared.Count) { $value = $shared[$idx] }
      } elseif ($c.t -eq "inlineStr") {
        $value = Get-XmlText $c.is.t
      } else {
        $value = Get-XmlText $c.v
      }
      $col = ($c.r -replace "[0-9]", "")
      $cells[$col] = $value
    }
    $rows.Add([pscustomobject]@{ Num = [int]$row.r; Cells = $cells })
  }
} finally {
  if ($zip) { $zip.Dispose() }
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
}

function Get-Cell($cells, [string]$col) {
  if ($cells -and $cells.ContainsKey($col)) { return ([string]$cells[$col]).Trim() }
  return ""
}

# 탭 이름 표기 흔들림(①, 공백, 대소문자)을 흡수한다.
function Normalize([string]$s) {
  return ($s -replace "[①②③④⑤\s]", "").ToLowerInvariant()
}

# 한 셀 안의 여러 줄을 항목 목록으로 자른다.
#
# '- '로 시작하는 줄은 바로 윗줄에 딸린 하위 메모다 — 화면에서 한 칸 들여 짧은 선으로 표시한다.
# 다만 예전에 쓰던 셀은 모든 줄이 '- '로 시작한다(그때는 그냥 줄머리 기호였다). 그런 셀은
# 하위가 하나도 없는 셈이라 전부 상위로 되돌린다 — 안 그러면 지난 달 문구가 통째로 하위가 된다.
# 하위로 남길 줄에는 '-'를, 상세 코멘트로 남길 줄에는 '*'를 앞에 붙여 넘긴다(화면이 이걸 보고 나눈다).
# "- " 처럼 뒤에 공백이 있을 때만 벗겨서, "-454는 ..." 같이 음수로 시작하는 문장이 망가지지 않게 한다.
# '[]'는 '여기서 줄을 바꿔라'는 표시라 실제 줄바꿈으로 바꾼다.
function Split-Lines([string]$text) {
  if (-not $text) { return @() }
  $raw = @($text -split "`r`n|`n|`r" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" })
  if ($raw.Count -eq 0) { return @() }
  $dashed = @($raw | Where-Object { $_ -match '^-\s+' })
  $allDashed = ($dashed.Count -eq $raw.Count)
  return @(
    $raw |
      ForEach-Object {
        $line = $_
        if ($line -match '^-\s+') {
          $line = $line -replace '^-\s+', ''
          if (-not $allDashed) { $line = '-' + $line }
        } else {
          $line = $line -replace "^[•·][ \t]*", ""
        }
        $line = $line -replace "^\*[ \t]*", "*"
        (($line -split "\[\]") | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }) -join "`n"
      } |
      Where-Object { $_ -ne "" }
  )
}

# 화면 상단 '보고 월'에 따라 Summary가 바뀌므로, 모든 내용을 월(B열)별로 나눠 담는다.
$boxesByMonth = @{}                                       # "6월" → @{ key = string[] }
$detailByMonth = @{}                                      # "6월" → List(구분, 줄들) — 시트 순서 유지
$trendByMonth = @{}                                       # "6월" → List(구분, 줄들) — '배부액 추이' 시트용
$trendMemos = New-Object System.Collections.Generic.List[object]   # '왜곡 수정ver' 그래프 보정 지점 메모 (월 무관)
$seenRows = 0

# 기간 표기에서 월만 뽑는다 — "6월" / "6월 누계" 모두 "6월"이 된다.
function Month-Of([string]$period) {
  $m = [regex]::Match($period, '([0-9]+)\s*월')
  if ($m.Success) { return $m.Groups[1].Value + "월" }
  return ""
}

foreach ($entry in $rows) {
  if ($entry.Num -eq 1) { continue }                      # 헤더
  $rowNum = $entry.Num
  $cells = $entry.Cells

  $tab = Get-Cell $cells "A"
  $period = Get-Cell $cells "B"
  $group = Get-Cell $cells "C"
  $lines = Split-Lines (Get-Cell $cells "D")

  if (-not $tab -or $lines.Count -eq 0) { continue }
  $seenRows++

  $tabKey = Normalize $tab
  # 보정 지점 메모 행은 구분('월별 배부액 추이')으로만 알아본다 — 어느 시트에 적어도 같은 곳으로 간다.
  $isTrendNote = ((Normalize $group) -like "*추이*")

  # '참고' 행만 월이 없어도 된다 (추이 그래프는 전체 기간을 그리므로).
  $month = Month-Of $period
  if (-not $month -and -not $isTrendNote) {
    throw "행 ${rowNum}: 기간(B열)에 월이 없습니다. '6월' 또는 '6월 누계'처럼 적어 주세요."
  }
  if ($month -and -not $boxesByMonth.ContainsKey($month)) {
    $boxesByMonth[$month] = @{}
    $detailByMonth[$month] = New-Object System.Collections.Generic.List[object]
    $trendByMonth[$month] = New-Object System.Collections.Generic.List[object]
  }

  if ($isTrendNote -or $tabKey -like "*상세*" -or $tabKey -like "*배부액*") {
    if (-not $group) { throw "행 ${rowNum}: 'Humax합계_상세' / '배부액 추이'는 구분(C열)이 비어 있으면 안 됩니다." }
    if ($isTrendNote) {
      if ($trendMemos.Count -gt 0) { throw "행 ${rowNum}: '월별 배부액 추이' 행이 두 번 나옵니다. 한 행에 모아 주세요." }
      foreach ($line in $lines) {
        # '*' 줄은 작성자용 메모(지시문)라 화면에 내보내지 않는다.
        if ($line.StartsWith("*")) { continue }
        $m = [regex]::Match($line, '^\[([^\]]+)\]\s*([^:\uFF1A\n]+)[:\uFF1A]\s*([\s\S]+)$')
        if (-not $m.Success) {
          Write-Warning ("행 {0}: '[STB] 4월, 5월: 내용' 형식이 아니라 건너뜁니다 - {1}" -f $rowNum, $line)
          continue
        }
        $memoMonths = @($m.Groups[2].Value -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" })
        $trendMemos.Add([pscustomobject]@{
          Series = $m.Groups[1].Value.Trim()
          Months = $memoMonths
          Text   = $m.Groups[3].Value.Trim()
        })
      }
    } elseif ($tabKey -like "*배부액*") {
      $trendByMonth[$month].Add([pscustomobject]@{ Label = $group; Lines = $lines })
    } else {
      $detailByMonth[$month].Add([pscustomobject]@{ Label = $group; Lines = $lines })
    }
  } elseif ($tabKey -like "*evcs*") {
    $boxesByMonth[$month]["evcs"] = $lines
  } elseif ($tabKey -like "*humax*") {
    if ($period -like "*누계*") { $boxesByMonth[$month]["humax_total_cum"] = $lines }
    else { $boxesByMonth[$month]["humax_total_month"] = $lines }
  } else {
    throw "행 ${rowNum}: 알 수 없는 탭 이름 '$tab' (Humax합계 / EVCS사업부 / Humax합계_상세 / 배부액 추이 중 하나여야 합니다)"
  }
}

if ($seenRows -eq 0) { throw "엑셀에서 읽어온 Summary가 한 줄도 없습니다. 시트 형식을 확인해 주세요." }

# 월 오름차순 — 생성 파일을 읽을 때 순서가 뒤섞이지 않게 한다.
$months = @($boxesByMonth.Keys | Sort-Object { [int]($_ -replace '[^0-9]', '') })

# 어떤 달을 반쯤 적어두면 화면에서 일부 박스만 나와 이상해 보이므로, 그 달은 통째로 비워야 한다.
foreach ($mo in $months) {
  $have = @("humax_total_month", "humax_total_cum", "evcs") | Where-Object { $boxesByMonth[$mo].ContainsKey($_) }
  $missing = @("humax_total_month", "humax_total_cum", "evcs") | Where-Object { -not $boxesByMonth[$mo].ContainsKey($_) }
  if ($missing.Count -gt 0 -and $have.Count -gt 0) {
    throw "$mo : Summary 박스가 일부만 적혀 있습니다 (빠진 것: $($missing -join ', ')). 그 달은 전부 적거나 전부 비워 주세요."
  }
}

function Escape-TS([string]$s) {
  # 백슬래시 → 따옴표 → 줄바꿈 순서로 바꾼다 (앞에서 만든 escape를 뒤에서 다시 건드리지 않도록).
  return $s.Replace("\", "\\").Replace('"', '\"').Replace("`r", "").Replace("`n", "\n")
}

$sb = New-Object System.Text.StringBuilder
function W([string]$line) { [void]$sb.AppendLine($line) }

W '/**'
W ' * Summary① ~ ③ 탭의 [Summary] 박스 문구 (경영진 보고용 고정 텍스트).'
W ' *'
W ' * ⚠️ 이 파일은 프로젝트 루트의 "Summary 작성용.xlsx"에서 자동 생성됩니다. 직접 고치지 마세요.'
W ' *    문구를 바꾸려면 엑셀을 수정한 뒤 `npm run sync:comments`를 실행합니다.'
W ' *'
W ' * 화면 상단 "보고 월"에 따라 표와 함께 문구도 바뀌어야 하므로 월별로 나눠 담는다.'
W ' * 문구가 없는 달은 키 자체가 없고, 그 달에는 Summary 박스를 표시하지 않는다.'
W ' */'
W 'export type SummaryCommentKey ='
W '  | "humax_total_month"'
W '  | "humax_total_cum"'
W '  | "evcs";'
W ''
W '/**'
W ' * Humax합계_상세의 Summary — 배부 항목별로 나눠서 관리한다.'
W ' * 각 항목의 누계 집행률과 월별 배부액 흐름을 수치로 확인하는 용도다.'
W ' */'
W 'export type SummaryCommentGroup = { label: string; lines: string[] };'
W ''
W '/**'
W ' * 월("6월") → 배부 항목별 Summary. 수치는 그 달의 누계 실적/예산 기준이다 (단위: 백만원).'
W ' * 판단 기준 — 누계 예산 대비 차이가 1억원 이상인 조직·계정만 기재하고, 항목당 2~3줄로 줄인다'
W ' * (첫 줄: 누계 집행률, 둘째 줄: 그 차이를 만든 원인). 매월 실적이 갱신되면 같은 기준으로 다시 뽑아 교체한다.'
W ' */'
W 'export const SUMMARY_DETAIL_GROUPS: Record<string, SummaryCommentGroup[]> = {'
foreach ($mo in $months) {
  if ($detailByMonth[$mo].Count -eq 0) { continue }
  W ("  `"" + (Escape-TS $mo) + "`": [")
  foreach ($g in $detailByMonth[$mo]) {
    W '    {'
    W ("      label: `"" + (Escape-TS $g.Label) + "`",")
    W '      lines: ['
    foreach ($line in $g.Lines) { W ("        `"" + (Escape-TS $line) + "`",") }
    W '      ],'
    W '    },'
  }
  W '  ],'
}
W '};'
W ''
W '/**'
W " * '배부액 추이' 시트의 Summary — 추이 그래프에서 읽히는 것을 배부 항목별로 적는다."
W ' * (같은 항목이라도 Humax합계_상세는 계정·조직 관점, 여기는 월별 흐름 관점으로 나눠 쓴다.)'
W ' */'
W 'export const SUMMARY_TREND_GROUPS: Record<string, SummaryCommentGroup[]> = {'
foreach ($mo in $months) {
  if ($trendByMonth[$mo].Count -eq 0) { continue }
  W ("  `"" + (Escape-TS $mo) + "`": [")
  foreach ($g in $trendByMonth[$mo]) {
    W '    {'
    W ("      label: `"" + (Escape-TS $g.Label) + "`",")
    W '      lines: ['
    foreach ($line in $g.Lines) { W ("        `"" + (Escape-TS $line) + "`",") }
    W '      ],'
    W '    },'
  }
  W '  ],'
}
W '};'
W ''
W '/**'
W " * '월별 배부액 추이' 그래프의 보정 지점에 붙는 메모."
W ' *'
W ' * 그래프에서 점을 키워 표시한 보정 지점에 커서를 올리면 이 문구가 뜬다. 무엇을 어떻게'
W ' * 되돌렸는지는 그래프 아래 한 줄(보정 내역)로만 밝히고, 자세한 내용은 여기로 옮겨'
W ' * 그림을 가리지 않게 했다. 보정 자체(움직인 금액)는 lib/trendAdjustments.ts가 갖고 있다.'
W ' */'
W 'export type SummaryTrendMemo = { series: string; months: string[]; text: string };'
W ''
W 'export const SUMMARY_TREND_MEMOS: SummaryTrendMemo[] = ['
foreach ($memo in $trendMemos) {
  $monthList = ($memo.Months | ForEach-Object { '"' + (Escape-TS $_) + '"' }) -join ", "
  W ('  { series: "' + (Escape-TS $memo.Series) + '", months: [' + $monthList + '], text: "' + (Escape-TS $memo.Text) + '" },')
}
W '];'
W ''
W '/** 월("6월") → Summary①·② 박스 문구. */'
W 'export const SUMMARY_COMMENTS: Record<string, Partial<Record<SummaryCommentKey, string[]>>> = {'
foreach ($mo in $months) {
  if ($boxesByMonth[$mo].Count -eq 0) { continue }
  W ("  `"" + (Escape-TS $mo) + "`": {")
  foreach ($key in @("humax_total_month", "humax_total_cum", "evcs")) {
    if (-not $boxesByMonth[$mo].ContainsKey($key)) { continue }
    W ("    " + $key + ": [")
    foreach ($line in $boxesByMonth[$mo][$key]) { W ("      `"" + (Escape-TS $line) + "`",") }
    W '    ],'
  }
  W '  },'
}
W '};'

# TS 파일은 BOM 없는 UTF-8 + LF 로 쓴다 (레포의 나머지 소스와 동일).
# .NET API는 셸의 현재 폴더를 모르므로 상대 경로를 미리 절대 경로로 바꿔둔다.
$Out = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine((Get-Location).ProviderPath, $Out))
$text = $sb.ToString() -replace "`r`n", "`n"
[System.IO.File]::WriteAllText($Out, $text, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "동기화 완료 → $Out"
foreach ($mo in $months) {
  $b = $boxesByMonth[$mo]
  $parts = @("humax_total_month", "humax_total_cum", "evcs") |
    ForEach-Object { if ($b.ContainsKey($_)) { "{0} {1}줄" -f $_, $b[$_].Count } }
  $det = ($detailByMonth[$mo] | ForEach-Object { "{0} {1}줄" -f $_.Label, $_.Lines.Count }) -join ", "
  Write-Host ("  [{0}] {1}" -f $mo, ($parts -join ", "))
  if ($det) { Write-Host ("        상세: {0}" -f $det) }
  $trd = ($trendByMonth[$mo] | ForEach-Object { "{0} {1}줄" -f $_.Label, $_.Lines.Count }) -join ", "
  if ($trd) { Write-Host ("        추이: {0}" -f $trd) }
}
Write-Host ("  월별 배부액 추이(메모) : {0}건 (월 무관)" -f $trendMemos.Count)
