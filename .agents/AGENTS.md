# Project Development Standards

## 1. Runtime Code Separation

The `src/` directory must contain ONLY production runtime code.

- Test files belong in `tests/`
- Reusable scripts belong in `scripts/` or `tools/`
- Test and script directories are excluded from `tsconfig.json` compilation (`dist/` output)

## 2. Temporary Script Policy (Mandatory)

If any temporary `.ts` file is created for:

- Database migration, data correction, one-time data update
- Trigger creation/removal, schema fixing
- Data import/export, cleanup scripts
- Debugging, testing, verification
- One-time backend processing
- Any temporary development task

Then:

1. Create the script
2. Execute it
3. Verify the expected result
4. **Remove the script immediately** if it is no longer required

Do NOT leave temporary scripts inside the repository after their purpose has been completed.

If a script is expected to be reused in the future, place it under `scripts/` or `tools/` with proper documentation explaining its purpose. Otherwise, delete it after execution.

## 3. Repository Cleanliness

The repository must remain clean and production-ready. Do not keep:

- Temporary scripts
- Throwaway utilities
- One-time migration helpers
- Debugging files
- Experimental files
- Duplicate implementations
- Backup files
- Unused code

Every file in the repository must have a clear long-term purpose.

## 4. Before Creating Any New File

Before creating a new `.ts` file, determine:

- Is it permanent?
- Is it reusable?
- Is it only for a one-time task?

If it is only for a one-time task, automatically delete it after successful execution and verification.

## 5. Development Standard

Always prefer:

- Modifying existing services
- Extending existing modules
- Reusing existing utilities

instead of creating unnecessary new files. Only create new files when there is a valid architectural reason.
