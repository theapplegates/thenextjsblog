import { describe, expect, it } from 'vitest'
import { getSearchSnippet, getSearchTerms, splitByMatches } from '@/lib/search-utils'

describe('getSearchTerms', () => {
  it('splits on whitespace and removes duplicates', () => {
    expect(getSearchTerms('  React   hooks react ')).toEqual(['React', 'hooks', 'react'])
  })

  it('returns no terms for an empty query', () => {
    expect(getSearchTerms('   ')).toEqual([])
  })
})

describe('splitByMatches', () => {
  it('marks matching terms case-insensitively', () => {
    const segments = splitByMatches('Search posts with Orama', ['search', 'orama'])

    expect(segments).toEqual([
      { text: 'Search', highlighted: true, start: 0 },
      { text: ' posts with ', highlighted: false, start: 6 },
      { text: 'Orama', highlighted: true, start: 18 },
    ])
  })

  it('handles regex special characters safely', () => {
    const segments = splitByMatches('Using C++ and (brackets)', ['C++', '(brackets)'])

    expect(segments.filter(segment => segment.highlighted).map(segment => segment.text)).toEqual([
      'C++',
      '(brackets)',
    ])
  })

  it('returns plain text when there are no terms', () => {
    expect(splitByMatches('Plain text', [])).toEqual([
      { text: 'Plain text', highlighted: false, start: 0 },
    ])
  })
})

describe('getSearchSnippet', () => {
  it('centers the excerpt around the first match', () => {
    const content = `${'Intro '.repeat(30)}search engine${' outro'.repeat(30)}`
    const snippet = getSearchSnippet(content, ['search'])

    expect(snippet).toContain('search engine')
    expect(snippet.startsWith('…')).toBe(true)
    expect(snippet.endsWith('…')).toBe(true)
  })

  it('falls back to the beginning when the term is not in the body', () => {
    const snippet = getSearchSnippet('A short description', ['missing'], 8)

    expect(snippet).toBe('A short…')
  })

  it('normalizes whitespace', () => {
    expect(getSearchSnippet('  Hello\n\nworld  ', ['world'])).toBe('Hello world')
  })
})
