export interface TextSegment {
  text: string
  highlighted: boolean
  start: number
}

const REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g
const SNIPPET_CONTEXT_BEFORE = 60
const SNIPPET_LENGTH = 180

/**
 * Split a query into unique search terms. Whitespace separates terms, so
 * "react hooks" highlights both words independently.
 */
export function getSearchTerms(query: string): string[] {
  return [...new Set(query.trim().split(/\s+/).filter(term => term !== ''))]
}

/**
 * Split text into plain and matched segments so React can render matches as
 * <mark> elements without using dangerouslySetInnerHTML.
 */
export function splitByMatches(text: string, terms: string[]): TextSegment[] {
  if (text === '') {
    return []
  }

  const pattern = terms
    .filter(term => term !== '')
    .sort((a, b) => b.length - a.length)
    .map(term => term.replace(REGEX_SPECIAL_CHARACTERS, '\\$&'))
    .join('|')

  if (pattern === '') {
    return [{ text, highlighted: false, start: 0 }]
  }

  const splitter = new RegExp(`(${pattern})`, 'gi')
  const matcher = new RegExp(`^(?:${pattern})$`, 'i')
  const segments: TextSegment[] = []
  let offset = 0

  for (const part of text.split(splitter)) {
    if (part === '') {
      continue
    }

    segments.push({
      text: part,
      highlighted: matcher.test(part),
      start: offset,
    })
    offset += part.length
  }

  return segments
}

/**
 * Build a short excerpt around the first matched term. Falls back to the
 * beginning of the text when no term appears in the body.
 */
export function getSearchSnippet(text: string, terms: string[], maxLength = SNIPPET_LENGTH): string {
  const normalizedText = text.replace(/\s+/g, ' ').trim()

  if (normalizedText === '') {
    return ''
  }

  const lowerText = normalizedText.toLowerCase()
  let matchIndex = -1

  for (const term of terms) {
    const index = lowerText.indexOf(term.toLowerCase())
    if (index !== -1 && (matchIndex === -1 || index < matchIndex)) {
      matchIndex = index
    }
  }

  if (matchIndex === -1) {
    return truncate(normalizedText, maxLength)
  }

  let start = Math.max(0, matchIndex - SNIPPET_CONTEXT_BEFORE)
  if (start > 0) {
    const nextWordStart = normalizedText.indexOf(' ', start)
    if (nextWordStart !== -1 && nextWordStart < matchIndex) {
      start = nextWordStart + 1
    }
  }

  let end = Math.min(normalizedText.length, start + maxLength)
  if (end < normalizedText.length) {
    const previousWordEnd = normalizedText.lastIndexOf(' ', end)
    if (previousWordEnd > matchIndex) {
      end = previousWordEnd
    }
  }

  const snippet = normalizedText.slice(start, end).trim()

  return `${start > 0 ? '…' : ''}${snippet}${end < normalizedText.length ? '…' : ''}`
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength).trimEnd()}…`
}
