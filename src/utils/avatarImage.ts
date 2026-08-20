const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const OUTPUT_SIZE = 512;
const OUTPUT_QUALITY = 0.88;

export const AVATAR_ACCEPT =
  "image/jpeg,image/jpg,image/png,image/webp,image/gif,image/bmp,image/avif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif,.heic,.heif";

export async function prepareAvatarImage(file: File): Promise<Blob> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("Photo is too large. Use an image under 8 MB.");
  }

  const bitmap = await loadImageBitmap(file);
  try {
    const { sx, sy, sw } = coverSquare(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process that photo.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sx, sy, sw, sw, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", OUTPUT_QUALITY);
    });
    if (!blob) throw new Error("Could not process that photo.");
    return blob;
  } finally {
    bitmap.close();
  }
}

function coverSquare(width: number, height: number) {
  const sw = Math.min(width, height);
  const sx = Math.max(0, (width - sw) / 2);
  const sy = Math.max(0, (height - sw) / 2);
  return { sx, sy, sw };
}

async function loadImageBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadHtmlImage(url);
      return await createImageBitmap(img);
    } catch {
      throw new Error(
        "That file isn't a photo we can use. Try JPEG, PNG, WebP, GIF, or BMP.",
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = src;
  });
}
