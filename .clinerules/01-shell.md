# Shell & Terminal Rules (Windows Git Bash)

## Mandatory Terminal Execution Rules

1. **ALWAYS USE GIT BASH ONLY:** All terminal commands run via Git Bash (POSIX sh), never PowerShell or cmd.exe.
   - Forward slashes for paths: `/c/Users/eluci/sage-code/verbologic/temp`, not backslashes.
   - `/dev/null` for redirecting to nothing, never `nul`.

2. **NO PIPING TO TAIL, HEAD, OR PAGERS:**
   - ❌ NEVER: `npm run generate 2>&1 | tail -30`
   - ❌ NEVER: `node scripts/foo.mjs | head -20`
   - ❌ NEVER: `git log | less`
   - Piping buffers output, hides interactive prompts, and causes Cline to freeze.

3. **RUN COMMANDS DIRECTLY:**
   - Log to files instead of piping to pagers:
     ```bash
     ./run validate > ./temp/validate.log
     npm run tsc > ./temp/tsc.log
     ```
   - Read logs afterward using the Read tool, not with `cat` or `tail`.

4. **ENFORCE NON-INTERACTIVE MODE:**
   - Always prepend flags to node, build, or package commands:
     ```bash
     NUXT_TELEMETRY_DISABLED=1 CI=true npm run generate
     NUXT_TELEMETRY_DISABLED=1 CI=true npm run build
     ```
   - This prevents interactive prompts and ensures clean stream closure.

5. **ONE COMMAND PER BASH CALL:**
   - Do not chain commands with `&&`, `;`, or `|` unless absolutely necessary for a single logical unit.
   - Each command runs in its own isolated Bash call so Cline can track completion cleanly.
   - Exception: Chaining for a single logical operation is OK if documented in the task card.

6. **NO ENVIRONMENT VARIABLE EXPORTS ACROSS CALLS:**
   - Set environment variables inline with each command:
     ```bash
     NUXT_TELEMETRY_DISABLED=1 CI=true npm run build
     ```
   - Do not run `export FOO=bar` then rely on it in a later call.

## Temp Folder & Logging

- **Location:** All temporary files, logs, and intermediate outputs go to `./temp/`.
- **Naming:** Use descriptive names: `./temp/<task>-validate.log`, `./temp/build.log`, `./temp/migration.sql`.
- **Cleanup:** Each task card specifies cleanup steps to remove task-specific files (e.g., `./temp/<task>-*.log`).
- **Preserved files:** Do not delete `build.fingerprint`, `last_push`, or `missing-content.md` during cleanup.
