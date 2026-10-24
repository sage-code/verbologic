/**
 * useTurnstile — Cloudflare Turnstile, loaded on demand.
 *
 * Anonymous sign-in creates a real row in `auth.users` per call, so the
 * endpoint is worth protecting: Supabase's own docs recommend a CAPTCHA for
 * exactly this reason, and the built-in 30 requests/hour/IP limit alone does
 * not stop a distributed botnet.
 *
 * Turnstile is the natural choice here — the site already runs behind
 * Cloudflare, and Turnstile is free and unlimited.
 *
 * The script is injected only when a token is actually needed (the first
 * progress write), never on page load, so the widget costs nothing for the
 * overwhelming majority of visitors who never sign in.
 *
 * Configuration: `NUXT_PUBLIC_TURNSTILE_SITE_KEY` (the public site key — safe
 * to ship). When it is absent the composable resolves to null and callers skip
 * the CAPTCHA, so the site works unchanged without it.
 */

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const SCRIPT_ID = 'cf-turnstile-script'

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string
      callback: (token: string) => void
      'error-callback'?: () => void
      'expired-callback'?: () => void
      size?: 'normal' | 'compact' | 'flexible'
      appearance?: 'always' | 'execute' | 'interaction-only'
      theme?: 'light' | 'dark' | 'auto'
    }
  ) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<TurnstileApi | null> | null = null

/** Inject the Turnstile script once; resolves null if it cannot load. */
function loadScript(): Promise<TurnstileApi | null> {
  if (!import.meta.client) return Promise.resolve(null)
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<TurnstileApi | null>((resolve) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    const script = existing ?? document.createElement('script')
    script.id = SCRIPT_ID
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.addEventListener('load', () => resolve(window.turnstile ?? null), { once: true })
    script.addEventListener('error', () => resolve(null), { once: true })
    if (!existing) document.head.appendChild(script)
  })
  return scriptPromise
}

export function useTurnstile() {
  const siteKey = useRuntimeConfig().public.turnstileSiteKey as string | undefined

  /** True when a site key is configured — callers can skip the whole flow. */
  const isConfigured = computed(() => Boolean(siteKey))

  /**
   * Run the challenge and resolve the token.
   *
   * Resolves `null` when Turnstile is not configured or cannot load — the
   * caller then proceeds without a token, which is the correct behaviour for a
   * project that has not enabled the CAPTCHA yet.
   *
   * The widget is rendered into a detached, off-screen container: the challenge
   * is `interaction-only`, so a normal visitor sees nothing and the token
   * arrives without a click. Only a suspected bot is shown a challenge.
   */
  async function getToken(): Promise<string | null> {
    if (!import.meta.client || !siteKey) return null
    const api = await loadScript()
    if (!api) {
      console.warn('[turnstile] script unavailable — continuing without a token')
      return null
    }

    return new Promise<string | null>((resolve) => {
      const container = document.createElement('div')
      container.style.position = 'fixed'
      container.style.bottom = '0'
      container.style.right = '0'
      container.style.zIndex = '9999'
      document.body.appendChild(container)

      let settled = false
      const finish = (token: string | null) => {
        if (settled) return
        settled = true
        try {
          api.remove(widgetId)
        } catch {
          // Widget already gone — nothing to clean up.
        }
        container.remove()
        resolve(token)
      }

      const widgetId = api.render(container, {
        sitekey: siteKey,
        appearance: 'interaction-only',
        size: 'flexible',
        theme: 'auto',
        callback: (token) => finish(token),
        'error-callback': () => finish(null),
        'expired-callback': () => finish(null)
      })

      // Never hang a progress write on a stuck challenge.
      setTimeout(() => finish(null), 15_000)
    })
  }

  return { isConfigured, getToken }
}
