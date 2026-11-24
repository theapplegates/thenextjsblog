

/Users/paulapplegate/Documents/Nextjs-jxl-working-checkout/

Below is a complete, drop-in pipeline that produces JXL → AVIF → WebP <picture> markup with srcset, driven by Cloudinary (no f_auto, explicit f_jxl/f_avif/f_webp). It ships as:

A shared ESM lib (src/lib/cloudinary-picture.mjs)
A CLI (scripts/cloudinary-breakpoints.mjs) that uploads, caches breakpoints, and prints ready-to-paste <picture>
A React/Next.js <ResponsivePicture> component (works in RSC, app/ or pages/, and MDX)

1. Env vars
.env.example

```bash
# Public cloud name (safe to expose)
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud
PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud        # legacy alias
CLOUDINARY_CLOUD_NAME=your-cloud               # legacy alias

# Upload-only creds — never exposed to the client
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

In Next.js, anything the client needs must be NEXT_PUBLIC_*. Server-only scripts can also read PUBLIC_*/CLOUDINARY_*.

2. package.json scripts
```json
   {
  "scripts": {
    "cloudinary:breakpoints": "node scripts/cloudinary-breakpoints.mjs"
  }
}
```

3. src/lib/cloudinary-picture.mjs
   Pure ESM, no runtime deps, safe to import from the CLI and from React server components.

```javascript
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
```

4. src/lib/cloudinary-picture.d.ts

```typescript
export type Format = 'jxl' | 'avif' | 'webp' | string;

export const FORMATS: string[];
export const DEFAULT_SIZES: string;
export const DEFAULT_WIDTHS: number[];

export function resolveCloudName(explicit?: string): string;
export function computeBreakpoints(originalWidth: number, customWidths?: number[]): number[];

export function imageUrl(opts: {
  cloudName: string; publicId: string; width: number; format: string;
  quality?: string; crop?: 'limit' | 'fill'; ar?: string; height?: number;
}): string;

export function buildSrcset(opts: {
  cloudName: string; publicId: string; widths: number[]; format: string;
  quality?: string; crop?: 'limit' | 'fill'; ar?: string; height?: number;
}): string;

export type PictureSource = {
  type: string;
  srcset: string;
  sizes?: string;
  media?: string;
};

export type PictureImg = {
  src: string;
  srcset: string;
  sizes: string;
  width: number;
  height: number;
  alt: string;
};

export type DeviceSource = {
  minWidth: number;
  percent: number;
  ratio?: string;
  sizes?: string;
};

export function buildPictureProps(opts: {
  cloudName?: string; publicId: string; width: number; height: number;
  alt?: string; sizes?: string; breakpoints?: number[]; devices?: DeviceSource[];
  quality?: string; fallbackFormat?: string;
}): { sources: PictureSource[]; img: PictureImg };

export function buildPictureHtml(opts: {
  cloudName?: string; publicId: string; width: number; height: number;
  alt?: string; sizes?: string; breakpoints?: number[]; devices?: DeviceSource[];
  quality?: string; fallbackFormat?: string;
  loading?: string; decoding?: string; priority?: boolean;
}): string;
```

5. scripts/cloudinary-breakpoints.mjs
Uploads to Cloudinary, writes a JSON cache, prints a paste-ready <picture>.

```typescript
#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import {
  resolveCloudName,
  computeBreakpoints,
  buildPictureHtml,
} from '../src/lib/cloudinary-picture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_PATH = path.join(ROOT, 'src/data/cloudinary-breakpoints.json');

// ---- CLI arg parsing -------------------------------------------------------
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) out[a.slice(2, eq)] = a.slice(eq + 1);
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[a.slice(2)] = argv[++i];
      else out[a.slice(2)] = true;
    } else {
      (out._ ||= []).push(a);
    }
  }
  return out;
}

function parseDevices(str) {
  if (!str) return undefined;
  return String(str).split(',').map((chunk) => {
    const [minW, pct, ratio] = chunk.trim().split('|');
    const minWidth = parseInt(minW, 10);
    const percent = parseFloat(pct);
    if (!Number.isFinite(minWidth) || !Number.isFinite(percent)) {
      throw new Error(`Bad --devices entry: ${chunk}`);
    }
    return { minWidth, percent, ratio: ratio && ratio !== 'original' ? ratio : undefined };
  });
}

// ---- Cache -----------------------------------------------------------------
async function readCache() {
  try { return JSON.parse(await fs.readFile(CACHE_PATH, 'utf8')); }
  catch { return {}; }
}
async function writeCache(cache) {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n');
}

// ---- Identity --------------------------------------------------------------
function derivePublicId(absPath) {
  const rel = path.relative(ROOT, absPath).replace(/\\/g, '/');
  return rel.replace(/\.[^./]+$/, '').replace(/^(src|public)\//, '');
}

// ---- Upload ----------------------------------------------------------------
async function uploadIfNeeded({ absPath, relKey, publicId, force }) {
  const cloudName = resolveCloudName();
  if (!cloudName) throw new Error('Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME (or PUBLIC_CLOUDINARY_CLOUD_NAME)');
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!apiKey || !apiSecret) throw new Error('CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET required to upload');

  const buf = await fs.readFile(absPath);
  const hash = createHash('sha1').update(buf).digest('hex');

  const cache = await readCache();
  const prev = cache[relKey];
  if (!force && prev && prev.hash === hash && prev.publicId === publicId) {
    return { ...prev, cached: true };
  }

  const { v2: cloudinary } = await import('cloudinary');
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });

  const result = await cloudinary.uploader.upload(absPath, {
    public_id: publicId,
    overwrite: true,
    resource_type: 'image',
    invalidate: true,
  });

  const entry = {
    publicId,
    width: result.width,
    height: result.height,
    format: result.format,
    bytes: result.bytes,
    version: result.version,
    hash,
    uploadedAt: new Date().toISOString(),
  };
  cache[relKey] = { ...(cache[relKey] || {}), ...entry };
  await writeCache(cache);
  return { ...entry, cached: false };
}

// ---- Main ------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args._?.[0];
  if (!input) {
    console.error(
      'Usage: npm run cloudinary:breakpoints -- <path/to/image> [options]\n' +
      'Options:\n' +
      '  --sizes="(min-width: 768px) 720px, 100vw"\n' +
      '  --alt="Describe photo"\n' +
      '  --widths="200,400,800,1600"\n' +
      '  --public-id="custom/path/id"\n' +
      '  --devices="1200|40|original,992|60|16:9,768|70|4:3,0|100|1:1"\n' +
      '  --force                 re-upload even if cached hash matches\n' +
      '  --no-upload             use cached metadata only\n'
    );
    process.exit(1);
  }

  const absPath = path.resolve(ROOT, input);
  const relKey = path.relative(ROOT, absPath).replace(/\\/g, '/');
  const publicId = args['public-id'] || derivePublicId(absPath);
  const sizes = args.sizes || '100vw';
  const alt = typeof args.alt === 'string' ? args.alt : '';
  const customWidths = args.widths
    ? String(args.widths).split(',').map((w) => parseInt(w.trim(), 10)).filter(Boolean)
    : undefined;
  const devices = parseDevices(args.devices);

  let meta;
  if (args['no-upload']) {
    const cache = await readCache();
    meta = cache[relKey];
    if (!meta) throw new Error(`No cache entry for ${relKey}; run once without --no-upload`);
  } else {
    meta = await uploadIfNeeded({ absPath, relKey, publicId, force: !!args.force });
  }

  const breakpoints = computeBreakpoints(meta.width, customWidths);

  const html = buildPictureHtml({
    cloudName: resolveCloudName(),
    publicId,
    width: meta.width,
    height: meta.height,
    alt,
    sizes,
    breakpoints,
    devices,
  });

  const cache = await readCache();
  cache[relKey] = { ...(cache[relKey] || {}), ...meta, breakpoints };
  await writeCache(cache);

  console.log(html);
  console.error(`\n# ${meta.cached ? 'cached' : 'uploaded'}: ${relKey}`);
  console.error(`# public_id: ${publicId}`);
  console.error(`# natural:   ${meta.width} × ${meta.height}`);
  if (devices) console.error(`# devices:   ${devices.length} art-directed crops`);
  else console.error(`# breakpoints: ${breakpoints.join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

6. src/components/ResponsivePicture.tsx
Server component, no client JS, works in app/, pages/, and MDX (via the components map).

```typescript
import { buildPictureProps, resolveCloudName } from '@/lib/cloudinary-picture.mjs';
import type { DeviceSource } from '@/lib/cloudinary-picture';

type Props = {
  publicId: string;
  width: number;
  height: number;
  alt: string;
  sizes?: string;
  breakpoints?: number[];
  devices?: DeviceSource[];
  cloudName?: string;
  quality?: string;
  fallbackFormat?: string;
  loading?: 'lazy' | 'eager';
  decoding?: 'async' | 'sync' | 'auto';
  priority?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

export function ResponsivePicture({
  publicId,
  width,
  height,
  alt,
  sizes,
  breakpoints,
  devices,
  cloudName,
  quality,
  fallbackFormat,
  loading,
  decoding,
  priority = false,
  className,
  style,
}: Props) {
  const cloud = cloudName ?? resolveCloudName();
  if (!cloud) throw new Error('Missing Cloudinary cloud name');

  const { sources, img } = buildPictureProps({
    cloudName: cloud,
    publicId,
    width,
    height,
    alt,
    sizes,
    breakpoints,
    devices,
    quality,
    fallbackFormat,
  });

  return (
    <picture className={className} style={style}>
      {sources.map((s, i) => (
        <source
          key={`${s.type}-${s.media ?? 'default'}-${i}`}
          type={s.type}
          srcSet={s.srcset}
          sizes={s.sizes}
          media={s.media}
        />
      ))}
      <img
        src={img.src}
        srcSet={img.srcset}
        sizes={img.sizes}
        width={img.width}
        height={img.height}
        alt={img.alt}
        loading={priority ? 'eager' : loading ?? 'lazy'}
        decoding={decoding ?? 'async'}
        fetchPriority={priority ? 'high' : undefined}
      />
    </picture>
  );
}
```

"fetchPriority (camelCase) requires React 18.3+ or React 19. On older React, replace it with {...({ fetchpriority: priority ? 'high' : undefined } as any)}."

7. Usage
CLI — single crop
```bash

npm run cloudinary:breakpoints -- src/assets/images/Lindsey-Luke-Cartoon.jpg \
  --sizes="(min-width: 768px) 720px, 100vw" \
  --alt="Lindsey and Luke cartoon"
```

Prints, and caches:

```html
<picture>
  <source type="image/jxl"  srcset="https://res.cloudinary.com/your-cloud/image/upload/c_limit,w_200,q_auto,f_jxl/assets/images/Lindsey-Luke-Cartoon 200w, … 2000w" sizes="(min-width: 768px) 720px, 100vw">
  <source type="image/avif" srcset="…" sizes="…">
  <source type="image/webp" srcset="…" sizes="…">
  <img src="…w_2000,f_webp…" srcset="…" sizes="…" width="2000" height="1500" alt="Lindsey and Luke cartoon" loading="lazy" decoding="async">
</picture>
```

CLI — art direction

```html
npm run cloudinary:breakpoints -- src/assets/images/hero.jpg \
  --devices="1200|40|original,992|60|16:9,768|70|4:3,0|100|1:1" \
  --alt="Hero"
```

Emits a <picture> where devices are grouped by descending min-width, and within each device the sources are JXL → AVIF → WebP. Each source gets its own sizes (40vw, 60vw, …) since media scopes the viewport range.

MDX
MDX (with either @next/mdx or next-mdx-remote) accepts a components map:

```typescript
// mdx-components.tsx
import { ResponsivePicture } from '@/components/ResponsivePicture';

export function useMDXComponents(components) {
  return { ResponsivePicture, ...components };
}
```

```bash
<ResponsivePicture
  publicId="assets/images/Lindsey-Luke-Cartoon"
  width={2000}
  height={1500}
  alt="Lindsey and Luke cartoon"
  sizes="(min-width: 768px) 720px, 100vw"
/>
```

Above code not bash, but MDX
TSX
```typescript
import { ResponsivePicture } from '@/components/ResponsivePicture';

export default function Page() {
  return (
    <ResponsivePicture
      publicId="assets/images/hero"
      width={2400}
      height={1600}
      alt="Hero"
      sizes="100vw"
      priority          // eager + fetchpriority=high
    />
  );
}
```
Above is TSX

8. Verification
Inspect HTML: the first <source> must be type="image/jxl". If AVIF or WebP is first, browsers that negotiate formats will skip JXL.

Confirm MIME from your origin/CDN (Cloudinary serves the correct Content-Type: image/jxl automatically):


```bash
curl -I "https://res.cloudinary.com/your-cloud/image/upload/c_limit,w_800,q_auto,f_jxl/your/public_id"
```

Expect content-type: image/jxl. If you front Cloudinary with your own CDN, ensure it doesn't strip/replace the type.

DevTools Network, DPR 2, viewport 390 / 768 / 1440: the chosen JXL/AVIF URL should match rendered width × DPR, not a 3000w file. If it doesn't, tighten sizes (or your --devices percentages).

src/data/cloudinary-breakpoints.json is a build artifact — commit it if you want reproducible builds without re-uploading.

9. Notes / gotchas
JXL support: Chrome/Edge 120+ have experimental JXL disabled by default; Safari and Firefox still lack it. The <picture> type negotiation is future-proof — as long as JXL is first, clients that support it get it, otherwise they get AVIF.

f_jxl is not universal on all plan tiers — verify one URL loads in your account before shipping.

next/image is bypassed. That's intentional — it can't emit <picture> with multiple formats. If other parts of your site use next/image, add res.cloudinary.com to images.remotePatterns:

```javascript
// next.config.js
module.exports = {
  images: { remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }] },
};
```

Don't escape srcset — commas and spaces are legal in the attribute; escaping will break parsing.

Widths cap at the source's natural size — Cloudinary c_limit won't upscale, and computeBreakpoints drops any width ≥ original. No oversized candidate gets emitted.

--devices ignores --sizes when a percent exists (each source derives <percent>vw). Pass --sizes only for --devices entries you want to override, or skip --devices.


