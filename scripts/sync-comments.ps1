<#
  "Summary 작성용.xlsx" → lib/summaryComments.ts 동기화.

  엑셀에서 Summary 문구를 고친 뒤 이 스크립트를 돌리면 대시보드가 쓰는 TS 파일이 다시 만들어진다.
      npm run sync:comments

  엑셀 시트(첫 번째 시트) 형식 — 헤더 1행 + 박스 1개당 1행:
      탭 | 기간 | 구분 | Summary
    · 탭     : Humax합계 / EVCS사업부 / Humax합계_상세
    · 기간   : "6월"처럼 당월이면 당월 박스, "6월 누계"처럼 '누계'가 들어가면 누계 박스
    · 구분   : Humax합계_상세에서만 사용 (STB / HUMAX(공통) / 건물). 나머지는 비워둔다
    · Summary: 한 셀 안에 Alt+Enter로 줄바꿈, 줄마다 "- "로 시작 (하이픈은 있어도 없어도 된다)

  '왜곡 수정ver' 그래프 하단 노트도 여기서 관리한다 — 탭에 'Humax합계_상세',
  구분에 '월별 배부액 추이'를 적으면 SUMMARY_TREND_NOTE로 나간다. 이 줄들은 그래프 아래
  '참고' 블록에 그대로 붙고, 그 위의 '보정 내역'은 lib/trendAdjustments.ts에서 자동 생성된다
  (보정 수치와 설명이 어긋나지 않도록 자동 생성분은 엑셀로 덮지 않는다).

  엑셀 의존성 없이 xlsx(=zip+xml)를 직접 읽으므로, 파일이 엑셀에서 열려 있어도 동작한다.
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

# 한 셀 안의 여러 줄을 불릿 목록으로 자른다. 줄머리 기호(-, ·, •, *)와 공백은 떼어낸다.
# "- " 처럼 뒤에 공백이 있을 때만 벗겨서, "-454는 ..." 같이 음수로 시작하는 문장이 망가지지 않게 한다.
function Split-Lines([string]$text) {
  if (-not $text) { return @() }
  return @(
    $text -split "`r`n|`n|`r" |
      ForEach-Object { ($_ -replace "^\s*(?:[-*][ \t]+|[•·][ \t]*)", "").Trim() } |
      Where-Object { $_ -ne "" }
  )
}

# 화면 상단 '보고 월'에 따라 Summary가 바뀌므로, 모든 내용을 월(B열)별로 나눠 담는다.
$boxesByMonth = @{}                                       # "6월" → @{ key = string[] }
$detailByMonth = @{}                                      # "6월" → List(구분, 줄들) — 시트 순서 유지
$trendNote = @()                                          # '왜곡 수정ver' 그래프 하단 '참고' (월 무관)
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
  $isTrendNote = ($tabKey -like "*상세*") -and ((Normalize $group) -like "*추이*")

  # '참고' 행만 월이 없어도 된다 (추이 그래프는 전체 기간을 그리므로).
  $month = Month-Of $period
  if (-not $month -and -not $isTrendNote) {
    throw "행 ${rowNum}: 기간(B열)에 월이 없습니다. '6월' 또는 '6월 누계'처럼 적어 주세요."
  }
  if ($month -and -not $boxesByMonth.ContainsKey($month)) {
    $boxesByMonth[$month] = @{}
    $detailByMonth[$month] = New-Object System.Collections.Generic.List[object]
  }

  if ($tabKey -like "*상세*") {
    if (-not $group) { throw "행 ${rowNum}: 'Humax합계_상세'는 구분(C열)이 비어 있으면 안 됩니다." }
    if ($isTrendNote) {
      if ($trendNote.Count -gt 0) { throw "행 ${rowNum}: '월별 배부액 추이' 행이 두 번 나옵니다. 한 행에 모아 주세요." }
      $trendNote = $lines
    } else {
      $detailByMonth[$month].Add([pscustomobject]@{ Label = $group; Lines = $lines })
    }
  } elseif ($tabKey -like "*evcs*") {
    $boxesByMonth[$month]["evcs"] = $lines
  } elseif ($tabKey -like "*humax*") {
    if ($period -like "*누계*") { $boxesByMonth[$month]["humax_total_cum"] = $lines }
    else { $boxesByMonth[$month]["humax_total_month"] = $lines }
  } else {
    throw "행 ${rowNum}: 알 수 없는 탭 이름 '$tab' (Humax합계 / EVCS사업부 / Humax합계_상세 중 하나여야 합니다)"
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
  return $s.Replace("\", "\\").Replace('"', '\"')
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
W ' * 각 항목은 "이렇게 움직여야 정상"이라는 방향성이 있어, 매월 추이가 그 방향과 맞는지 확인하는 용도다.'
W ' *   STB        : Closing 사업 — 계속 줄어 결국 사라져야 함'
W ' *   HUMAX(공통) : 감소 추세인지 관리 필요'
W ' *   건물        : 사옥 이전에 따라 계단식으로 떨어져야 함'
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
W " * '월별 배부액 추이 (왜곡 수정ver)' 그래프 하단 '참고' 블록."
W ' *'
W ' * 그 위의 "보정 내역"은 lib/trendAdjustments.ts 값에서 자동 생성된다 — 차트를 움직인 숫자와'
W ' * 설명이 어긋나면 안 되기 때문이다. 여기에는 보정 대상이 아닌 것(제 달에 제대로 기표됐지만'
W ' * 반복되지 않는 일회성 비용 등), 즉 그래프는 그대로 두고 말로만 짚어야 할 내용을 적는다.'
W ' * 비어 있으면 참고 블록 자체가 표시되지 않는다.'
W ' */'
W 'export const SUMMARY_TREND_NOTE: string[] = ['
foreach ($line in $trendNote) { W ("  `"" + (Escape-TS $line) + "`",") }
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
}
Write-Host ("  월별 배부액 추이(참고) : {0}줄 (월 무관)" -f $trendNote.Count)
