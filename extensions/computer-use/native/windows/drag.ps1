# Native drag implementation using SendInput with MOUSEEVENTF_MOVE.
# The default usecomputer bridge uses SetCursorPos during drag steps,
# which does not inject input events — applications ignore the movement
# and drag-and-drop fails.
#
# Usage: powershell.exe -ExecutionPolicy Bypass -NoProfile -File drag.ps1 -FromX <x> -FromY <y> -ToX <x> -ToY <y> [-DurationMs <ms>] [-Steps <n>]

param(
    [Parameter(Mandatory = $true)]
    [double]$FromX,

    [Parameter(Mandatory = $true)]
    [double]$FromY,

    [Parameter(Mandatory = $true)]
    [double]$ToX,

    [Parameter(Mandatory = $true)]
    [double]$ToY,

    [int]$DurationMs = 0,

    [int]$Steps = 32
)

$ErrorActionPreference = 'Stop'

Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Threading;

public class NativeDrag {
    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT {
        public uint type;
        public MOUSEINPUT mi;
    }

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int nIndex);

    const uint INPUT_MOUSE = 0;
    const uint MOUSEEVENTF_MOVE = 0x0001;
    const uint MOUSEEVENTF_ABSOLUTE = 0x8000;
    const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    const uint MOUSEEVENTF_LEFTUP = 0x0004;

    static int ScreenWidth() { return GetSystemMetrics(0); }
    static int ScreenHeight() { return GetSystemMetrics(1); }

    static INPUT MoveInput(double x, double y) {
        int sw = ScreenWidth();
        int sh = ScreenHeight();
        var inp = new INPUT();
        inp.type = INPUT_MOUSE;
        inp.mi.dx = (int)((x * 65536.0) / sw + 0.5);
        inp.mi.dy = (int)((y * 65536.0) / sh + 0.5);
        inp.mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE;
        return inp;
    }

    static INPUT ButtonInput(uint flags) {
        var inp = new INPUT();
        inp.type = INPUT_MOUSE;
        inp.mi.dwFlags = flags;
        return inp;
    }

    public static void Drag(double fromX, double fromY, double toX, double toY,
                            int durationMs, int steps) {
        if (durationMs <= 0) {
            double dist = Math.Sqrt((toX - fromX) * (toX - fromX) + (toY - fromY) * (toY - fromY));
            durationMs = Math.Max((int)(dist / 0.5), 200);
        }
        int stepDelay = durationMs / steps;

        // Move to start
        var inputs = new INPUT[] { MoveInput(fromX, fromY) };
        SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
        Thread.Sleep(50);

        // Mouse down
        inputs = new INPUT[] { ButtonInput(MOUSEEVENTF_LEFTDOWN) };
        SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
        Thread.Sleep(30);

        // Drag steps with MOUSEEVENTF_MOVE
        for (int i = 1; i <= steps; i++) {
            double t = (double)i / steps;
            double x = fromX + (toX - fromX) * t;
            double y = fromY + (toY - fromY) * t;

            inputs = new INPUT[] { MoveInput(x, y) };
            SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));

            if (i < steps && stepDelay > 0) {
                Thread.Sleep(stepDelay);
            }
        }

        Thread.Sleep(30);

        // Mouse up
        inputs = new INPUT[] { ButtonInput(MOUSEEVENTF_LEFTUP) };
        SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
    }
}
'@

[NativeDrag]::Drag($FromX, $FromY, $ToX, $ToY, $DurationMs, $Steps)
