# level-series.ps1 — 레벨 시계열을 위한 야간 반복 실행기 (드리프트 문서 12절 실험 10)
#
# 왜 이 모양인가
# --------------
# 실험 6(perf-session-drift.md 8-b절)이 밝힌 것은 성능 레벨이 **시간당 규모로 양방향**
# 움직인다는 것이다. 그러면 필요한 것은 한 세트를 길게 재는 것이 아니라 레벨을 자주
# 찍는 것이다. 세트 안 CV 가 7.07% 이므로 3회면 레벨 추정 표준오차가 약 4% 로, 관측된
# 28~48% 이동을 충분히 분해한다.
#
# 세트(약 37분)와 유휴(60분)를 번갈아 둔다. 유휴 구간이 있어야 같이 도는
# idle-bench-logger 가 **부하 없는** 환경 표본을 남길 수 있다(실험 11). 두 실험이 한
# 스케줄로 동시에 진행되는 셈이다.
#
# 고아 컨테이너 방어
# ------------------
# 이전 세트가 비정상 종료하면 `perf-k6` 컨테이너가 남고, 다음 세트는 같은 이름을 만들 수
# 없어 Docker 종료 코드 125 로 통째로 실패한다(실제로 겪었다 — overnight-execution-fixes
# 문서의 수정 4). 그래서 매 세트 앞에서 고아를 먼저 걷어낸다.
#
# 중단 방법
#   New-Item "reports\overnight\STOP-LEVEL" -ItemType File
#   (다음 세트 시작 전에 스스로 멈춘다. 즉시 멈추려면 프로세스를 종료한다.)

$perf = "C:\Users\user\Desktop\projects\highteen\highteenday-backend\performance"
$node = "C:\Users\user\AppData\Local\nvm\v22.23.1\node.exe"
$stop = Join-Path $perf "reports\overnight\STOP-LEVEL"

Set-Location $perf
$i = 2
$fails = 0

while ($true) {
    if (Test-Path $stop) {
        Write-Output "$(Get-Date -Format s) STOP 파일 감지 — 종료"
        break
    }

    # 고아 부하 컨테이너 제거. 없을 때 오류를 내지 않도록 존재를 먼저 확인한다.
    $orphan = docker ps -aq -f name=perf-k6
    if ($orphan) {
        Write-Output "$(Get-Date -Format s) 고아 perf-k6 제거: $orphan"
        docker rm -f perf-k6 | Out-Null
    }
    # 비정상 종료로 남은 실행 잠금도 걷어낸다. 살아 있는 실행이 있으면 애초에 여기 오지 않는다.
    Remove-Item (Join-Path $env:TEMP "highteenday-perf-run-*.lock") -ErrorAction SilentlyContinue

    $log = Join-Path $perf ("reports\overnight\level-set-{0:D2}.log" -f $i)
    Write-Output "$(Get-Date -Format s) 세트 #$i 시작 -> $log"

    # 시나리오 경로는 **슬래시**여야 한다. 이 인자는 Windows 가 아니라 컨테이너 안의 k6 가
    # 받으므로, 역슬래시로 주면 리눅스에서 파일을 찾지 못해 k6 가 종료 코드 255 로 죽는다.
    # 2026-08-19 밤에 이걸로 세트 9개가 통째로 무효가 됐다.
    & $node tools/repeatability.js scenarios/normal-day.js --runs 3 `
        --warmup 180 --hold 5m --dataset medium --env perf `
        --loadgen docker --reset restart `
        --note "레벨 시계열 세트 #$i — 실험 10" > $log 2>&1
    $code = $LASTEXITCODE

    Write-Output "$(Get-Date -Format s) 세트 #$i 종료 (exit $code)"

    # 실패가 이어지면 멈춘다. 밤새 같은 실패를 반복해 시간만 버리는 것을 막는다
    # (overnight-runner 의 수정 5 와 같은 취지).
    if ($code -ne 0) {
        $fails++
        if ($fails -ge 2) {
            Write-Output "$(Get-Date -Format s) 연속 $fails 회 실패 — 실행기를 중단한다. $log 확인 필요"
            break
        }
    } else {
        $fails = 0
    }

    $i++
    Write-Output "$(Get-Date -Format s) 60분 유휴"
    Start-Sleep -Seconds 3600
}
