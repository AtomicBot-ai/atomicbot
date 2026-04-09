# Windows OCR via WinRT Windows.Media.Ocr API
# Usage: powershell.exe -ExecutionPolicy Bypass -File vision-ocr.ps1 <imagePath>
# Output: JSON matching the OcrResult schema (engine, imageWidth, imageHeight, lines[])

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$ImagePath
)

$ErrorActionPreference = 'Stop'

try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime

    # Load WinRT types required for OCR and image decoding
    [void][Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType = WindowsRuntime]
    [void][Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
    [void][Windows.Storage.Streams.RandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]

    # Helper to await WinRT IAsyncOperation<T> from synchronous PowerShell
    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and
        $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]

    function Await-WinRtTask($WinRtTask, $ResultType) {
        $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
        $netTask = $asTask.Invoke($null, @($WinRtTask))
        $netTask.Wait(-1) | Out-Null
        return $netTask.Result
    }

    $fullPath = (Resolve-Path $ImagePath).Path

    # Open image file as RandomAccessStream
    $fileStream = [System.IO.File]::OpenRead($fullPath)
    $dotNetStream = [System.IO.StreamReader]::new($fileStream)
    $inputStream = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($fileStream)

    # Decode the image to get a SoftwareBitmap
    $decoder = Await-WinRtTask `
        ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($inputStream)) `
        ([Windows.Graphics.Imaging.BitmapDecoder])

    $imageWidth = [int]$decoder.PixelWidth
    $imageHeight = [int]$decoder.PixelHeight

    $bitmap = Await-WinRtTask `
        ($decoder.GetSoftwareBitmapAsync()) `
        ([Windows.Graphics.Imaging.SoftwareBitmap])

    # Create OCR engine with user's preferred language (falls back to first available)
    $ocrEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
    if ($null -eq $ocrEngine) {
        $ocrEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage(
            ([Windows.Globalization.Language]::new('en-US'))
        )
    }

    if ($null -eq $ocrEngine) {
        throw 'No OCR language pack available'
    }

    # Run OCR
    $ocrResult = Await-WinRtTask `
        ($ocrEngine.RecognizeAsync($bitmap)) `
        ([Windows.Media.Ocr.OcrResult])

    $inputStream.Dispose()
    $fileStream.Dispose()

    # Build output lines from OCR result
    $lines = @()

    foreach ($ocrLine in $ocrResult.Lines) {
        $text = $ocrLine.Text
        if ([string]::IsNullOrWhiteSpace($text)) { continue }

        # Compute line bounding box from word bounding rects
        $minLeft = [double]::MaxValue
        $minTop = [double]::MaxValue
        $maxRight = 0.0
        $maxBottom = 0.0

        foreach ($word in $ocrLine.Words) {
            $r = $word.BoundingRect
            if ($r.X -lt $minLeft) { $minLeft = $r.X }
            if ($r.Y -lt $minTop) { $minTop = $r.Y }
            $right = $r.X + $r.Width
            $bottom = $r.Y + $r.Height
            if ($right -gt $maxRight) { $maxRight = $right }
            if ($bottom -gt $maxBottom) { $maxBottom = $bottom }
        }

        $bboxWidth = $maxRight - $minLeft
        $bboxHeight = $maxBottom - $minTop

        $lines += @{
            text       = $text.Trim()
            confidence = 1.0
            bbox       = @{
                left   = [math]::Round($minLeft, 2)
                top    = [math]::Round($minTop, 2)
                width  = [math]::Round($bboxWidth, 2)
                height = [math]::Round($bboxHeight, 2)
            }
            center     = @{
                x = [math]::Round($minLeft + ($bboxWidth / 2.0), 2)
                y = [math]::Round($minTop + ($bboxHeight / 2.0), 2)
            }
        }
    }

    $response = @{
        engine      = 'windows-media-ocr'
        imageWidth  = $imageWidth
        imageHeight = $imageHeight
        lines       = $lines
    }

    $response | ConvertTo-Json -Depth 4 -Compress
}
catch {
    [Console]::Error.WriteLine('{"error":"windows ocr failed: ' + ($_.Exception.Message -replace '"', '\"') + '"}')
    exit 1
}
