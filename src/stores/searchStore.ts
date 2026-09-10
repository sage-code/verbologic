/**
 * searchStore — in-memory Fuse.js index over the decoupled entity collections.
 * Instant client-side search; zero server calls (O(N) payload, O(log n) queries).
 */
import { defineStore } from 'pinia'
import Fuse from 'fuse.js'
import type { FuseResult } from 'fuse.js'
import type { Lang, VerbologicEntity } from '~/types/entities'
import { loadEntities } from '~/composables/useEntities'

const FUSE_OPTIONS = {
  keys: [
    'term',
    'example',
    'translations.en',
    'translations.es',
    'translations.it',
    'translations.fr',
    'translations.ro',
    'context'
  ],
  threshold: 0.35,
  ignoreLocation: true
}

export const useSearchStore = defineStore('search', () => {
  const activeLang = ref<Lang>('ro')
  const entities = ref<VerbologicEntity[]>([])
  const index = shallowRef<Fuse<VerbologicEntity> | null>(null)
  const query = ref('')
  const ready = ref(false)
  const loadedLangs = ref<Lang[]>([])

  const results = computed<VerbologicEntity[]>(() => {
    const trimmed = query.value.trim().toLowerCase()
    if (!trimmed) return entities.value
    const idx = index.value
    if (!idx) return entities.value
    return idx.search(query.value).map((hit: FuseResult<VerbologicEntity>) => hit.item)
  })

  async function init(lang: Lang) {
    activeLang.value = lang
    if (loadedLangs.value.includes(lang)) return
    const list = await loadEntities(lang)
    entities.value = list
    index.value = new Fuse(list, FUSE_OPTIONS)
    loadedLangs.value.push(lang)
    ready.value = true
  }

  function setQuery(value: string) {
    query.value = value
  }

  return { activeLang, entities, index, query, results, ready, loadedLangs, init, setQuery }
})
