# Agent control overlay: glowing screen border + cursor highlight ring + breathing pulse.
# Port of the macOS Swift overlay to Windows WPF.
# Launched as a subprocess, stays alive until stdin closes or 'quit' is received.
# Usage: powershell.exe -ExecutionPolicy Bypass -NoProfile -File agent-overlay.ps1 [-Color RRGGBB]

param(
    [string]$Color = 'AEFF00',
    [int]$BorderWidth = 3
)

$ErrorActionPreference = 'Stop'

# WPF must run Per-Monitor v2; otherwise powershell.exe is often system-DPI-aware and
# sizes/positions disagree with GetCursorPos (common symptom: visuals ~2x too large at "100%").
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class AgentOverlayDpi {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetProcessDpiAwarenessContext(IntPtr dpiContext);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);

    [DllImport("user32.dll")]
    public static extern uint GetDpiForWindow(IntPtr hwnd);

    public static void PreferPerMonitorV2() {
        SetProcessDpiAwarenessContext(new IntPtr(-4)); // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
    }

    // Re-assert on the UI thread if process-wide call was too late for this host.
    public static void ThreadPreferPerMonitorV2() {
        SetThreadDpiAwarenessContext(new IntPtr(-4));
    }

    // DIPs per physical pixel (96 / monitor DPI).
    public static double DipsPerPhysicalPixel(IntPtr hwnd) {
        uint dpi = GetDpiForWindow(hwnd);
        if (dpi < 72) dpi = 96;
        return 96.0 / (double)dpi;
    }
}
'@
[AgentOverlayDpi]::PreferPerMonitorV2()

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Windows.Forms

Add-Type @'
using System;
using System.Runtime.InteropServices;

public class Win32Overlay {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetCursorPos(out POINT lpPoint);

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT {
        public int X;
        public int Y;
    }

    public const int GWL_EXSTYLE = -20;
    public const int WS_EX_TRANSPARENT = 0x00000020;
    public const int WS_EX_LAYERED = 0x00080000;
    public const int WS_EX_TOOLWINDOW = 0x00000080;

    public static void MakeClickThrough(IntPtr hwnd) {
        int style = GetWindowLong(hwnd, GWL_EXSTYLE);
        SetWindowLong(hwnd, GWL_EXSTYLE, style | WS_EX_TRANSPARENT | WS_EX_LAYERED | WS_EX_TOOLWINDOW);
    }
}
'@

$r = [Convert]::ToByte($Color.Substring(0, 2), 16)
$g = [Convert]::ToByte($Color.Substring(2, 2), 16)
$b = [Convert]::ToByte($Color.Substring(4, 2), 16)
$mediaColor = [System.Windows.Media.Color]::FromRgb($r, $g, $b)

# Screen sizing: use Forms.Screen.Bounds for physical pixels, then convert to DIPs
# in SourceInitialized once we know the real DPI scale from WPF's composition target.
# SystemParameters can lie depending on the process DPI awareness context.
$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$physBounds = $screen.Bounds

# Temporary DIPs estimate (corrected in SourceInitialized)
$screenW = [System.Windows.SystemParameters]::PrimaryScreenWidth
$screenH = [System.Windows.SystemParameters]::PrimaryScreenHeight

# ── Border window with smooth DropShadowEffect glow ──────────

$borderWindow = [System.Windows.Window]::new()
$borderWindow.WindowStyle = 'None'
$borderWindow.AllowsTransparency = $true
$borderWindow.Background = [System.Windows.Media.Brushes]::Transparent
$borderWindow.Topmost = $true
$borderWindow.ShowInTaskbar = $false
$borderWindow.Left = 0
$borderWindow.Top = 0
$borderWindow.Width = $screenW
$borderWindow.Height = $screenH
$borderWindow.ResizeMode = 'NoResize'
$borderWindow.Opacity = 0

$border = [System.Windows.Controls.Border]::new()
$border.BorderBrush = [System.Windows.Media.SolidColorBrush]::new($mediaColor)
$border.BorderThickness = [System.Windows.Thickness]::new($BorderWidth)
$border.Background = [System.Windows.Media.Brushes]::Transparent

$glowEffect = [System.Windows.Media.Effects.DropShadowEffect]::new()
$glowEffect.Color = $mediaColor
$glowEffect.BlurRadius = 35
$glowEffect.ShadowDepth = 0
$glowEffect.Opacity = 0.8
$glowEffect.Direction = 0
$border.Effect = $glowEffect

$borderWindow.Content = $border

$borderWindow.Add_SourceInitialized({
    $helper = [System.Windows.Interop.WindowInteropHelper]::new($borderWindow)
    [Win32Overlay]::MakeClickThrough($helper.Handle)

    # Correct window size using actual DPI from WPF composition target
    $source = [System.Windows.PresentationSource]::FromVisual($borderWindow)
    if ($null -ne $source) {
        $dpiX = $source.CompositionTarget.TransformToDevice.M11
        $dpiY = $source.CompositionTarget.TransformToDevice.M22
        $borderWindow.Left = $physBounds.Left / $dpiX
        $borderWindow.Top = $physBounds.Top / $dpiY
        $borderWindow.Width = $physBounds.Width / $dpiX
        $borderWindow.Height = $physBounds.Height / $dpiY
    }
})

# ── Cursor ring (macOS-style strokes only, no WPF DropShadowEffect) ──────────
# DropShadowEffect blooms far outside the ellipse; users often read that as "~2x" the real ring.
# Target physical pixels; convert to DIPs via GetDpiForWindow on the real HWND.

$targetCursorOuterPx = 40

$cursorWindow = [System.Windows.Window]::new()
$cursorWindow.WindowStyle = 'None'
$cursorWindow.AllowsTransparency = $true
$cursorWindow.Background = [System.Windows.Media.Brushes]::Transparent
$cursorWindow.Topmost = $true
$cursorWindow.ShowInTaskbar = $false
$cursorWindow.Width = 40
$cursorWindow.Height = 40
$cursorWindow.ResizeMode = 'NoResize'
$cursorWindow.Opacity = 0

$canvas = [System.Windows.Controls.Canvas]::new()
$canvas.SnapsToDevicePixels = $true

# Soft outer rings (like macOS GlowCursorRingView): faint strokes, no bitmap blur.
$cursorRingLayers = 6
$ringEllipses = [System.Windows.Shapes.Ellipse[]]::new($cursorRingLayers)
# Add outer (large, faint) ellipses first so inner rings stay visible on top.
for ($ri = $cursorRingLayers - 1; $ri -ge 0; $ri--) {
    $t = if ($cursorRingLayers -le 1) { 1.0 } else { [double]$ri / [double]($cursorRingLayers - 1) }
    $alpha = 0.06 + 0.55 * ($t * $t)
    $c = [System.Windows.Media.Color]::FromArgb([byte]([math]::Round(255 * $alpha)), $r, $g, $b)
    $e = [System.Windows.Shapes.Ellipse]::new()
    $e.Fill = [System.Windows.Media.Brushes]::Transparent
    $e.Stroke = [System.Windows.Media.SolidColorBrush]::new($c)
    $e.StrokeThickness = 1.15
    $ringEllipses[$ri] = $e
    $canvas.Children.Add($e) | Out-Null
}

$cursorWindow.Content = $canvas

$cursorWindow.Add_SourceInitialized({
    $helper = [System.Windows.Interop.WindowInteropHelper]::new($cursorWindow)
    [Win32Overlay]::MakeClickThrough($helper.Handle)

    $hwnd = $helper.Handle
    $dpp = [AgentOverlayDpi]::DipsPerPhysicalPixel($hwnd)

    $outerW = $targetCursorOuterPx * $dpp
    $outerH = $targetCursorOuterPx * $dpp
    $cursorWindow.Width = $outerW
    $cursorWindow.Height = $outerH

    $layerCount = $ringEllipses.Length
    for ($li = 0; $li -lt $layerCount; $li++) {
        $t = if ($layerCount -le 1) { 1.0 } else { [double]$li / [double]($layerCount - 1) }
        # Inset grows with t (smaller ellipses first), matching macOS spread falloff.
        $spreadPhys = 9.0 * (1.0 - $t)
        $insetPhys = $spreadPhys + 2.5
        $insetDip = $insetPhys * $dpp
        $ew = [math]::Max(1.0, $outerW - 2 * $insetDip)
        $eh = [math]::Max(1.0, $outerH - 2 * $insetDip)
        $el = $ringEllipses[$li]
        $el.Width = $ew
        $el.Height = $eh
        $el.StrokeThickness = (1.0 + 0.35 * $t) * $dpp
        [System.Windows.Controls.Canvas]::SetLeft($el, ($outerW - $ew) / 2)
        [System.Windows.Controls.Canvas]::SetTop($el, ($outerH - $eh) / 2)
    }
})

# ── Cursor label window (compact pill; macOS CursorLabelView parity) ───────────
# Physical px targets → DIPs via GetDpiForWindow (same as cursor ring). The old
# LayoutTransform only when dpiX>1.05 left the pill unscaled at 100% while WPF
# could still render it oversized vs the intended ~11pt macOS pill.

$labelText = "Atomic bot"
$targetLabelFontPx = 11
$targetLabelPadHPx = 8
$targetLabelPadVPx = 3
$targetLabelCornerPx = 4
# macOS draws the filled pill inside bounds.insetBy(dx: 1, dy: 1)
$targetLabelOuterInsetPx = 1

$labelWindow = [System.Windows.Window]::new()
$labelWindow.WindowStyle = 'None'
$labelWindow.AllowsTransparency = $true
$labelWindow.Background = [System.Windows.Media.Brushes]::Transparent
$labelWindow.Topmost = $true
$labelWindow.ShowInTaskbar = $false
$labelWindow.ResizeMode = 'NoResize'
$labelWindow.SizeToContent = 'WidthAndHeight'
$labelWindow.Opacity = 0

$labelShell = [System.Windows.Controls.Border]::new()
$labelShell.Background = [System.Windows.Media.Brushes]::Transparent
$labelShell.SnapsToDevicePixels = $true

$labelPill = [System.Windows.Controls.Border]::new()
$labelPill.Background = [System.Windows.Media.SolidColorBrush]::new($mediaColor)
$labelPill.SnapsToDevicePixels = $true

$labelBlock = [System.Windows.Controls.TextBlock]::new()
$labelBlock.Text = $labelText
$labelBlock.FontSize = 11
$labelBlock.FontWeight = [System.Windows.FontWeights]::Medium
$labelBlock.Foreground = [System.Windows.Media.Brushes]::Black
$labelBlock.SnapsToDevicePixels = $true

$labelPill.Child = $labelBlock
$labelShell.Child = $labelPill
$labelWindow.Content = $labelShell

$labelWindow.Add_SourceInitialized({
    $helper = [System.Windows.Interop.WindowInteropHelper]::new($labelWindow)
    [Win32Overlay]::MakeClickThrough($helper.Handle)

    $dpp = [AgentOverlayDpi]::DipsPerPhysicalPixel($helper.Handle)
    $inset = $targetLabelOuterInsetPx * $dpp
    $labelShell.Padding = [System.Windows.Thickness]::new($inset, $inset, $inset, $inset)

    $r = $targetLabelCornerPx * $dpp
    $labelPill.CornerRadius = [System.Windows.CornerRadius]::new($r, $r, $r, $r)
    $labelPill.Padding = [System.Windows.Thickness]::new(
        $targetLabelPadHPx * $dpp,
        $targetLabelPadVPx * $dpp,
        $targetLabelPadHPx * $dpp,
        $targetLabelPadVPx * $dpp
    )
    $labelBlock.FontSize = $targetLabelFontPx * $dpp
})

# ── Cursor tracking timer ────────────────────────────────────

$cursorTimer = [System.Windows.Threading.DispatcherTimer]::new()
$cursorTimer.Interval = [TimeSpan]::FromMilliseconds(33)
$cursorTimer.Add_Tick({
    $pt = [Win32Overlay+POINT]::new()
    [void][Win32Overlay]::GetCursorPos([ref]$pt)

    $source = [System.Windows.PresentationSource]::FromVisual($cursorWindow)
    if ($null -ne $source) {
        $dpiX = $source.CompositionTarget.TransformToDevice.M11
        $dpiY = $source.CompositionTarget.TransformToDevice.M22
        $cx = $pt.X / $dpiX
        $cy = $pt.Y / $dpiY
    }
    else {
        $cx = $pt.X
        $cy = $pt.Y
    }
    $halfRing = $cursorWindow.Width / 2
    $cursorWindow.Left = $cx - $halfRing
    $cursorWindow.Top = $cy - $halfRing
    $labelWindow.Left = $cx + 6
    $labelWindow.Top = $cy + 8
})

# ── Graceful fade-out (triggered by stdin close/quit) ────────

$script:fadeOutStarted = $false

function Start-FadeOut {
    if ($script:fadeOutStarted) { return }
    $script:fadeOutStarted = $true

    $cursorTimer.Stop()

    # Clear any running pulse animation so fade-out takes over cleanly
    $borderWindow.BeginAnimation([System.Windows.Window]::OpacityProperty, $null)
    $cursorWindow.BeginAnimation([System.Windows.Window]::OpacityProperty, $null)
    $labelWindow.BeginAnimation([System.Windows.Window]::OpacityProperty, $null)

    $fo = [System.Windows.Media.Animation.DoubleAnimation]::new()
    $fo.To = 0.0
    $fo.Duration = [System.Windows.Duration]::new([TimeSpan]::FromMilliseconds(350))
    $fo.EasingFunction = [System.Windows.Media.Animation.QuadraticEase]::new()
    $fo.EasingFunction.EasingMode = [System.Windows.Media.Animation.EasingMode]::EaseIn
    $fo.Add_Completed({
        $borderWindow.Close()
        $cursorWindow.Close()
        $labelWindow.Close()
        [System.Windows.Threading.Dispatcher]::CurrentDispatcher.InvokeShutdown()
    })

    $borderWindow.BeginAnimation([System.Windows.Window]::OpacityProperty, $fo)
    $cursorWindow.BeginAnimation([System.Windows.Window]::OpacityProperty, $fo)
    $labelWindow.BeginAnimation([System.Windows.Window]::OpacityProperty, $fo)
}

# ── Launch ────────────────────────────────────────────────────

[AgentOverlayDpi]::ThreadPreferPerMonitorV2() | Out-Null

$borderWindow.Show()
$cursorWindow.Show()
$labelWindow.Show()
$cursorTimer.Start()

# Fade-in (matches macOS: 400ms ease-out)
$fadeIn = [System.Windows.Media.Animation.DoubleAnimation]::new()
$fadeIn.From = 0.0
$fadeIn.To = 1.0
$fadeIn.Duration = [System.Windows.Duration]::new([TimeSpan]::FromMilliseconds(400))
$fadeIn.EasingFunction = [System.Windows.Media.Animation.QuadraticEase]::new()
$fadeIn.EasingFunction.EasingMode = [System.Windows.Media.Animation.EasingMode]::EaseOut
$borderWindow.BeginAnimation([System.Windows.Window]::OpacityProperty, $fadeIn)
$cursorWindow.BeginAnimation([System.Windows.Window]::OpacityProperty, $fadeIn)
$labelWindow.BeginAnimation([System.Windows.Window]::OpacityProperty, $fadeIn)

# Breathing pulse starts after fade-in completes (matches macOS: alpha 0.55–1.0, ~2s period)
$pulseDelay = [System.Windows.Threading.DispatcherTimer]::new()
$pulseDelay.Interval = [TimeSpan]::FromMilliseconds(450)
$pulseDelay.Add_Tick({
    $pulseDelay.Stop()
    if ($script:fadeOutStarted) { return }
    $pulse = [System.Windows.Media.Animation.DoubleAnimation]::new()
    $pulse.From = 1.0
    $pulse.To = 0.55
    $pulse.Duration = [System.Windows.Duration]::new([TimeSpan]::FromSeconds(1))
    $pulse.AutoReverse = $true
    $pulse.RepeatBehavior = [System.Windows.Media.Animation.RepeatBehavior]::Forever
    $pulse.EasingFunction = [System.Windows.Media.Animation.SineEase]::new()
    $pulse.EasingFunction.EasingMode = [System.Windows.Media.Animation.EasingMode]::EaseInOut
    $borderWindow.BeginAnimation([System.Windows.Window]::OpacityProperty, $pulse)
    $cursorWindow.BeginAnimation([System.Windows.Window]::OpacityProperty, $pulse)
    $labelWindow.BeginAnimation([System.Windows.Window]::OpacityProperty, $pulse)
})
$pulseDelay.Start()

# ── Stdin watcher: detect 'quit' or pipe close for graceful shutdown ──

try {
    $stdinStream = [Console]::OpenStandardInput()
    $stdinBuf = [byte[]]::new(16)
    $stdinAr = $stdinStream.BeginRead($stdinBuf, 0, $stdinBuf.Length, $null, $null)

    $stdinWatch = [System.Windows.Threading.DispatcherTimer]::new()
    $stdinWatch.Interval = [TimeSpan]::FromMilliseconds(100)
    $stdinWatch.Add_Tick({
        if ($stdinAr.IsCompleted) {
            $stdinWatch.Stop()
            try { $stdinStream.EndRead($stdinAr) | Out-Null } catch {}
            Start-FadeOut
        }
    })
    $stdinWatch.Start()
} catch {
    # stdin unavailable — no graceful shutdown, process will be killed externally
}

[System.Windows.Threading.Dispatcher]::Run()
