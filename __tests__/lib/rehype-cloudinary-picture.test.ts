import type { Element, Root } from 'hast'
import { serialize } from 'next-mdx-remote/serialize'
import { describe, expect, it } from 'vitest'
import rehypeCloudinaryPicture, {
  buildCloudinaryPictureNode,
  normalizeCloudinaryPublicId,
  parseCloudinaryBreakpoints,
} from '@/lib/rehype-cloudinary-picture'

const manifest = {
  'assets/images/photo': {
    width: 4000,
    height: 2667,
    breakpoints: [200, 800, 1600, 2000],
  },
  'thumbnails/photo': {
    width: 6000,
    height: 4000,
    breakpoints: [200, 600, 1200, 1920],
  },
}

function pictureChildren(node: Element): Element[] {
  return node.children.filter(
    (child): child is Element => child.type === 'element',
  )
}

describe('parseCloudinaryBreakpoints', () => {
  it('parses a comma-separated string into sorted unique widths', () => {
    expect(parseCloudinaryBreakpoints('800, 200, 800, 1600')).toEqual([200, 800, 1600])
  })

  it('parses a JSON array', () => {
    expect(parseCloudinaryBreakpoints('[800, 200, 1600]')).toEqual([200, 800, 1600])
  })

  it('parses Cloudinary breakpoint objects', () => {
    expect(parseCloudinaryBreakpoints('[{"width":800},{"width":200}]')).toEqual([200, 800])
  })

  it('ignores invalid and non-positive values', () => {
    expect(parseCloudinaryBreakpoints('0, -1, nope, 200, 800')).toEqual([200, 800])
  })

  it('returns an empty array for missing values', () => {
    expect(parseCloudinaryBreakpoints(undefined)).toEqual([])
    expect(parseCloudinaryBreakpoints('')).toEqual([])
  })
})

describe('normalizeCloudinaryPublicId', () => {
  it('keeps an already-normalized public ID', () => {
    expect(normalizeCloudinaryPublicId('assets/images/photo')).toBe('assets/images/photo')
  })

  it('strips a public/ prefix and the extension', () => {
    expect(normalizeCloudinaryPublicId('public/thumbnails/photo.jpg')).toBe('thumbnails/photo')
  })

  it('strips a leading slash and the extension', () => {
    expect(normalizeCloudinaryPublicId('/thumbnails/photo.jpg')).toBe('thumbnails/photo')
  })

  it('strips a src/ prefix', () => {
    expect(normalizeCloudinaryPublicId('src/assets/images/photo.jpg')).toBe('assets/images/photo')
  })

  it('strips query strings and hashes', () => {
    expect(normalizeCloudinaryPublicId('thumbnails/photo.jpg?v=2#top')).toBe('thumbnails/photo')
  })

  it('rejects remote URLs', () => {
    expect(() => normalizeCloudinaryPublicId('https://example.com/photo.jpg')).toThrow(
      /local image path/,
    )
  })
})

describe('buildCloudinaryPictureNode', () => {
  it('builds JXL, AVIF, and WebP sources with a WebP img fallback', () => {
    const node = buildCloudinaryPictureNode(
      {
        src: 'src/assets/images/photo.jpg',
        alt: 'A photo',
        sizes: '(min-width: 768px) 720px, 100vw',
        breakpoints: [200, 800, 1600],
        pictureClass: 'responsive-picture',
      },
      { cloudName: 'paulapplegate-com', manifest },
    )

    expect(node.tagName).toBe('picture')
    expect(node.properties.className).toEqual(['responsive-picture'])

    const [jxl, avif, webp, img] = pictureChildren(node)
    expect(jxl.tagName).toBe('source')
    expect(jxl.properties.type).toBe('image/jxl')
    expect(String(jxl.properties.srcSet)).toContain('f_jxl')
    expect(String(jxl.properties.srcSet)).toContain('1600w')
    expect(jxl.properties.sizes).toBe('(min-width: 768px) 720px, 100vw')

    expect(avif.properties.type).toBe('image/avif')
    expect(String(avif.properties.srcSet)).toContain('f_avif')

    expect(webp.properties.type).toBe('image/webp')
    expect(String(webp.properties.srcSet)).toContain('f_webp')

    expect(img.tagName).toBe('img')
    expect(String(img.properties.src)).toContain('f_webp')
    expect(String(img.properties.src)).toContain('w_1600')
    expect(String(img.properties.srcSet)).toContain('200w')
    expect(img.properties.alt).toBe('A photo')
    expect(img.properties.width).toBe(4000)
    expect(img.properties.height).toBe(2667)
    expect(img.properties.sizes).toBe('(min-width: 768px) 720px, 100vw')
    expect(img.properties.loading).toBe('lazy')
    expect(img.properties.decoding).toBe('async')
  })

  it('reads width, height, and breakpoints from the manifest', () => {
    const node = buildCloudinaryPictureNode(
      { src: 'public/thumbnails/photo.jpg', alt: 'A photo', breakpoints: [] },
      { cloudName: 'paulapplegate-com', manifest },
    )

    const img = pictureChildren(node).at(-1)
    expect(img?.properties.width).toBe(6000)
    expect(img?.properties.height).toBe(4000)
    expect(String(img?.properties.src)).toContain('w_1920')
    expect(String(img?.properties.srcSet)).toContain('1920w')
  })

  it('supports priority images', () => {
    const node = buildCloudinaryPictureNode(
      {
        src: 'assets/images/photo.jpg',
        alt: 'A photo',
        breakpoints: [200, 800],
        priority: true,
      },
      { cloudName: 'paulapplegate-com', manifest },
    )

    const img = pictureChildren(node).at(-1)
    expect(img?.properties.loading).toBe('eager')
    expect(img?.properties.fetchPriority).toBe('high')
  })

  it('rejects a missing alt', () => {
    expect(() =>
      buildCloudinaryPictureNode(
        { src: 'assets/images/photo.jpg', alt: ' ', breakpoints: [200] },
        { cloudName: 'paulapplegate-com', manifest },
      ),
    ).toThrow(/non-empty alt/)
  })

  it('rejects an image without breakpoints', () => {
    expect(() =>
      buildCloudinaryPictureNode(
        { src: 'assets/images/missing.jpg', alt: 'A photo', breakpoints: [] },
        { cloudName: 'paulapplegate-com', manifest },
      ),
    ).toThrow(/no breakpoints found/)
  })

  it('rejects a missing cloud name', () => {
    expect(() =>
      buildCloudinaryPictureNode(
        { src: 'assets/images/photo.jpg', alt: 'A photo', breakpoints: [200] },
        { cloudName: '', manifest },
      ),
    ).toThrow(/NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME/)
  })
})

describe('rehypeCloudinaryPicture', () => {
  it('replaces an MDX <cloudinary-picture> tag with a <picture> element', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'mdxJsxFlowElement',
          name: 'cloudinary-picture',
          attributes: [
            { type: 'mdxJsxAttribute', name: 'src', value: 'assets/images/photo.jpg' },
            { type: 'mdxJsxAttribute', name: 'alt', value: 'A photo' },
            { type: 'mdxJsxAttribute', name: 'breakpoints', value: '200, 800, 1600' },
            { type: 'mdxJsxAttribute', name: 'picture-class', value: 'responsive-picture' },
            { type: 'mdxJsxAttribute', name: 'priority', value: null },
          ],
          children: [],
        },
      ],
    }

    const plugin = rehypeCloudinaryPicture({ cloudName: 'paulapplegate-com', manifest })
    const transformed = plugin(tree as unknown as Root) as unknown as {
      children: Element[]
    }

    const picture = transformed.children[0]
    expect(picture.tagName).toBe('picture')
    expect(picture.properties.className).toEqual(['responsive-picture'])

    const img = pictureChildren(picture).at(-1)
    expect(img?.tagName).toBe('img')
    expect(img?.properties.loading).toBe('eager')
    expect(String(img?.properties.src)).toContain('res.cloudinary.com/paulapplegate-com')
  })

  it('replaces an HTML <cloudinary-picture> element inside a paragraph', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'p',
          properties: {},
          children: [
            {
              type: 'element',
              tagName: 'cloudinary-picture',
              properties: {
                src: 'thumbnails/photo',
                alt: 'A photo',
                breakpoints: '200, 600',
              },
              children: [],
            },
          ],
        },
      ],
    }

    const plugin = rehypeCloudinaryPicture({ cloudName: 'paulapplegate-com', manifest })
    const transformed = plugin(tree as unknown as Root) as unknown as {
      children: Array<{ children: Element[] }>
    }

    expect(transformed.children[0].children[0].tagName).toBe('picture')
  })

  it('leaves other tags and images alone', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'img',
          properties: { src: '/photo.jpg', alt: 'A photo' },
          children: [],
        },
      ],
    }

    const plugin = rehypeCloudinaryPicture({ cloudName: 'paulapplegate-com', manifest })
    const transformed = plugin(tree as unknown as Root) as unknown as {
      children: Element[]
    }

    expect(transformed.children[0].tagName).toBe('img')
    expect(transformed.children[0].properties.src).toBe('/photo.jpg')
  })

  it('compiles a tag through next-mdx-remote', async () => {
    const result = await serialize(
      [
        '<cloudinary-picture',
        '  src="public/thumbnails/photo.jpg"',
        '  alt="A photo"',
        '  sizes="(min-width: 768px) 720px, 100vw"',
        '  picture-class="responsive-picture"',
        '/>',
      ].join('\n'),
      {
        mdxOptions: {
          rehypePlugins: [
            [rehypeCloudinaryPicture, { cloudName: 'paulapplegate-com', manifest }],
          ],
        },
      },
    )

    expect(result.compiledSource).toContain('image/jxl')
    expect(result.compiledSource).toContain('image/avif')
    expect(result.compiledSource).toContain('image/webp')
    expect(result.compiledSource).toContain('res.cloudinary.com/paulapplegate-com')
    expect(result.compiledSource).toContain('responsive-picture')
    expect(result.compiledSource).not.toContain('"cloudinary-picture"')
  })
})
