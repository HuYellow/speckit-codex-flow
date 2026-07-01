---
name: speckit-gate
description: Evaluate whether a GitHub Spec Kit phase may proceed in Codex. Use before plan, tasks, implement, or converge, or when the user asks why implementation is blocked.
---

# Spec Kit Gate

Use this skill to enforce local Spec Kit workflow gates.

## Required Behavior

1. Identify the requested phase: `plan`, `tasks`, `implement`, or `converge`.
2. Call `gate_phase` with that phase.
3. If `allowed` is false:
   - report blockers first
   - report `nextSkill`
   - stop without implementation
4. If `allowed` is true:
   - report that the phase is clear
   - name the official next skill returned by the tool

## Gate Rules

- Implementation requires constitution, current spec, technical plan, and executable tasks.
- Spec, plan, and tasks must not contain unresolved `[NEEDS CLARIFICATION]` markers or template placeholders.
- If the constitution requires tests, `tasks.md` must include test tasks.

## Guardrails

- This skill does not edit files.
- Do not bypass a failed gate unless the user explicitly stops using this Spec Kit flow.
