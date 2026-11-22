import type { SearchDocument } from '@/lib/search-engine'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const documents: SearchDocument[] = [
  {
    id: 'en-US:mdx',
    locale: 'en-US',
    slug: 'mdx',
    title: 'Implement Fancy MDX',
    description: 'Fancy MDX in Next.js',
    content: 'MDX is an advanced Markdown format with React components. Search engines help readers find posts.',
    tags: ['MDX', 'React'],
    createTime: '2022-04-26T00:00:00.000Z',
  },
  {
    id: 'en-US:agent',
    locale: 'en-US',
    slug: 'agent',
    title: 'AI Agent Design Patterns',
    description: 'Patterns for reliable AI agents',
    content: 'Agent principles, orchestration, guardrails, and evaluation methods.',
    tags: ['AI', 'Agent'],
    createTime: '2026-01-15T00:00:00.000Z',
  },
  {
    id: 'zh-CN:mdx',
    locale: 'zh-CN',
    slug: 'mdx',
    title: '实现花哨的 MDX',
    description: '在 Next.js 中实现 MDX',
    content: '现代博客使用 React 组件。搜索引擎很有用。',
    tags: ['MDX', 'React'],
    createTime: '2022-04-26T00:00:00.000Z',
  },
]

function mockIndexResponse() {
  return new Response(JSON.stringify(documents), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('search-engine', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('finds posts by body content', async () => {
    const fetchMock = vi.fn(async () => mockIndexResponse())
    vi.stubGlobal('fetch', fetchMock)

    const { searchPosts } = await import('@/lib/search-engine')
    const results = await searchPosts('en-US', 'guardrails')

    expect(results.map(post => post.slug)).toEqual(['agent'])
  })

  it('matches English words with stemming', async () => {
    const fetchMock = vi.fn(async () => mockIndexResponse())
    vi.stubGlobal('fetch', fetchMock)

    const { searchPosts } = await import('@/lib/search-engine')
    const results = await searchPosts('en-US', 'search engines')

    expect(results.map(post => post.slug)).toEqual(['mdx'])
  })

  it('only searches the active locale', async () => {
    const fetchMock = vi.fn(async () => mockIndexResponse())
    vi.stubGlobal('fetch', fetchMock)

    const { searchPosts } = await import('@/lib/search-engine')

    expect(await searchPosts('en-US', '搜索引擎')).toEqual([])
    expect((await searchPosts('zh-CN', '搜索引擎')).map(post => post.slug)).toEqual(['mdx'])
  })

  it('loads the index only once per page load', async () => {
    const fetchMock = vi.fn(async () => mockIndexResponse())
    vi.stubGlobal('fetch', fetchMock)

    const { searchPosts } = await import('@/lib/search-engine')
    await searchPosts('en-US', 'mdx')
    await searchPosts('en-US', 'agent')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries after a failed index load', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(mockIndexResponse())
    vi.stubGlobal('fetch', fetchMock)

    const { searchPosts } = await import('@/lib/search-engine')

    await expect(searchPosts('en-US', 'mdx')).rejects.toThrow('Could not load the search index')
    await expect(searchPosts('en-US', 'mdx')).resolves.toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
