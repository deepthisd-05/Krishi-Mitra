export function scaleDimensions(
  width: number,
  height: number,
  maxDimension = 1024
): { width: number; height: number } {
  const safeW = Math.max(1, width || 1);
  const safeH = Math.max(1, height || 1);
  const scale = Math.min(1, maxDimension / Math.max(safeW, safeH, 1));
  return {
    width: Math.max(1, Math.round(safeW * scale)),
    height: Math.max(1, Math.round(safeH * scale)),
  };
}

export async function compressLeafImageFile(file: File, maxDimension = 1024, quality = 0.82): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (JPEG, PNG, or WebP).');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the selected image file.'));
    reader.readAsDataURL(file);
  });

  if (typeof document === 'undefined') {
    return rawDataUrl;
  }

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode image preview.'));
      el.src = rawDataUrl;
    });

    const target = scaleDimensions(img.width, img.height, maxDimension);
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return rawDataUrl;

    ctx.drawImage(img, 0, 0, target.width, target.height);
    const compressed = canvas.toDataURL('image/jpeg', quality);
    return compressed.length < rawDataUrl.length ? compressed : rawDataUrl;
  } catch {
    return rawDataUrl;
  }
}

export function captureVideoFrameToDataUrl(
  video: HTMLVideoElement,
  maxDimension = 1024,
  quality = 0.82
): string {
  if (!video || !video.videoWidth || !video.videoHeight) {
    throw new Error('Camera preview frame is not ready yet. Please wait a moment and try again.');
  }

  const target = scaleDimensions(video.videoWidth, video.videoHeight, maxDimension);
  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to capture frame on this browser.');
  }
  ctx.drawImage(video, 0, 0, target.width, target.height);
  return canvas.toDataURL('image/jpeg', quality);
}

export function estimateDataUrlKb(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) return 0;
  const b64Len = dataUrl.length - commaIdx - 1;
  return Math.max(1, Math.round((b64Len * 3) / 4 / 1024));
}
