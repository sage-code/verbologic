#!/usr/bin/env node
/**
 * fingerprint.mjs — differential build gate for the `run build` command.
 *
 *   node scripts/fingerprint.mjs --check   exit 0 = unchanged (skip rebuild), 1 = changed
 *   node scripts/fingerprint.mjs --save    recompute and store the fingerprint
 *
 * The fingerprint is a single hash over every source/content file that can
 * affect the static output: src/**, public/data/**, and the build configs.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
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
