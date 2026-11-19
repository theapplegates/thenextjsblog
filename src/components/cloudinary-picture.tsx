import type { ReactEventHandler } from 'react'
import { cn } from '@/lib/utils'

type CloudinaryFormat = 'jxl' | 'avif' | 'webp'

const FORMAT_ORDER: CloudinaryFormat[] = ['jxl', 'avif', 'webp']

const MIME_TYPES: Record<CloudinaryFormat, string> = {
  jxl: 'image/jxl',
  avif: 'image/avif',
  webp: 'image/webp',
}

export interface CloudinaryPictureProps {
  /** Cloudinary public ID, e.g. "thumbnails/laptop-ai-workspace". */
  publicId: string
  alt: string
  width?: number
  height?: number
  sizes?: string
  breakpoints: number[]
  priority?: boolean
  loading?: 'lazy' | 'eager'
  fill?: boolean
  className?: string
  pictureClassName?: string
  onLoad?: ReactEventHandler<HTMLImageElement>
  onError?: ReactEventHandler<HTMLImageElement>
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

/**
 * Responsive Cloudinary image with an explicit format ladder:
 * JPEG XL first, then AVIF, then WebP, with a WebP <img> floor.
 *
 * The browser picks the first format it supports and then the best width
 * for the layout from `sizes`. It does not download every format.
 */
export function CloudinaryPicture({
  publicId,
  alt,
  width,
  height,
  sizes = '100vw',
  breakpoints,
  priority = false,
  loading = 'lazy',
  fill = false,
  className,
  pictureClassName,
  onLoad,
  onError,
}: CloudinaryPictureProps) {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME

  if (cloudName === undefined || cloudName === '') {
    console.error('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME is not defined')
    return null
  }

  const widths = [...new Set(breakpoints)]
    .filter(candidateWidth => Number.isFinite(candidateWidth) && candidateWidth > 0)
    .sort((a, b) => a - b)

  if (widths.length === 0) {
    throw new Error(`No responsive breakpoints were found for Cloudinary image: ${publicId}`)
  }

  const fallbackWidth = widths[widths.length - 1]
  const fallbackSrc = buildUrl(cloudName, publicId, 'webp', fallbackWidth)

  return (
    <picture
      className={cn(
        'block',
        fill && 'relative h-full w-full overflow-hidden',
        pictureClassName,
      )}
    >
      {FORMAT_ORDER.map(format => (
        <source
          key={format}
          type={MIME_TYPES[format]}
          sizes={sizes}
          srcSet={buildSrcSet(cloudName, publicId, format, widths)}
        />
      ))}
      <img
        src={fallbackSrc}
        srcSet={buildSrcSet(cloudName, publicId, 'webp', widths)}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        loading={priority ? 'eager' : loading}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        onLoad={onLoad}
        onError={onError}
        className={cn(
          fill ? 'absolute inset-0 h-full w-full object-cover' : 'h-auto w-full',
          className,
        )}
      />
    </picture>
  )
}
