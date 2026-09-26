# Cline Workflow Rules

**Use `./run <cmd>`** for build, validate, deploy, git, and media. Direct exceptions: `npm run dev` (dev server), one-off scripts in CLAUDE.md. See `./run help` for full list.

**Dev Server Port:** Before `./run build`, check if port 3123 is in use. If yes, ask user approval before building.

**Verification:** After edits, log to `./temp/task-*.log` and read logs with Grep tool or Read. If dev server is running, verify rendering with `curl -s http://localhost:3123/<route> -o ./temp/task-page.html`.

**Task Completion:**
1. Edit files as specified.
2. Run validation and type-check, log to `./temp/`.
3. Verify rendering if needed.
4. Check `git status` — only expected files changed.
5. Clean up task files from `./temp/` (preserve `build.fingerprint`, `last_push`, `missing-content.md`).
6. Report in ≤10 lines: what changed + validation results.

**Do NOT:**
- Restart dev server without explicit approval.
- Call `npm run build`/`npm run generate` directly (use `./run`).
- Create commits or push without being asked.
- Delete or modify files outside task scope.
- Leave temp files in `./temp/` after task completion.
