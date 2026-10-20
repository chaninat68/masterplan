param([string]$OutDir)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$ErrorActionPreference = 'Stop'

function ColIdx([string]$ref) { $l = $ref -replace '\d',''; $n=0; foreach($ch in $l.ToCharArray()){ $n = $n*26 + ([int][char]$ch - 64) }; return $n }

# Returns list of rows; each row = hashtable colIdx -> value (string or double)
function ReadSheet($file, $sheetName, $startRow, $maxCol) {
  $z = [System.IO.Compression.ZipFile]::OpenRead($file)
  $ss = New-Object System.Collections.Generic.List[string]
  $sse = $z.GetEntry('xl/sharedStrings.xml')
  if ($sse) { $doc = New-Object Xml.XmlDocument; $doc.Load($sse.Open()); foreach ($si in $doc.DocumentElement.ChildNodes) { $ss.Add($si.InnerText) } }
  $wb = [xml](New-Object IO.StreamReader($z.GetEntry('xl/workbook.xml').Open())).ReadToEnd()
  $rels = [xml](New-Object IO.StreamReader($z.GetEntry('xl/_rels/workbook.xml.rels').Open())).ReadToEnd()
  $s = $wb.workbook.sheets.sheet | ? { $_.name.Trim() -eq $sheetName }
  $rid = $s.GetAttribute('id','http://schemas.openxmlformats.org/officeDocument/2006/relationships')
  $t = ($rels.Relationships.Relationship | ? { $_.Id -eq $rid }).Target -replace '^/?(xl/)?',''
  $rows = New-Object System.Collections.Generic.List[object]
  $xr = [Xml.XmlReader]::Create($z.GetEntry("xl/$t").Open()); $go=$xr.Read(); $cur=$null; $rn=0
  while ($go) { $adv=$true
    if ($xr.NodeType -eq 'Element' -and $xr.LocalName -eq 'row') { $rn=[int]$xr.GetAttribute('r'); $cur=@{ '_r'=$rn } }
    elseif ($xr.NodeType -eq 'Element' -and $xr.LocalName -eq 'c') { $ctype=$xr.GetAttribute('t'); $ci=ColIdx $xr.GetAttribute('r') }
    elseif ($xr.NodeType -eq 'Element' -and ($xr.LocalName -eq 'v' -or ($xr.LocalName -eq 't' -and $ctype -eq 'inlineStr'))) {
      $v=$xr.ReadElementContentAsString(); $adv=$false
      if ($rn -ge $startRow -and $ci -le $maxCol) {
        if ($ctype -eq 's') { $v = $ss[[int]$v].Trim() }
        elseif ($ctype -eq 'str' -or $ctype -eq 'inlineStr' -or $ctype -eq 'e') { $v = "$v".Trim() }
        else { $d=0.0; if ([double]::TryParse($v,[Globalization.NumberStyles]::Float,[Globalization.CultureInfo]::InvariantCulture,[ref]$d)) { $v=$d } }
        $cur[$ci]=$v } }
    elseif ($xr.NodeType -eq 'EndElement' -and $xr.LocalName -eq 'row') { if ($rn -ge $startRow) { $rows.Add($cur) } }
    if ($adv){$go=$xr.Read()} else {$go = -not $xr.EOF} }
  $xr.Close(); $z.Dispose()
  return ,$rows
}
function S($v){ if ($null -eq $v) { return '' }; $s="$v".Trim(); if ($s -match '^#(N/A|VALUE!|REF!|ERROR!|DIV/0!)') { return '' }; return $s }
function N($v){ if ($v -is [double]) { return [math]::Round($v,3) }; return 0 }
function D($v){ if ($v -is [double] -and $v -gt 30000) { return [DateTime]::FromOADate([math]::Floor($v)).ToString('yyyy-MM-dd') }; $s=S $v; if ($s -match '^\d{4}-\d{2}-\d{2}') { return $s.Substring(0,10) }; return '' }

# string dictionary to keep JSON small
$dict = New-Object System.Collections.Generic.List[string]; $dmap=@{}
function I($s){ $s = S $s; if (-not $dmap.ContainsKey($s)) { $dmap[$s]=$dict.Count; $dict.Add($s) }; return $dmap[$s] }

$queueFile = 'C:\Users\s_chaninat.ASIAGROUP\Desktop\รายงานคิว-วัน-ปี 69.xlsx'
$mpFile = 'D:\Master Planning\Master Planning 2026\M10\Master Planning Update 17-10-69 - Copy.xlsx'
$soFile = 'C:\Users\s_chaninat.ASIAGROUP\Desktop\ข้อมูล SO และใบเปลี่ยนแปลง ปี 2026.xlsx'

# ---- คิว-วัน
$q = ReadSheet $queueFile 'คิว-วัน' 2 20
$logs = New-Object System.Collections.Generic.List[object]; $skipped=0
foreach ($r in $q) {
  $d = D $r[1]; $p = S $r[2]
  if (-not $d -or -not $p) { $skipped++; continue }
  # date,project,owner,agency,province,type,jobstatus,leader,company,rig,rigtype,order,std,size,section,length,shift,qty,cubic,meters
  $logs.Add(@($d,$p,(I $r[3]),(I $r[4]),(I $r[5]),(I $r[6]),(I $r[7]),(I $r[8]),(I $r[9]),(I $r[10]),(I $r[11]),(N $r[12]),(I $r[13]),(I $r[14]),(N $r[15]),(N $r[16]),(S $r[17]),(N $r[18]),(N $r[19]),(N $r[20])))
}
[Console]::Error.WriteLine("queue rows: $($logs.Count) skipped: $skipped")

# ---- Pile
$pile = ReadSheet $mpFile 'Pile' 3 1300
$hdr = $pile | ? { $_['_r'] -eq 3 } | select -First 1
$dateCols = @{}; foreach ($k in $hdr.Keys) { if ($k -is [int] -and $k -ge 18 -and $hdr[$k] -is [double]) { $dateCols[$k] = [DateTime]::FromOADate($hdr[$k]).ToString('yyyy-MM-dd') } }
$projects = [ordered]@{}
foreach ($r in $pile) {
  if ($r['_r'] -lt 4) { continue }
  $code = S $r[1]; if (-not $code) { continue }
  $kind = S $r[17]
  if (-not $projects.Contains($code)) { $projects[$code] = [ordered]@{ code=$code; plan=@{}; act=@{}; notes=@{} } }
  $p = $projects[$code]
  if ($kind -eq 'Plan') {
    $p.pm=S $r[2]; $p.sales=S $r[3]; $p.status=S $r[4]; $p.customer=S $r[5]; $p.name=S $r[6]
    $p.order=N $r[7]; $p.value=N $r[8]; $p.vpp=N $r[9]; $p.done=N $r[10]; $p.remain=N $r[11]; $p.ab=N $r[14]
    $p.start=D $r[15]; $p.end=D $r[16]
    foreach ($k in $dateCols.Keys) { $v=$r[$k]; if ($v -is [double] -and $v -ne 0) { $p.plan[$dateCols[$k]] = [math]::Round($v,2) } }
  } elseif ($kind -eq 'Actual') {
    $p.billing = S $r[5]; $p.endNote = S $r[16]
    foreach ($k in $dateCols.Keys) { $v=$r[$k]
      if ($v -is [double]) { if ($v -ne 0) { $p.act[$dateCols[$k]] = [math]::Round($v,2) } }
      elseif ((S $v) -ne '') { $p.notes[$dateCols[$k]] = (S $v) } }
  }
}
# keep daily detail only for non-completed or projects touched in 2026
$plist = New-Object System.Collections.Generic.List[object]
foreach ($p in $projects.Values) {
  $recent = ($p.act.Keys | ? { $_ -ge '2026-01-01' }).Count -gt 0 -or ($p.plan.Keys | ? { $_ -ge '2026-01-01' }).Count -gt 0
  if (-not ($p.status -match '^[123]') -and -not $recent) { $p.plan=@{}; $p.act=@{}; $p.notes=@{} }
  $plist.Add($p)
}
[Console]::Error.WriteLine("projects: $($plist.Count)")

# ---- SO dataรวม  A type,B date,D project,E projname,H customer,I group,U amount,Z approval,AA work,AJ svc,AQ new,AS sales,AU service,BL province, R qty, AP groupproduct
$so = ReadSheet $soFile 'dataรวม' 2 70
$sales = New-Object System.Collections.Generic.List[object]
foreach ($r in $so) {
  $t = S $r[1]; $d = D $r[2]; if (-not $t -or -not $d) { continue }
  $sales.Add(@($t,$d,(S $r[4]),(I $r[5]),(I $r[8]),(I $r[9]),(N $r[21]),(I $r[26]),(I $r[43]),(I $r[45]),(I $r[47]),(N $r[18]),(I $r[42])))
}
[Console]::Error.WriteLine("sales rows: $($sales.Count)")

# ---- pile sizes (ขนาด)
$sz = ReadSheet $queueFile 'ขนาด' 2 6
$sizes = @(); foreach ($r in $sz) { if ($r[2] -is [double]) { $sizes += ,@((N $r[2]),(S $r[6])) } }

$out = [ordered]@{ generated=(Get-Date).ToString('s'); dict=$dict; logs=$logs; projects=$plist; sales=$sales; sizes=$sizes }
$json = $out | ConvertTo-Json -Depth 6 -Compress
[IO.File]::WriteAllText((Join-Path $OutDir 'data.json'), $json, (New-Object Text.UTF8Encoding $false))
[Console]::Error.WriteLine("json bytes: $($json.Length)")
