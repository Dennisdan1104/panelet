$name = 'panelet'
$p = $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut("$desktop\$name.lnk")
$sc.TargetPath = Join-Path $p 'node_modules\electron\dist\electron.exe'
$sc.Arguments = '"' + $p + '"'
$sc.WorkingDirectory = $p
$sc.IconLocation = Join-Path $p 'node_modules\electron\dist\electron.exe,0'
$sc.Description = 'Clock and Todo desktop widgets'
$sc.Save()
Write-Output ("CREATED: " + $name + ".lnk")
