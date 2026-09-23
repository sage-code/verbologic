/**
 * lectureRows — the provide/inject seam between a lecture page and the MDC
 * components inside its prose (::term): the page resolves the topic payload
 * client-side and provides id → row; `::term{addresses="…"}` chips look up
 * their records here.
 */
import type { InjectionKey, Ref } from 'vue'
import type { MediaRow } from '~/types/media'

export const LECTURE_ROWS_KEY: InjectionKey<Ref<Map<string, MediaRow>>> = Symbol('lecture-rows')
