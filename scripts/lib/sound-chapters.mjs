/**
 * Chapters whose sound is complete (planning/lt01-all-languages-plan.md, part 1).
 *
 * In these chapters validate-data.mjs fails when a shown name has no clip or a title clip speaks a name
 * other than the sidebar's (scripts/sync-title-names.mjs), and `./run.sh missing` prints the sound audit
 * (scripts/audit-sound.mjs). Add a chapter here once its audit reports no missing, stale or unverified
 * clip, so it cannot regress.
 */
export const SOUND_GUARDED = ['LT01']
