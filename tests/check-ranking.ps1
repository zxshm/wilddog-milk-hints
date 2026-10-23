param([Parameter(Mandatory)][string]$Evidence, [Parameter(Mandatory)][string]$Nickname)
$ErrorActionPreference = 'Stop'
# 使用系统网络配置，凭据只保存在进程变量中，不写文件或输出。
$api = 'https://wilddog-milk-hints-20261022.zhangqiongxingzhe.chatgpt.site/api'
$record = Get-Content -LiteralPath $Evidence -Raw | ConvertFrom-Json
$player = Invoke-RestMethod -Uri "$api/players" -Method Post -ContentType 'application/json' -Body '{}'
$auth = @{ Authorization = "Bearer $($player.id):$($player.token)" }
$seconds = if ($null -ne $record.result.totalSeconds) { $record.result.totalSeconds } else { $record.result.seconds }
$payload = @{ nickname=$Nickname; runId=[guid]::NewGuid().ToString(); mode='auto'; score=$record.result.score; moves=$record.result.moves; maxLevel=$record.result.maxLevel; duration=[math]::Round($seconds) }
$body = $payload | ConvertTo-Json -Compress
$saved = Invoke-RestMethod -Uri "$api/scores" -Method Post -ContentType 'application/json; charset=utf-8' -Headers $auth -Body $body
$duplicate = Invoke-RestMethod -Uri "$api/scores" -Method Post -ContentType 'application/json; charset=utf-8' -Headers $auth -Body $body
$readback = Invoke-RestMethod -Uri "$api/leaderboard?mode=auto"
if (!$saved.saved -or !$duplicate.duplicate -or !($readback.entries | Where-Object { $_.nickname -eq $Nickname -and $_.score -eq $record.result.score })) { throw '共享榜单读写验收失败' }
New-Item -ItemType Directory -Force -Path output/deployment | Out-Null
@{ checkedAt=[DateTime]::UtcNow.ToString('o'); evidence=$Evidence; submitted=$payload; publicReadback=$readback; duplicatePrevented=$true } | ConvertTo-Json -Depth 8 | Set-Content output/deployment/ranking-live.json
@{ sharedSaved=$true; anonymousReadback=$true; duplicatePrevented=$true; nickname=$Nickname; score=$record.result.score } | ConvertTo-Json -Compress
