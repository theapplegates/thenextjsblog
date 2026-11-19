// scripts/build-search-index.mjs
import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'

const ROOT = process.cwd()
const CONTENT_DIR = path.join(ROOT, 'content')
const OUT = path.join(ROOT, 'public', 'search-index.json')

function stripMdx(input) {
  return input
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
    const dir = path.join(CONTENT_DIR, locale)
    const files = await fs.readdir(dir)

    for (const file of files) {
      if (!file.endsWith('.mdx'))
        continue
      const slug = file.replace(/\.mdx$/, '')
      const raw = await fs.readFile(path.join(dir, file), 'utf8')
      const { data, content } = matter(raw)

      docs.push({
        id: `${locale}:${slug}`,
        locale,
        slug,
        title: data.title ?? slug,
        description: data.description ?? '',
        content: stripMdx(content).slice(0, 15000),
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        createTime: data.createTime
          ? String(data.createTime)
          : data.date
            ? String(data.date)
            : '',
      })
    }
  }

  await fs.mkdir(path.dirname(OUT), { recursive: true })
  await fs.writeFile(OUT, JSON.stringify(docs, null, 2))
  console.log(`Wrote ${docs.length} docs to ${path.relative(ROOT, OUT)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
