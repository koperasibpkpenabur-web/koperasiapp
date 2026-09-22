Add-Type -AssemblyName System.Drawing

$inputPath = "C:\Users\User\.gemini\antigravity\brain\16bc7ce4-8fdf-4801-b537-a61cf6dd5211\.user_uploaded\media_1789704297179.jpg"
$outputPublic = "d:\SISTEM KOPERASI\public\logo-cynera.png"
$outputSrcDir = "d:\SISTEM KOPERASI\src\assets"

if (!(Test-Path -Path $outputSrcDir)) {
    New-Item -ItemType Directory -Path $outputSrcDir -Force | Out-Null
}
$outputSrc = "d:\SISTEM KOPERASI\src\assets\logo-cynera.png"

$srcBmp = [System.Drawing.Bitmap]::FromFile($inputPath)
$width = $srcBmp.Width
$height = $srcBmp.Height

# Create a 32bpp ARGB bitmap for true transparency
$destBmp = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

# We can lock bits or process pixels. Since it's 1024x1024, let's use LockBits for high speed
$rect = New-Object System.Drawing.Rectangle(0, 0, $width, $height)
$srcData = $srcBmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$destData = $destBmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::WriteOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

$bytes = [Math]::Abs($srcData.Stride) * $height
$rgbValues = New-Object byte[] $bytes
[System.Runtime.InteropServices.Marshal]::Copy($srcData.Scan0, $rgbValues, 0, $bytes)

# Process pixels: Format32bppArgb is BGRA (B=0, G=1, R=2, A=3)
for ($i = 0; $i -lt $bytes; $i += 4) {
    $b = [int]$rgbValues[$i]
    $g = [int]$rgbValues[$i + 1]
    $r = [int]$rgbValues[$i + 2]

    # White or near white threshold
    if ($r -ge 242 -and $g -ge 242 -and $b -ge 242) {
        # Transparent
        $rgbValues[$i + 3] = 0
    } elseif ($r -ge 225 -and $g -ge 225 -and $b -ge 225) {
        # Smooth alpha antialiasing
        $diff = [Math]::Max([Math]::Max($r, $g), $b) - 225
        $alpha = [byte][Math]::Max(0, 255 - ($diff * 15))
        $rgbValues[$i + 3] = $alpha
    } else {
        $rgbValues[$i + 3] = 255
    }
}

[System.Runtime.InteropServices.Marshal]::Copy($rgbValues, 0, $destData.Scan0, $bytes)
$srcBmp.UnlockBits($srcData)
$destBmp.UnlockBits($destData)
$srcBmp.Dispose()

# Save as PNG
$destBmp.Save($outputPublic, [System.Drawing.Imaging.ImageFormat]::Png)
$destBmp.Save($outputSrc, [System.Drawing.Imaging.ImageFormat]::Png)
$destBmp.Dispose()

Write-Host "Success! Transparent PNG saved to $outputPublic and $outputSrc"
