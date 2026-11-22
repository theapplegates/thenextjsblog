// scripts/build-search-index.mjs
//
// Builds the static search index used by the blog's OramaJS search.
// Run automatically before `pnpm dev` and `pnpm build`, or manually with:
//   pnpm search:index
import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'

const ROOT = process.cwd()
const CONTENT_DIR = path.join(ROOT, 'content')
const OUT = path.join(ROOT, 'public', 'search-index.json')
const MAX_CONTENT_LENGTH = 20000

/**
 * Turn MDX into plain text so Orama indexes words, not markup.
 */
function stripMdx(input) {
  return input
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/^\s*(?:import|export)\s.+$/gm, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, ' ')
    .replace(/[*_~>#|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Remove the post's leading H1 when it repeats (or is contained in) the
 * front-matter title, so search snippets start with the actual body text.
 */
function stripLeadingTitleHeading(content, title) {
  const headingMatch = content.match(/^\s{0,3}#\s+(.+?)\s*$/m)
  if (headingMatch === null) {
    return content
  }

  const heading = stripMdx(headingMatch[1])
  const normalizedTitle = title.toLowerCase()
  const normalizedHeading = heading.toLowerCase()

  if (
    normalizedHeading !== ''
    && (normalizedTitle.includes(normalizedHeading) || normalizedHeading.includes(normalizedTitle))
  ) {
    return content.replace(headingMatch[0], ' ')
  }

  return content
}

/**
 * Remove a leading H1 that repeats the front-matter title, so search snippets
 * start with the actual body text instead of repeating the result title.
 */
function stripTitlePrefix(content, title) {
  const plainTitle = stripMdx(title)
  if (plainTitle !== '' && content.toLowerCase().startsWith(plainTitle.toLowerCase())) {
    return content.slice(plainTitle.length).trim()
  }

  return content
}

/**
 * Normalize front matter dates to ISO strings so the browser can sort and
 * display them consistently.
 */
function toIsoDate(value) {
  if (value === undefined || value === null || value === '')
    return ''

  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString()
}

async function collectPostFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...await collectPostFiles(entryPath))
    } else if (entry.isFile() && /\.mdx?$/.test(entry.name)) {
      files.push(entryPath)
    }
  }

  return files
}

async function main() {
  let localeDirs
  try {
    localeDirs = await fs.readdir(CONTENT_DIR, { withFileTypes: true })
  } catch {
    console.warn(`No content dir at ${CONTENT_DIR}; writing empty index.`)
    await fs.mkdir(path.dirname(OUT), { recursive: true })
    await fs.writeFile(OUT, '[]')
    return
  }

  const docs = []

  for (const localeDir of localeDirs) {
    if (!localeDir.isDirectory())
      continue

    const locale = localeDir.name
    const localePath = path.join(CONTENT_DIR, locale)
    const files = await collectPostFiles(localePath)

    for (const file of files) {
      const slug = path.relative(localePath, file).replace(/\.mdx?$/, '').split(path.sep).join('/')
      const raw = await fs.readFile(file, 'utf8')
      const { data, content } = matter(raw)
      const title = typeof data.title === 'string' && data.title.trim() !== '' ? data.title : slug
      const description = typeof data.description === 'string' ? data.description : ''
      const tags = Array.isArray(data.tags) ? data.tags.map(String) : []
      const createTime = toIsoDate(data.createTime ?? data.date)

      docs.push({
        id: `${locale}:${slug}`,
        locale,
        slug,
        title,
        description,
        content: stripTitlePrefix(stripMdx(stripLeadingTitleHeading(content, title)), title).slice(0, MAX_CONTENT_LENGTH),
        tags,
        createTime,
      })
    }
  }

  docs.sort((a, b) => {
    if (a.locale !== b.locale)
      return a.locale.localeCompare(b.locale)
    return (b.createTime || '').localeCompare(a.createTime || '')
  })

  await fs.mkdir(path.dirname(OUT), { recursive: true })
  await fs.writeFile(OUT, JSON.stringify(docs, null, 2))
  console.log(`Wrote ${docs.length} docs to ${path.relative(ROOT, OUT)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
