$ErrorActionPreference = "Stop"
$src = "D:\Deepseekharness\v8-heart-of-motion\src"
$out = "D:\Deepseekharness\v8-heart-of-motion\index.html"
$parts = @("00_head.html","10_body.html","20_core.js","30_physics.js","40_geom.js","50_scene.js","60_ui.js","70_main.js")
$sb = New-Object System.Text.StringBuilder
foreach ($p in $parts) {
  $full = Join-Path $src $p
  $text = [System.IO.File]::ReadAllText($full, [System.Text.Encoding]::UTF8)
  [void]$sb.Append($text)
  [void]$sb.Append("`r`n")
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($out, $sb.ToString(), $utf8)
$len = (Get-Item $out).Length
Write-Output ("built: " + $out + "  bytes=" + $len)
