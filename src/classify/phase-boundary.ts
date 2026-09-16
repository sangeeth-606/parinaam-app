/**
 * Parinaam — Phase-Boundary Extraction for Two-Phase Tests
 * Governed by spec/04-phase-3-classification.md (Task 3.7 & Milestone M3.9).
 *
 * Applicable to:
 * - Scott Reagent (Cobalt Thiocyanate)
 * - Duquenois-Levine Reagent
 *
 * Chloroform (CHCl3, density ~1.49 g/cm^3) forms the LOWER layer.
 * Aqueous reagent forms the UPPER layer.
 *
 * Implements:
 * 1. Horizontal edge gradient detection (Sobel y) across vertical sample window
 * 2. Peak meniscus detection with noise suppression
 * 3. Exclusive sub-ROI extraction targeting the diagnostic lower chloroform layer
 */

export interface PhaseDetectionResult {
  isTwoPhase: boolean;
  meniscusDetected: boolean;
  meniscusRowRatio: number; // Row ratio in [0, 1] from top to bottom
  upperLayerBounds: { topRatio: number; bottomRatio: number };
  lowerLayerBounds: { topRatio: number; bottomRatio: number };
  targetLayer: 'lower' | 'upper' | 'full';
  selectedBounds: { topRatio: number; bottomRatio: number };
}

export interface ImageBuffer {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray; // RGBA or Grayscale
  channels: 1 | 3 | 4;
}

export class PhaseBoundaryDetector {
  /**
   * Detect the horizontal meniscus boundary in a sample window image.
   *
   * @param image Pixel buffer of the sample aperture
   * @param isTwoPhase Whether the test being performed is a two-phase test
   */
  public detectMeniscus(image: ImageBuffer, isTwoPhase: boolean): PhaseDetectionResult {
    if (!isTwoPhase) {
      return {
        isTwoPhase: false,
        meniscusDetected: false,
        meniscusRowRatio: 0.5,
        upperLayerBounds: { topRatio: 0.0, bottomRatio: 0.5 },
        lowerLayerBounds: { topRatio: 0.5, bottomRatio: 1.0 },
        targetLayer: 'full',
        selectedBounds: { topRatio: 0.15, bottomRatio: 0.85 }, // 70% central window
      };
    }

    const { width, height, data, channels } = image;

    // Convert to row-wise horizontal luminance profile
    const rowLuminance = new Float64Array(height);
    for (let y = 0; y < height; y++) {
      let rowSum = 0;
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * channels;
        let lum: number;
        if (channels === 1) {
          lum = data[idx];
        } else {
          // Standard Rec. 709 luminance
          lum = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
        }
        rowSum += lum;
      }
      rowLuminance[y] = rowSum / width;
    }

    // Compute vertical gradient Gy = |L(y+1) - L(y-1)|
    // Restrict search to middle 25% - 75% to ignore top/bottom container edges
    const searchStart = Math.floor(height * 0.25);
    const searchEnd = Math.floor(height * 0.75);

    let maxGradient = 0;
    let meniscusY = Math.floor(height * 0.5);

    for (let y = searchStart; y < searchEnd; y++) {
      // 3-point central difference
      const dy = Math.abs(rowLuminance[y + 1] - rowLuminance[y - 1]);
      if (dy > maxGradient) {
        maxGradient = dy;
        meniscusY = y;
      }
    }

    // Minimum gradient threshold for distinct meniscus
    const meniscusDetected = maxGradient > 2.0;
    const meniscusRatio = meniscusY / height;

    // Upper layer: 10% from top down to (meniscus - 8% margin)
    const upperBounds = {
      topRatio: 0.1,
      bottomRatio: Math.max(0.15, meniscusRatio - 0.08),
    };

    // Lower layer (Chloroform): (meniscus + 8% margin) down to 90%
    const lowerBounds = {
      topRatio: Math.min(0.85, meniscusRatio + 0.08),
      bottomRatio: 0.9,
    };

    return {
      isTwoPhase: true,
      meniscusDetected,
      meniscusRowRatio: meniscusRatio,
      upperLayerBounds: upperBounds,
      lowerLayerBounds: lowerBounds,
      targetLayer: 'lower',
      // For Scott / Duquenois-Levine, ALWAYS target the lower chloroform layer
      selectedBounds: lowerBounds,
    };
  }
}
