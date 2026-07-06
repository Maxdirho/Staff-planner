import AppKit

let size = NSSize(width: 1024, height: 1024)
let image = NSImage(size: size)
image.lockFocus()

let background = NSBezierPath(roundedRect: NSRect(x: 72, y: 72, width: 880, height: 880), xRadius: 205, yRadius: 205)
NSColor(calibratedRed: 0.071, green: 0.420, blue: 0.388, alpha: 1).setFill()
background.fill()

let sheet = NSBezierPath(roundedRect: NSRect(x: 245, y: 205, width: 534, height: 614), xRadius: 70, yRadius: 70)
NSColor(calibratedWhite: 1, alpha: 0.96).setFill()
sheet.fill()

NSColor(calibratedRed: 0.071, green: 0.420, blue: 0.388, alpha: 1).setStroke()
for y in [650.0, 535.0, 420.0] {
    let line = NSBezierPath()
    line.lineWidth = 34
    line.lineCapStyle = .round
    line.move(to: NSPoint(x: 345, y: y))
    line.line(to: NSPoint(x: 680, y: y))
    line.stroke()
}

let check = NSBezierPath()
check.lineWidth = 42
check.lineCapStyle = .round
check.lineJoinStyle = .round
check.move(to: NSPoint(x: 340, y: 318))
check.line(to: NSPoint(x: 445, y: 245))
check.line(to: NSPoint(x: 690, y: 360))
check.stroke()

image.unlockFocus()
guard let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:]) else { exit(1) }
try png.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
