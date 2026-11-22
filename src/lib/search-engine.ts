import type { Tokenizer } from '@orama/orama'
import { components, create, insertMultiple, search } from '@orama/orama'

export interface SearchDocument {
  id: string
  locale: string
  slug: string
  title: string
  description: string
  content: string
  tags: string[]
  createTime: string
}

type SearchDatabase = ReturnType<typeof createSearchDatabase>
type SearchIndex = Map<string, SearchDatabase>

const SEARCH_INDEX_URL = '/search-index.json'
const SEARCHABLE_PROPERTIES = ['title', 'description', 'content', 'tags'] as const
const CJK_RUN_PATTERN = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]+/g

let indexPromise: Promise<SearchIndex> | null = null

/**
 * Orama's default tokenizer treats a whole run of Chinese/Japanese characters
 * as one token. Adding single characters and two-character pairs makes CJK
 * searches such as "博客" or "搜索引擎" work alongside English stemmed search.
 */
function createSearchTokenizer(): Tokenizer {
  const base = components.tokenizer.createTokenizer({ language: 'english', stemming: true })

  return {
    language: base.language,
    normalizationCache: base.normalizationCache,
    tokenize(raw, language, prop, withCache = true) {
      const tokens = base.tokenize(raw, language, prop, withCache)
      const cjkRuns = raw.match(CJK_RUN_PATTERN)

      if (cjkRuns !== null) {
        for (const run of cjkRuns) {
          for (let index = 0; index < run.length; index += 1) {
            const character = run[index]
            tokens.push(base.normalizeToken(prop ?? '', character, withCache))

            const nextCharacter = run[index + 1]
            if (nextCharacter !== undefined) {
              tokens.push(base.normalizeToken(prop ?? '', character + nextCharacter, withCache))
            }
          }
        }
      }

      return [...new Set(tokens.filter(token => token !== ''))]
    },
  }
}

async function buildSearchIndex(): Promise<SearchIndex> {
  const response = await fetch(SEARCH_INDEX_URL)

  if (!response.ok) {
    throw new Error(`Could not load the search index (HTTP ${response.status}).`)
  }

  const documents = (await response.json()) as SearchDocument[]
  if (!Array.isArray(documents)) {
    throw new TypeError('The search index is not a list of documents.')
  }

  const documentsByLocale = new Map<string, SearchDocument[]>()

  for (const document of documents) {
    if (typeof document.locale !== 'string' || typeof document.slug !== 'string') {
      continue
    }

    const localeDocuments = documentsByLocale.get(document.locale) ?? []
    localeDocuments.push(document)
    documentsByLocale.set(document.locale, localeDocuments)
  }

  const indexes: SearchIndex = new Map()

  for (const [locale, localeDocuments] of documentsByLocale) {
    const database = createSearchDatabase()

    await insertMultiple(database, localeDocuments)
    indexes.set(locale, database)
  }

  return indexes
}

function createSearchDatabase() {
  return create({
    schema: {
      id: 'string',
      locale: 'string',
      slug: 'string',
      title: 'string',
      description: 'string',
      content: 'string',
      tags: 'string[]',
      createTime: 'string',
    },
    components: { tokenizer: createSearchTokenizer() },
  })
}

/**
 * Load and build the Orama index once per page load. The promise is cached so
 * opening the search dialog repeatedly does not refetch the index.
 */
export async function loadSearchIndex(): Promise<SearchIndex> {
  if (indexPromise === null) {
    indexPromise = buildSearchIndex().catch((error: unknown) => {
      indexPromise = null
      throw error
    })
  }

  return indexPromise
}

/**
 * Search the current locale's posts. Results are ranked by Orama's BM25 score
 * with titles, descriptions, and tags boosted above body content.
 */
export async function searchPosts(locale: string, term: string, limit = 8): Promise<SearchDocument[]> {
  const indexes = await loadSearchIndex()
  const database = indexes.get(locale)

  if (database === undefined) {
    return []
  }

  const results = await search(database, {
    term,
    properties: [...SEARCHABLE_PROPERTIES],
    boost: {
      title: 4,
      description: 2,
      tags: 3,
    },
    limit,
  })

  return results.hits.map(hit => hit.document)
}
