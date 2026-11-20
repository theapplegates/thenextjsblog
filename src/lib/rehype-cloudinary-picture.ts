import type { Element, Properties, Root } from 'hast'
import manifestData from '@/data/cloudinary-breakpoints.json'

type CloudinaryFormat = 'jxl' | 'avif' | 'webp'

interface CloudinaryEntry {
  width?: number
  height?: number
  breakpoints: number[]
}

type CloudinaryManifestEntry = number[] | CloudinaryEntry

export type CloudinaryManifest = Record<string, CloudinaryManifestEntry>

interface MdxJsxAttribute {
  type: 'mdxJsxAttribute'
  name: string
  value?: string | null | { type: string, value?: string }
}

interface MdxJsxElement {
  type: 'mdxJsxFlowElement' | 'mdxJsxTextElement'
  name?: string | null
  attributes?: MdxJsxAttribute[]
  children?: unknown[]
}

interface CloudinaryPictureAttributes {
  src?: string
  alt?: string
  width?: number
  height?: number
  sizes?: string
  breakpoints: number[]
  loading?: string
  decoding?: string
  priority?: boolean
  pictureClass?: string
  className?: string
}

type AttributeValue = string | true | undefined

const FORMAT_ORDER: CloudinaryFormat[] = ['jxl', 'avif', 'webp']

const MIME_TYPES: Record<CloudinaryFormat, string> = {
  jxl: 'image/jxl',
  avif: 'image/avif',
  webp: 'image/webp',
}

/**
 * The default `sizes` value matches the inline images used by MDXImage.
 * Override it per image with the `sizes` attribute.
 */
export const DEFAULT_PICTURE_SIZES
  = '(max-width: 768px) calc(100vw - 3rem), (max-width: 1280px) 720px, 814px'

export interface RehypeCloudinaryPictureOptions {
  /** Cloudinary cloud name. Defaults to NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME. */
  cloudName?: string
  /** Breakpoint manifest. Defaults to src/data/cloudinary-breakpoints.json. */
  manifest?: CloudinaryManifest
  /** Fallback `sizes` value when the tag does not include one. */
  defaultSizes?: string
}

function toNumber(value: AttributeValue): number | undefined {
  if (value === undefined || value === true) {
    return undefined
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function toPositiveNumber(value: AttributeValue): number | undefined {
  const parsed = toNumber(value)
  return parsed !== undefined && parsed > 0 ? parsed : undefined
}

function toBoolean(value: AttributeValue): boolean {
  return value !== undefined && value !== 'false'
}

/**
 * Parse `breakpoints="200, 455, 637"` (or a JSON array) into sorted, unique
 * positive widths.
 */
export function parseCloudinaryBreakpoints(value: AttributeValue): number[] {
  if (value === undefined || value === true) {
    return []
  }

  const trimmed = value.trim()
  if (trimmed === '') {
    return []
  }

  let rawWidths: unknown[] = trimmed.split(',')

  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        rawWidths = parsed
      }
    } catch {
      // Not JSON: fall back to the comma-separated value.
    }
  }

  const widths = rawWidths
    .map((width) => {
      if (typeof width === 'number') {
        return width
      }
      if (typeof width === 'string') {
        return Number(width.trim())
      }
      if (typeof width === 'object' && width !== null && 'width' in width) {
        return Number(width.width)
      }
      return Number.NaN
    })
    .filter(width => Number.isFinite(width) && width > 0)

  return [...new Set(widths)].sort((a, b) => a - b)
}

/**
 * Convert the paths authors use in MDX into Cloudinary public IDs:
 *   assets/images/photo.jpg       -> assets/images/photo
 *   public/thumbnails/photo.jpg   -> thumbnails/photo
 *   /thumbnails/photo.jpg         -> thumbnails/photo
 *   src/assets/images/photo.jpg   -> assets/images/photo
 */
export function normalizeCloudinaryPublicId(src: string): string {
  if (/^(?:https?:)?\/\//.test(src)) {
    throw new Error(
      `[cloudinary-picture] expected a local image path or Cloudinary public ID, received "${src}"`,
    )
  }

  const [pathname] = src.trim().split(/[?#]/)
  const publicId = pathname
    .replace(/^\/+/, '')
    .replace(/^public\//, '')
    .replace(/^src\//, '')
    .replace(/\.[^./]+$/, '')
    .replace(/\/+/g, '/')

  if (publicId === '') {
    throw new Error('[cloudinary-picture] `src` must not be empty')
  }

  return publicId
}

function resolveEntry(
  manifest: CloudinaryManifest,
  publicId: string,
): { width?: number, height?: number, breakpoints: number[] } | null {
  const manifestEntry = manifest[publicId]

  if (manifestEntry === undefined) {
    return null
  }

  if (Array.isArray(manifestEntry)) {
    return { breakpoints: manifestEntry }
  }

  return {
    width: manifestEntry.width,
    height: manifestEntry.height,
    breakpoints: manifestEntry.breakpoints,
  }
}

function buildUrl(
  cloudName: string,
  publicId: string,
  format: CloudinaryFormat,
  width: number,
): string {
  const transformation = `c_limit,w_${width},f_${format},q_auto`
  return `https://res.cloudinary.com/${cloudName}/image/upload/${transformation}/${publicId}`
}

function buildSrcSet(
  cloudName: string,
  publicId: string,
  format: CloudinaryFormat,
  widths: number[],
): string {
  return widths
    .map(width => `${buildUrl(cloudName, publicId, format, width)} ${width}w`)
    .join(', ')
}

function classNames(value: string | undefined): string[] | undefined {
  if (value === undefined) {
    return undefined
  }

  const classes = value.split(/\s+/).filter(Boolean)
  return classes.length > 0 ? classes : undefined
}

function isMdxElement(node: unknown): node is MdxJsxElement {
  if (typeof node !== 'object' || node === null) {
    return false
  }

  const candidate = node as { type?: string }
  return candidate.type === 'mdxJsxFlowElement' || candidate.type === 'mdxJsxTextElement'
}

function isElement(node: unknown): node is Element {
  return typeof node === 'object' && node !== null && (node as { type?: string }).type === 'element'
}

function isCloudinaryPicture(node: unknown): node is Element | MdxJsxElement {
  if (isElement(node)) {
    return node.tagName === 'cloudinary-picture'
  }

  if (isMdxElement(node)) {
    return node.name === 'cloudinary-picture'
  }

  return false
}

function mdxAttributeValue(attribute: MdxJsxAttribute): AttributeValue {
  if (attribute.value === null || attribute.value === undefined) {
    return true
  }

  if (typeof attribute.value === 'string') {
    return attribute.value
  }

  if (typeof attribute.value === 'object' && typeof attribute.value.value === 'string') {
    return attribute.value.value
  }

  return undefined
}

function extractAttributes(node: Element | MdxJsxElement): Record<string, AttributeValue> {
  const attributes: Record<string, AttributeValue> = {}

  if (isElement(node)) {
    for (const [name, value] of Object.entries(node.properties ?? {})) {
      if (value === null || value === undefined || value === false) {
        continue
      }

      attributes[name] = Array.isArray(value) ? value.join(' ') : String(value)
    }

    return attributes
  }

  for (const attribute of node.attributes ?? []) {
    if (attribute.type !== 'mdxJsxAttribute') {
      continue
    }

    const value = mdxAttributeValue(attribute)
    if (value !== undefined) {
      attributes[attribute.name] = value
    }
  }

  return attributes
}

function toPictureAttributes(
  attributes: Record<string, AttributeValue>,
): CloudinaryPictureAttributes {
  return {
    src: attributes.src === true ? undefined : attributes.src,
    alt: attributes.alt === true ? undefined : attributes.alt,
    width: toPositiveNumber(attributes.width),
    height: toPositiveNumber(attributes.height),
    sizes: attributes.sizes === true ? undefined : attributes.sizes,
    breakpoints: parseCloudinaryBreakpoints(attributes.breakpoints),
    loading: attributes.loading === true ? undefined : attributes.loading,
    decoding: attributes.decoding === true ? undefined : attributes.decoding,
    priority: toBoolean(attributes.priority),
    pictureClass:
      attributes['picture-class'] === true
        ? undefined
        : attributes['picture-class'] ?? (
          attributes.pictureClass === true ? undefined : attributes.pictureClass
        ),
    className:
      attributes.class === true
        ? undefined
        : attributes.class ?? (
          attributes.className === true ? undefined : attributes.className
        ),
  }
}

/**
 * Build the standard <picture> hast node for one <cloudinary-picture> tag.
 * Exported so the URL and fallback behaviour can be tested directly.
 */
export function buildCloudinaryPictureNode(
  attributes: CloudinaryPictureAttributes,
  options: RehypeCloudinaryPictureOptions = {},
): Element {
  const cloudName
    = options.cloudName ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME

  if (cloudName === undefined || cloudName === '') {
    throw new Error(
      '[cloudinary-picture] NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME is not set. Add it to .env.local.',
    )
  }

  if (attributes.src === undefined || attributes.src.trim() === '') {
    throw new Error('[cloudinary-picture] `src` is required')
  }

  if (attributes.alt === undefined || attributes.alt.trim() === '') {
    throw new Error(
      `[cloudinary-picture] a non-empty alt is required for src="${attributes.src}"`,
    )
  }

  const publicId = normalizeCloudinaryPublicId(attributes.src)
  const manifest = options.manifest ?? manifestData
  const entry = resolveEntry(manifest, publicId)

  const widths = attributes.breakpoints.length > 0
    ? attributes.breakpoints
    : entry?.breakpoints ?? []

  if (widths.length === 0) {
    throw new Error(
      `[cloudinary-picture] no breakpoints found for "${publicId}". `
      + `Run "pnpm cloudinary:breakpoints" first, or add a breakpoints="..." attribute.`,
    )
  }

  const width = attributes.width ?? entry?.width
  const height = attributes.height ?? entry?.height
  const sizes = attributes.sizes ?? options.defaultSizes ?? DEFAULT_PICTURE_SIZES
  const fallbackWidth = widths[widths.length - 1]
  const loading = attributes.priority === true ? 'eager' : attributes.loading ?? 'lazy'
  const decoding = attributes.decoding ?? 'async'

  const sources = FORMAT_ORDER.map(format => ({
    type: 'element' as const,
    tagName: 'source',
    properties: {
      type: MIME_TYPES[format],
      sizes,
      srcSet: buildSrcSet(cloudName, publicId, format, widths),
    } satisfies Properties,
    children: [],
  }))

  const imageProperties: Properties = {
    src: buildUrl(cloudName, publicId, 'webp', fallbackWidth),
    srcSet: buildSrcSet(cloudName, publicId, 'webp', widths),
    alt: attributes.alt,
    sizes,
    loading,
    decoding,
  }

  if (width !== undefined) {
    imageProperties.width = width
  }

  if (height !== undefined) {
    imageProperties.height = height
  }

  if (attributes.priority === true) {
    imageProperties.fetchPriority = 'high'
  }

  const imageClasses = classNames(attributes.className)
  if (imageClasses !== undefined) {
    imageProperties.className = imageClasses
  }

  const pictureProperties: Properties = {}
  const pictureClasses = classNames(attributes.pictureClass)
  if (pictureClasses !== undefined) {
    pictureProperties.className = pictureClasses
  }

  return {
    type: 'element',
    tagName: 'picture',
    properties: pictureProperties,
    children: [
      ...sources,
      {
        type: 'element',
        tagName: 'img',
        properties: imageProperties,
        children: [],
      },
    ],
  }
}

function walk(node: unknown, options: RehypeCloudinaryPictureOptions): void {
  if (typeof node !== 'object' || node === null) {
    return
  }

  const parent = node as { children?: unknown[] }
  if (!Array.isArray(parent.children)) {
    return
  }

  parent.children = parent.children.map((child) => {
    if (isCloudinaryPicture(child)) {
      return buildCloudinaryPictureNode(
        toPictureAttributes(extractAttributes(child)),
        options,
      )
    }

    walk(child, options)
    return child
  })
}

/**
 * Render <cloudinary-picture> tags in MDX to native <picture> elements with
 * JXL, AVIF, and WebP sources plus a WebP <img> fallback.
 *
 * No browser-side custom element is needed: the tag is resolved at build time.
 */
export default function rehypeCloudinaryPicture(
  options: RehypeCloudinaryPictureOptions = {},
) {
  return (tree: Root) => {
    walk(tree, options)
    return tree
  }
}
