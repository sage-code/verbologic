import type { ComputedRef, InjectionKey } from 'vue'

export const DICTIONARY_TERM_KEY: InjectionKey<ComputedRef<string>> = Symbol('dictionary-target-term')
