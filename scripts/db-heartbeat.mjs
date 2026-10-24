#!/usr/bin/env node
/**
 * db-heartbeat.mjs — keep the Supabase Free-tier project from auto-pausing.
 *
 * A Free-tier project that receives no API or database traffic for 7
 * consecutive days is paused automatically. The data is not lost, but the
 * project has to be resumed by hand from the dashboard, which takes the site's
 * auth and progress tracking offline until someone notices. One authenticated
 * REST request per day resets that clock, so
 * .github/workflows/supabase-heartbeat.yml runs this at 05:00 daily.
 *
 *   node scripts/db-heartbeat.mjs
 *
 * Exit codes: 0 = project answered, 1 = project unreachable / rejected us.
 *
 * Credentials come from the environment, falling back to .env (gitignored):
 *   NUXT_PUBLIC_SUPABASE_URL        https://<ref>.supabase.co
 *   NUXT_PUBLIC_SUPABASE_ANON_KEY   sb_publishable_… (browser-safe; RLS protects data)
 *
 * The probe is `select=id&limit=1` against `profiles` — the cheapest
 * authenticated read that still counts as real API traffic. RLS returns an
 * empty array to an anonymous caller, which is a 200 and therefore success.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ENV_FILE = join(ROOT, '.env')

const ATTEMPTS = 3
const TIMEOUT_MS = 20_000
const BACKOFF_MS = [0, 5_000, 15_000]

function loadCredentials() {
  // CI supplies these as workflow secrets and has no .env; locally they live in
  // .env. Only fall back to the file when the environment is missing them, so
  // an explicit override always wins.
  if ((!process.env.NUXT_PUBLIC_SUPABASE_URL || !process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY) && existsSync(ENV_FILE)) {
    process.loadEnvFile(ENV_FILE)
  }
  const url = (process.env.NUXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '')
  const key = (process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
  const missing = [
    !url && 'NUXT_PUBLIC_SUPABASE_URL',
    !key && 'NUXT_PUBLIC_SUPABASE_ANON_KEY'
  ].filter(Boolean)
  if (missing.length) {
    console.error(`db-heartbeat: missing ${missing.join(' and ')} — set them in .env or the environment.`)
    return null
  }
  return { url, key }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function probe(url, key) {
  const endpoint = `${url}/rest/v1/profiles?select=id&limit=1`
  const response = await fetch(endpoint, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
  const body = await response.text()
  return { status: response.status, ok: response.ok, body: body.slice(0, 300) }
}

async function main() {
  const credentials = loadCredentials()
  if (!credentials) return 1
  const { url, key } = credentials
  const host = new URL(url).host
  console.log(`db-heartbeat: pinging ${host} …`)

  let lastError = ''
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    if (BACKOFF_MS[attempt]) {
      console.log(`db-heartbeat: retrying in ${BACKOFF_MS[attempt] / 1000}s …`)
      await sleep(BACKOFF_MS[attempt])
    }
    try {
      const { status, ok, body } = await probe(url, key)
      if (ok) {
        console.log(`db-heartbeat: OK — ${status} from /rest/v1/profiles (project is awake).`)
        return 0
      }
      // 401/403 means the project answered but rejected the key: retrying will
      // not help, and the key needs fixing.
      if (status === 401 || status === 403) {
        console.error(`db-heartbeat: FAILED — ${status} from /rest/v1/profiles.`)
        console.error('  The project is reachable but rejected the publishable key.')
        console.error('  Check NUXT_PUBLIC_SUPABASE_ANON_KEY (Dashboard → Project Settings → API keys).')
        console.error(`  Response: ${body}`)
        return 1
      }
      lastError = `HTTP ${status}: ${body}`
    } catch (error) {
      lastError = error?.cause?.message || error?.message || String(error)
    }
    console.warn(`db-heartbeat: attempt ${attempt + 1}/${ATTEMPTS} failed — ${lastError}`)
  }

  console.error('db-heartbeat: FAILED — the project did not answer.')
  console.error(`  Last error: ${lastError}`)
  console.error('  A paused Free-tier project refuses connections until it is resumed:')
  console.error(`  https://supabase.com/dashboard/project/${host.split('.')[0]}`)
  return 1
}

// Set the code rather than calling process.exit(): exiting while a fetch handle
// is still open trips a libuv assertion on Windows.
process.exitCode = await main()
