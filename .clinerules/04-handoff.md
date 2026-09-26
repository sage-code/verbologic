# Task Card Template for Haiku (Act Mode Handoff)

When switching from Plan mode to Act mode with Haiku, use this format for complete, self-contained task execution.

## Template

```
## TASK: [One-sentence goal]

**FILES (read only):**
- C:\Users\eluci\sage-code\verbologic\<relative-path>
- C:\Users\eluci\sage-code\verbologic\<relative-path>

**CHANGES:**
1. File: `<relative-path>` — [Find X, replace with Y] OR [Add Z at line N]
2. File: `<relative-path>` — [description of edit]

**COMMANDS (Git Bash, one per call):**
1. `./run validate > ./temp/<task>-validate.log`
2. `./run tsc > ./temp/<task>-tsc.log`
3. [optional] `curl -s http://localhost:3123/<route> -o ./temp/<task>-page.html`

**VERIFY:**
- Read `./temp/<task>-validate.log` — look for "✓ OK" or error summary.
- Read `./temp/<task>-tsc.log` — confirm "No errors found".
- [if applicable] Read `./temp/<task>-page.html` and check for "<expected-text>".

**DONE WHEN:**
- [objective criteria, e.g., "no validation or type errors, page renders correctly"]

**CLEANUP:**
- Delete: `./temp/<task>-validate.log`, `./temp/<task>-tsc.log`, `./temp/<task>-page.html`
- Report: changed files + validation results in ≤10 lines.

**DO NOT:**
- Touch files outside the CHANGES section.
- Restart the dev server.
- Run `npm` or `node` directly (use `./run`).
- Create commits or push.
```

## Guidelines

1. **Exactness:** Include full absolute file paths and specific line numbers or find-replace strings.
2. **One-command-per-call:** Each Bash command is a separate call so Cline can track completion.
3. **Logging to `./temp/`:** All output goes to `./temp/<task>-*.log` or `./temp/<task>-*.html` for later inspection.
4. **Reading logs:** Use the Read tool to fetch log contents; never use `cat`, `tail`, or `head`.
5. **Preservation:** Do not delete `build.fingerprint`, `last_push`, or `missing-content.md` from `./temp/`.
6. **Cleanup:** After all commands run and verification passes, remove task-specific files from `./temp/`.
7. **Short report:** Conclude with a ≤10-line summary of what changed and the results.

## Example

```
## TASK: Add dark-mode toggle to navbar

**FILES (read only):**
- C:\Users\eluci\sage-code\verbologic\src\components\Navbar.vue
- C:\Users\eluci\sage-code\verbologic\src\stores\theme.ts

**CHANGES:**
1. File: `src/components/Navbar.vue` — Add `<button @click="toggleTheme">🌙</button>` after line 42
2. File: `src/stores/theme.ts` — Add `const toggleTheme = () => { isDark.value = !isDark.value; }` in the store

**COMMANDS:**
1. `./run tsc > ./temp/dark-mode-tsc.log`
2. `curl -s http://localhost:3123/ -o ./temp/dark-mode-page.html`

**VERIFY:**
- Read `./temp/dark-mode-tsc.log` — no errors.
- Read `./temp/dark-mode-page.html` — check for toggle button in navbar.

**DONE WHEN:**
- No type errors, toggle button visible in navbar HTML.

**CLEANUP:**
- `rm ./temp/dark-mode-tsc.log ./temp/dark-mode-page.html`

**DO NOT:**
- Modify any other components or stores.
- Start the dev server.
```
