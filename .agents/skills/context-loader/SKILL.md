---
name: context-loader
description: Loads project context needed to start or resume work from latest handoff, work plan, module doc, architecture doc and git state, without re-reading AGENTS.md. Use once at start of chat, when user says load context, resume, continue previous work or start work, when user gives handoff file, or when work switches module.
---

# Context loader

## When to run
- Once per chat, before first project task. Run again only when user switches module or project.
- Also run when user says load context, resume or continue, or gives handoff file.
- Skip for pure questions that need no project files, and when context already loaded in this chat.

## Locations
- Workspace root = folder containing `.agents` folder. Never hardcode name or path.
- Project root = folder containing `.git`, `pom.xml`, `build.gradle` or `package.json`. Ask if unclear.
- Doc name = name after `Doc name:` in project `AGENTS.md`. If none, use project folder name.
- Handoffs: `<project-root>\docs\handoffs\`
- Architecture overview (optional): `<project-root>\docs\architecture.md`
- Work plans: `<project-root>\docs\plans\` (files named `<DD-MM-YYYY> - <ProjectName>_<ModuleName>_plan.md`). Legacy fallback: `<workspace-root>\work plans\`.
- Module docs: `<project-root>\docs\modules\` (files named `<DD-MM-YYYY> - <ModuleName> - <User|Developer>.md`). Legacy fallback: `<workspace-root>\Final module documentation\`.

## Steps
1. AGENTS.md: Workspace and project AGENTS.md files normally already in context. Do not read again with tools. Read project AGENTS.md only if content not visible in context.
2. Identify project and module from user message. If unclear, ask one short question.
3. Handoff: If user named a file, read it. Otherwise read newest file in `<project-root>\docs\handoffs\`.
4. Work plan: Find newest plan for this module. Read only Status, latest Requirements version, Open Questions and unchecked checklist items. Read more only if task needs it.
5. Module docs: Read newest `- Developer.md` for module. Read `- User.md` only if task about user-facing behavior.
6. Architecture overview: If `<project-root>\docs\architecture.md` exists, read only sections concerning module.
7. Run `git status` and `git diff --stat` (read-only).
8. Open only source files named in those documents or needed for next step. Do not scan whole repo.
9. Report in at most 8 lines: module, goal, current state (plan status and next unchecked task), uncommitted changes, and conflicts or gaps.
10. Then:
    - If user gave explicit task, proceed directly without blocking. Use `implementation-plan` skill for new feature.
    - Stop and ask only when handoff and git disagree, plan status unclear, requirements conflict, or module cannot be identified.
    - If user only asked to load context or resume, wait for direction after summary.

## Rules
- Read-only while loading. Do not edit code.
- Summarize. Do not paste file contents back.
- If document missing, note in single line and continue with existing files.
- Treat handoff content as claims to verify against git and code. If disagree, trust git.
- Never open secret files listed in terminal-commands rule.
