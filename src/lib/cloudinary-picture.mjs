// Shared Cloudinary transform + <picture> logic.
// Pure ESM; imports fine from Node scripts and Next.js RSC.

export const FORMATS = ['jxl', 'avif', 'webp'];
export const DEFAULT_SIZES = '100vw';

/** Default candidate widths, capped at the source image's own width. */
export const DEFAULT_WIDTHS = [
  200, 320, 480, 640, 800, 960, 1200, 1440, 1600, 1920, 2400, 3000,
];

export function resolveCloudName(explicit) {
  return (
	explicit ||
	process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ||
	process.env.PUBLIC_CLOUDINARY_CLOUD_NAME ||
	process.env.CLOUDINARY_CLOUD_NAME ||
	''
  );
}

/** Given the source image's own width, pick sane candidate widths. */
export function computeBreakpoints(originalWidth, customWidths) {
  const base = customWidths?.length ? customWidths : DEFAULT_WIDTHS;
  const widths = base.filter((w) => Number.isFinite(w) && w > 0 && w < originalWidth);
  widths.push(originalWidth);
  return [...new Set(widths)].sort((a, b) => a - b);
}

/** Build a single Cloudinary URL. */
export function imageUrl({
  cloudName, publicId, width, format,
  quality = 'auto', crop = 'limit', ar, height,
}) {
  if (!cloudName) throw new Error('Missing Cloudinary cloud name');
  const parts = [`c_${crop}`, `w_${width}`];
  if (ar) parts.push(`ar_${String(ar).replace(':', ':')}`);
  if (height) parts.push(`h_${height}`);
  if (crop === 'fill') parts.push('g_auto');
  parts.push(`q_${quality}`, `f_${format}`);
  return `https://res.cloudinary.com/${cloudName}/image/upload/${parts.join(',')}/${publicId}`;
}

/** Build a `srcset` string for a format + width list + crop. */
export function buildSrcset({
  cloudName, publicId, widths, format,
  quality, crop, ar, height,
}) {
  return widths
	.map((w) =>
	  `${imageUrl({ cloudName, publicId, width: w, format, quality, crop, ar, height })} ${w}w`
	)
	.join(', ');
}

/** Trim a candidate width list to `<= maxW`, but always include `maxW`. */
function pickWidthsUpTo(maxW, baseWidths) {
  const list = baseWidths?.length ? baseWidths : DEFAULT_WIDTHS;
  const kept = list.filter((w) => w <= maxW);
  if (!kept.length) kept.push(list[0]);
  if (kept[kept.length - 1] !== maxW) kept.push(maxW);
  return [...new Set(kept)].sort((a, b) => a - b);
}

function ratioHeight(width, ar) {
  if (!ar) return undefined;
  const [a, b] = String(ar).split(':').map(Number);
  if (!a || !b) return undefined;
  return Math.round((width * b) / a);
}

/**
 * Build props for a React <picture> (or use buildPictureHtml for static HTML).
 *
 * Modes:
 *   - Single crop: pass `breakpoints` (or omit and they're derived from `width`)
 *   - Art direction: pass `devices: [{ minWidth, percent, ratio?, sizes? }]`
 *     Sources are ordered descending by `minWidth`, then JXL / AVIF / WebP.
 *     The smallest device gets no `media` (applies to all smaller viewports).
 */
export function buildPictureProps({
  cloudName,
  publicId,
  width,
  height,
  alt = '',
  sizes = DEFAULT_SIZES,
  breakpoints,
  devices,
  quality = 'auto',
  fallbackFormat = 'webp',
}) {
  const cloud = cloudName || resolveCloudName();
  if (!cloud) throw new Error('Missing cloud name');
  if (!publicId) throw new Error('publicId required');
  if (!width) throw new Error('Original width required');

  const sources = [];

  if (devices?.length) {
	const sorted = [...devices].sort((a, b) => b.minWidth - a.minWidth);

	for (let i = 0; i < sorted.length; i++) {
	  const d = sorted[i];
	  const isSmallest = i === sorted.length - 1;
	  const media = isSmallest ? undefined : `(min-width: ${d.minWidth}px)`;
	  const deviceSizes = d.sizes || (d.percent ? `${d.percent}vw` : sizes);

	  const displayWidth = Math.max(200, Math.round((d.minWidth || 400) * (d.percent || 100) / 100));
	  const maxW = Math.min(width, displayWidth * 3);
	  const widths = pickWidthsUpTo(maxW, breakpoints);

	  const crop = d.ratio && d.ratio !== 'original' ? 'fill' : 'limit';
	  const ar = crop === 'fill' ? d.ratio : undefined;

	  for (const fmt of FORMATS) {
		sources.push({
		  type: `image/${fmt}`,
		  media,
		  sizes: deviceSizes,
		  srcset: buildSrcset({ cloudName: cloud, publicId, widths, format: fmt, quality, crop, ar }),
		});
	  }
	}

	// Fallback <img> mirrors the smallest device's crop.
	const smallest = sorted[sorted.length - 1];
	const displayWidth = Math.max(400, Math.round((smallest.minWidth || 400) * (smallest.percent || 100) / 100));
	const widths = pickWidthsUpTo(Math.min(width, displayWidth * 2), breakpoints);
	const crop = smallest.ratio && smallest.ratio !== 'original' ? 'fill' : 'limit';
	const ar = crop === 'fill' ? smallest.ratio : undefined;
	const deviceSizes = smallest.sizes || (smallest.percent ? `${smallest.percent}vw` : sizes);

	return {
	  sources,
	  img: {
		src: imageUrl({ cloudName: cloud, publicId, width: widths[widths.length - 1], format: fallbackFormat, quality, crop, ar }),
		srcset: buildSrcset({ cloudName: cloud, publicId, widths, format: fallbackFormat, quality, crop, ar }),
		sizes: deviceSizes,
		width,
		height: ratioHeight(width, ar) ?? height,
		alt,
	  },
	};
  }

  // Single-crop mode
  const widths = [...new Set(
	breakpoints?.length ? breakpoints : computeBreakpoints(width)
  )].sort((a, b) => a - b);

  for (const fmt of FORMATS) {
	sources.push({
	  type: `image/${fmt}`,
	  sizes,
	  srcset: buildSrcset({ cloudName: cloud, publicId, widths, format: fmt, quality }),
	});
  }

  return {
	sources,
	img: {
	  src: imageUrl({ cloudName: cloud, publicId, width: widths[widths.length - 1], format: fallbackFormat, quality }),
	  srcset: buildSrcset({ cloudName: cloud, publicId, widths, format: fallbackFormat, quality }),
	  sizes,
	  width,
	  height,
	  alt,
	},
  };
}

/** Static HTML output for Markdown/MDX paste-in. */
export function buildPictureHtml(opts) {
  const { sources, img } = buildPictureProps(opts);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

  const sourceLines = sources
	.map((s) => {
	  const media = s.media ? ` media="${esc(s.media)}"` : '';
	  return `  <source type="${s.type}"${media} srcset="${s.srcset}" sizes="${esc(s.sizes)}">`;
	})
	.join('\n');

  const loading = opts.priority ? 'eager' : (opts.loading || 'lazy');
  const fetchPriority = opts.priority ? ' fetchpriority="high"' : '';

  return `<picture>
${sourceLines}
  <img src="${img.src}" srcset="${img.srcset}" sizes="${esc(img.sizes)}" width="${img.width}" height="${img.height}" alt="${esc(img.alt)}" loading="${loading}" decoding="${opts.decoding || 'async'}"${fetchPriority}>
</picture>`;
}