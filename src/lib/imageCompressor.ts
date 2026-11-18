/**
 * Resizes and compresses an uploaded image file to a lightweight data URL
 */
export async function compressImage(file: File, maxDimension = 320, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // If PNG transparency is needed or standard JPEG
        const isPng = file.type === 'image/png';
        const mimeType = isPng ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(mimeType, quality);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
      img.src = event.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses an image specifically for the Home banner (max 1600px wide, 0.75 JPEG, under 600KB)
 */
export async function compressBannerImage(file: File): Promise<{ dataUrl: string; sizeKb: number; isTooLarge: boolean }> {
  let quality = 0.75;
  let dataUrl = await compressImage(file, 1600, quality);
  let sizeBytes = Math.round((dataUrl.length * 3) / 4);

  // If slightly over 600KB, try one more pass at 0.60
  if (sizeBytes > 600 * 1024) {
    dataUrl = await compressImage(file, 1400, 0.60);
    sizeBytes = Math.round((dataUrl.length * 3) / 4);
  }

  const sizeKb = Math.round(sizeBytes / 1024);
  const isTooLarge = sizeBytes > 600 * 1024;

  return { dataUrl, sizeKb, isTooLarge };
}

function encodeJpegWithDimensions(
  img: HTMLImageElement,
  maxDimension: number,
  quality: number
): { dataUrl: string; width: number; height: number; sizeBytes: number } {
  let { width, height } = img;
  if (width > maxDimension || height > maxDimension) {
    if (width >= height) {
      height = Math.max(1, Math.round((height * maxDimension) / width));
      width = maxDimension;
    } else {
      width = Math.max(1, Math.round((width * maxDimension) / height));
      height = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Browser canvas is unavailable for image compression.');
  }

  // Paint deep navy behind transparent PNG/WebP before JPEG conversion
  ctx.fillStyle = '#0a1428';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const base64Part = dataUrl.split(',')[1] || '';
  const sizeBytes = Math.ceil((base64Part.length * 3) / 4);
  return { dataUrl, width, height, sizeBytes };
}

/**
 * Compresses an image for the Login screen background:
 * max 1920px wide/tall, JPEG ~0.8 quality, aiming under ~600KB, refusing >800KB.
 */
export async function compressLoginBackgroundImage(
  file: File
): Promise<{ dataUrl: string; width: number; height: number; sizeKb: number; isTooLarge: boolean }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        try {
          const attempts: Array<[number, number]> = [
            [1920, 0.80],
            [1920, 0.70],
            [1600, 0.65],
            [1440, 0.56],
          ];

          let best = encodeJpegWithDimensions(img, attempts[0][0], attempts[0][1]);
          for (let i = 1; i < attempts.length && best.sizeBytes > 600 * 1024; i++) {
            best = encodeJpegWithDimensions(img, attempts[i][0], attempts[i][1]);
          }

          const sizeKb = Math.round(best.sizeBytes / 1024);
          const isTooLarge = best.sizeBytes > 800 * 1024;
          resolve({
            dataUrl: best.dataUrl,
            width: best.width,
            height: best.height,
            sizeKb,
            isTooLarge,
          });
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = (err) => reject(err);
      img.src = event.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}
