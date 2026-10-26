/**
 * ipa-translit — turn IPA into something a TTS voice can actually read.
 *
 * Article prose carries IPA inline (`/ə/`, `` `masă` ``). Edge TTS does not
 * fail on those characters — it silently mispronounces or skips them, so the
 * recording says something the article does not. This module rewrites each IPA
 * span into a respelling in the voice's own language before synthesis.
 *
 * The map is per-language because the same symbol needs a different respelling
 * per voice: `/ə/` is "uh" to an English voice, "э" to a Russian one, "ă" to a
 * Romanian one.
 *
 * The DISPLAYED article is never touched — only the string sent to the API.
 */

/**
 * Characters that carry no sound for a TTS engine and are dropped outright:
 * stress marks, length marks, and the combining modifiers (syllabicity,
 * nasalisation, aspiration, palatalisation, non-syllabic, lowered/raised).
 */
const SILENT = new Set([
  'ˈ', 'ˌ', // primary / secondary stress
  'ː', 'ˑ', // length
  '̯', '̃', '̩', 'ʰ', 'ʲ', '̞', '̺', '̪', '̥', '˞', '͡', '‿', 'ᵊ'
])

/**
 * Per-language respellings. Only the symbols that actually occur in the corpus
 * are listed; anything else falls through to the shared table below.
 */
const BY_LANG = {
  en: {
    'ə': 'uh', 'ɚ': 'er', 'ɜ': 'ur', 'ɝ': 'ur',
    'ʃ': 'sh', 'ʒ': 'zh', 'tʃ': 'ch', 'dʒ': 'j',
    'θ': 'th', 'ð': 'dh', 'ŋ': 'ng', 'ɹ': 'r', 'ɾ': 't',
    'ɪ': 'ih', 'ʊ': 'uu', 'ɛ': 'eh', 'æ': 'a', 'ʌ': 'uh',
    'ɔ': 'aw', 'ɑ': 'ah', 'ɒ': 'o', 'ɡ': 'g', 'ɟ': 'j',
    'ç': 'h', 'x': 'kh', 'ɣ': 'gh', 'ʁ': 'r', 'ʝ': 'y',
    'ɲ': 'ny', 'ʎ': 'ly', 'ɕ': 'sh', 'ʂ': 'sh', 'ʐ': 'zh',
    'ɦ': 'h', 'ʔ': '', '∅': 'nothing', 'β': 'v', 'ɸ': 'f',
    'ø': 'ur', 'œ': 'ur', 'y': 'ue', 'ʏ': 'ue', 'ɨ': 'ih',
    'ɐ': 'uh', 'ɵ': 'oh', 'ʉ': 'oo', 'ɯ': 'oo', 'ɤ': 'uh',
    'ʀ': 'r', 'ɫ': 'l', 'ɱ': 'm', 'ɥ': 'w', 'ʑ': 'zh', 'ʨ': 'ch'
  },
  ro: {
    'ə': 'ă', 'ɚ': 'ăr', 'ɜ': 'ă', 'ɝ': 'ăr',
    'ʃ': 'ș', 'ʒ': 'j', 'tʃ': 'ci', 'dʒ': 'gi',
    'θ': 'th', 'ð': 'dh', 'ŋ': 'ng', 'ɹ': 'r', 'ɾ': 'r',
    'ɪ': 'i', 'ʊ': 'u', 'ɛ': 'e', 'æ': 'a', 'ʌ': 'a',
    'ɔ': 'o', 'ɑ': 'a', 'ɒ': 'o', 'ɡ': 'g', 'ɟ': 'g',
    'ç': 'h', 'x': 'h', 'ɣ': 'g', 'ʁ': 'r', 'ʝ': 'i',
    'ɲ': 'ni', 'ʎ': 'li', 'ɕ': 'ș', 'ʂ': 'ș', 'ʐ': 'j',
    'ɦ': 'h', 'ʔ': '', '∅': 'nimic', 'β': 'v', 'ɸ': 'f',
    'ø': 'ö', 'œ': 'e', 'y': 'ü', 'ʏ': 'ü', 'ɨ': 'î',
    'ɐ': 'ă', 'ɵ': 'o', 'ʉ': 'u', 'ɯ': 'u', 'ɤ': 'ă',
    'ʀ': 'r', 'ɫ': 'l', 'ɱ': 'm', 'ɥ': 'u', 'ʑ': 'j', 'ʨ': 'ci'
  },
  ru: {
    'ə': 'э', 'ɚ': 'эр', 'ɜ': 'э', 'ɝ': 'эр',
    'ʃ': 'ш', 'ʒ': 'ж', 'tʃ': 'ч', 'dʒ': 'дж',
    'θ': 'тх', 'ð': 'дх', 'ŋ': 'нг', 'ɹ': 'р', 'ɾ': 'р',
    'ɪ': 'и', 'ʊ': 'у', 'ɛ': 'э', 'æ': 'э', 'ʌ': 'а',
    'ɔ': 'о', 'ɑ': 'а', 'ɒ': 'о', 'ɡ': 'г', 'ɟ': 'дь',
    'ç': 'хь', 'x': 'х', 'ɣ': 'г', 'ʁ': 'р', 'ʝ': 'й',
    'ɲ': 'нь', 'ʎ': 'ль', 'ɕ': 'щ', 'ʂ': 'ш', 'ʐ': 'ж',
    'ɦ': 'г', 'ʔ': '', '∅': 'ничего', 'β': 'в', 'ɸ': 'ф',
    'ø': 'ё', 'œ': 'ё', 'y': 'ю', 'ʏ': 'ю', 'ɨ': 'ы',
    'ɐ': 'а', 'ɵ': 'о', 'ʉ': 'у', 'ɯ': 'ы', 'ɤ': 'ы',
    'ʀ': 'р', 'ɫ': 'л', 'ɱ': 'м', 'ɥ': 'у', 'ʑ': 'жь', 'ʨ': 'ч'
  },
  de: {
    'ə': 'e', 'ɚ': 'er', 'ɜ': 'ö', 'ɝ': 'er',
    'ʃ': 'sch', 'ʒ': 'sch', 'tʃ': 'tsch', 'dʒ': 'dsch',
    'θ': 'th', 'ð': 'dh', 'ŋ': 'ng', 'ɹ': 'r', 'ɾ': 'r',
    'ɪ': 'i', 'ʊ': 'u', 'ɛ': 'e', 'æ': 'ä', 'ʌ': 'a',
    'ɔ': 'o', 'ɑ': 'a', 'ɒ': 'o', 'ɡ': 'g', 'ɟ': 'j',
    'ç': 'ch', 'x': 'ch', 'ɣ': 'g', 'ʁ': 'r', 'ʝ': 'j',
    'ɲ': 'nj', 'ʎ': 'lj', 'ɕ': 'sch', 'ʂ': 'sch', 'ʐ': 'sch',
    'ɦ': 'h', 'ʔ': '', '∅': 'nichts', 'β': 'w', 'ɸ': 'f',
    'ø': 'ö', 'œ': 'ö', 'y': 'ü', 'ʏ': 'ü', 'ɨ': 'i',
    'ɐ': 'a', 'ɵ': 'ö', 'ʉ': 'u', 'ɯ': 'u', 'ɤ': 'o',
    'ʀ': 'r', 'ɫ': 'l', 'ɱ': 'm', 'ɥ': 'j', 'ʑ': 'sch', 'ʨ': 'tsch'
  },
  it: {
    'ə': 'e', 'ɚ': 'er', 'ɜ': 'e', 'ɝ': 'er',
    'ʃ': 'sc', 'ʒ': 'g', 'tʃ': 'c', 'dʒ': 'g',
    'θ': 'th', 'ð': 'dh', 'ŋ': 'ng', 'ɹ': 'r', 'ɾ': 'r',
    'ɪ': 'i', 'ʊ': 'u', 'ɛ': 'e', 'æ': 'a', 'ʌ': 'a',
    'ɔ': 'o', 'ɑ': 'a', 'ɒ': 'o', 'ɡ': 'g', 'ɟ': 'g',
    'ç': 'c', 'x': 'ch', 'ɣ': 'g', 'ʁ': 'r', 'ʝ': 'i',
    'ɲ': 'gn', 'ʎ': 'gl', 'ɕ': 'sc', 'ʂ': 'sc', 'ʐ': 'g',
    'ɦ': 'h', 'ʔ': '', '∅': 'niente', 'β': 'v', 'ɸ': 'f',
    'ø': 'ö', 'œ': 'e', 'y': 'ü', 'ʏ': 'ü', 'ɨ': 'i',
    'ɐ': 'a', 'ɵ': 'o', 'ʉ': 'u', 'ɯ': 'u', 'ɤ': 'e',
    'ʀ': 'r', 'ɫ': 'l', 'ɱ': 'm', 'ɥ': 'u', 'ʑ': 'g', 'ʨ': 'c'
  },
  es: {
    'ə': 'e', 'ɚ': 'er', 'ɜ': 'e', 'ɝ': 'er',
    'ʃ': 'sh', 'ʒ': 'y', 'tʃ': 'ch', 'dʒ': 'y',
    'θ': 'z', 'ð': 'd', 'ŋ': 'ng', 'ɹ': 'r', 'ɾ': 'r',
    'ɪ': 'i', 'ʊ': 'u', 'ɛ': 'e', 'æ': 'a', 'ʌ': 'a',
    'ɔ': 'o', 'ɑ': 'a', 'ɒ': 'o', 'ɡ': 'g', 'ɟ': 'y',
    'ç': 'j', 'x': 'j', 'ɣ': 'g', 'ʁ': 'r', 'ʝ': 'y',
    'ɲ': 'ñ', 'ʎ': 'll', 'ɕ': 'sh', 'ʂ': 'sh', 'ʐ': 'y',
    'ɦ': 'h', 'ʔ': '', '∅': 'nada', 'β': 'b', 'ɸ': 'f',
    'ø': 'o', 'œ': 'e', 'y': 'u', 'ʏ': 'u', 'ɨ': 'i',
    'ɐ': 'a', 'ɵ': 'o', 'ʉ': 'u', 'ɯ': 'u', 'ɤ': 'e',
    'ʀ': 'r', 'ɫ': 'l', 'ɱ': 'm', 'ɥ': 'u', 'ʑ': 'y', 'ʨ': 'ch'
  },
  fr: {
    'ə': 'e', 'ɚ': 'eur', 'ɜ': 'e', 'ɝ': 'eur',
    'ʃ': 'ch', 'ʒ': 'j', 'tʃ': 'tch', 'dʒ': 'dj',
    'θ': 'th', 'ð': 'dh', 'ŋ': 'ng', 'ɹ': 'r', 'ɾ': 'r',
    'ɪ': 'i', 'ʊ': 'ou', 'ɛ': 'è', 'æ': 'a', 'ʌ': 'a',
    'ɔ': 'o', 'ɑ': 'a', 'ɒ': 'o', 'ɡ': 'g', 'ɟ': 'gu',
    'ç': 'h', 'x': 'kh', 'ɣ': 'g', 'ʁ': 'r', 'ʝ': 'y',
    'ɲ': 'gn', 'ʎ': 'ill', 'ɕ': 'ch', 'ʂ': 'ch', 'ʐ': 'j',
    'ɦ': 'h', 'ʔ': '', '∅': 'rien', 'β': 'v', 'ɸ': 'f',
    'ø': 'eu', 'œ': 'eu', 'y': 'u', 'ʏ': 'u', 'ɨ': 'i',
    'ɐ': 'a', 'ɵ': 'e', 'ʉ': 'u', 'ɯ': 'ou', 'ɤ': 'e',
    'ʀ': 'r', 'ɫ': 'l', 'ɱ': 'm', 'ɥ': 'u', 'ʑ': 'j', 'ʨ': 'tch'
  },
  hu: {
    'ə': 'e', 'ɚ': 'er', 'ɜ': 'e', 'ɝ': 'er',
    'ʃ': 's', 'ʒ': 'zs', 'tʃ': 'cs', 'dʒ': 'dzs',
    'θ': 'th', 'ð': 'dh', 'ŋ': 'ng', 'ɹ': 'r', 'ɾ': 'r',
    'ɪ': 'i', 'ʊ': 'u', 'ɛ': 'e', 'æ': 'e', 'ʌ': 'a',
    'ɔ': 'o', 'ɑ': 'a', 'ɒ': 'o', 'ɡ': 'g', 'ɟ': 'gy',
    'ç': 'h', 'x': 'h', 'ɣ': 'g', 'ʁ': 'r', 'ʝ': 'j',
    'ɲ': 'ny', 'ʎ': 'ly', 'ɕ': 's', 'ʂ': 's', 'ʐ': 'zs',
    'ɦ': 'h', 'ʔ': '', '∅': 'semmi', 'β': 'v', 'ɸ': 'f',
    'ø': 'ö', 'œ': 'ö', 'y': 'ü', 'ʏ': 'ü', 'ɨ': 'i',
    'ɐ': 'a', 'ɵ': 'ö', 'ʉ': 'u', 'ɯ': 'u', 'ɤ': 'e',
    'ʀ': 'r', 'ɫ': 'l', 'ɱ': 'm', 'ɥ': 'u', 'ʑ': 'zs', 'ʨ': 'cs'
  },
  pt: {
    'ə': 'e', 'ɚ': 'er', 'ɜ': 'e', 'ɝ': 'er',
    'ʃ': 'ch', 'ʒ': 'j', 'tʃ': 'tch', 'dʒ': 'dj',
    'θ': 'th', 'ð': 'dh', 'ŋ': 'ng', 'ɹ': 'r', 'ɾ': 'r',
    'ɪ': 'i', 'ʊ': 'u', 'ɛ': 'é', 'æ': 'a', 'ʌ': 'a',
    'ɔ': 'ó', 'ɑ': 'a', 'ɒ': 'ó', 'ɡ': 'g', 'ɟ': 'g',
    'ç': 's', 'x': 'rr', 'ɣ': 'g', 'ʁ': 'r', 'ʝ': 'j',
    'ɲ': 'nh', 'ʎ': 'lh', 'ɕ': 'ch', 'ʂ': 'ch', 'ʐ': 'j',
    'ɦ': 'r', 'ʔ': '', '∅': 'nada', 'β': 'v', 'ɸ': 'f',
    'ø': 'ô', 'œ': 'e', 'y': 'u', 'ʏ': 'u', 'ɨ': 'i',
    'ɐ': 'a', 'ɵ': 'o', 'ʉ': 'u', 'ɯ': 'u', 'ɤ': 'e',
    'ʀ': 'r', 'ɫ': 'l', 'ɱ': 'm', 'ɥ': 'u', 'ʑ': 'j', 'ʨ': 'tch'
  }
}

/** Symbols every language shares — ASCII letters and the obvious digraphs. */
const SHARED = {
  'ɡ': 'g', 'ɢ': 'g', 'ʙ': 'b', 'ʜ': 'h', 'ʟ': 'l', 'ɴ': 'n', 'ʀ': 'r',
  'ǀ': 'click', 'ǁ': 'click', 'ǂ': 'click', 'ǃ': 'click'
}

/**
 * Nasal vowels, keyed by the base vowel of a vowel + combining tilde (U+0303).
 *
 * The tilde is in SILENT, so without this table `/sɛ̃k/` comes out as "sek" and
 * the nasality — the whole point of the sound — is lost. No explanation
 * language here has nasal vowels, so each one approximates the nasal with its
 * own vowel plus a nasal consonant (Portuguese, which does have them, uses its
 * own tilde letters).
 */
const NASAL = {
  en: { 'ɑ': 'ahn', 'ɛ': 'ehn', 'ɔ': 'ohn', 'œ': 'uhn', 'æ': 'ahn', 'a': 'ahn', 'e': 'ehn', 'o': 'ohn', 'i': 'ehn', 'u': 'uhn', 'ə': 'uhn' },
  ro: { 'ɑ': 'an', 'ɛ': 'en', 'ɔ': 'on', 'œ': 'ăn', 'æ': 'an', 'a': 'an', 'e': 'en', 'o': 'on', 'i': 'ân', 'u': 'un', 'ə': 'ăn' },
  ru: { 'ɑ': 'ан', 'ɛ': 'эн', 'ɔ': 'он', 'œ': 'ён', 'æ': 'ан', 'a': 'ан', 'e': 'эн', 'o': 'он', 'i': 'эн', 'u': 'юн', 'ə': 'эн' },
  de: { 'ɑ': 'an', 'ɛ': 'en', 'ɔ': 'on', 'œ': 'ön', 'æ': 'än', 'a': 'an', 'e': 'en', 'o': 'on', 'i': 'en', 'u': 'un', 'ə': 'en' },
  it: { 'ɑ': 'an', 'ɛ': 'en', 'ɔ': 'on', 'œ': 'ön', 'æ': 'an', 'a': 'an', 'e': 'en', 'o': 'on', 'i': 'en', 'u': 'un', 'ə': 'en' },
  es: { 'ɑ': 'an', 'ɛ': 'en', 'ɔ': 'on', 'œ': 'un', 'æ': 'an', 'a': 'an', 'e': 'en', 'o': 'on', 'i': 'in', 'u': 'un', 'ə': 'en' },
  fr: { 'ɑ': 'an', 'ɛ': 'in', 'ɔ': 'on', 'œ': 'un', 'æ': 'an', 'a': 'an', 'e': 'in', 'o': 'on', 'i': 'in', 'u': 'un', 'ə': 'in' },
  hu: { 'ɑ': 'an', 'ɛ': 'en', 'ɔ': 'on', 'œ': 'ön', 'æ': 'en', 'a': 'an', 'e': 'en', 'o': 'on', 'i': 'in', 'u': 'un', 'ə': 'en' },
  pt: { 'ɑ': 'ã', 'ɛ': 'ẽ', 'ɔ': 'õ', 'œ': 'ũ', 'æ': 'ã', 'a': 'ã', 'e': 'ẽ', 'o': 'õ', 'i': 'ĩ', 'u': 'ũ', 'ə': 'ẽ' }
}

/** The combining tilde that turns a vowel into a nasal vowel. */
const COMBINING_TILDE = '\u0303'

/**
 * A backtick span that is a real word — no IPA-only characters — is left alone.
 * `masă` is already readable; `/ˈma.sə/` is not.
 */
const IPA_ONLY = /[\u0250-\u02FF\u0300-\u036F\u1D00-\u1DBF\u2C60-\u2C7F\uA700-\uA71F]/

/** True when a span contains at least one character only IPA uses. */
export function looksLikeIpa(span) {
  return IPA_ONLY.test(span)
}

/**
 * Respell one IPA span for a language.
 *
 * Unknown characters are dropped rather than passed through: a stray `ʝ` read
 * aloud is worse than silence, and the surrounding respelling still carries the
 * sound.
 */
export function transliterateSpan(span, lang) {
  const table = BY_LANG[lang] ?? BY_LANG.en
  const nasal = NASAL[lang] ?? NASAL.en
  const chars = [...span]
  let out = ''
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]
    // A combining tilde FOLLOWS the vowel it nasalises, so it is consumed by
    // the vowel's own iteration. It is in SILENT, so without this lookahead it
    // would simply be dropped and `/sɛ̃k/` would come out as "sek".
    const nasalised = chars[index + 1] === COMBINING_TILDE
    if (nasalised) index += 1
    // `.` is the IPA syllable separator; read aloud it becomes a full stop.
    if (SILENT.has(char) || char === '.') continue
    const mapped = table[char] ?? SHARED[char]
    if (mapped !== undefined) {
      out += nasalised ? (nasal[char] ?? mapped + 'n') : mapped
      continue
    }
    // ASCII and the language's own accented letters pass through unchanged.
    if (char.codePointAt(0) < 128) {
      out += nasalised ? (nasal[char] ?? char + 'n') : char
      continue
    }
    if (!IPA_ONLY.test(char)) {
      out += char
      continue
    }
    // An unmapped IPA-only character: drop it.
  }
  return out.replace(/\s+/g, ' ').trim()
}

/**
 * Rewrite every IPA span in a block of prose.
 *
 * Four delimiters occur in the corpus:
 * - `/…/` — always IPA (phonemic).
 * - `[…]` — always IPA (phonetic), e.g. `[ɨ]`, `[t͡ʃ]`.
 * - `(…)` — IPA only when it contains an IPA-only character, e.g. `(tʃ)`.
 * - `` `…` `` — IPA only when it contains an IPA-only character; otherwise it
 *   is a real word (`masă`) and stays as written.
 *
 * A final sweep drops any IPA-only character that survived — the corpus has a
 * few malformed spans with a missing opening delimiter (`suonoʒ/`), and a
 * stray symbol read aloud is worse than silence.
 */
export function transliterate(text, lang) {
  const rewritten = text
    .replace(FOREIGN_WORD, '')
    .replace(/\/([^/\n]{1,60})\//g, (_, span) => transliterateSpan(span, lang))
    .replace(/\[([^\]\n]{1,60})\]/g, (whole, span) =>
      looksLikeIpa(span) ? transliterateSpan(span, lang) : whole
    )
    .replace(/\(([^)\n]{1,60})\)/g, (whole, span) =>
      looksLikeIpa(span) ? transliterateSpan(span, lang) : whole
    )
    .replace(/`([^`\n]{1,60})`/g, (whole, span) =>
      looksLikeIpa(span) ? transliterateSpan(span, lang) : span
    )
  return rewritten.replace(IPA_ONLY_GLOBAL, '')
}

/**
 * `(word) /ipa/` — a target-language word in round brackets, spelled as the
 * language spells it, immediately followed by its pronunciation. A Romanian
 * (or any other explanation-language) voice cannot read a foreign word, so the
 * bracketed word is dropped from the spoken text and only the respelled
 * pronunciation is voiced. The IPA must stay OUTSIDE the brackets: the bracketed
 * part is the silent part. The lookahead keeps ordinary parentheses untouched.
 */
const FOREIGN_WORD = /\(([^()\n]{1,60})\)[ \t]*(?=\/[^/\n]{1,60}\/)/g

/** Every IPA-only character, for the final sweep. */
const IPA_ONLY_GLOBAL = /[\u0250-\u02FF\u0300-\u036F\u1D00-\u1DBF\u2C60-\u2C7F\uA700-\uA71F]/g

/** Every language the map covers. */
export const TRANSLIT_LANGS = Object.keys(BY_LANG)
