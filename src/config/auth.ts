/**
 * Auth feature flags.
 *
 * EMAIL_CODE_ENABLED — e-mail code verification (the 6-digit code Supabase
 * e-mails when the Magic Link / Confirm-signup templates include `{{ .Token }}`).
 * POSTPONED: hosted projects can't customize auth e-mail templates until
 * **custom SMTP** is configured (Dashboard → Auth → SMTP Settings — free to
 * set up with your own provider, e.g. Resend). Until then, registration and
 * sign-in use e-mail + password with "Confirm email" turned OFF in the
 * dashboard (signUp returns a session immediately; no verification, no
 * password reset — development-grade, see manual/MAINTENANCE.md §3.6).
 *
 * Flip to `true` after custom SMTP + `{{ .Token }}` are in place to restore
 * the paste-the-code flow (the code is kept, not deleted).
 */
export const EMAIL_CODE_ENABLED = false
