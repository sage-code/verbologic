### Terminal Execution Rules (Mandatory)
1. **NO PIPING TO TAIL/HEAD:** Never redirect or pipe terminal output to `tail`, `head`, `less`, `more`, or `grep` (e.g., DO NOT execute `npm run generate 2>&1 | tail -30`). Piping buffers standard output, conceals interactive prompts, and causes long-running processes to hang indefinitely.
2. **ENFORCE NON-INTERACTIVE MODE:** Always prepend non-interactive environment variables to build, install, or generation commands:
   `NUXT_TELEMETRY_DISABLED=1 CI=true npm run <script>`
3. **DIRECT COMMAND EXECUTION:** Run commands directly (e.g., `npm run generate`). Allow standard streams to handle output natively so Cline can observe completion signals cleanly.