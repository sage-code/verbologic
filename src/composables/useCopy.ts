/**
 * useCopy — shared localized-copy helper for pages and components.
 * Returns the translated string for `key` (dotted, e.g. 'ui.back') or the
 * English `fallback` while the locale dictionary loads / for untranslated
 * locales. Reactive: re-renders when the toolbar language changes.
 */
export function useCopy() {
  const { t } = useLocale()
  return (key: string, fallback: string): string => t(key) ?? fallback
}