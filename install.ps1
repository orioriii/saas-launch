# =============================================================================
# SaaS ローンチ・ハーネス ワンコマンドインストーラ（Windows / PowerShell）
#
# 使い方（PowerShell に貼り付けて実行）:
#   irm https://raw.githubusercontent.com/orioriii/saas-launch/main/install.ps1 | iex
#
# やること（書き込むのは %USERPROFILE%\.saas-launch の中だけ・管理者権限は不要）:
#   1. Node.js の確認。v20 以上が無ければ、公式 LTS を SHA-256 検証付きで
#      .saas-launch\node に用意する（既存の環境は変更しない）
#   2. ツール本体の取得（GitHub から zip をダウンロード）
#   3. ビルドと `saas-launch` コマンドの登録（PATH への追加は確認してから）
#   4. 希望すれば、そのままデプロイ（saas-launch setup）を開始
#
# もう一度実行すると、ツールを最新版に更新できます。
# =============================================================================
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$RepoUrl  = if ($env:SAAS_LAUNCH_REPO)   { $env:SAAS_LAUNCH_REPO }   else { 'https://github.com/orioriii/saas-launch' }
$Branch   = if ($env:SAAS_LAUNCH_BRANCH) { $env:SAAS_LAUNCH_BRANCH } else { 'main' }
$Root     = Join-Path $env:USERPROFILE '.saas-launch'
$NodeDist = 'https://nodejs.org/dist/latest-v22.x'
$MinNodeMajor = 20

function Info($msg) { Write-Host $msg -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "[OK] $msg" -ForegroundColor Green }
function Warn2($msg){ Write-Host "[!] $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "[NG] $msg" -ForegroundColor Red; exit 1 }

function Ask-YesNo($question, $defaultYes = $true) {
  $hint = if ($defaultYes) { 'Y/n' } else { 'y/N' }
  while ($true) {
    $ans = Read-Host "$question [$hint]"
    if ($ans -eq '')       { return $defaultYes }
    if ($ans -match '^[Yy]') { return $true }
    if ($ans -match '^[Nn]') { return $false }
    Write-Host 'y か n で答えてください。'
  }
}

Write-Host ''
Info '===== SaaS ローンチ・ハーネス インストーラ ====='
Write-Host ''
Write-Host 'これから行うこと:'
Write-Host '  1. Node.js の確認（無ければ .saas-launch に自動で用意・既存環境は変更しません）'
Write-Host "  2. ツール本体の取得とビルド（$RepoUrl）"
Write-Host '  3. saas-launch コマンドの登録'
Write-Host '  4. 希望すれば、そのままデプロイを開始'
Write-Host ''
Write-Host "書き込み先は $Root の中だけです（管理者権限は不要）。"
Write-Host ''
if (-not (Ask-YesNo '続行しますか？')) {
  Write-Host '中断しました。またいつでも実行できます。'
  exit 0
}

New-Item -ItemType Directory -Force -Path (Join-Path $Root 'bin') | Out-Null
$Tmp = Join-Path ([IO.Path]::GetTempPath()) ("saas-launch-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $Tmp | Out-Null

try {
  # ---- 1. Node.js ----------------------------------------------------------
  function Get-NodeMajor($exe) {
    try { [int]((& $exe -v) -replace '^v(\d+).*', '$1') } catch { 0 }
  }

  $NodeDir = $null
  $LocalNode = Join-Path $Root 'node\node.exe'
  if ((Test-Path $LocalNode) -and ((Get-NodeMajor $LocalNode) -ge $MinNodeMajor)) {
    $NodeDir = Join-Path $Root 'node'
    Ok "Node.js: 用意済み（$(& $LocalNode -v)）"
  }
  elseif ((Get-Command node -ErrorAction SilentlyContinue) -and ((Get-NodeMajor 'node') -ge $MinNodeMajor)) {
    $NodeDir = Split-Path (Get-Command node).Source
    Ok "Node.js: インストール済みのものを使います（$(node -v)）"
  }
  else {
    Info "Node.js（v$MinNodeMajor 以上）が見つからないため、公式 LTS を用意します..."
    $Arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'win-arm64' } else { 'win-x64' }
    $Shas = (Invoke-WebRequest -UseBasicParsing "$NodeDist/SHASUMS256.txt").Content
    if ($Shas -notmatch "(?m)^([0-9a-f]{64})\s+(node-v[\d\.]+-$Arch\.zip)\s*$") {
      Fail "この環境向けの Node.js（$Arch）が見つかりませんでした。"
    }
    $ExpectedHash = $Matches[1]; $ZipName = $Matches[2]

    Info "ダウンロード中: $ZipName（nodejs.org 公式）"
    $ZipPath = Join-Path $Tmp $ZipName
    Invoke-WebRequest -UseBasicParsing "$NodeDist/$ZipName" -OutFile $ZipPath

    # SHA-256 検証（改ざん・破損対策）
    $Actual = (Get-FileHash -Algorithm SHA256 $ZipPath).Hash.ToLower()
    if ($Actual -ne $ExpectedHash) { Fail 'Node.js のチェックサム検証に失敗しました（ダウンロードが壊れている可能性）。' }
    Ok 'チェックサム検証 OK'

    Expand-Archive -Path $ZipPath -DestinationPath $Tmp -Force
    $Inner = Join-Path $Tmp ($ZipName -replace '\.zip$', '')
    if (Test-Path (Join-Path $Root 'node')) { Remove-Item -Recurse -Force (Join-Path $Root 'node') }
    Move-Item $Inner (Join-Path $Root 'node')
    $NodeDir = Join-Path $Root 'node'
    Ok "Node.js を用意しました（$(& (Join-Path $NodeDir 'node.exe') -v) / 置き場所: $NodeDir）"
  }

  # 以降のコマンド（npm 等）がこの Node を使うようにする
  $env:Path = "$NodeDir;" + $env:Path

  # ---- 2. ツール本体の取得 --------------------------------------------------
  $Slug = ($RepoUrl -replace '^https://github\.com/', '') -replace '\.git$', ''
  Info 'ツール本体を取得中...'
  $AppZip = Join-Path $Tmp 'app.zip'
  Invoke-WebRequest -UseBasicParsing "https://codeload.github.com/$Slug/zip/refs/heads/$Branch" -OutFile $AppZip
  Expand-Archive -Path $AppZip -DestinationPath (Join-Path $Tmp 'app-extract') -Force
  $InnerApp = Get-ChildItem (Join-Path $Tmp 'app-extract') -Directory | Select-Object -First 1
  if (-not $InnerApp -or -not (Test-Path (Join-Path $InnerApp.FullName 'package.json'))) {
    Fail '取得した内容が想定と異なります（package.json がありません）。'
  }

  # 旧バージョンを置き換え（設定・進捗はあなたのアプリ側に保存されるため消えません）
  if (Test-Path (Join-Path $Root 'app')) { Remove-Item -Recurse -Force (Join-Path $Root 'app') }
  Move-Item $InnerApp.FullName (Join-Path $Root 'app')
  Ok "ツール本体を取得しました（$(Join-Path $Root 'app')）"

  # ---- 3. ビルドとコマンド登録 ----------------------------------------------
  Info 'ビルド中（数十秒かかります）...'
  Push-Location (Join-Path $Root 'app')
  try {
    & npm install --no-audit --no-fund --loglevel=error | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail 'npm install に失敗しました。' }
    & npm run build | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail 'ビルドに失敗しました。' }
    & npm prune --omit=dev --no-audit --no-fund --loglevel=error | Out-Null
  } finally { Pop-Location }
  Ok 'ビルド完了'

  # どこからでも使える起動コマンド（shim）を作る。
  # ユーザー名に日本語が含まれても壊れないよう、パスは %USERPROFILE% で表し ASCII のみで書く
  # （.saas-launch\node が無い場合はシステムの node が使われる）。
  $Shim = Join-Path $Root 'bin\saas-launch.cmd'
  @(
    '@echo off'
    'rem saas-launch launcher (auto-generated by install.ps1)'
    'set "PATH=%USERPROFILE%\.saas-launch\node;%PATH%"'
    'node "%USERPROFILE%\.saas-launch\app\dist\index.js" %*'
  ) | Set-Content -Path $Shim -Encoding ASCII
  Ok "saas-launch コマンドを登録しました（$Shim）"

  # PATH への追加（ユーザー環境変数。必ず確認してから）
  $BinDir = Join-Path $Root 'bin'
  $UserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if ($UserPath -and ($UserPath -split ';' -contains $BinDir)) {
    Ok 'PATH: 設定済み'
  }
  elseif (Ask-YesNo "どのフォルダからでも saas-launch を使えるように、PATH に $BinDir を追加しますか？") {
    $NewPath = if ($UserPath) { "$UserPath;$BinDir" } else { $BinDir }
    [Environment]::SetEnvironmentVariable('Path', $NewPath, 'User')
    Ok 'PATH: 追加しました（新しい PowerShell から有効）'
  }
  else {
    Warn2 'PATH には追加しませんでした。使うときはフルパスで実行してください:'
    Write-Host "  $Shim setup"
  }
  # このセッションでもすぐ使えるようにする
  $env:Path = "$BinDir;" + $env:Path

  # ---- 4. そのままデプロイ開始（希望すれば） ---------------------------------
  Write-Host ''
  Ok 'インストール完了！'
  Write-Host ''

  if (Ask-YesNo 'このままデプロイを始めますか？（あなたのアプリのフォルダをこの後に聞きます）') {
    while ($true) {
      $AppDir = Read-Host 'あなたのアプリのフォルダのパス（例: C:\Users\you\my-app）'
      if ($AppDir -and (Test-Path $AppDir -PathType Container)) { break }
      Warn2 "フォルダが見つかりません: $AppDir。もう一度入力してください。"
    }
    Write-Host ''
    Info 'デプロイを開始します。ここからは画面の質問に答えるだけです。'
    Write-Host '（中断しても、同じフォルダで saas-launch setup を実行すれば続きから再開できます）'
    Write-Host ''
    & $Shim setup -C $AppDir
  }
  else {
    Write-Host 'デプロイを始めるときは、あなたのアプリのフォルダで次を実行してください:'
    Write-Host ''
    Write-Host '  saas-launch setup'
    Write-Host ''
    Write-Host '（PATH を追加した場合は、新しい PowerShell を開いてから実行してください）'
  }
}
finally {
  if (Test-Path $Tmp) { Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue }
}
