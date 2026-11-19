'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { CloudinaryPicture } from '@/components/cloudinary-picture'
import { DotPattern } from '@/components/ui/dot-pattern'
import breakpointsData from '@/data/cloudinary-breakpoints.json'
import { cn } from '@/lib/utils'

interface CloudinaryEntry {
  width?: number
  height?: number
  breakpoints: number[]
}

type BreakpointManifest = Record<string, number[] | CloudinaryEntry>

const manifest = breakpointsData as BreakpointManifest

const DEFAULT_SIZES
  = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'

export interface PostImageProps {
  src?: string
  alt: string
  placeholder?: string
  sizes?: string
  loading?: 'lazy' | 'eager'
  priority?: boolean
  unoptimized?: boolean
  hoverScale?: boolean
  className?: string
  pictureClassName?: string
}

function localPathToPublicId(src: string): string | null {
  if (/^(?:https?:)?\/\//.test(src) || /^(?:data|blob):/.test(src)) {
    return null
  }

  if (/\.svg(?:[?#]|$)/i.test(src)) {
    return null
  }

  const [pathname] = src.split(/[?#]/)
  const clean = pathname
    .replace(/^\/+/, '')
    .replace(/^public\//, '')
    .replace(/^src\/assets\/images\//, 'assets/images/')
    .replace(/\.[^./]+$/, '')
    .replace(/\/+/g, '/')

  return clean || null
}

function resolveEntry(entry: number[] | CloudinaryEntry | undefined): {
  width?: number
  height?: number
  breakpoints: number[]
} | null {
  if (entry === undefined) {
    return null
  }

  if (Array.isArray(entry)) {
    return { breakpoints: entry }
  }

  return {
    width: entry.width,
    height: entry.height,
    breakpoints: entry.breakpoints,
  }
}

export function PostImage({
  src,
  alt,
  placeholder,
  sizes = DEFAULT_SIZES,
  loading = 'lazy',
  priority = false,
  unoptimized = false,
  hoverScale = false,
  className,
  pictureClassName,
}: PostImageProps) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [cloudinaryError, setCloudinaryError] = useState(false)

  useEffect(() => {
    setLoaded(false)
    setError(false)
    setCloudinaryError(false)
  }, [src])

  const imageSrc = src ?? ''
  const hasImage = imageSrc !== '' && !error
  const isRemote = /^(?:https?:)?\/\//.test(imageSrc)
  const isSvg = /\.svg(?:[?#]|$)/i.test(imageSrc)
  const shouldUnoptimize = unoptimized || isRemote || isSvg

  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  const publicId = imageSrc === '' ? null : localPathToPublicId(imageSrc)
  const entry
    = publicId === null ? null : resolveEntry(manifest[publicId])
  const cloudinaryImage
    = cloudName !== undefined
      && cloudName !== ''
      && publicId !== null
      && entry !== null
      && entry.breakpoints.length > 0
      && !cloudinaryError
      ? { publicId, entry }
      : null

  const imageClassName = cn(
    'object-cover transition-transform duration-300',
    hoverScale && 'group-hover:scale-105',
    className,
  )

  return (
    <>
      {!loaded && (
        <>
          <DotPattern
            width={20}
            height={20}
            cx={1}
            cy={1}
            cr={1}
            className={cn(
              'fill-muted-foreground/20 transition-transform duration-300',
              hoverScale && 'group-hover:scale-105',
            )}
          />
          {placeholder !== undefined && placeholder !== '' && (
            <span className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">
              {placeholder}
            </span>
          )}
        </>
      )}

      {cloudinaryImage !== null
        ? (
            <CloudinaryPicture
              publicId={cloudinaryImage.publicId}
              alt={alt}
              width={cloudinaryImage.entry.width}
              height={cloudinaryImage.entry.height}
              sizes={sizes}
              breakpoints={cloudinaryImage.entry.breakpoints}
              priority={priority}
              loading={priority ? 'eager' : loading}
              fill
              className={imageClassName}
              pictureClassName={pictureClassName}
              onLoad={() => setLoaded(true)}
              onError={() => setCloudinaryError(true)}
            />
          )
        : hasImage
          ? (
              <Image
                src={imageSrc}
                alt={alt}
                fill
                sizes={sizes}
                loading={priority ? 'eager' : loading}
                priority={priority}
                unoptimized={shouldUnoptimize}
                className={imageClassName}
                onLoad={() => setLoaded(true)}
                onError={() => setError(true)}
              />
            )
          : null}
    </>
  )
}
