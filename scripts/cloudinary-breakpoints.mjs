// scripts/cloudinary-breakpoints.mjs
//
// Uploads local blog images to Cloudinary (or reuses an existing upload) and
// asks Cloudinary for responsive breakpoints. The resulting manifest is read by
// src/components/post-image.tsx at build time.
//
// Usage:
//   pnpm cloudinary:breakpoints
//   pnpm cloudinary:breakpoints public/thumbnails/photo.jpg
//   pnpm cloudinary:breakpoints public/thumbnails/*.jpg
//
// Credentials live in .env.local (never commit that file):
//   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name
//   CLOUDINARY_API_KEY=your-api-key
//   CLOUDINARY_API_SECRET=your-api-secret

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, parse, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { v2 as cloudinary } from 'cloudinary'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DATA_DIR = join(ROOT, 'src', 'data')
const JSON_PATH = join(DATA_DIR, 'cloudinary-breakpoints.json')
const PUBLIC_DIR = join(ROOT, 'public')
const ASSETS_DIR = join(ROOT, 'src', 'assets', 'images')
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif'])

// .env.local wins over .env. Existing shell variables still take priority.
dotenv.config({ path: join(ROOT, '.env.local'), quiet: true })
dotenv.config({ path: join(ROOT, '.env'), quiet: true })

const cloudName
  = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
    ?? process.env.CLOUDINARY_CLOUD_NAME
    ?? process.env.PUBLIC_CLOUDINARY_CLOUD_NAME

cloudinary.config({
  cloud_name: cloudName,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})

const RESPONSIVE_BREAKPOINTS = [
  {
    create_derived: true,
    bytes_step: 200,
    min_width: 200,
    max_width: 1920,
    max_images: 20,
  },
]

function isNotFound(error) {
  return (
    error?.http_code === 404
    || error?.statusCode === 404
    || error?.error?.http_code === 404
  )
}

function pathToPublicId(filePath) {
  const absolutePath = resolve(ROOT, filePath)

  const relativePublic = relative(PUBLIC_DIR, absolutePath).replace(/\\/g, '/')
  if (!relativePublic.startsWith('..')) {
    const { dir, name } = parse(relativePublic)
    return dir === '' ? name : `${dir}/${name}`
  }

  const relativeAssets = relative(ASSETS_DIR, absolutePath).replace(/\\/g, '/')
  if (!relativeAssets.startsWith('..')) {
    const { dir, name } = parse(relativeAssets)
    return dir === ''
      ? `assets/images/${name}`
      : `assets/images/${dir}/${name}`
  }

  throw new Error(
    `Image must be inside public/ or src/assets/images/. Received: ${filePath}`,
  )
}

function isImageFile(filePath) {
  return IMAGE_EXTENSIONS.has(parse(filePath).ext.toLowerCase())
}

async function findImages(directoryPath) {
  const found = []

  async function walk(currentPath) {
    let entries
    try {
      entries = await readdir(currentPath, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const entryPath = join(currentPath, entry.name)
      if (entry.isDirectory()) {
        await walk(entryPath)
      } else if (entry.isFile() && isImageFile(entry.name)) {
        found.push(entryPath)
      }
    }
  }

  await walk(directoryPath)
  return found
}

function extractEntry(result) {
  const breakpoints = result.responsive_breakpoints?.[0]?.breakpoints

  if (!Array.isArray(breakpoints) || breakpoints.length === 0) {
    throw new Error('Cloudinary returned no responsive breakpoints')
  }

  const widths = [...new Set(
    breakpoints
      .map(breakpoint => Number(breakpoint.width))
      .filter(width => Number.isFinite(width) && width > 0),
  )].sort((a, b) => a - b)

  if (widths.length === 0) {
    throw new Error('Cloudinary returned breakpoints without usable widths')
  }

  return {
    width: Number.isFinite(Number(result.width)) ? Number(result.width) : undefined,
    height: Number.isFinite(Number(result.height)) ? Number(result.height) : undefined,
    breakpoints: widths,
  }
}

async function analyzeExisting(publicId) {
  return cloudinary.uploader.explicit(publicId, {
    type: 'upload',
    responsive_breakpoints: RESPONSIVE_BREAKPOINTS,
  })
}

async function upload(publicId, localPath) {
  return cloudinary.uploader.upload(localPath, {
    public_id: publicId,
    overwrite: false,
    responsive_breakpoints: RESPONSIVE_BREAKPOINTS,
  })
}

async function ensureEntry(publicId, localPath) {
  try {
    return extractEntry(await analyzeExisting(publicId))
  } catch (error) {
    if (!isNotFound(error)) {
      throw error
    }
  }

  return extractEntry(await upload(publicId, localPath))
}

async function loadMap() {
  try {
    return JSON.parse(await readFile(JSON_PATH, 'utf8'))
  } catch {
    return {}
  }
}

async function writeManifest(map) {
  const sortedMap = Object.fromEntries(
    Object.keys(map)
      .sort()
      .map(key => [key, map[key]]),
  )

  await mkdir(DATA_DIR, { recursive: true })
  await writeFile(JSON_PATH, `${JSON.stringify(sortedMap, null, 2)}\n`)
}

function printHelp() {
  console.log(`
Usage:
  pnpm cloudinary:breakpoints
  pnpm cloudinary:breakpoints <image> [<image> ...]

Examples:
  pnpm cloudinary:breakpoints public/thumbnails/photo.jpg
  pnpm cloudinary:breakpoints public/thumbnails/*.jpg

With no arguments, every JPG, PNG, WebP, and AVIF under public/ and
src/assets/images/ is uploaded and analyzed.
`)
}

async function main() {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    printHelp()
    return
  }

  if (cloudName === undefined || cloudName === '') {
    throw new Error(
      'Missing Cloudinary cloud name. Add NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME to .env.local.',
    )
  }

  if (
    process.env.CLOUDINARY_API_KEY === undefined
    || process.env.CLOUDINARY_API_SECRET === undefined
  ) {
    throw new Error(
      'Missing CLOUDINARY_API_KEY or CLOUDINARY_API_SECRET. Add both to .env.local.',
    )
  }

  let files = args

  if (files.length === 0) {
    const publicImages = await findImages(PUBLIC_DIR)
    const assetImages = await findImages(ASSETS_DIR)
    files = [...publicImages, ...assetImages]
  }

  if (files.length === 0) {
    console.log('No images found. Nothing to do.')
    return
  }

  const map = await loadMap()
  let succeeded = 0

  for (const file of files) {
    const publicId = pathToPublicId(file)
    const entry = await ensureEntry(publicId, resolve(ROOT, file))
    map[publicId] = entry
    await writeManifest(map)
    succeeded += 1
    console.log(
      `${publicId}: ${entry.breakpoints.join(', ')} (${entry.width ?? '?'} × ${entry.height ?? '?'})`,
    )
  }

  console.log(`\nSaved ${succeeded} image${succeeded === 1 ? '' : 's'} to ${JSON_PATH}`)
}

main().catch((error) => {
  console.error(`\nCloudinary breakpoint generation failed: ${error.message}`)
  process.exit(1)
})
