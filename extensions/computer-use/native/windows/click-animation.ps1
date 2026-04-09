# Click ripple animation: expanding ring that fades out at a given screen point.
# Usage: powershell.exe -ExecutionPolicy Bypass -NoProfile -File click-animation.ps1 -X <x> -Y <y> [-Color RRGGBB]

param(
    [Parameter(Mandatory = $true)]
    [double]$X,

    [Parameter(Mandatory = $true)]
    [double]$Y,

    [string]$Color = 'AEFF00'
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Windows.Forms

Add-Type @'
using System;
using System.Runtime.InteropServices;

public class Win32Click {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

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

$windowSize = 72
$animDurationMs = 450

$window = [System.Windows.Window]::new()
$window.WindowStyle = 'None'
$window.AllowsTransparency = $true
$window.Background = [System.Windows.Media.Brushes]::Transparent
$window.Topmost = $true
$window.ShowInTaskbar = $false
$window.ResizeMode = 'NoResize'
$window.Width = $windowSize
$window.Height = $windowSize

# Account for DPI
$window.Add_SourceInitialized({
    $helper = [System.Windows.Interop.WindowInteropHelper]::new($window)
    [Win32Click]::MakeClickThrough($helper.Handle)

    $source = [System.Windows.PresentationSource]::FromVisual($window)
    if ($null -ne $source) {
        $dpiX = $source.CompositionTarget.TransformToDevice.M11
        $dpiY = $source.CompositionTarget.TransformToDevice.M22
        $window.Left = ($X / $dpiX) - ($windowSize / 2)
        $window.Top = ($Y / $dpiY) - ($windowSize / 2)
    }
    else {
        $window.Left = $X - ($windowSize / 2)
        $window.Top = $Y - ($windowSize / 2)
    }
})

$canvas = [System.Windows.Controls.Canvas]::new()

# Glow ring layers for ripple effect
$ringConfigs = @(
    @{ StrokeAlpha = 38;  StrokeWidth = 6.0; StartSize = 14; EndSize = 52 },
    @{ StrokeAlpha = 90;  StrokeWidth = 3.0; StartSize = 16; EndSize = 48 },
    @{ StrokeAlpha = 204; StrokeWidth = 1.5; StartSize = 18; EndSize = 44 }
)

$duration = [System.Windows.Duration]::new([TimeSpan]::FromMilliseconds($animDurationMs))
$easeOut = [System.Windows.Media.Animation.QuadraticEase]::new()
$easeOut.EasingMode = [System.Windows.Media.Animation.EasingMode]::EaseOut

foreach ($cfg in $ringConfigs) {
    $layerColor = [System.Windows.Media.Color]::FromArgb($cfg.StrokeAlpha, $r, $g, $b)
    $layerBrush = [System.Windows.Media.SolidColorBrush]::new($layerColor)

    $ellipse = [System.Windows.Shapes.Ellipse]::new()
    $ellipse.Width = $cfg.StartSize
    $ellipse.Height = $cfg.StartSize
    $ellipse.Stroke = $layerBrush
    $ellipse.StrokeThickness = $cfg.StrokeWidth
    $ellipse.Fill = [System.Windows.Media.Brushes]::Transparent
    $ellipse.RenderTransformOrigin = [System.Windows.Point]::new(0.5, 0.5)
    [System.Windows.Controls.Canvas]::SetLeft($ellipse, ($windowSize - $cfg.StartSize) / 2)
    [System.Windows.Controls.Canvas]::SetTop($ellipse, ($windowSize - $cfg.StartSize) / 2)

    # Width animation
    $widthAnim = [System.Windows.Media.Animation.DoubleAnimation]::new()
    $widthAnim.From = $cfg.StartSize
    $widthAnim.To = $cfg.EndSize
    $widthAnim.Duration = $duration
    $widthAnim.EasingFunction = $easeOut

    # Height animation
    $heightAnim = [System.Windows.Media.Animation.DoubleAnimation]::new()
    $heightAnim.From = $cfg.StartSize
    $heightAnim.To = $cfg.EndSize
    $heightAnim.Duration = $duration
    $heightAnim.EasingFunction = $easeOut

    # Left reposition (keep centered)
    $leftAnim = [System.Windows.Media.Animation.DoubleAnimation]::new()
    $leftAnim.From = ($windowSize - $cfg.StartSize) / 2
    $leftAnim.To = ($windowSize - $cfg.EndSize) / 2
    $leftAnim.Duration = $duration
    $leftAnim.EasingFunction = $easeOut

    # Top reposition
    $topAnim = [System.Windows.Media.Animation.DoubleAnimation]::new()
    $topAnim.From = ($windowSize - $cfg.StartSize) / 2
    $topAnim.To = ($windowSize - $cfg.EndSize) / 2
    $topAnim.Duration = $duration
    $topAnim.EasingFunction = $easeOut

    # Fade out
    $fadeAnim = [System.Windows.Media.Animation.DoubleAnimation]::new()
    $fadeAnim.From = 1.0
    $fadeAnim.To = 0.0
    $fadeAnim.Duration = $duration
    $fadeAnim.EasingFunction = $easeOut

    $canvas.Children.Add($ellipse) | Out-Null

    $ellipse.BeginAnimation([System.Windows.FrameworkElement]::WidthProperty, $widthAnim)
    $ellipse.BeginAnimation([System.Windows.FrameworkElement]::HeightProperty, $heightAnim)
    $ellipse.BeginAnimation([System.Windows.Controls.Canvas]::LeftProperty, $leftAnim)
    $ellipse.BeginAnimation([System.Windows.Controls.Canvas]::TopProperty, $topAnim)
    $ellipse.BeginAnimation([System.Windows.UIElement]::OpacityProperty, $fadeAnim)
}

# Center dot for impact
$dot = [System.Windows.Shapes.Ellipse]::new()
$dotSize = 6
$dot.Width = $dotSize
$dot.Height = $dotSize
$dotColor = [System.Windows.Media.Color]::FromArgb(230, $r, $g, $b)
$dot.Fill = [System.Windows.Media.SolidColorBrush]::new($dotColor)
[System.Windows.Controls.Canvas]::SetLeft($dot, ($windowSize - $dotSize) / 2)
[System.Windows.Controls.Canvas]::SetTop($dot, ($windowSize - $dotSize) / 2)
$canvas.Children.Add($dot) | Out-Null

$dotFade = [System.Windows.Media.Animation.DoubleAnimation]::new()
$dotFade.From = 0.9
$dotFade.To = 0.0
$dotFade.Duration = [System.Windows.Duration]::new([TimeSpan]::FromMilliseconds($animDurationMs * 0.7))
$dot.BeginAnimation([System.Windows.UIElement]::OpacityProperty, $dotFade)

$window.Content = $canvas
$window.Show()

# Auto-close after animation
$closeTimer = [System.Windows.Threading.DispatcherTimer]::new()
$closeTimer.Interval = [TimeSpan]::FromMilliseconds($animDurationMs + 50)
$closeTimer.Add_Tick({
    $window.Close()
    [System.Windows.Threading.Dispatcher]::CurrentDispatcher.InvokeShutdown()
})
$closeTimer.Start()

[System.Windows.Threading.Dispatcher]::Run()
