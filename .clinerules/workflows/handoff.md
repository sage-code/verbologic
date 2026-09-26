# Task Card Template for Haiku (Act Mode Handoff)

When switching from Plan mode to Act mode with Haiku, use this format for complete, self-contained task execution.

## Template

```
## TASK: [One-sentence goal]

**FILES (read only):**
- /c/Users/eluci/sage-code/verbologic/<relative-path>
- /c/Users/eluci/sage-code/verbologic/<relative-path>

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
- Restart the dev server without explicit user approval.
- Call `npm run build` or other build commands directly (use `./run` instead).
- Create commits or push without being asked.
```

## Guidelines

1. **Exactness:** Include full absolute paths, specific line numbers or find-replace strings.
2. **One-command-per-call:** Each Bash command is a separate call so Cline can track completion.
3. **Logging to `./temp/`:** All output goes to `./temp/<task>-*.log` or `./temp/<task>-*.html`.
4. **Reading logs:** Use Read tool with `offset`/`limit`, or Grep tool with `head_limit` to search; never use `cat`, `tail`, or `head`.
5. **Preservation:** Do not delete `build.fingerprint`, `last_push`, or `missing-content.md` from `./temp/`.
6. **Cleanup:** After commands run and verification passes, remove task-specific files from `./temp/`.
7. **Short report:** Conclude with ≤10-line summary of what changed and results.
