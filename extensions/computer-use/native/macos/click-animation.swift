// Click ripple animation: ring contracts toward click point and fades out.
// Usage: xcrun swift click-animation.swift <x> <y> [--color RRGGBB]

import AppKit

let RING_START_RADIUS: CGFloat = 40.0
let RING_END_RADIUS: CGFloat = 4.0
let ANIMATION_DURATION: TimeInterval = 0.55
let WINDOW_SIZE: CGFloat = (RING_START_RADIUS + 20.0) * 2.0
let LAYER_COUNT = 16

// Project lime: #AEFF00
var colorR: CGFloat = 0.682
var colorG: CGFloat = 1.0
var colorB: CGFloat = 0.0

let args = CommandLine.arguments
guard args.count >= 3,
      let screenX = Double(args[1]),
      let screenY = Double(args[2])
else {
    fputs("Usage: click-animation.swift <x> <y> [--color RRGGBB]\n", stderr)
    exit(1)
}

if let idx = args.firstIndex(of: "--color"), idx + 1 < args.count {
    let hex = args[idx + 1]
    if hex.count == 6,
       let r = UInt8(hex.prefix(2), radix: 16),
       let g = UInt8(hex.dropFirst(2).prefix(2), radix: 16),
       let b = UInt8(hex.dropFirst(4).prefix(2), radix: 16)
    {
        colorR = CGFloat(r) / 255.0
        colorG = CGFloat(g) / 255.0
        colorB = CGFloat(b) / 255.0
    }
}

// ── NSView that draws animated contracting rings ─────────────

final class RippleView: NSView {
    private var startTime: CFTimeInterval = 0
    private var displayLink: CVDisplayLink?

    override var wantsLayer: Bool { get { true } set {} }
    override var isFlipped: Bool { false }

    func startAnimation() {
        startTime = CACurrentMediaTime()

        var link: CVDisplayLink?
        CVDisplayLinkCreateWithActiveCGDisplays(&link)
        guard let dl = link else { return }
        displayLink = dl

        CVDisplayLinkSetOutputHandler(dl) { [weak self] _, _, _, _, _ in
            DispatchQueue.main.async { self?.needsDisplay = true }
            return kCVReturnSuccess
        }
        CVDisplayLinkStart(dl)
    }

    func stopAnimation() {
        if let dl = displayLink {
            CVDisplayLinkStop(dl)
            displayLink = nil
        }
    }

    override func draw(_ dirtyRect: NSRect) {
        NSColor.clear.setFill()
        dirtyRect.fill()

        let elapsed = CACurrentMediaTime() - startTime
        let progress = min(elapsed / ANIMATION_DURATION, 1.0)
        if progress >= 1.0 {
            stopAnimation()
            return
        }

        let eased = 1.0 - pow(1.0 - progress, 2.5) // ease-out
        let cx = bounds.midX
        let cy = bounds.midY

        for i in 0..<LAYER_COUNT {
            let t = CGFloat(i) / CGFloat(LAYER_COUNT - 1) // 0 = outermost, 1 = innermost
            let alpha = (0.03 + 0.75 * pow(t, 1.8)) * (1.0 - CGFloat(progress))

            // Each layer starts at a slightly different radius and all converge to center
            let layerStartR = RING_START_RADIUS - t * 12.0
            let radius = layerStartR + (RING_END_RADIUS - layerStartR) * CGFloat(eased)

            let color = NSColor(red: colorR, green: colorG, blue: colorB, alpha: alpha)
            color.setStroke()

            let rect = NSRect(x: cx - radius, y: cy - radius, width: radius * 2, height: radius * 2)
            let circle = NSBezierPath(ovalIn: rect)
            circle.lineWidth = 1.3
            circle.stroke()
        }
    }
}

// ── Main ─────────────────────────────────────────────────────

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

guard let screen = NSScreen.main else { exit(1) }

let flippedY = screen.frame.height - CGFloat(screenY)
let origin = NSPoint(
    x: CGFloat(screenX) - WINDOW_SIZE / 2.0,
    y: flippedY - WINDOW_SIZE / 2.0
)

let maxLevel = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.maximumWindow)))

let window = NSWindow(
    contentRect: NSRect(origin: origin, size: NSSize(width: WINDOW_SIZE, height: WINDOW_SIZE)),
    styleMask: .borderless,
    backing: .buffered,
    defer: false
)
window.level = maxLevel
window.backgroundColor = .clear
window.isOpaque = false
window.hasShadow = false
window.ignoresMouseEvents = true
window.collectionBehavior = [.canJoinAllSpaces, .stationary]

let rippleView = RippleView(frame: NSRect(x: 0, y: 0, width: WINDOW_SIZE, height: WINDOW_SIZE))
window.contentView = rippleView
window.orderFrontRegardless()

rippleView.startAnimation()

DispatchQueue.main.asyncAfter(deadline: .now() + ANIMATION_DURATION + 0.05) {
    app.terminate(nil)
}

signal(SIGTERM, SIG_IGN)
let src = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
src.setEventHandler { app.terminate(nil) }
src.resume()

app.run()
