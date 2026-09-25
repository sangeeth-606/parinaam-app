/**
 * sRGB Linearization / Encoding
 * Standard: IEC 61966-2-1 (sRGB specification)
 *
 * OETF (linear → encoded/gamma-compressed sRGB) and
 * EOTF (encoded/gamma-compressed sRGB → linear light) implementations.
 *
 * These are the KNOWN, closed-form formulas from the IEC standard.
 * They do not need experimental validation — they are physics/standards.
 */

/**
 * Apply sRGB Electro-Optical Transfer Function (EOTF):
 * encoded 8-bit sRGB value [0-255] → linear light [0, 1]
 *
 * Formula: IEC 61966-2-1 §5.2
 */
export function srgbByteToLinear(c: number): number {
  const normalized = c / 255.0;
  return normalized <= 0.04045
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

/**
 * Apply sRGB Opto-Electronic Transfer Function (OETF):
 * linear light [0, 1] → encoded sRGB [0, 1] (multiply by 255 for byte)
 *
 * Formula: IEC 61966-2-1 §5.2
 */
export function linearToSrgbNormalized(c: number): number {
  const clamped = Math.max(0, Math.min(1, c));
  return clamped <= 0.0031308
    ? 12.92 * clamped
    : 1.055 * Math.pow(clamped, 1.0 / 2.4) - 0.055;
}

/**
 * Encode linear [0,1] value as 8-bit sRGB integer [0-255].
 */
export function linearToSrgbByte(c: number): number {
  return Math.round(linearToSrgbNormalized(c) * 255);
}

/**
 * Convert an entire sRGB pixel (3 bytes [0-255]) to linear RGB [0,1] triple.
 */
export function srgbPixelToLinear(r: number, g: number, b: number): [number, number, number] {
  return [srgbByteToLinear(r), srgbByteToLinear(g), srgbByteToLinear(b)];
}
