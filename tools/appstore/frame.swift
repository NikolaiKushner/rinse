// Turns raw screenshots into App Store screenshots: brand gradient, a headline, and the
// screenshot (or two side by side) with rounded corners and a soft shadow.
//
// Usage:
//   swift tools/appstore/frame.swift --size 1320x2868 --out out.png --title "Headline" \
//     [--subtitle "Second line"] --in shot.png [--in second.png --labels "Before|After"]
import AppKit

var args = Array(CommandLine.arguments.dropFirst())
func take(_ name: String) -> [String] {
    var values: [String] = []
    while let i = args.firstIndex(of: name), i + 1 < args.count {
        values.append(args[i + 1]); args.removeSubrange(i...(i + 1))
    }
    return values
}
let size = take("--size").first!.split(separator: "x").map { CGFloat(Double($0)!) }
let (W, H) = (size[0], size[1])
let out = take("--out").first!
let title = take("--title").first ?? ""
let subtitle = take("--subtitle").first
let inputs = take("--in").map { NSImage(contentsOfFile: $0)! }
let labels = take("--labels").first?.split(separator: "|").map(String.init)

let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(W), pixelsHigh: Int(H), bitsPerSample: 8,
                           samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                           bytesPerRow: 0, bitsPerPixel: 0)!
rep.size = NSSize(width: W, height: H)
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let ctx = NSGraphicsContext.current!.cgContext

// Background: the icon's teal → blue, top-left to bottom-right.
let colors = [NSColor(red: 0.04, green: 0.77, blue: 0.85, alpha: 1).cgColor,
              NSColor(red: 0.04, green: 0.42, blue: 0.96, alpha: 1).cgColor] as CFArray
let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1])!
ctx.drawLinearGradient(gradient, start: CGPoint(x: 0, y: H), end: CGPoint(x: W, y: 0), options: [])

// Headline (AppKit's origin is bottom-left, so y counts up from the bottom).
let landscape = W > H
let margin = W * (landscape ? 0.06 : 0.07)
let titleSize = (landscape ? H : W) * (landscape ? 0.075 : 0.085)
func draw(_ text: String, size: CGFloat, weight: NSFont.Weight, alpha: CGFloat, top: CGFloat) -> CGFloat {
    let style = NSMutableParagraphStyle()
    style.alignment = .center
    style.lineHeightMultiple = 0.95
    let attrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: size, weight: weight),
        .foregroundColor: NSColor.white.withAlphaComponent(alpha),
        .paragraphStyle: style,
    ]
    let str = NSAttributedString(string: text, attributes: attrs)
    let box = str.boundingRect(with: NSSize(width: W - 2 * margin, height: H), options: [.usesLineFragmentOrigin])
    str.draw(with: NSRect(x: margin, y: H - top - box.height, width: W - 2 * margin, height: box.height),
             options: [.usesLineFragmentOrigin])
    return top + box.height
}
var y = draw(title, size: titleSize, weight: .bold, alpha: 1, top: H * (landscape ? 0.07 : 0.06))
if let subtitle { y = draw(subtitle, size: titleSize * 0.48, weight: .medium, alpha: 0.88, top: y + titleSize * 0.35) }

// Screenshot(s): fill the rest, keep aspect ratio, round corners, soft shadow.
let areaTop = y + titleSize * (labels == nil ? 0.8 : 1.6)
let area = NSRect(x: margin, y: H * 0.04, width: W - 2 * margin, height: H - areaTop - H * 0.04)
let gap = inputs.count > 1 ? W * 0.04 : 0
let slotWidth = (area.width - gap * CGFloat(inputs.count - 1)) / CGFloat(inputs.count)
for (i, image) in inputs.enumerated() {
    let aspect = image.size.width / image.size.height
    var w = slotWidth, h = slotWidth / aspect
    if h > area.height { h = area.height; w = h * aspect }
    let x = area.minX + CGFloat(i) * (slotWidth + gap) + (slotWidth - w) / 2
    let rect = NSRect(x: x, y: area.maxY - h, width: w, height: h)
    let radius = min(w, h) * (landscape ? 0.02 : 0.06)
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: -W * 0.01), blur: W * 0.04, color: NSColor.black.withAlphaComponent(0.35).cgColor)
    NSColor.white.setFill()
    NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius).fill()
    ctx.restoreGState()
    ctx.saveGState()
    NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius).addClip()
    image.draw(in: rect)
    ctx.restoreGState()
    if let labels, i < labels.count {
        _ = labels[i]
        let style = NSMutableParagraphStyle(); style.alignment = .center
        let label = NSAttributedString(string: labels[i], attributes: [
            .font: NSFont.systemFont(ofSize: titleSize * 0.42, weight: .semibold),
            .foregroundColor: NSColor.white, .paragraphStyle: style])
        label.draw(in: NSRect(x: x, y: rect.maxY + titleSize * 0.25, width: w, height: titleSize * 0.7))
    }
}
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
print("wrote \(out) (\(Int(W))x\(Int(H)))")
