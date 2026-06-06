function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

async function resizeWithCanvas(file: File, maxPx: number, quality: number): Promise<string> {
  const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(1, maxPx / Math.max(w, h));
      const cw = Math.round(w * scale);
      const ch = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, cw, ch);
      resolve(canvas.toDataURL(outputType, quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

/**
 * Prepares an image file for upload:
 * - GIF: passed through as-is to preserve animation
 * - PNG: resized via canvas, output as PNG to preserve transparency
 * - JPEG / WebP / other: resized via canvas, output as JPEG
 */
export async function prepareImageForUpload(file: File, maxPx = 1024, quality = 0.82): Promise<string> {
  if (file.type === 'image/gif') {
    if (file.size > 3 * 1024 * 1024) throw new Error('GIF er for stor (maks 3 MB).');
    return fileToDataUrl(file);
  }
  return resizeWithCanvas(file, maxPx, quality);
}
