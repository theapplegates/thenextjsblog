import { describe, expect, it } from 'vitest'
import { MDXImage } from '@/components/mdx-image'
import { render, screen } from '@/tests/test-utils'

describe('MDXImage', () => {
  const defaultProps = {
    src: '/test-image.jpg',
    alt: 'Test Image',
  }

  it('should render image with default alt text when alt is not provided', () => {
    render(<MDXImage src="/test.jpg" />)

    expect(screen.getByAltText('Image')).toBeInTheDocument()
  })

  it('should render image with provided alt text', () => {
    render(<MDXImage {...defaultProps} />)

    expect(screen.getByAltText('Test Image')).toBeInTheDocument()
  })

  it('should render image with provided src', () => {
    render(<MDXImage {...defaultProps} />)

    const image = screen.getByAltText('Test Image')
    expect(image).toHaveAttribute('src', '/test-image.jpg')
  })

  it('should render title when provided', () => {
    render(<MDXImage {...defaultProps} title="Image Title" />)

    expect(screen.getByText('Image Title')).toBeInTheDocument()
  })

  it('should not render title when empty string', () => {
    render(<MDXImage {...defaultProps} title="" />)

    expect(screen.queryByTestId('mdx-image-title')).not.toBeInTheDocument()
  })

  it('should not render title when undefined', () => {
    render(<MDXImage {...defaultProps} />)

    expect(screen.queryByTestId('mdx-image-title')).not.toBeInTheDocument()
  })

  it('should apply custom className to image', () => {
    render(<MDXImage {...defaultProps} className="custom-class" />)

    const image = screen.getByAltText('Test Image')
    expect(image).toHaveClass('custom-class')
  })

  it('should pass through a pre-built responsive image without wrapping it', () => {
    render(
      <MDXImage
        src="https://res.cloudinary.com/demo/image/upload/c_limit,w_800,f_webp,q_auto/photo"
        srcSet="https://res.cloudinary.com/demo/image/upload/c_limit,w_400,f_webp,q_auto/photo 400w, https://res.cloudinary.com/demo/image/upload/c_limit,w_800,f_webp,q_auto/photo 800w"
        alt="Responsive photo"
        width={800}
        height={600}
        sizes="100vw"
        loading="lazy"
        decoding="async"
      />,
    )

    const image = screen.getByAltText('Responsive photo')
    expect(image.tagName).toBe('IMG')
    expect(image.closest('figure')).toBeNull()
    expect(image).toHaveAttribute('width', '800')
    expect(image).toHaveAttribute('height', '600')
    expect(image).toHaveAttribute('sizes', '100vw')
    expect(image.getAttribute('srcset')).toContain('800w')
  })
})
