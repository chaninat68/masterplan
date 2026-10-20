# สร้างไฟล์พรีวิว: อ่าน Excel 3 ไฟล์ (อ่านอย่างเดียว) -> data.json -> ฝังลง template.html
# ใช้: powershell -ExecutionPolicy Bypass -File preview\build-preview.ps1
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$tmp = Join-Path $env:TEMP 'mp-preview'; New-Item -ItemType Directory -Force $tmp | Out-Null
& (Join-Path $here 'extract-data.ps1') -OutDir $tmp
$t = [IO.File]::ReadAllText((Join-Path $here 'template.html'), [Text.Encoding]::UTF8)
$j = [IO.File]::ReadAllText((Join-Path $tmp 'data.json'), [Text.Encoding]::UTF8).Replace('</','<\/')
$out = Join-Path $here 'master-planning-preview.html'
[IO.File]::WriteAllText($out, $t.Replace('__DATA__', $j), (New-Object Text.UTF8Encoding $false))
Write-Host "สร้างแล้ว: $out"