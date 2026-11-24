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