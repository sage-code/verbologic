#!/usr/bin/env node
/**
 * check-articles.mjs — every content/**\/<ID>.json is in canonical form, and the
 * Python writer (scripts/lib/articles.py) produces the same bytes as the Node one.
 *
 *   node scripts/check-articles.mjs
 *
 * planning/content-in-database.md section 9 (two writers, one format).
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serialize } from './lib/articles.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CONTENT = join(ROOT, 'content')

const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (name.endsWith('.json')) files.push(path)
  }
}
for (const track of ['lectures', 'stories']) walk(join(CONTENT, track))

const bad = []
for (const file of files) {
  const raw = readFileSync(file, 'utf8')
  if (raw.includes('\r')) bad.push(`${file}: CRLF line endings`)
  else if (raw !== serialize(JSON.parse(raw))) bad.push(`${file}: not in canonical form (Node)`)
}

// `grammar` links an article to the LT02 topics it draws on.
const lt02 = new Set(readdirSync(join(CONTENT, 'lectures')).filter((name) => /^LT02T\d\d$/.test(name)))
for (const file of files) {
  const grammar = JSON.parse(readFileSync(file, 'utf8')).grammar
  if (grammar === undefined) continue
  if (!Array.isArray(grammar) || grammar.some((code) => !lt02.has(code))) bad.push(`${file}: grammar must list LT02 topic codes`)
}

// The Python writer must agree byte for byte.
const py = spawnSync(
  process.platform === 'win32' ? join(ROOT, '.venv', 'Scripts', 'python.exe') : 'python3',
  ['-c', [
    'import sys, json',
    'from pathlib import Path',
    'sys.path.insert(0, "scripts/lib")',
    'import articles',
    'bad = []',
    'for name in sys.stdin.read().split(chr(10)):',
    '    if not name: continue',
    '    p = Path(name)',
    '    if p.read_bytes() != articles.serialize(articles.read_article(p)).encode("utf-8"):',
    '        bad.append(name)',
    'print(json.dumps(bad))'
  ].join(String.fromCharCode(10))],
  { cwd: ROOT, input: files.join(String.fromCharCode(10)), encoding: 'utf8' }
)
if (py.status !== 0) bad.push(`python check failed: ${py.stderr.trim().slice(0, 200)}`)
else for (const file of JSON.parse(py.stdout)) bad.push(`${file}: Python writer disagrees with Node`)

if (bad.length) {
  console.error(`${bad.length} problem(s):`)
  bad.slice(0, 20).forEach((b) => console.error(`  ${b}`))
  process.exit(1)
}
console.log(`check-articles OK: ${files.length} article file(s), canonical in Node and Python`)
