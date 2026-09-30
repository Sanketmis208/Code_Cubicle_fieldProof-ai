export function cloudinaryThumbnail(url: string, width = 800, height = 600, video = false) {
  if (!url.includes('/upload/')) return url;
  const transformed = url.replace('/upload/', `/upload/${video ? 'so_0,f_jpg,' : 'f_auto,'}q_auto,c_fill,g_auto,w_${width},h_${height}/`);
  return video ? transformed.replace(/\.[a-z0-9]+(?:\?.*)?$/i, '.jpg') : transformed;
}
