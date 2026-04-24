$b64 = Get-Content -Path extract_logo.py -Raw
$start = $b64.IndexOf("base64,") + 7
$end = $b64.IndexOf('"', $start)
$b64String = $b64.Substring($start, $end - $start)
$bytes = [Convert]::FromBase64String($b64String)
[IO.File]::WriteAllBytes("C:\Users\bowtharinivijay\.gemini\antigravity\scratch\hello-machi-fm\logo.jpg", $bytes)
