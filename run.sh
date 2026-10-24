#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────────────
#  Verbologic maintenance runner.
#  One entry point for build / clean / commit / push / release / media tooling.
#  Usage: ./run.sh <command> [args]
# ────────────────────────────────────────────────────────────────────────────
set -o pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; RED=$'\033[0;31m'; NC=$'\033[0m'
say()  { printf "${GREEN}[run.sh]${NC} %s\n" "$*"; }
warn() { printf "${YELLOW}[run.sh]${NC} %s\n" "$*"; }
fail() { printf "${RED}[run.sh]${NC} %s\n" "$*" >&2; exit 1; }

usage() {
cat <<'EOF'
Verbologic maintenance runner
─────────────────────────────
  ./run.sh help                          Show this help
  ./run.sh dev                           Start Nuxt dev server (http://localhost:3000)
  ./run.sh install                       Install dependencies
  ./run.sh build [--force]               Differential build (skips rebuild when nothing changed)
  ./run.sh validate                      Entity/nav/locale integrity checks
  ./run.sh heartbeat                     Ping Supabase (keeps the Free-tier project from pausing)
  ./run.sh missing                       Missing-content inventory (planned items → temp/missing-content.md)
  ./run.sh media stage                  Archive mp3s → media per-topic layout
  ./run.sh media index [dry]            Build public/data/media payloads (sidebars + manifests + config)
  ./run.sh media manifest [--dry-run]   Reconcile item manifests with files on disk (the baseline)
  ./run.sh media verify [--remote]      Missing / orphan / dirty / pending report (+ R2 diff)
  ./run.sh media upload [--apply]       Differential R2 sync (Cloudflare API; default reports, --apply transfers)
  ./run.sh media prune [--apply]        R2 objects no manifest references (default reports, --apply deletes)
  ./run.sh scaffold <lang> <TOPIC> <seed.json>  Seed a blank dictionary topic with pending manifests
  ./run.sh lecture <new|status|translate|review>  Lecture content tooling (content/lectures)
  ./run.sh clean                         Remove build junk (keeps .nuxt cache)
  ./run.sh clean-deep                    Remove build junk AND the .nuxt cache
  ./run.sh tsc                           Type-check (vue-tsc)
  ./run.sh status                        Git status + build-fingerprint state
  ./run.sh commit "<message>"            Stage + commit all changes
  ./run.sh push [--force]                Push current branch (throttled: max 1 push / 2h; --force bypasses)
  ./run.sh release "<message>"           build → validate → media manifest → commit → push (throttled)
  ./run.sh deploy                        Wrangler deploy (Workers Static Assets, differential)
  ./run.sh deploy-dry                    Validate wrangler.toml without uploading
EOF
}

# ── Push throttle: at most one push per 2h (one Workers Builds deploy/window).
# Commits always happen; a throttled push just keeps them local until the
# window opens. The marker lives in gitignored temp/ (same pattern as the
# build fingerprint); './run.sh clean' wiping it falls back to the origin/main
# commit date, which tracks the last push closely enough for the fallback.
PUSH_WINDOW=7200 # seconds (2h)
PUSH_STAMP="temp/last_push"

last_push_epoch() {
  if [[ -f "$PUSH_STAMP" ]]; then cat "$PUSH_STAMP"
  elif git rev-parse --verify -q origin/main >/dev/null 2>&1; then git log -1 --format=%ct origin/main
  else echo 0; fi
}

# do_push ["--force"] — push the current branch, honoring the throttle.
# Exit codes: 0 = pushed (or nothing to push), 2 = throttled (commit kept local).
do_push() {
  local branch force="${1:-}"
  branch="$(git branch --show-current)"

  # Nothing unpushed? (remote branch exists and we're not ahead of it)
  if git rev-parse --verify -q "origin/$branch" >/dev/null 2>&1 && \
     (( $(git rev-list --count "origin/$branch..$branch") == 0 )); then
    say "Nothing to push — '$branch' already matches origin."
    return 0
  fi

  local now last delta
  now="$(date +%s)"
  last="$(last_push_epoch)"
  delta=$(( now - last ))
  if [[ "$force" != "--force" ]] && (( delta < PUSH_WINDOW )); then
    warn "Last push $(( delta / 60 )) min ago — throttle: 1 push / 2h. Commit kept local."
    warn "Push in ~$(( (PUSH_WINDOW - delta + 59) / 60 )) min: ./run.sh push   (bypass once: ./run.sh push --force)"
    return 2
  fi

  git push origin "$branch" || fail "push failed"
  date +%s > "$PUSH_STAMP"
  say "Pushed $branch — Cloudflare Workers Builds is (re)deploying. Next push allowed in 2h."
}

differential_build() {
  # Refresh the media runtime payloads first (idempotent, cheap) so any
  # media/ content change is reflected before the fingerprint check —
  # public/data/media/** is part of the fingerprint inputs.
  node scripts/media-index.mjs || warn "media index failed/skipped"
  if node scripts/fingerprint.mjs --check; then
    say "No source/content changes — reusing existing static build (.output/public)."
    say "Use './run.sh build --force' to regenerate anyway."
    return 0
  fi
  say "Changes detected — regenerating the static site (differential)."
  npx nuxi prepare
  npm run generate || fail "build failed"
  node scripts/fingerprint.mjs --save
  say "Build finished → .output/public"
}

case "${1:-help}" in
  help|-h|--help) usage ;;
  dev)            npm run dev ;;
  install)        npm install ;;
  tsc)            npx nuxi prepare && npx vue-tsc --noEmit ;;
  status)
    git status --short
    node scripts/fingerprint.mjs --check || true
    echo "last push: $(( ( $(date +%s) - $(last_push_epoch) ) / 60 )) min ago (throttle window: 2h)"
    ;;
  build)
    if [[ "${2:-}" == "--force" ]]; then
      say "Forced full build."
      npx nuxi prepare
      npm run generate
      node scripts/fingerprint.mjs --save
    else
      differential_build
    fi
    ;;
  validate)  node scripts/validate-data.mjs ;;
  heartbeat) node scripts/db-heartbeat.mjs ;;
  missing)   node scripts/missing-content.mjs ;;
  media)
    shift
    # `./run.sh media index` builds the runtime payloads; every other argument is a
    # media-sync subcommand (stage | manifest | verify | upload | prune),
    # forwarded along with any flags after it (--apply, --remote, --dry-run).
    if [[ "${1:-}" == "index" ]]; then
      shift
      node scripts/media-index.mjs "${1:-}"
    else
      cmd="${1:-manifest}"
      [[ $# -gt 0 ]] && shift
      node scripts/media-sync.mjs "$cmd" "$@"
    fi ;;
  scaffold)  shift; node scripts/media-scaffold-topic.mjs "$@" ;;
  lecture)   shift; node scripts/lecture.mjs "$@" ;;
  clean)
    warn "Removing temp/ (keeping build.fingerprint, last_push, missing-content.md), node_modules/.cache, .output/"
    find temp -mindepth 1 \
      ! -name build.fingerprint ! -name last_push ! -name missing-content.md \
      -exec rm -rf {} + 2>/dev/null
    rm -rf .output node_modules/.cache
    say "Cleaned — .nuxt kept for fast next build."
    ;;
  clean-deep)
    warn "Removing build artifacts AND the .nuxt cache (keeping build.fingerprint, last_push, missing-content.md)."
    find temp -mindepth 1 \
      ! -name build.fingerprint ! -name last_push ! -name missing-content.md \
      -exec rm -rf {} + 2>/dev/null
    rm -rf .output .nuxt node_modules/.cache
    npm run postinstall
    say "Deep cleaned. Regenerate with './run.sh build --force'."
    ;;
  commit)
    msg="${2:?usage: ./run.sh commit \"<message>\"}"
    git add -A
    git commit -m "$msg" || fail "commit failed"
    say "Committed: $msg"
    ;;
  push)
    do_push "${2:-}"
    ;;
  release)
    differential_build
    node scripts/validate-data.mjs || warn "validation reported issues"
    node scripts/media-sync.mjs manifest || warn "media manifest failed/skipped"
    msg="${2:-release $(date +%Y-%m-%d %H:%M)}"
    git add -A
    git commit -m "$msg" || warn "nothing to commit"
    do_push
    if (( $? == 2 )); then
      warn "Release committed but push throttled — run './run.sh push' when the 2h window opens."
    else
      say "Released ✓ — website deployed by Cloudflare Workers Builds."
    fi
    ;;

  deploy)
    # CLOUDFLARE_API_TOKEN lives in .env (gitignored) alongside the R2 S3 keys —
    # load it so this guard (and wrangler itself) can see it without requiring
    # it to be exported in the shell profile.
    [[ -f .env ]] && set -a && source .env && set +a
    [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]] || \
      fail "CLOUDFLARE_API_TOKEN is not set in .env — create a Workers-scoped token at https://dash.cloudflare.com/profile/api-tokens (different from the R2 bucket token used by './run.sh media')"
    differential_build
    npx wrangler deploy || fail "wrangler deploy failed — see output above."
    say "Deployed ✓ — verbologic.com + www.verbologic.com (Workers Static Assets)."
    ;;
  deploy-dry)
    differential_build
    # Dry-run bundle goes to the gitignored temp/ scratch — never into the
    # deployable .output/public (a past `--outdir dist` symlinked there).
    npx wrangler deploy --dry-run --outdir temp/wrangler-dry
    say "Dry run OK — wrangler.toml is valid, nothing uploaded."
    ;;
  *) warn "Unknown command: ${1:-}"; usage ;;
esac
