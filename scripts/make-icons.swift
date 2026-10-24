// Renders the Rinse icon (water drop with a play glyph on a teal gradient) to PNGs.
// Usage: swift scripts/make-icons.swift
import AppKit

func render(_ size: Int, rounded: Bool) -> Data {
    let s = CGFloat(size)
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                               bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let ctx = NSGraphicsContext.current!.cgContext
    let bounds = CGRect(x: 0, y: 0, width: s, height: s)
    // macOS icons sit on a transparent canvas with ~10% margin; iOS icons are full-bleed squares.
    let tile = rounded ? bounds.insetBy(dx: s * 0.1, dy: s * 0.1) : bounds
    let path = rounded ? CGPath(roundedRect: tile, cornerWidth: tile.width * 0.225, cornerHeight: tile.width * 0.225, transform: nil)
                       : CGPath(rect: tile, transform: nil)
    ctx.addPath(path); ctx.clip()
    let colors = [NSColor(red: 0.05, green: 0.75, blue: 0.85, alpha: 1).cgColor,
                  NSColor(red: 0.10, green: 0.35, blue: 0.95, alpha: 1).cgColor] as CFArray
    let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1])!
    ctx.drawLinearGradient(grad, start: CGPoint(x: tile.minX, y: tile.maxY), end: CGPoint(x: tile.maxX, y: tile.minY), options: [])

    // Water drop.
    let w = tile.width, cx = tile.midX, top = tile.minY + w * 0.84, r = w * 0.26, cy = tile.minY + w * 0.38
    let drop = CGMutablePath()
    drop.move(to: CGPoint(x: cx, y: top))
    drop.addCurve(to: CGPoint(x: cx + r, y: cy), control1: CGPoint(x: cx + r * 0.25, y: top - w * 0.12), control2: CGPoint(x: cx + r, y: cy + r * 0.9))
    drop.addArc(center: CGPoint(x: cx, y: cy), radius: r, startAngle: 0, endAngle: .pi, clockwise: true)
    drop.addCurve(to: CGPoint(x: cx, y: top), control1: CGPoint(x: cx - r, y: cy + r * 0.9), control2: CGPoint(x: cx - r * 0.25, y: top - w * 0.12))
    ctx.addPath(drop); ctx.setFillColor(NSColor.white.cgColor); ctx.fillPath()

    // Play triangle inside the drop.
    let t = r * 0.62
    let play = CGMutablePath()
    play.move(to: CGPoint(x: cx - t * 0.4, y: cy + t * 0.55))
    play.addLine(to: CGPoint(x: cx - t * 0.4, y: cy - t * 0.55))
    play.addLine(to: CGPoint(x: cx + t * 0.6, y: cy))
    play.closeSubpath()
    ctx.addPath(play); ctx.setFillColor(NSColor(red: 0.10, green: 0.45, blue: 0.95, alpha: 1).cgColor); ctx.fillPath()
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

let fm = FileManager.default
let appIcon = "App/Assets.xcassets/AppIcon.appiconset"
try fm.createDirectory(atPath: appIcon, withIntermediateDirectories: true)
var images: [[String: String]] = [["filename": "ios-1024.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"]]
try render(1024, rounded: false).write(to: URL(fileURLWithPath: "\(appIcon)/ios-1024.png"))
for pt in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let name = "mac-\(pt)@\(scale)x.png"
        try render(pt * scale, rounded: true).write(to: URL(fileURLWithPath: "\(appIcon)/\(name)"))
        images.append(["filename": name, "idiom": "mac", "scale": "\(scale)x", "size": "\(pt)x\(pt)"])
    }
}
let info = ["author": "xcode", "version": 1] as [String: Any]
try JSONSerialization.data(withJSONObject: ["images": images, "info": info], options: [.prettyPrinted, .sortedKeys])
    .write(to: URL(fileURLWithPath: "\(appIcon)/Contents.json"))
try JSONSerialization.data(withJSONObject: ["info": info], options: .prettyPrinted)
    .write(to: URL(fileURLWithPath: "App/Assets.xcassets/Contents.json"))
for px in [48, 96, 128, 256, 512] {
    try render(px, rounded: true).write(to: URL(fileURLWithPath: "Extensions/YouTube/Resources/icon-\(px).png"))
}
print("icons written")
