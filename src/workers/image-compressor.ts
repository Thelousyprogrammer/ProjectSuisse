self.onmessage = function (e) {
  const { blob, maxWidth, maxHeight, quality, id } = e.data;

  // Basic validation
  if (!blob || !(blob instanceof Blob)) {
    self.postMessage({ error: 'Invalid blob' });
    return;
  }

  createImageBitmap(blob as Blob)
    .then((bitmap) => {
      let width = bitmap.width;
      let height = bitmap.height;
      if (width > maxWidth) {
        height = Math.round(height * (maxWidth / width));
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = Math.round(width * (maxHeight / height));
        height = maxHeight;
      }

      const offscreen = new OffscreenCanvas(width, height);
      const ctx = offscreen.getContext('2d');
      if (!ctx) {
        self.postMessage({ error: 'Canvas 2d context not available' });
        return;
      }
      ctx.drawImage(bitmap, 0, 0, width, height);
      return offscreen.convertToBlob({ type: 'image/jpeg', quality: quality });
    })
    .then((compressedBlob) => {
      if (!compressedBlob) {
        throw new Error('Failed to compress image');
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result;
        self.postMessage({ id, base64: base64data });
      };
      reader.onerror = () => {
        self.postMessage({ error: 'FileReader failed to read blob' });
      };
      reader.readAsDataURL(compressedBlob);
    })
    .catch((err) => {
      self.postMessage({ error: err.message });
    });
};
