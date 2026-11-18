---
name: db-schema
description: Reads the live database structure (tables, columns, primary and foreign keys, indexes, views) through a read-only script. Use when the user asks about the current database schema, or before writing entities, migrations, queries or documentation that depend on the real table structure.
---

# Database schema (read-only)

## Hard rules
1. Get schema information only through `scripts/db-schema.ps1` in this skill folder.
2. Never run `psql`, `mysql`, `sqlcmd` or any other database client yourself. Never write SQL for this task.
3. Never insert, update, delete or change the schema. If a change is needed, propose a migration (see the db-migration skill) and let the user run it.
4. Never read, print or search for passwords, connection strings or environment variables.
   Do not open application.yml, application.properties or .env just to find credentials.
5. If the script fails, report the error message to the user. Do not try workarounds, other tools or other accounts.

## Steps
1. Workspace root = the folder that contains the .agents folder. Run the command with that folder as the working directory.
2. Find the DB profile name in the project's AGENTS.md (a line like `DB profile: ALZEVITA`).
   If there is none, ask the user which profile to use. Do not guess.
3. Run this exact form (only the values after `-Profile` and the optional filters change):
   `powershell -NoProfile -ExecutionPolicy Bypass -File .agents\skills\db-schema\scripts\db-schema.ps1 -Profile <NAME> -Mode <mode>`
4. Modes: `overview`, `tables`, `columns`, `keys`, `indexes`, `views`, `all`.
   Optional filters: `-Schema <name>` and `-Table <name>` (letters, digits and underscores only), and `-MaxLines <n>`.
5. Start with `overview`. On a large database narrow with `-Schema` or `-Table` instead of running `all` for everything.
6. Summarize for the user per table: columns and types, primary key, foreign keys, unique constraints and indexes.

## Useful checks (report, do not fix)
- Tables without a primary key.
- Foreign key columns without an index.
- New or changed tables missing the 8 mandatory audit columns from the database-entities rule
  (created_at, created_by, updated_at, updated_by, deleted_at, deleted_by, status, audit_tracker_id).
- Entity classes whose fields do not match the real columns.

## When the script reports a problem
- "Missing setting DB_RO_...": tell the user which variable is missing. Do not guess values.
- "... was not found on PATH": tell the user the database client must be installed or added to PATH.
- Permission or login errors: report them as they are. Do not retry with different credentials.
