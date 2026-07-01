---
name: speckit-status
description: Inspect local GitHub Spec Kit status for a Codex project, including constitution, official skills, current feature, spec, plan, and tasks artifacts. Use when the user asks for Spec Kit status, current phase, blockers, or next step.
---

# Spec Kit Status

Use this skill to summarize the current Spec Kit state without modifying files.

## Required Behavior

1. Call `project_status` for the current workspace or requested path.
2. Report:
   - project root
   - git branch when available
   - whether `.specify` exists
   - official `speckit-*` skill count
   - current feature directory
   - existence and blocker state for `spec.md`, `plan.md`, and `tasks.md`
   - next recommended skill
3. If blockers exist, list them before the summary.

## Guardrails

- This skill is read-only.
- Do not run `bootstrap_project`, `install_specify_cli`, or any implementation command from this skill.
