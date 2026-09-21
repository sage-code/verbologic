/**
 * useNavigation — single source of truth for the site chrome.
 * navigation.json is imported at build time so the menu, language list and
 * social footer are baked into the static HTML during `nuxt generate`
 * (zero runtime round-trips for SSR-ready output).
 */
import navigation from '~/data/navigation.json'

export interface NavigationLanguage {
  code: string
  label: string
  /** ISO-3166 country code resolving to a bundled SVG flag (LanguageFlag.vue). */
  flag: string
  /** lowercase locale code used for menuLabels + locale files (SP -> es). */
  locale: string
}

export interface NavigationItem {
  id: string
  icon: string
  route: string
  order: number
}

export interface SocialLink {
  id: string
  label: string
  url: string
  icon: string
}

export interface NavigationData {
  languages: NavigationLanguage[]
  menu: NavigationItem[]
  menuLabels: Record<string, Record<string, string>>
  social: SocialLink[]
}

const nav = navigation as NavigationData

export function useNavigation() {
  const { lang, t } = useLocale()
  const { nameFor } = useLanguageNames()

  const menu = computed(() => [...nav.menu].sort((a, b) => a.order - b.order))

  /** Localized label for a menu item, falling back to EN then to the item id. */
  function menuLabel(id: string): string {
    const labels = nav.menuLabels[lang.value] ?? nav.menuLabels.en
    return labels[id] ?? nav.menuLabels.en[id] ?? id
  }

  /**
   * Language display name in the language currently set on the toolbar.
   * Fallback chain: language-names.json matrix → locale-dict `languages.<code>`
   * key → native endonym from navigation.json → uppercase locale code.
   */
  function languageName(locale: string): string {
    const entry = nav.languages.find((l) => l.locale === locale)
    return nameFor(locale) ?? t(`languages.${locale}`) ?? entry?.label ?? locale.toUpperCase()
  }

  return {
    languages: nav.languages,
    menu,
    menuLabel,
    languageName,
    social: nav.social
  }
}
