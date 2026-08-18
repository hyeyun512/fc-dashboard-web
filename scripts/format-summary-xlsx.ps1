<#
  "Summary 작성용.xlsx"에 짝수 월(2·4·6·8·10·12월) 행만 연한 배경을 넣어 월 경계를 눈에 띄게 한다.

      npm run format:summary

  한 달이 6행(당월·누계·EVCS·STB·HUMAX(공통)·건물)씩 이어져 어디서 달이 바뀌는지 보이지 않아,
  줄무늬처럼 한 달 걸러 칠해 구분한다. 내용은 건드리지 않고 배경색만 다시 칠하므로 몇 번을 돌려도 같다.

  행을 추가하거나 문구를 다시 뽑은 뒤에 한 번 돌려주면 서식이 유지된다.
  (기간이 비어 있는 '월별 배부액 추이' 참고 행은 월과 무관하므로 칠하지 않는다.)

  서식을 쓰려면 엑셀이 필요하다. 파일이 열려 있어도 되지만, 다른 문서를 편집 중이면
  엑셀이 잠시 응답을 거부할 수 있어 몇 번 다시 시도한다.
#>
param(
  [string]$Xlsx
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $Xlsx) { $Xlsx = Join-Path $repoRoot "Summary 작성용.xlsx" }
if (-not (Test-Path -LiteralPath $Xlsx)) { throw "엑셀 파일을 찾을 수 없습니다: $Xlsx" }
$target = (Resolve-Path -LiteralPath $Xlsx).Path

# 연한 청회색. 인쇄해도 글자를 가리지 않을 만큼만 옅게 준다. (Excel은 BGR 순서로 색을 받는다)
$SHADE = 247 * 65536 + 242 * 256 + 238   # RGB(238,242,247)
$NO_FILL = -4142                          # xlNone

function Invoke-WithRetry([scriptblock]$Action) {
  for ($i = 1; $i -le 10; $i++) {
    try { return & $Action }
    catch {
      # 엑셀이 편집 중이면 COM 호출을 거부한다(RPC_E_CALL_REJECTED). 잠깐 뒤 다시 시도한다.
      if ($i -eq 10) { throw }
      Start-Sleep -Milliseconds 1200
    }
  }
}

$excel = $null
$startedExcel = $false
try { $excel = [Runtime.InteropServices.Marshal]::GetActiveObject("Excel.Application") } catch { $excel = $null }
if (-not $excel) { $excel = New-Object -ComObject Excel.Application; $startedExcel = $true }
$excel.DisplayAlerts = $false

$wb = $null
foreach ($open in $excel.Workbooks) { if ($open.FullName -eq $target) { $wb = $open; break } }
if (-not $wb) { $wb = Invoke-WithRetry { $excel.Workbooks.Open($target) } }
$ws = $wb.Worksheets.Item(1)

$used = $ws.UsedRange
$lastRow = $used.Row + $used.Rows.Count - 1
if ($lastRow -lt 2) { throw "칠할 데이터 행이 없습니다." }

$shaded = 0
for ($r = 2; $r -le $lastRow; $r++) {
  $period = [string](Invoke-WithRetry { $ws.Cells.Item($r, 2).Text })
  $m = [regex]::Match($period, "([0-9]+)\s*월")
  $range = $ws.Range($ws.Cells.Item($r, 1), $ws.Cells.Item($r, 4))
  # 매번 지웠다 다시 칠해, 행이 밀리거나 월이 바뀌어도 결과가 항상 같게 만든다.
  if ($m.Success -and ([int]$m.Groups[1].Value % 2 -eq 0)) {
    Invoke-WithRetry { $range.Interior.Color = $SHADE }
    $shaded++
  } else {
    Invoke-WithRetry { $range.Interior.ColorIndex = $NO_FILL }
  }
}

Invoke-WithRetry { $wb.Save() }
Write-Host ("서식 적용 완료 → {0}" -f $target)
Write-Host ("  짝수 월 음영 처리: {0}행 / 전체 {1}행" -f $shaded, ($lastRow - 1))

if ($startedExcel) { $wb.Close($true); $excel.Quit() }
