/**
 * usePrices — loads the editable pricing model from public/data/prices.json.
 * Client-side fetch, matching the useLocale/useEntities pattern. Missing or
 * malformed data resolves to an empty tier list (the page shows a notice).
 */

export interface PriceTier {
  id: string
  name: string
  tagline?: string
  description?: string
  /** Default per-language price when no perLanguage override exists. */
  price: number
  /** Per-language price overrides, keyed by locale code. */
  perLanguage?: Record<string, number>
  /** Pricing unit: 'credits' renders the count instead of the currency symbol. */
  unit?: string
}

interface PricesFile {
  currency?: string
  symbol?: string
  tiers?: PriceTier[]
}

const fetched = ref(false)

export function usePrices() {
  const tiers = useState<PriceTier[]>('prices-tiers', () => [])
  const symbol = useState<string>('prices-symbol', () => '$')

  onMounted(async () => {
    if (fetched.value) return
    fetched.value = true
    try {
      const data = await $fetch<PricesFile>('/data/prices.json')
      tiers.value = data.tiers ?? []
      symbol.value = data.symbol ?? '$'
    } catch {
      tiers.value = []
    }
  })

  /** Price for one language under a tier: perLanguage override ?? default. */
  function priceFor(tier: PriceTier, locale: string): number {
    return tier.perLanguage?.[locale] ?? tier.price ?? 0
  }

  return { tiers, symbol, priceFor }
}
