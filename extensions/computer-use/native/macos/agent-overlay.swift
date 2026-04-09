// Agent control overlay: glowing screen border + cursor highlight ring.
// Launched as a subprocess, stays alive until killed (SIGTERM/SIGINT).
// Usage: xcrun swift agent-overlay.swift [--color RRGGBB]

import AppKit

let BORDER_CORE_WIDTH: CGFloat = 3.5
let CURSOR_RING_SIZE: CGFloat = 40.0
let CURSOR_POLL_INTERVAL: TimeInterval = 1.0 / 30.0
let FADE_IN_DURATION: TimeInterval = 0.4
let FADE_OUT_DURATION: TimeInterval = 0.35

// Breathing pulse: alpha oscillates between these bounds
let PULSE_MIN_ALPHA: CGFloat = 0.55
let PULSE_MAX_ALPHA: CGFloat = 1.0
let PULSE_PERIOD: TimeInterval = 2.0

// Project lime: --lime: #aeff00 from electron-desktop base.css
var overlayR: CGFloat = 0.682
var overlayG: CGFloat = 1.0
var overlayB: CGFloat = 0.0

func parseColorArg() {
    let args = CommandLine.arguments
    if let idx = args.firstIndex(of: "--color"), idx + 1 < args.count {
        let hex = args[idx + 1]
        if hex.count == 6,
           let r = UInt8(hex.prefix(2), radix: 16),
           let g = UInt8(hex.dropFirst(2).prefix(2), radix: 16),
           let b = UInt8(hex.dropFirst(4).prefix(2), radix: 16)
        {
            overlayR = CGFloat(r) / 255.0
            overlayG = CGFloat(g) / 255.0
            overlayB = CGFloat(b) / 255.0
        }
    }
}

// ── Glow border view ─────────────────────────────────────────
// Draws multiple concentric strokes with decreasing alpha
// to simulate a soft outer glow around the screen edge.

final class GlowBorderView: NSView {
    override var wantsLayer: Bool { get { true } set {} }

    private static let layerCount = 36
    private static let maxWidth: CGFloat = 38.0

    override func draw(_ dirtyRect: NSRect) {
        NSColor.clear.setFill()
        dirtyRect.fill()

        let count = GlowBorderView.layerCount
        for i in 0..<count {
            let t = CGFloat(i) / CGFloat(count - 1) // 0 (outermost) → 1 (innermost)
            let width = GlowBorderView.maxWidth * (1.0 - t) + BORDER_CORE_WIDTH
            let alpha = 0.03 + 0.85 * pow(t, 2.2)

            let color = NSColor(red: overlayR, green: overlayG, blue: overlayB, alpha: alpha)
            color.setStroke()
            let inset = width / 2.0
            let path = NSBezierPath(rect: bounds.insetBy(dx: inset, dy: inset))
            path.lineWidth = 1.2
            path.stroke()
        }
    }
}

// ── Cursor label view ────────────────────────────────────────

final class CursorLabelView: NSView {
    override var wantsLayer: Bool { get { true } set {} }
    override var isFlipped: Bool { false }

    static let labelText = "Atomic bot"
    static let fontSize: CGFloat = 11.0
    static let paddingH: CGFloat = 8.0
    static let paddingV: CGFloat = 3.0
    static let cornerRadius: CGFloat = 4.0

    private lazy var textAttrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: CursorLabelView.fontSize, weight: .medium),
        .foregroundColor: NSColor.black,
    ]

    override func draw(_ dirtyRect: NSRect) {
        NSColor.clear.setFill()
        dirtyRect.fill()

        let bgColor = NSColor(red: overlayR, green: overlayG, blue: overlayB, alpha: 1.0)
        let pill = NSBezierPath(
            roundedRect: bounds.insetBy(dx: 1, dy: 1),
            xRadius: CursorLabelView.cornerRadius,
            yRadius: CursorLabelView.cornerRadius
        )
        bgColor.setFill()
        pill.fill()

        let str = NSAttributedString(string: CursorLabelView.labelText, attributes: textAttrs)
        let size = str.size()
        let origin = NSPoint(
            x: (bounds.width - size.width) / 2.0,
            y: (bounds.height - size.height) / 2.0
        )
        str.draw(at: origin)
    }

    static func preferredSize() -> NSSize {
        let attrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: fontSize, weight: .medium),
        ]
        let size = (labelText as NSString).size(withAttributes: attrs)
        return NSSize(
            width: ceil(size.width) + paddingH * 2 + 2,
            height: ceil(size.height) + paddingV * 2 + 2
        )
    }
}

// ── Glow cursor ring view ────────────────────────────────────

final class GlowCursorRingView: NSView {
    override var wantsLayer: Bool { get { true } set {} }

    private static let layerCount = 14
    private static let maxSpread: CGFloat = 10.0

    override func draw(_ dirtyRect: NSRect) {
        NSColor.clear.setFill()
        dirtyRect.fill()

        let count = GlowCursorRingView.layerCount
        for i in 0..<count {
            let t = CGFloat(i) / CGFloat(count - 1)
            let spread = GlowCursorRingView.maxSpread * (1.0 - t)
            let alpha = 0.04 + 0.76 * pow(t, 2.0)

            let color = NSColor(red: overlayR, green: overlayG, blue: overlayB, alpha: alpha)
            color.setStroke()
            let inset = spread + 3.0
            let circle = NSBezierPath(ovalIn: bounds.insetBy(dx: inset, dy: inset))
            circle.lineWidth = 1.2
            circle.stroke()
        }
    }
}

// ── Main ─────────────────────────────────────────────────────

parseColorArg()

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

guard let screen = NSScreen.main else {
    fputs("No main screen available\n", stderr)
    exit(1)
}

let frame = screen.frame
let maxLevel = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.maximumWindow)))

// Border window — full screen, click-through, starts invisible for fade-in
let borderWindow = NSWindow(
    contentRect: frame,
    styleMask: .borderless,
    backing: .buffered,
    defer: false
)
borderWindow.level = maxLevel
borderWindow.backgroundColor = .clear
borderWindow.isOpaque = false
borderWindow.hasShadow = false
borderWindow.ignoresMouseEvents = true
borderWindow.collectionBehavior = [.canJoinAllSpaces, .stationary]
borderWindow.contentView = GlowBorderView(frame: frame)
borderWindow.contentView?.wantsLayer = true
borderWindow.alphaValue = 0
borderWindow.orderFrontRegardless()

// Cursor ring window
let cursorWindow = NSWindow(
    contentRect: NSRect(x: 0, y: 0, width: CURSOR_RING_SIZE, height: CURSOR_RING_SIZE),
    styleMask: .borderless,
    backing: .buffered,
    defer: false
)
cursorWindow.level = maxLevel
cursorWindow.backgroundColor = .clear
cursorWindow.isOpaque = false
cursorWindow.hasShadow = false
cursorWindow.ignoresMouseEvents = true
cursorWindow.collectionBehavior = [.canJoinAllSpaces, .stationary]
cursorWindow.contentView = GlowCursorRingView(
    frame: NSRect(x: 0, y: 0, width: CURSOR_RING_SIZE, height: CURSOR_RING_SIZE)
)
cursorWindow.contentView?.wantsLayer = true
cursorWindow.alphaValue = 0

// Label window — follows cursor, sits below the ring
let labelSize = CursorLabelView.preferredSize()
let labelWindow = NSWindow(
    contentRect: NSRect(x: 0, y: 0, width: labelSize.width, height: labelSize.height),
    styleMask: .borderless,
    backing: .buffered,
    defer: false
)
labelWindow.level = maxLevel
labelWindow.backgroundColor = .clear
labelWindow.isOpaque = false
labelWindow.hasShadow = false
labelWindow.ignoresMouseEvents = true
labelWindow.collectionBehavior = [.canJoinAllSpaces, .stationary]
labelWindow.contentView = CursorLabelView(
    frame: NSRect(x: 0, y: 0, width: labelSize.width, height: labelSize.height)
)
labelWindow.contentView?.wantsLayer = true
labelWindow.alphaValue = 0

// ── Fade in ──────────────────────────────────────────────────

NSAnimationContext.runAnimationGroup { ctx in
    ctx.duration = FADE_IN_DURATION
    ctx.timingFunction = CAMediaTimingFunction(name: .easeOut)
    borderWindow.animator().alphaValue = 1.0
    cursorWindow.animator().alphaValue = 1.0
    labelWindow.animator().alphaValue = 1.0
}

// ── Breathing pulse ─────────────────────────────────────────
// Smooth sine-wave alpha oscillation so the overlay feels alive.

var pulseTerminating = false
let pulseStart = CFAbsoluteTimeGetCurrent()

Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { timer in
    if pulseTerminating { timer.invalidate(); return }
    let elapsed = CFAbsoluteTimeGetCurrent() - pulseStart
    let t = (1.0 + sin(2.0 * .pi * elapsed / PULSE_PERIOD - .pi / 2.0)) / 2.0
    let alpha = PULSE_MIN_ALPHA + (PULSE_MAX_ALPHA - PULSE_MIN_ALPHA) * CGFloat(t)
    DispatchQueue.main.async {
        borderWindow.alphaValue = alpha
        cursorWindow.alphaValue = alpha
        labelWindow.alphaValue = alpha
    }
}

// ── Cursor tracking ──────────────────────────────────────────

Timer.scheduledTimer(withTimeInterval: CURSOR_POLL_INTERVAL, repeats: true) { _ in
    DispatchQueue.main.async {
        let pos = NSEvent.mouseLocation
        cursorWindow.setFrameOrigin(NSPoint(
            x: pos.x - CURSOR_RING_SIZE / 2.0,
            y: pos.y - CURSOR_RING_SIZE / 2.0
        ))
        cursorWindow.orderFrontRegardless()

        labelWindow.setFrameOrigin(NSPoint(
            x: pos.x + 6.0,
            y: pos.y - labelSize.height - 8.0
        ))
        labelWindow.orderFrontRegardless()
    }
}

// ── Graceful fade-out on termination ─────────────────────────

func gracefulFadeOut() {
    pulseTerminating = true
    NSAnimationContext.runAnimationGroup({ ctx in
        ctx.duration = FADE_OUT_DURATION
        ctx.timingFunction = CAMediaTimingFunction(name: .easeIn)
        borderWindow.animator().alphaValue = 0
        cursorWindow.animator().alphaValue = 0
        labelWindow.animator().alphaValue = 0
    }, completionHandler: {
        exit(0)
    })
}

let sigTermSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
signal(SIGTERM, SIG_IGN)
sigTermSource.setEventHandler { gracefulFadeOut() }
sigTermSource.resume()

let sigIntSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
signal(SIGINT, SIG_IGN)
sigIntSource.setEventHandler { gracefulFadeOut() }
sigIntSource.resume()

app.run()
