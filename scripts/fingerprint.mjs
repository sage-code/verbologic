#!/usr/bin/env node
/**
 * fingerprint.mjs — differential build gate for the `run build` command.
 *
 *   node scripts/fingerprint.mjs --check   exit 0 = unchanged (skip rebuild), 1 = changed
 *   node scripts/fingerprint.mjs --save    recompute and store the fingerprint
 *
 * The fingerprint is a single hash over every source/content file that can
 * affect the static output: src/**, public/data/**, the build configs, and
 * .env.
 *
 * .env is included because NUXT_PUBLIC_* values are BAKED INTO the bundle at
 * build time — they are not read at runtime (this is an assets-only Worker, so
 * there is no runtime to read them in). Adding or changing a public key
 * therefore changes the output, and skipping the rebuild would ship a bundle
 * with the old value. Only the file's contents are hashed, never logged.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const STATE_FILE = join(ROOT, 'temp', 'build.fingerprint')
const TOP_DIRS = ['src', 'public/data', 'media', 'content']
const TOP_FILES = [
  'nuxt.config.ts',
  'tailwind.config.ts',
  'tsconfig.json',
  'package.json',
  'wrangler.toml'
]
/** Baked into the bundle at build time — see the header comment. */
const OPTIONAL_FILES = ['.env']

/** Recursively list all files under a directory (sorted, deterministic). */
function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

function collect() {
  const files = []
  for (const dir of TOP_DIRS) files.push(...walk(join(ROOT, dir)))
  for (const f of TOP_FILES) files.push(join(ROOT, f))
  // Optional: absent on a machine with no .env (CI, a fresh clone) — skip
  // rather than crash, so the gate still works there.
  for (const f of OPTIONAL_FILES) {
    const p = join(ROOT, f)
    if (existsSync(p)) files.push(p)
  }
  return files.sort()
}

function hash(files) {
  const digest = createHash('sha256')
  for (const file of files) {
    digest.update(file.replace(ROOT, ''))
    digest.update(readFileSync(file))
  }
  return digest.digest('hex')
}

function currentFingerprint() {
  try {
    return readFileSync(STATE_FILE, 'utf-8').trim()
  } catch {
    return null
  }
}

const mode = process.argv[2] ?? '--check'
const bundle = collect()
const current = hash(bundle)

if (mode === '--check') {
  const stored = currentFingerprint()
  if (stored === current) {
    console.log(`fingerprint: unchanged (${current.slice(0, 12)}…)`)
    process.exit(0)
  }
  console.log(`fingerprint: CHANGED (stored ${stored ? stored.slice(0, 12) + '…' : '<none>'})`)
  process.exit(1)
}

if (mode === '--save') {
  writeFileSync(STATE_FILE, current)
  console.log(`fingerprint saved: ${current.slice(0, 12)}… (${bundle.length} files hashed)`)
  process.exit(0)
}

console.error(`unknown mode: ${mode}`)
process.exit(2)
