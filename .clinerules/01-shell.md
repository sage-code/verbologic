# Shell & Terminal Rules (Windows Git Bash)

**ALWAYS USE GIT BASH ONLY.** All commands via Git Bash (POSIX sh). Use forward slashes: `/c/Users/eluci/sage-code/verbologic/temp`, not backslashes. Use `/dev/null` for redirects, never `nul`.

**NO PIPING TO TAIL, HEAD, OR PAGERS.** Piping buffers output and hides interactive prompts. Do not use `cat`, `tail`, `head`, or `less`.
- Short commands (git status, ls, single checks): let output print directly, no log file.
- Long-running commands (`./run build`, `./run tsc`, `./run validate`): redirect to `./temp/<name>.log`, then search it with Grep (`offset`/`head_limit`) instead of reading the whole file.

**ONE COMMAND PER BASH CALL.** Each command runs isolated so Cline can track completion. Do not chain with `&&`, `;`, or `|` unless it's a single logical unit.

**NO ENV EXPORTS ACROSS CALLS.** Set inline: `NUXT_TELEMETRY_DISABLED=1 CI=true npm run build`. Do not run `export FOO=bar` then rely on it in a later call.

**NON-INTERACTIVE MODE.** When calling npm/node directly, prepend flags: `NUXT_TELEMETRY_DISABLED=1 CI=true npm run dev`. The `./run` wrapper handles CI flags automatically.
