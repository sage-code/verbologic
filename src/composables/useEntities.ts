/**
 * Entity loader — fetches the decoupled public/data/entities/*.json collections
 * and flattens them per target language. Fetching is client-only (called from
 * onMounted) so SSG prerendering never hits a static file 404.
 */
import type { Lang, VerbologicEntity } from '~/types/entities'
import { ENTITY_FILES } from '~/types/entities'

const cache = new Map<Lang, Promise<VerbologicEntity[]>>()

export function loadEntities(lang: Lang): Promise<VerbologicEntity[]> {
  const hit = cache.get(lang)
  if (hit) return hit

  const pending = Promise.all(
    ENTITY_FILES[lang].map((file) =>
      $fetch<VerbologicEntity[]>(`/data/entities/${file}.json`)
    )
  ).then((batches) => batches.flat())

  cache.set(lang, pending)
  return pending
}
