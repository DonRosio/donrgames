import type { ImageSegmenter } from '@mediapipe/tasks-vision';

/** Longest side of the working picture: enough for a 512 px head, light for the segmentation. */
const WORK_SIZE = 1024;
const WASM_PATH = '/vendor/mediapipe/wasm';
const MODEL_PATH = '/vendor/mediapipe/selfie_segmenter.tflite';
/** Side in pixels of the exported head, and the next sizes tried if the PNG is too heavy. */
const HEAD_SIZES = [512, 384, 256];

/** Square window on the working picture, in its pixels; it may stick out (then it is transparent). */
export interface Framing {
  cx: number;
  cy: number;
  side: number;
}

export interface Cutout {
  /** The photo, opaque. */
  photo: HTMLCanvasElement;
  /** The same picture where only the person remains (transparent background). */
  person: HTMLCanvasElement;
  /** Bounding box of the person. */
  bounds: { x: number; y: number; width: number; height: number };
}

let segmenter: Promise<ImageSegmenter> | null = null;

/** The model and its WASM runtime are loaded once, on first use (own files, no CDN). */
function loadSegmenter(): Promise<ImageSegmenter> {
  segmenter ??= import('@mediapipe/tasks-vision')
    .then(async ({ FilesetResolver, ImageSegmenter }) => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
      return ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'CPU' },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    })
    .catch((error: unknown) => {
      segmenter = null;
      throw error;
    });
  return segmenter;
}

/** Draws the picture on a canvas whose longest side is at most WORK_SIZE (EXIF turn applied). */
export async function loadPhoto(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, WORK_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/** Confidence (0..1) that each pixel belongs to the person, whichever way the model orders it. */
function personMask(masks: { getAsFloat32Array(): Float32Array }[], width: number, height: number) {
  // Some models give [background, person], others [person]: the person is the last one.
  const mask = masks.at(-1)!.getAsFloat32Array();
  // Safety net on the polarity: the person is more in the middle than along the borders.
  let centre = 0;
  let centreCount = 0;
  let border = 0;
  let borderCount = 0;
  const margin = 0.15;
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const value = mask[y * width + x]!;
      const onBorder =
        x < width * margin ||
        x > width * (1 - margin) ||
        y < height * margin ||
        y > height * (1 - margin);
      if (onBorder) {
        border += value;
        borderCount++;
      } else {
        centre += value;
        centreCount++;
      }
    }
  }
  const inverted = border / Math.max(1, borderCount) > centre / Math.max(1, centreCount);
  return inverted ? mask.map((value) => 1 - value) : mask;
}

/** Removes the background. Throws when the model cannot be loaded or finds nobody. */
export async function cutOutPerson(photo: HTMLCanvasElement): Promise<Cutout> {
  const model = await loadSegmenter();
  const result = model.segment(photo);
  const masks = result.confidenceMasks;
  if (!masks || masks.length === 0) throw new Error('NO_MASK');
  const { width, height } = photo;
  const mask = personMask(masks, width, height);
  result.close();

  const person = document.createElement('canvas');
  person.width = width;
  person.height = height;
  const context = person.getContext('2d')!;
  context.drawImage(photo, 0, 0);
  const pixels = context.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      // Soft edge: below 0.35 it is background, above 0.65 it is the person.
      const alpha = Math.min(1, Math.max(0, (mask[index]! - 0.35) / 0.3));
      pixels.data[index * 4 + 3] = Math.round(alpha * 255);
      if (alpha > 0.5) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error('NO_PERSON');
  context.putImageData(pixels, 0, 0);
  return {
    photo,
    person,
    bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  };
}

/** Head and shoulders: as wide as the person, starting just above their head. */
export function personFraming(bounds: Cutout['bounds']): Framing {
  const side = bounds.width * 1.1;
  return { cx: bounds.x + bounds.width / 2, cy: bounds.y - side * 0.06 + side / 2, side };
}

/** The largest centred square of the photo. */
export function centredFraming(photo: HTMLCanvasElement): Framing {
  const side = Math.min(photo.width, photo.height);
  return { cx: photo.width / 2, cy: photo.height / 2, side };
}

/** Draws the framed square on a new canvas of `size` px (transparent where the source is). */
export function renderHead(
  source: HTMLCanvasElement,
  framing: Framing,
  size: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    source,
    framing.cx - framing.side / 2,
    framing.cy - framing.side / 2,
    framing.side,
    framing.side,
    0,
    0,
    size,
    size,
  );
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('ENCODE'))), 'image/png'),
  );
}

/** The head as a PNG under `maxBytes`, reducing its size if needed. */
export async function exportHead(
  source: HTMLCanvasElement,
  framing: Framing,
  maxBytes: number,
): Promise<Blob> {
  for (const size of HEAD_SIZES) {
    const blob = await toBlob(renderHead(source, framing, size));
    if (blob.size <= maxBytes) return blob;
  }
  throw new Error('TOO_HEAVY');
}
