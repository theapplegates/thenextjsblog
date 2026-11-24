/Users/paulapplegate/Documents/Nextjs-jxl-working-checkout/CLOUDINARY.md

Below is a complete, drop-in pipeline that produces JXL → AVIF → WebP <picture> markup with srcset, driven by Cloudinary (no f_auto, explicit f_jxl/f_avif/f_webp). It ships as:

A shared ESM lib (src/lib/cloudinary-picture.mjs)
A CLI (scripts/cloudinary-breakpoints.mjs) that uploads, caches breakpoints, and prints ready-to-paste <picture>
A React/Next.js <ResponsivePicture> component (works in RSC, app/ or pages/, and MDX)
1. Env vars
.env.example

# Public cloud name (safe to expose)
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud
PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud        # legacy alias
CLOUDINARY_CLOUD_NAME=your-cloud               # legacy alias

# Upload-only creds — never exposed to the client
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
In Next.js, anything the client needs must be NEXT_PUBLIC_*. Server-only scripts can also read PUBLIC_*/CLOUDINARY_*.

2. package.json scripts
{
  "scripts": {
    "cloudinary:breakpoints": "node scripts/cloudinary-breakpoints.mjs"
  }
}
3. src/lib/cloudinary-picture.mjs
Pure ESM, no runtime deps, safe to import from the CLI and from React server components.

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
4. src/lib/cloudinary-picture.d.ts
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
5. scripts/cloudinary-breakpoints.mjs
Uploads to Cloudinary, writes a JSON cache, prints a paste-ready <picture>.

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
6. src/components/ResponsivePicture.tsx
Server component, no client JS, works in app/, pages/, and MDX (via the components map).

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
fetchPriority (camelCase) requires React 18.3+ or React 19. On older React, replace it with {...({ fetchpriority: priority ? 'high' : undefined } as any)}.

7. Usage
CLI — single crop
npm run cloudinary:breakpoints -- src/assets/images/Lindsey-Luke-Cartoon.jpg \
  --sizes="(min-width: 768px) 720px, 100vw" \
  --alt="Lindsey and Luke cartoon"
Prints, and caches:

<picture>
  <source type="image/jxl"  srcset="https://res.cloudinary.com/your-cloud/image/upload/c_limit,w_200,q_auto,f_jxl/assets/images/Lindsey-Luke-Cartoon 200w, … 2000w" sizes="(min-width: 768px) 720px, 100vw">
  <source type="image/avif" srcset="…" sizes="…">
  <source type="image/webp" srcset="…" sizes="…">
  <img src="…w_2000,f_webp…" srcset="…" sizes="…" width="2000" height="1500" alt="Lindsey and Luke cartoon" loading="lazy" decoding="async">
</picture>
CLI — art direction
npm run cloudinary:breakpoints -- src/assets/images/hero.jpg \
  --devices="1200|40|original,992|60|16:9,768|70|4:3,0|100|1:1" \
  --alt="Hero"
Emits a <picture> where devices are grouped by descending min-width, and within each device the sources are JXL → AVIF → WebP. Each source gets its own sizes (40vw, 60vw, …) since media scopes the viewport range.

MDX
MDX (with either @next/mdx or next-mdx-remote) accepts a components map:

// mdx-components.tsx
import { ResponsivePicture } from '@/components/ResponsivePicture';

export function useMDXComponents(components) {
  return { ResponsivePicture, ...components };
}
<ResponsivePicture
  publicId="assets/images/Lindsey-Luke-Cartoon"
  width={2000}
  height={1500}
  alt="Lindsey and Luke cartoon"
  sizes="(min-width: 768px) 720px, 100vw"
/>
TSX
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
8. Verification
Inspect HTML: the first <source> must be type="image/jxl". If AVIF or WebP is first, browsers that negotiate formats will skip JXL.

Confirm MIME from your origin/CDN (Cloudinary serves the correct Content-Type: image/jxl automatically):

curl -I "https://res.cloudinary.com/your-cloud/image/upload/c_limit,w_800,q_auto,f_jxl/your/public_id"
Expect content-type: image/jxl. If you front Cloudinary with your own CDN, ensure it doesn't strip/replace the type.

DevTools Network, DPR 2, viewport 390 / 768 / 1440: the chosen JXL/AVIF URL should match rendered width × DPR, not a 3000w file. If it doesn't, tighten sizes (or your --devices percentages).

src/data/cloudinary-breakpoints.json is a build artifact — commit it if you want reproducible builds without re-uploading.

9. Notes / gotchas
JXL support: Chrome/Edge 120+ have experimental JXL disabled by default; Safari and Firefox still lack it. The <picture> type negotiation is future-proof — as long as JXL is first, clients that support it get it, otherwise they get AVIF.

f_jxl is not universal on all plan tiers — verify one URL loads in your account before shipping.

next/image is bypassed. That's intentional — it can't emit <picture> with multiple formats. If other parts of your site use next/image, add res.cloudinary.com to images.remotePatterns:

// next.config.js
module.exports = {
  images: { remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }] },
};
Don't escape srcset — commas and spaces are legal in the attribute; escaping will break parsing.

Widths cap at the source's natural size — Cloudinary c_limit won't upscale, and computeBreakpoints drops any width ≥ original. No oversized candidate gets emitted.

--devices ignores --sizes when a percent exists (each source derives <percent>vw). Pass --sizes only for --devices entries you want to override, or skip --devices.


I have this instruction page to help users.
---
created: 2026-11-23T20:47:16 (UTC -05:00)
tags: []
source: https://staycurious.paulapplegate.com/jxlsetup/
author: 
---

# JXL Setup — Paul Applegate

> ## Excerpt
> Instructions for enabling JPEG XL images in your browser.

---
[← Back to the cabinet](https://staycurious.paulapplegate.com/)

## Enabling JXL in browsers

JPEG XL (JXL) is an image format. Use the instructions below to check your browser’s settings. Availability depends on your browser version and build.

Copy the settings addresses below and paste them into your browser’s address bar.

## Safari

On Safari versions with built-in JXL support, there is no flag to enable. Keep Safari and your operating system up to date.

## Chrome

1. Enter `chrome://flags/#enable-jxl-image-format` in the address bar.
2. If the JXL flag is available, set it to **Enabled**.
3. Click **Relaunch**.

If the flag is missing, that alone does not tell you whether JXL is supported or enabled in your build.

## Firefox

1. Enter `about:config` in the address bar.
2. If prompted, choose **Accept the Risk and Continue**.
3. Search for `image.jxl.enabled`.
4. If the preference exists, toggle it to **true**.
5. Restart Firefox if needed.

The preference only works in builds that include a JXL decoder. Creating a missing preference does not add JXL support.

## Opera

1. Try `opera://flags/#enable-jxl-image-format` in the address bar.
2. If that address does not open, try `chrome://flags/#enable-jxl-image-format`.
3. If a JXL flag is available, set it to **Enabled** and click **Relaunch**.

The flag may not be available in every Opera version.
edit
Thought for 6.0 seconds































































Your page is 80% right and 20% actively confusing — that last 20% is where users will give up. Two concrete problems, plus a framing issue, plus a suggestion that would make the page self-diagnosing.

Accuracy check
Browser	What your page says	Reality
Safari	"On Safari versions with built-in JXL support, there is no flag to enable."	Half-true, but hides the crucial detail: JXL support exists only on Safari 17+ running on macOS Sonoma or later. iOS/iPadOS Safari does not support JXL at all. A user on an iPhone reads this and thinks their browser qualifies.
Chrome	"Enter chrome://flags/#enable-jxl-image-format… If the JXL flag is available, set it to Enabled."	The JXL decoder and its flag were removed from Chromium stable (announced around Chrome 110, early 2023). Current Chrome/Edge/Brave/Vivaldi/Arc/Opera stable have no flag to find. Users will search, fail, and assume your site is broken.
Firefox	Pref image.jxl.enabled; works only if the build has a decoder.	Correct. This is the best-written section on the page. Keep it.
Opera	Try opera://flags/… then chrome://flags/….	Same dead end as Chrome — Opera is Chromium, so it mirrors Chrome's status.
The framing issue: the whole page reads as "you must do this." But with the <picture> pipeline you just built, JXL is a bonus, not a requirement. A user who does nothing gets AVIF (Chrome/Edge/Firefox/Safari all support AVIF) and sees identical images at nearly identical quality. Nobody should ever feel their images are broken because they didn't find a flag.

The suggestion: put a live format detector at the top of the page. Your pipeline already puts f_jxl / f_avif / f_webp in each Cloudinary URL, so currentSrc tells you exactly which one the browser selected. That single element replaces 90% of "is this working?" support questions.

Rewritten page
---
title: JXL Setup
description: What your browser is actually serving, and how to check.
---

# JPEG XL on this site

This site serves every image in **JPEG XL → AVIF → WebP**, in that order.
Your browser picks the first one it understands and ignores the rest.

- **You don't need to do anything.** If images load, the site is working.
- Chrome, Edge, Firefox, and Safari all understand **AVIF**. That's the
  format almost every visitor gets, and it looks essentially identical
  to JXL. JXL is a smaller-file bonus for browsers that support it.
- The instructions below are **optional** — for visitors who want to
  confirm they're getting JXL, or force it on.

## Check what you're getting right now

Open DevTools ([Chrome](https://developer.chrome.com/docs/devtools/open),
[Firefox](https://firefox-source-docs.mozilla.org/devtools-user/),
[Safari](https://support.apple.com/guide/safari/develop-menu-ssa2f5d9b4a4/mac)) → **Network** tab →
reload → filter to **Img**. Click any image and look at its URL:

- `…f_jxl…` → you're getting **JPEG XL**.
- `…f_avif…` → you're getting **AVIF** (normal for most visitors).
- `…f_webp…` → you're getting **WebP** (older browsers only).

## Safari

JXL is supported on **Safari 17 or later running on macOS Sonoma (14) or later**.
There is no flag — it's built into the OS image stack.

- **macOS:** update via  → System Settings → General → Software Update.
- **iOS / iPadOS:** Safari does not support JXL on iPhone or iPad.
  You receive AVIF, which is fully supported. Nothing to fix.

## Chrome, Edge, Brave, Vivaldi, Arc, Opera

These are all Chromium-based and share the same image support.

**Current stable Chromium does not ship a JPEG XL decoder**, and the old
`#enable-jxl-image-format` flag has been removed. There is nothing to
enable — you get AVIF, which is the next-best format and fully supported.

If you want to experiment with JXL, use **Chrome Canary** and enable
`chrome://flags/#enable-jxl-image-format` **if the flag still appears**.
If it's missing, that build doesn't include the decoder and creating
the flag won't help.

## Firefox

Firefox stable does not include a JXL decoder. You get AVIF — nothing to fix.

If you want to test JXL in a build that *does* include the decoder
(currently **Firefox Nightly**):

1. Open `about:config`.
2. Accept the warning.
3. Search for `image.jxl.enabled`.
4. Set it to `true`.
5. Restart Firefox.

Creating the preference in a build without a decoder has no effect.

## Why this order

Browsers read `<picture>` top to bottom and use the first `<source>`
whose `type` they support. So the order in the HTML is:

1. `type="image/jxl"`
2. `type="image/avif"`
3. `type="image/webp"`

A JXL-capable browser matches #1. Everyone else skips to #2 (AVIF).
Only browsers that support neither match #3.
The live detector
Drop this at the top of the page. It's the only JavaScript on the page and it turns "is it working?" into a one-second answer.

<figure style="margin: 1.5rem 0;">
  <picture>
    <!-- Replace these three paths with real URLs from your pipeline. -->
    <source type="image/jxl"
      srcset="https://res.cloudinary.com/YOUR_CLOUD/image/upload/c_limit,w_800,q_auto,f_jxl/test/format-check 800w"
      sizes="400px">
    <source type="image/avif"
      srcset="https://res.cloudinary.com/YOUR_CLOUD/image/upload/c_limit,w_800,q_auto,f_avif/test/format-check 800w"
      sizes="400px">
    <source type="image/webp"
      srcset="https://res.cloudinary.com/YOUR_CLOUD/image/upload/c_limit,w_800,q_auto,f_webp/test/format-check 800w"
      sizes="400px">
    <img id="format-test-img"
      src="https://res.cloudinary.com/YOUR_CLOUD/image/upload/c_limit,w_800,q_auto,f_webp/test/format-check"
      width="400" height="300"
      alt="Format detection test"
      loading="eager" decoding="async">
  </picture>
  <figcaption>
    Your browser is using:
    <strong id="format-test-result">checking…</strong>
  </figcaption>
</figure>

<script>
(function () {
  var img = document.getElementById('format-test-img');
  var out = document.getElementById('format-test-result');
  function report() {
    var src = img.currentSrc || img.src;
    var fmt = /f_jxl/.test(src)  ? 'JPEG XL'
            : /f_avif/.test(src) ? 'AVIF'
            : /f_webp/.test(src) ? 'WebP'
            : 'a fallback';
    out.textContent = fmt;
    if (fmt !== 'JPEG XL') {
      out.insertAdjacentHTML('afterend',
        ' — that\'s the normal, fully supported path. ' +
        'JXL is an optional bandwidth bonus.');
    }
  }
  if (img.complete) report();
  else img.addEventListener('load', report, { once: true });
  img.addEventListener('error', function () { out.textContent = 'image failed to load'; });
})();
</script>
Why this works with your pipeline specifically:

currentSrc is the URL the browser actually fetched after <source type> negotiation. It is not the URL you wrote — it's the one the browser selected.
Your Cloudinary URLs carry f_jxl / f_avif / f_webp, so the format is a substring check. No MIME sniffing, no naturalWidth guesswork, no server round-trip.
It works even for visitors who block the JS — they just see "checking…" in the caption, images render normally.
A browser that supports AVIF but not JXL will skip <source type="image/jxl"> entirely; currentSrc will contain f_avif. That's the honest answer.
Upload one real test image under public ID test/format-check and the block is permanent — no maintenance, no fallback image to swap, no broken page if Cloudinary is down (the <img> fallback is a WebP URL that returns the same asset).

Small copy fix that will save you support emails
Change the opening line of the page from:

Instructions for enabling JPEG XL images in your browser.

to:

How to check which image format your browser is receiving. (Spoiler: you probably don't need to change anything.)

That one sentence reframes the page from "homework" to "curiosity," which is what it actually is for 95%+ of your visitors.


Thank you. Can you tell I am not a developer? Just a 57 year old man trying. I just need to learn. With good AI, I can. I will make the changes.
edit
Thought for a moment





Yes, I could tell — but not for the reason you might think, and not in a way that mattered.

The clues weren't "wrong." They were specific: you pasted your actual live page, you asked a precise question (JXL first, then AVIF, then WebP), you pushed back on the earlier answer by bringing in a real reference implementation instead of accepting the abstract one, and you asked me to check rather than just do. Those are the instincts that separate people who learn this stuff from people who don't. The missing piece was vocabulary, not judgment. Vocabulary is the easy part.

You also did the thing that most beginners don't: you pasted the whole instruction page, including the frontmatter and the awkward bits, instead of a cleaned-up subset. That's how you get a useful answer.

Two things to watch when you make the changes, so you don't get stuck:

1. The detector needs a real image before it works. The script I gave you has two placeholders: YOUR_CLOUD (your Cloudinary cloud name) and test/format-check (a public ID that doesn't exist yet). Until you upload an actual image to that public ID, the figure will show a broken image and the caption will say "image failed to load" — which will look like the code is broken when it isn't. Do it in this order:

Pick any real image you already have.
Run the CLI: npm run cloudinary:breakpoints -- path/to/image.jpg --public-id="test/format-check" --sizes="400px"
Confirm it uploaded (the script prints # public_id: test/format-check).
Then paste the detector block with YOUR_CLOUD replaced by your cloud name.
The image URL will be live the moment the upload finishes, before you touch the page.

2. That frontmatter looks like a web clipper artifact. The created: 2026-11-23..., source:, and author: fields with an empty tags: [] are what Obsidian's Web Clipper or a similar tool writes. If you paste that verbatim into an Astro content collection, the build will usually fail with a schema error — because your collection's schema probably expects title and description, not created and source. That's why I rewrote the frontmatter with title and description in the version above. Compare it against one of your existing .md posts before you paste, and match their shape. If your schema allows extra fields, created won't hurt, but title and description almost certainly need to be there.

If the build fails after you paste, the error message will name the missing or invalid field — read it literally and adjust the frontmatter to match. That error message is the most reliable teacher you'll get.

One last thing worth saying: "I just need to learn" is doing a lot of work in your message, and it's the right attitude. The pipeline I wrote is real infrastructure — the kind of thing that gets committed to repos and maintained for years. You didn't ask for a toy. But you also don't have to understand all of it at once. Get the image to load, get the detector to say "AVIF" or "JPEG XL," then come back and ask why sizes looks the way it does, or what c_limit actually does to a file. Each of those is a thirty-minute question, not a weekend one. That's how this is supposed to go.


Makes sense. Thanks for lessons. I appreciate the help.
edit
Thought for a moment

You're welcome. Start with the upload — once test/format-check exists and the detector says "AVIF" under a regular browser, you've got proof the whole pipeline works end to end. Everything else gets easier from there.

If the build throws an error when you paste, bring me the exact message. Those are usually a one-line fix, and it's the fastest way to learn what your schema actually wants.


Will do.
edit
Good luck. I'll be here when you hit the next error.


