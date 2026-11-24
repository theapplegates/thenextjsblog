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