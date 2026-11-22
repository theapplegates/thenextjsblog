'use client'

import type { Metadata, PostMeta } from '@/types'
import { useRouter } from '@bprogress/next/app'
import { FileTextIcon, LoaderCircleIcon, SearchIcon, TagIcon } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { FormattedDate } from '@/components/formatted-date'
import { Button } from '@/components/ui/button'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { useNavigationRouter } from '@/i18n/navigation'
import { getSearchSnippet, getSearchTerms, splitByMatches } from '@/lib/search-utils'
import { cn, getTagUrl } from '@/lib/utils'

interface CommandMenuProps {
  metadata: Metadata
}

type SearchResultPost = Pick<PostMeta, 'slug' | 'title' | 'description' | 'tags' | 'createTime'> & {
  content?: string
}

interface PostResultItemProps {
  post: SearchResultPost
  searchTerms: string[]
  showSnippet: boolean
  onSelect: () => void
}

function HighlightedText({ text, terms }: { text: string, terms: string[] }) {
  return (
    <>
      {splitByMatches(text, terms).map(segment =>
        segment.highlighted
          ? (
              <mark key={segment.start} className="bg-primary/20 text-foreground rounded-sm px-0.5">
                {segment.text}
              </mark>
            )
          : <span key={segment.start}>{segment.text}</span>,
      )}
    </>
  )
}

function PostResultItem({ post, searchTerms, showSnippet, onSelect }: PostResultItemProps) {
  const snippet = showSnippet
    ? getSearchSnippet(post.content ?? post.description ?? '', searchTerms)
    : post.description ?? ''

  return (
    <CommandItem
      value={post.slug}
      onSelect={onSelect}
      className="items-start gap-2.5"
    >
      <FileTextIcon className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-1 font-medium">
          <HighlightedText text={post.title} terms={searchTerms} />
        </div>
        {snippet !== '' && (
          <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs leading-relaxed">
            <HighlightedText text={snippet} terms={searchTerms} />
          </p>
        )}
        {(post.tags?.length ?? 0) > 0 && (
          <div className="text-muted-foreground mt-1 flex flex-wrap gap-1 text-[11px]">
            {post.tags?.slice(0, 4).map(tag => (
              <span key={tag} className="bg-muted rounded px-1.5 py-0.5">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      {post.createTime !== undefined && post.createTime !== ''
        ? (
            <FormattedDate
              date={post.createTime}
              className="text-muted-foreground mt-0.5 hidden shrink-0 text-xs sm:block"
            />
          )
        : null}
    </CommandItem>
  )
}

export function CommandMenu({
  metadata: {
    posts,
    tags: { allTags, tagCounts },
  },
}: CommandMenuProps) {
  const t = useTranslations('commandMenu')
  const locale = useLocale()
  const router = useRouter({ customRouter: useNavigationRouter })
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResultPost[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  const normalizedSearch = search.trim().toLowerCase()
  const isSearchActive = normalizedSearch !== ''
  const searchTerms = getSearchTerms(search)

  const fallbackPosts = posts.filter((post) => {
    if (!isSearchActive) {
      return true
    }

    return (
      post.title.toLowerCase().includes(normalizedSearch)
      || (post.description ?? '').toLowerCase().includes(normalizedSearch)
      || (post.tags ?? []).some(tag => tag.toLowerCase().includes(normalizedSearch))
    )
  })

  const resultPosts: SearchResultPost[] = isSearchActive ? (searchResults ?? fallbackPosts) : posts
  const filteredTags = allTags.filter(tag => tag !== 'All' && tag.toLowerCase().includes(normalizedSearch))

  const runCommand = useCallback((command: () => void) => {
    setOpen(false)
    setSearch('')
    command()
  }, [])

  useEffect(() => {
    const term = search.trim()

    if (!open || term === '') {
      setSearchResults(null)
      setIsSearching(false)
      return
    }

    let cancelled = false
    setIsSearching(true)

    void import('@/lib/search-engine')
      .then(async ({ searchPosts }) => searchPosts(locale, term))
      .then((results) => {
        if (!cancelled) {
          setSearchResults(results)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSearchResults(null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsSearching(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, search, locale])

  // Warm up Orama and the index as soon as the dialog opens, so the first
  // keystroke does not have to wait for the chunk and index to load.
  useEffect(() => {
    if (!open) {
      return
    }

    void import('@/lib/search-engine')
      .then(async ({ loadSearchIndex }) => loadSearchIndex())
      .catch(() => undefined)
  }, [open])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        if (
          (e.target instanceof HTMLElement && e.target.isContentEditable)
          || e.target instanceof HTMLInputElement
          || e.target instanceof HTMLTextAreaElement
          || e.target instanceof HTMLSelectElement
        ) {
          return
        }

        e.preventDefault()
        setOpen(open => !open)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('searchLabel')}
        className="shrink-0 md:hidden"
        onClick={() => setOpen(true)}
      >
        <SearchIcon className="size-6" />
      </Button>
      <Button
        variant="outline"
        aria-label={t('searchLabel')}
        className={cn(
          'relative hidden h-8 w-full justify-start pr-12 pl-3 text-sm font-normal shadow-none md:mr-2 md:flex md:w-48 lg:w-56',
        )}
        onClick={() => setOpen(true)}
      >
        <span className="hidden lg:inline-flex">{t('searchPostsLong')}</span>
        <span className="inline-flex lg:hidden">{t('searchPostsShort')}</span>
        <KbdGroup className="absolute top-1.5 right-1.5 hidden text-[10px] sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (!nextOpen) {
            setSearch('')
          }
        }}
        title={t('searchLabel')}
        description={t('searchDescription')}
        shouldFilter={false}
      >
        <CommandInput placeholder={t('searchPlaceholder')} value={search} onValueChange={setSearch} />
        <CommandList>
          <CommandEmpty>{isSearching && isSearchActive ? t('searching') : t('noResults')}</CommandEmpty>
          {resultPosts.length > 0 && (
            <CommandGroup
              heading={(
                <span className="inline-flex items-center gap-1.5">
                  {t('posts')}
                  {isSearching && isSearchActive
                    ? <LoaderCircleIcon className="size-3 animate-spin" aria-hidden="true" />
                    : null}
                </span>
              )}
            >
              {resultPosts.map(post => (
                <PostResultItem
                  key={post.slug}
                  post={post}
                  searchTerms={searchTerms}
                  showSnippet={isSearchActive}
                  onSelect={() => {
                    runCommand(() => router.push(`/post/${post.slug}`))
                  }}
                />
              ))}
            </CommandGroup>
          )}
          {filteredTags.length > 0 && (
            <CommandGroup heading={t('tags')}>
              {filteredTags.map(tag => (
                <CommandItem
                  key={tag}
                  value={tag}
                  onSelect={() => {
                    runCommand(() => router.push(getTagUrl(tag)))
                  }}
                >
                  <TagIcon />
                  <span className="line-clamp-1">{tag}</span>
                  <span className="border-border text-muted-foreground ml-auto flex h-5 min-w-5 items-center justify-center rounded-sm border text-xs font-medium">
                    {tagCounts[tag]}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
        <div className="border-border text-muted-foreground flex items-center justify-center gap-3 border-t p-3 text-xs">
          <KbdGroup>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            <span>{t('navigate')}</span>
          </KbdGroup>
          <KbdGroup>
            <Kbd>⏎</Kbd>
            <span>{t('select')}</span>
          </KbdGroup>
          <KbdGroup>
            <Kbd>Esc</Kbd>
            <span>{t('close')}</span>
          </KbdGroup>
        </div>
      </CommandDialog>
    </>
  )
}
