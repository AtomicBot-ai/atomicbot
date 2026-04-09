# Agent control overlay: glowing screen border + cursor highlight ring.
# Launched as a subprocess, stays alive until killed.
# Usage: powershell.exe -ExecutionPolicy Bypass -NoProfile -File agent-overlay.ps1 [-Color RRGGBB]

param(
    [string]$Color = 'AEFF00',
    [int]$BorderWidth = 2
)

$ErrorActionPreference = 'Stop'

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

$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$bounds = $screen.Bounds

# ── Border window with glow ──────────────────────────────────

$borderWindow = [System.Windows.Window]::new()
$borderWindow.WindowStyle = 'None'
$borderWindow.AllowsTransparency = $true
$borderWindow.Background = [System.Windows.Media.Brushes]::Transparent
$borderWindow.Topmost = $true
$borderWindow.ShowInTaskbar = $false
$borderWindow.Left = $bounds.Left
$borderWindow.Top = $bounds.Top
$borderWindow.Width = $bounds.Width
$borderWindow.Height = $bounds.Height
$borderWindow.ResizeMode = 'NoResize'
$borderWindow.Opacity = 0

# Build glow using nested borders with decreasing alpha
$glowLayers = @(
    @{ Thickness = 20; Alpha = 15 },
    @{ Thickness = 14; Alpha = 25 },
    @{ Thickness = 8;  Alpha = 46 },
    @{ Thickness = 4;  Alpha = 102 },
    @{ Thickness = $BorderWidth; Alpha = 230 }
)

$currentElement = $null
for ($i = 0; $i -lt $glowLayers.Count; $i++) {
    $layer = $glowLayers[$i]
    $layerColor = [System.Windows.Media.Color]::FromArgb($layer.Alpha, $r, $g, $b)
    $layerBrush = [System.Windows.Media.SolidColorBrush]::new($layerColor)

    $border = [System.Windows.Controls.Border]::new()
    $border.BorderBrush = $layerBrush
    $border.BorderThickness = [System.Windows.Thickness]::new($layer.Thickness)
    $border.Background = [System.Windows.Media.Brushes]::Transparent

    if ($null -ne $currentElement) {
        $border.Child = $currentElement
    }
    $currentElement = $border
}
$borderWindow.Content = $currentElement

$borderWindow.Add_SourceInitialized({
    $helper = [System.Windows.Interop.WindowInteropHelper]::new($borderWindow)
    [Win32Overlay]::MakeClickThrough($helper.Handle)
})

# ── Cursor ring window with glow ─────────────────────────────

$ringSize = 40

$cursorWindow = [System.Windows.Window]::new()
$cursorWindow.WindowStyle = 'None'
$cursorWindow.AllowsTransparency = $true
$cursorWindow.Background = [System.Windows.Media.Brushes]::Transparent
$cursorWindow.Topmost = $true
$cursorWindow.ShowInTaskbar = $false
$cursorWindow.Width = $ringSize
$cursorWindow.Height = $ringSize
$cursorWindow.ResizeMode = 'NoResize'
$cursorWindow.Opacity = 0

$canvas = [System.Windows.Controls.Canvas]::new()

$cursorGlowLayers = @(
    @{ StrokeWidth = 8; Alpha = 25; Inset = 0 },
    @{ StrokeWidth = 5; Alpha = 64; Inset = 2 },
    @{ StrokeWidth = 2.5; Alpha = 204; Inset = 4 }
)

foreach ($layer in $cursorGlowLayers) {
    $layerColor = [System.Windows.Media.Color]::FromArgb($layer.Alpha, $r, $g, $b)
    $layerBrush = [System.Windows.Media.SolidColorBrush]::new($layerColor)

    $ellipse = [System.Windows.Shapes.Ellipse]::new()
    $ellipse.Width = $ringSize - ($layer.Inset * 2)
    $ellipse.Height = $ringSize - ($layer.Inset * 2)
    $ellipse.Stroke = $layerBrush
    $ellipse.StrokeThickness = $layer.StrokeWidth
    $ellipse.Fill = [System.Windows.Media.Brushes]::Transparent
    [System.Windows.Controls.Canvas]::SetLeft($ellipse, $layer.Inset)
    [System.Windows.Controls.Canvas]::SetTop($ellipse, $layer.Inset)
    $canvas.Children.Add($ellipse) | Out-Null
}

$cursorWindow.Content = $canvas

$cursorWindow.Add_SourceInitialized({
    $helper = [System.Windows.Interop.WindowInteropHelper]::new($cursorWindow)
    [Win32Overlay]::MakeClickThrough($helper.Handle)
})

# ── Fade-in animation ────────────────────────────────────────

function Start-FadeIn {
    $fadeIn = [System.Windows.Media.Animation.DoubleAnimation]::new()
    $fadeIn.From = 0.0
    $fadeIn.To = 1.0
    $fadeIn.Duration = [System.Windows.Duration]::new([TimeSpan]::FromMilliseconds(400))
    $fadeIn.EasingFunction = [System.Windows.Media.Animation.QuadraticEase]::new()
    $fadeIn.EasingFunction.EasingMode = [System.Windows.Media.Animation.EasingMode]::EaseOut

    $borderWindow.BeginAnimation([System.Windows.Window]::OpacityProperty, $fadeIn)
    $cursorWindow.BeginAnimation([System.Windows.Window]::OpacityProperty, $fadeIn)
}

# ── Cursor tracking timer ────────────────────────────────────

$timer = [System.Windows.Threading.DispatcherTimer]::new()
$timer.Interval = [TimeSpan]::FromMilliseconds(33)
$timer.Add_Tick({
    $pt = [Win32Overlay+POINT]::new()
    [void][Win32Overlay]::GetCursorPos([ref]$pt)

    $source = [System.Windows.PresentationSource]::FromVisual($cursorWindow)
    if ($null -ne $source) {
        $dpiX = $source.CompositionTarget.TransformToDevice.M11
        $dpiY = $source.CompositionTarget.TransformToDevice.M22
        $cursorWindow.Left = ($pt.X / $dpiX) - ($ringSize / 2)
        $cursorWindow.Top = ($pt.Y / $dpiY) - ($ringSize / 2)
    }
    else {
        $cursorWindow.Left = $pt.X - ($ringSize / 2)
        $cursorWindow.Top = $pt.Y - ($ringSize / 2)
    }
})

# ── Launch ────────────────────────────────────────────────────

$borderWindow.Show()
$cursorWindow.Show()
$timer.Start()
Start-FadeIn

[System.Windows.Threading.Dispatcher]::Run()
