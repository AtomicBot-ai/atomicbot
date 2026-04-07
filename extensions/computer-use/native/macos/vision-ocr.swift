import Foundation
import ImageIO
import Vision

struct BoundingBox: Encodable {
    let left: Double
    let top: Double
    let width: Double
    let height: Double
}

struct AnchorPoint: Encodable {
    let x: Double
    let y: Double
}

struct OcrLine: Encodable {
    let text: String
    let confidence: Double
    let bbox: BoundingBox
    let center: AnchorPoint
}

struct OcrResponse: Encodable {
    let engine: String
    let imageWidth: Double
    let imageHeight: Double
    let lines: [OcrLine]
}

enum VisionOcrError: Error {
    case invalidArguments
    case imageSourceUnavailable
    case imageMetadataUnavailable
}

func readImageSize(url: URL) throws -> (width: Double, height: Double) {
    guard let imageSource = CGImageSourceCreateWithURL(url as CFURL, nil) else {
        throw VisionOcrError.imageSourceUnavailable
    }
    guard
        let properties = CGImageSourceCopyPropertiesAtIndex(imageSource, 0, nil) as? [CFString: Any],
        let width = properties[kCGImagePropertyPixelWidth] as? Double,
        let height = properties[kCGImagePropertyPixelHeight] as? Double
    else {
        throw VisionOcrError.imageMetadataUnavailable
    }
    return (width, height)
}

func toPixelBoundingBox(_ box: CGRect, imageWidth: Double, imageHeight: Double) -> BoundingBox {
    let left = box.origin.x * imageWidth
    let top = (1.0 - box.origin.y - box.height) * imageHeight
    return BoundingBox(
        left: left,
        top: top,
        width: box.width * imageWidth,
        height: box.height * imageHeight
    )
}

func toAnchorPoint(_ bbox: BoundingBox) -> AnchorPoint {
    AnchorPoint(
        x: bbox.left + (bbox.width / 2.0),
        y: bbox.top + (bbox.height / 2.0)
    )
}

func sortReadingOrder(left: OcrLine, right: OcrLine) -> Bool {
    if abs(left.bbox.top - right.bbox.top) <= 8.0 {
        return left.bbox.left < right.bbox.left
    }
    return left.bbox.top < right.bbox.top
}

func recognizeText(url: URL) throws -> OcrResponse {
    let imageSize = try readImageSize(url: url)
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.minimumTextHeight = 0.012

    let handler = VNImageRequestHandler(url: url, options: [:])
    try handler.perform([request])

    let observations = request.results ?? []
    let lines = observations.compactMap { observation -> OcrLine? in
        guard let candidate = observation.topCandidates(1).first else {
            return nil
        }
        let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            return nil
        }
        let bbox = toPixelBoundingBox(
            observation.boundingBox,
            imageWidth: imageSize.width,
            imageHeight: imageSize.height
        )
        return OcrLine(
            text: text,
            confidence: Double(observation.confidence),
            bbox: bbox,
            center: toAnchorPoint(bbox)
        )
    }
    .sorted(by: sortReadingOrder)

    return OcrResponse(
        engine: "vision",
        imageWidth: imageSize.width,
        imageHeight: imageSize.height,
        lines: lines
    )
}

let arguments = CommandLine.arguments
guard arguments.count >= 2 else {
    fputs("{\"error\":\"image path argument is required\"}\n", stderr)
    exit(1)
}

do {
    let imageURL = URL(fileURLWithPath: arguments[1])
    let response = try recognizeText(url: imageURL)
    let encoder = JSONEncoder()
    encoder.outputFormatting = []
    let data = try encoder.encode(response)
    if let output = String(data: data, encoding: .utf8) {
        print(output)
    } else {
        throw VisionOcrError.invalidArguments
    }
} catch {
    fputs("{\"error\":\"vision ocr failed\"}\n", stderr)
    exit(1)
}
