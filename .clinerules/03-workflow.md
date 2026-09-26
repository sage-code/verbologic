# Cline Workflow Rules

## Project Runner & Commands

- **Always use `./run <cmd>`** instead of calling `npm` or `node` scripts directly.
- The `./run` wrapper adds fingerprint gating, throttling, and sequencing.
- Available commands (see `./run help`):
  - `./run build [--force]` — differential build to `.output/public` (skips if unchanged).
  - `./run validate` — validate data indices (`scripts/validate-data.mjs`).
  - `./run media index|stage|manifest|verify|upload|prune` — media pipeline.
  - `./run missing` / `./run scaffold <lang> <TOPIC> <seed.json>` — content inventory.
  - `./run lecture <new|status|translate|review>` — lecture tooling.
  - `./run deploy` / `./run deploy-dry` — Wrangler deployment.
  - `./run status` / `./run commit "<msg>"` / `./run push [--force]` / `./run release "<msg>"` — git operations.
  - `./run tsc` — type-check with `vue-tsc`.
  - `./run clean` / `./run clean-deep` — remove build artifacts.

## Dev Server & Build Conflicts

- **Port Check:** Before running `./run build` or `./run generate`, check if the dev server is running on port 3123.
- **If port 3123 is in use:**
  - Do NOT stop or restart the dev server.
  - Ask the user: "Your dev server on :3123 is running. Building may fail. Proceed anyway?"
  - Wait for approval before continuing.
- **If port 3123 is free:** Proceed with the build.

## Plan Mode vs. Act Mode

- **Plan Mode (read-only):**
  - Analyze requirements, explore the codebase, and design implementation.
  - Do not edit files, create commits, or run state-changing commands.
  - Report findings and propose a plan for the user to review.

- **Act Mode (read-write):**
  - Implement changes based on the approved plan.
  - Edit files, run builds, validate changes, and create commits as needed.
  - Follow task cards for step-by-step execution.

## Verification & Testing

- **Static Validation:** After edits, run:
  ```bash
  ./run validate > ./temp/task-validate.log
  ./run tsc > ./temp/task-tsc.log
  ```
- **Runtime Verification:**
  - Start the dev server: `npm run dev` (direct command, not via `./run`).
  - Fetch the page: `curl -s http://localhost:3123/<route> -o ./temp/task-page.html`
  - Inspect the HTML body to confirm the change rendered correctly.
  - Do not rely on validators alone; always verify the rendered output.

## Task Completion Checklist

1. Edit files as specified in the task card.
2. Run validation commands (direct execution, log to `./temp/`).
3. Verify rendering with `curl` if necessary.
4. Check `git status` to confirm only expected files changed.
5. Clean up task-specific files from `./temp/` (e.g., `./temp/task-*.log`, `./temp/task-*.html`).
6. Report the outcome in ≤10 lines: what changed, validation results, and any issues.

## Important Constraints

- **Do not:**
  - Restart the dev server without explicit user approval.
  - Run `npm` or `node` scripts directly (use `./run` instead).
  - Create commits or push without being asked.
  - Delete or modify files outside the task's scope.
  - Leave temporary files in `./temp/` after task completion (except `build.fingerprint`, `last_push`, `missing-content.md`).
