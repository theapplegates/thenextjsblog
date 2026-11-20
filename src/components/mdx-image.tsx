import { PostImage } from '@/components/post-image'
import { cn } from '@/lib/utils'

interface MDXImageProps {
  src?: string
  alt?: string
  title?: string
  className?: string
  width?: number
  height?: number
  srcSet?: string
  sizes?: string
  loading?: 'lazy' | 'eager'
  decoding?: 'async' | 'sync' | 'auto'
  fetchPriority?: 'high' | 'low' | 'auto'
}

export function MDXImage({
  src,
  alt = 'Image',
  title,
  className,
  width,
  height,
  srcSet,
  sizes,
  loading,
  decoding,
  fetchPriority,
}: MDXImageProps) {
  // A <cloudinary-picture> tag is already rendered to a complete <picture>
  // with a WebP <img> fallback. Pass that fallback through unchanged instead
  // of wrapping it in PostImage/Next Image a second time.
  if (srcSet !== undefined) {
    return (
      // eslint-disable-next-line next/no-img-element -- The Cloudinary tag already provides a complete responsive srcset.
      <img
        src={src}
        srcSet={srcSet}
        alt={alt}
        title={title}
        width={width}
        height={height}
        sizes={sizes}
        loading={loading}
        decoding={decoding}
        fetchPriority={fetchPriority}
        className={className}
      />
    )
  }

  return (
    <figure className="prose-img:m-0 text-center">
      <span className="relative block h-128 w-full overflow-hidden">
        <PostImage
          src={src}
          alt={alt}
          placeholder="No Image Available"
          sizes="(max-width: 768px) calc(100vw - 3rem), (max-width: 1280px) 720px, 814px"
          className={cn('object-contain', className)}
        />
      </span>
      {title !== undefined && title !== '' && (
        <figcaption data-testid="mdx-image-title" className="line-clamp-3">
          {title}
        </figcaption>
      )}
    </figure>
  )
}
