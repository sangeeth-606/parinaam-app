/**
 * Parinaam — Sub-Window Patch Extraction & Glare-Robust Median Filtering
 * Conforms to spec/colour-pipeline-algorithm.md Step 1.
 */

export interface PatchBoundingBox {
  id: string;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

export interface ExtractedPatchRgb {
  id: string;
  r: number; // [0, 255]
  g: number; // [0, 255]
  b: number; // [0, 255]
  validPixelCount: number;
  clippedPixelCount: number;
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Extracts a centered 60% sub-window from a patch region,
 * discards clipping/saturated pixels (RGB >= 250 or RGB <= 5),
 * and computes the per-channel median.
 */
export function extractPatchMedianRgb(
  pixels: Uint8Array | number[], // Interleaved RGB buffer
  imageWidth: number,
  imageHeight: number,
  patch: PatchBoundingBox,
  insetFraction: number = 0.60
): ExtractedPatchRgb {
  const subWidth = Math.floor(patch.width * insetFraction);
  const subHeight = Math.floor(patch.height * insetFraction);

  const startX = Math.max(0, Math.floor(patch.centerX - subWidth / 2));
  const startY = Math.max(0, Math.floor(patch.centerY - subHeight / 2));
  const endX = Math.min(imageWidth - 1, startX + subWidth);
  const endY = Math.min(imageHeight - 1, startY + subHeight);

  const validR: number[] = [];
  const validG: number[] = [];
  const validB: number[] = [];
  let clippedCount = 0;

  for (let y = startY; y <= endY; y++) {
    const rowOffset = y * imageWidth * 3;
    for (let x = startX; x <= endX; x++) {
      const idx = rowOffset + x * 3;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];

      // Step 1: Reject clipping / outlier pixels
      const isClipped =
        r >= 250 || g >= 250 || b >= 250 ||
        (r <= 5 && g <= 5 && b <= 5);

      if (isClipped) {
        clippedCount++;
      } else {
        validR.push(r);
        validG.push(g);
        validB.push(b);
      }
    }
  }

  // If all pixels in window were clipped, fallback to entire window
  if (validR.length === 0) {
    for (let y = startY; y <= endY; y++) {
      const rowOffset = y * imageWidth * 3;
      for (let x = startX; x <= endX; x++) {
        const idx = rowOffset + x * 3;
        validR.push(pixels[idx]);
        validG.push(pixels[idx + 1]);
        validB.push(pixels[idx + 2]);
      }
    }
  }

  return {
    id: patch.id,
    r: calculateMedian(validR),
    g: calculateMedian(validG),
    b: calculateMedian(validB),
    validPixelCount: validR.length,
    clippedPixelCount: clippedCount,
  };
}
