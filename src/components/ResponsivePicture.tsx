import { buildPictureProps, resolveCloudName } from '@/lib/cloudinary-picture.mjs';
import type { DeviceSource } from '@/lib/cloudinary-picture';

type Props = {
  publicId: string;
  width: number | string;
  height: number | string;
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
    width: Number(width),
	height: Number(height),
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