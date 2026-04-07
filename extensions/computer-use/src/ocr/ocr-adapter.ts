export type OcrBoundingBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type OcrAnchorPoint = {
  x: number;
  y: number;
};

export type OcrLine = {
  text: string;
  confidence: number;
  bbox: OcrBoundingBox;
  center: OcrAnchorPoint;
};

export type OcrResult = {
  engine: string;
  imageWidth: number;
  imageHeight: number;
  lines: OcrLine[];
};

export type RecognizeTextParams = {
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
  signal?: AbortSignal;
};

export type OcrAdapter = {
  recognizeText(params: RecognizeTextParams): Promise<OcrResult | null>;
};
