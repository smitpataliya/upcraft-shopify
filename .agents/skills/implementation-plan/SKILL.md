---
name: implementation-plan
description: Creates or updates the written work plan for a new feature, module or significant change before any code is written. Works as a senior full-stack developer, tech lead and project manager - discusses requirements, compares 3-4 industry-standard approaches, analyses API speed and load behaviour, then writes the plan. Use when the user asks for a plan, design, approach or breakdown, or when a new module, endpoint group or database schema is about to be built.
---

# Implementation plan

## Mindset
Think as a senior full-stack developer, tech lead and project manager at the same time:
- Developer: pick the simplest design that is fast, correct and maintainable.
- Tech lead: compare real alternatives, choose the industry-standard one that fits this application, explain the trade-offs.
- Project manager: clarify scope, risks, order of work and what "done" means.
- Never guess. Anything not confirmed by the user or the code is an ASSUMPTION and is written as one.
- Never claim a measured number you did not measure. Estimates are labelled "estimate".

## Locations
- Workspace root = the folder that contains the .agents folder. Never hardcode its name or path.
- Project = the folder inside the workspace with .git, pom.xml, build.gradle or package.json (e.g., `makerman_clothing`, `upcraft-backed`, `upcraft-admin-panel`). Ask if unclear.
- **MANDATORY PROJECT-LEVEL STORAGE**:
  - Plans live STRICTLY in `<project-root>\docs\plans\` inside the specific project being modified (create the folder if missing).
  - NEVER store plans or documentation in the workspace root (e.g., `<workspace-root>\Docs\` or `<workspace-root>\docs\`).
  - Storing any files in `<workspace-root>\Docs\` is strictly forbidden. Always locate the target project and write the plan inside `<project-root>\docs\plans\`.

## File name
`<DD-MM-YYYY> - <ProjectName>_<ModuleName>_plan.md`
- The date is the plan generation date, always DD-MM-YYYY (a slash is not valid in Windows file names).
- Underscore between project and module. Keep the established project and module names. No spaces inside names.
- One file per module. Never combine unrelated modules.
- Every date inside the plan also uses DD-MM-YYYY.

## When to create a plan
New module or feature, significant change to a module, new API endpoint group, new schema or migration.
Not needed for small fixes (under 5 lines).
Light mode: for a small addition that clearly follows an existing pattern, Phase 2 may be one line
("single sensible approach: X, because the module already does Y") and Phase 3 a short table.
Say that you are using light mode.

## Process (follow the phases in order, never skip one)

### Phase 0 - Prepare
1. Run `code-review-graph build` in the project root and inspect the graph for architecture, modules and dependencies.
   If the command is missing or fails, skip it, say so in one line, and read the code by hand instead.
2. Read AGENTS.md, the matching rules (especially performance-scalability, api-design, spring-layers,
   database-entities, java-naming-structure) and the existing code the feature touches.
3. Look in <project-root>\docs\plans\ for an existing plan for this module (any date).
   If found, update it and keep its filename and original date. Never create a duplicate.

### Phase 1 - Discover (talk first, no plan yet)
Ask at most 5 focused questions in one message. For every question give your default assumption,
so the user can answer "ok". Cover only what is not already clear:
1. Business goal and who uses it.
2. Scope: what is in, what is explicitly out.
3. Expected scale: users, requests per second (average and peak), data volume now and in 1-2 years, read/write ratio.
4. Speed target: acceptable response time (p95) for each main endpoint.
5. Constraints: consistency needs, deadlines, existing integrations, team skills.
Wait for the answers.

### Phase 2 - Options (then STOP)
Propose 3-4 real ways to build this (for example: synchronous vs queue-based, offset vs keyset pagination,
direct query vs cached or read-optimised model, polling vs events). For each option give:
- How it works, in 2-3 lines.
- Is it an established industry pattern? Name the pattern. Do not invent names.
- Speed: number of DB queries and time complexity of the request path.
- Load: how it behaves at 10x and 100x the expected traffic, and its memory profile.
- Effort (S/M/L), maintainability, fit with our stack, main risk.
Then show a comparison table, and finish with:
`Recommendation: Option X, because ...` and `Rejected: Option Y (why), Option Z (why)`.
STOP and wait for the user to choose. Do not continue to Phase 3 without a choice.

### Phase 3 - Analyse the chosen option
Do this before writing the plan. Follow the performance-scalability rule.
1. Speed, per endpoint: number of DB queries (must not grow with result size), time complexity of in-memory work,
   index used, maximum payload, target p95. Flag anything that is O(n*m), N+1, unbounded or does a full table scan.
2. Load, use Little's law: concurrent requests = requests per second x seconds per request.
   Check that number against the thread pool, the DB connection pool and memory per request.
   Walk through three levels: expected load, 10x peak, and a burst of one million requests.
   For each level say what happens and what protects the server.
3. Protections to plan: pagination cap, timeouts, bounded pools and queues, caching, rate limiting,
   async work for slow operations, streaming or chunking for big data, idempotency for retried writes,
   circuit breaker for external calls, graceful degradation (fail fast with 429 or 503, never queue forever).
4. Memory: no unbounded lists, maps, caches or result sets. Big reads and files are streamed or chunked.
5. Say how it will be verified: query-count test, load test plan (tool, scenarios, pass criteria).
   Running a load tool is an Ask First command (see terminal-commands rule).
If the analysis shows the chosen option cannot meet the target, go back to the user with the problem
and the next best option. Do not hide it.

### Phase 4 - Write the plan
Use the template below. Include the planned class, DTO and method names, following java-naming-structure.
If requirements are still unclear after Phases 1 to 3, ask up to three more questions first.

### Phase 5 - Approval and tracking
1. Stop and ask for approval. Do not write feature code before it.
2. During implementation, tick checklist items as [x]. The plan is a living document.
3. Update "Status" in the plan when the phase changes.

## Template
```
# [Project Name] - [Module Name] Plan

## Status
Draft | Approved | In progress | Done  (one value, update as work moves)

## Module Overview
Problem, goal, users, what is out of scope.

## Tech Stack

## Requirements
### Version 1 - [Date: DD-MM-YYYY]
- Requirement 1

## Non-Functional Requirements
Expected load (average, peak), data volume, response-time target (p95) per endpoint,
availability and consistency needs. Mark each ASSUMPTION or CONFIRMED.

## Options Considered
Table of the options from Phase 2, the chosen one, and why the others were rejected.

## Architecture & Design
Chosen design, data flow, planned classes / DTOs / methods (named per java-naming-structure).

## API Endpoints
Contract per endpoint (see api-contract skill), with the speed target.

## Database Design
Tables, columns, indexes and the queries each index serves.

## Performance & Complexity Analysis
| Endpoint | DB queries | Time complexity | Index used | Max payload | Target p95 | Risk |
| --- | --- | --- | --- | --- | --- | --- |

## Scalability & Load Plan
Little's law numbers, behaviour at expected / 10x / burst load, and the protections chosen
(pagination cap, pools, timeouts, caching, rate limit, async, idempotency, degradation).

## Security & Risks
Security concerns and other risks, each with a mitigation.

## Test & Load Verification
Unit and integration tests, query-count checks, load test scenarios and pass criteria.

## Rollout & Rollback
Migration order, feature flag if any, how to undo.

## Open Questions

## Implementation Checklist
- [ ] Task 1

## Change History
| Date | Change Description | Old Requirement (Commented) |
| --- | --- | --- |
| DD-MM-YYYY | Initial plan created | - |
```

## When requirements change
1. Never delete old requirements. Mark the old version as superseded and wrap its text in an HTML comment
   (<!-- OUTDATED - replaced by Version 2 ... -->).
2. Add a new versioned block with the updated requirements.
3. Re-run Phase 3 for anything the change affects, and update the analysis sections.
4. Add a row to the Change History table.
5. Keep the original filename and date.

## Rules
- No feature code before the plan is approved.
- No plan before the user has chosen an approach (except in light mode).
- Every performance or load claim is either measured or labelled "estimate" or "assumption".
