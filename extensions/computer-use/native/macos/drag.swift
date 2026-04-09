// Native drag implementation using kCGEventLeftMouseDragged events.
// The default usecomputer bridge sends kCGEventMouseMoved during drag steps,
// which macOS does not treat as a drag gesture — files won't follow the cursor.
//
// Usage: xcrun swift drag.swift <fromX> <fromY> <toX> <toY> [--duration-ms N] [--steps N]

import CoreGraphics
import Foundation

let args = CommandLine.arguments
guard args.count >= 5,
      let fromX = Double(args[1]),
      let fromY = Double(args[2]),
      let toX = Double(args[3]),
      let toY = Double(args[4])
else {
    fputs("Usage: drag.swift <fromX> <fromY> <toX> <toY> [--duration-ms N] [--steps N]\n", stderr)
    exit(1)
}

var durationMs: Double = 0
var stepCount: Int = 32

if let idx = args.firstIndex(of: "--duration-ms"), idx + 1 < args.count,
   let v = Double(args[idx + 1]), v > 0 {
    durationMs = v
}
if let idx = args.firstIndex(of: "--steps"), idx + 1 < args.count,
   let v = Int(args[idx + 1]), v > 0 {
    stepCount = v
}

// Auto-compute duration from distance if not provided (0.5 px/ms, min 200ms).
if durationMs <= 0 {
    let dist = sqrt((toX - fromX) * (toX - fromX) + (toY - fromY) * (toY - fromY))
    durationMs = max(dist / 0.5, 200)
}

let stepDuration = durationMs / Double(stepCount) / 1000.0 // seconds per step

func lerp(_ a: Double, _ b: Double, _ t: Double) -> Double {
    a + (b - a) * t
}

// Move cursor to start position.
let fromPoint = CGPoint(x: fromX, y: fromY)
CGWarpMouseCursorPosition(fromPoint)
usleep(50_000) // 50ms settle

// Mouse down at start.
guard let downEvent = CGEvent(
    mouseEventSource: nil,
    mouseType: .leftMouseDown,
    mouseCursorPosition: fromPoint,
    mouseButton: .left
) else {
    fputs("Failed to create mouseDown event\n", stderr)
    exit(2)
}
downEvent.setIntegerValueField(.mouseEventClickState, value: 1)
downEvent.post(tap: .cghidEventTap)
usleep(30_000) // 30ms before starting the drag motion

// Drag steps with kCGEventLeftMouseDragged.
for i in 1...stepCount {
    let t = Double(i) / Double(stepCount)
    let x = lerp(fromX, toX, t)
    let y = lerp(fromY, toY, t)
    let point = CGPoint(x: x, y: y)

    CGWarpMouseCursorPosition(point)

    guard let dragEvent = CGEvent(
        mouseEventSource: nil,
        mouseType: .leftMouseDragged,
        mouseCursorPosition: point,
        mouseButton: .left
    ) else { continue }
    dragEvent.post(tap: .cghidEventTap)

    if i < stepCount {
        usleep(UInt32(stepDuration * 1_000_000))
    }
}

// Mouse up at destination.
let toPoint = CGPoint(x: toX, y: toY)
usleep(30_000) // brief settle before release
guard let upEvent = CGEvent(
    mouseEventSource: nil,
    mouseType: .leftMouseUp,
    mouseCursorPosition: toPoint,
    mouseButton: .left
) else {
    fputs("Failed to create mouseUp event\n", stderr)
    exit(2)
}
upEvent.setIntegerValueField(.mouseEventClickState, value: 1)
upEvent.post(tap: .cghidEventTap)
