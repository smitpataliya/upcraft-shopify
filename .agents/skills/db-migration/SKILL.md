---
name: db-migration
description: Creates safe database migrations and the matching SQL file for a module. Use when adding or changing tables, columns, indexes or constraints, or when the user mentions a migration, Flyway, Liquibase, or database changes for a module.
---

# Database migration

## Locations
- Workspace root = the folder that contains the .agents folder. Never hardcode its name or path.
- SQL file base: <workspace-root>\Final module documentation\
- If <base>\<ProjectName>\ exists, save into <base>\<ProjectName>\SQL Queries\.
  Otherwise save into <base>\SQL Queries\. Create folders as needed.
- SQL file name: `<DD-MM-YYYY> - <module title>.sql`

## Steps
1. Detect the tool already in the project (flyway or liquibase dependency in pom.xml or build.gradle,
   existing db/migration or db/changelog folders). Never introduce a second tool.
2. If no tool is configured, ask which one to set up. Never use ddl-auto=update as a workaround.
3. Follow the project's existing folder and naming convention. Read the newest migration for the pattern.
4. Create a new migration file. Never edit an applied or committed migration.
   Never change the schema by hand against a database.
5. One logical change per migration. Use a clear description, never names like V13__update.sql.
   - Flyway: `V<version>__<description>.sql`, versions strictly increasing with no gaps or duplicates.
   - Liquibase: one changeset per logical change, each with a unique id and author, included in the master changelog.
6. Every new table includes the 8 mandatory audit columns from the database-entities rule.
7. Write the same changes into the SQL file described above.
8. Add the indexes the module plan needs (see its Database Design and Performance sections). Each index must serve a named query.
   Check heavy queries with the read-only explain tool.
9. On a large or busy table, plan a safe migration: add new columns as nullable or with a default, backfill in batches,
   then add constraints. Create indexes with the online option the database supports. Describe the lock risk in your reply.
10. Update the matching entity and DTOs. Test the migration on a fresh local database before finishing.

## Rules
- Ask before any destructive statement (DROP, TRUNCATE, mass DELETE or UPDATE).
- Never run migrations against production. Never put secrets or real data in migration files.
- Keep changes backward compatible where possible. Describe the rollback approach in your reply.
