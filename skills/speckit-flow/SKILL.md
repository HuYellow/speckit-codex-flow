---
name: speckit-flow
description: Start or continue a GitHub Spec Kit workflow in Codex, using project-local official $speckit-* skills plus local status and gate tools. Use when the user asks to start spec-driven development, continue the Spec Kit workflow, decide the next Spec Kit step, or integrate specs into Codex development.
---

# Spec Kit Flow

Use this skill as the top-level workflow controller for GitHub Spec Kit in Codex.

## Required Behavior

1. Call `project_status` for the current workspace.
2. If the project is not initialized or official project-local skills are missing, direct the user to `$speckit-bootstrap` and do not start implementation.
3. Otherwise, choose the next official skill from `nextRecommendedSkill`.
4. Preserve the official Spec Kit lifecycle:
   - `$speckit-constitution`
   - `$speckit-specify`
   - `$speckit-clarify`
   - `$speckit-plan`
   - `$speckit-analyze`
   - `$speckit-tasks`
   - `$speckit-flow-implement`
   - `$speckit-converge`
5. When the next step is planning, tasks, implementation, or convergence, call `gate_phase` before recommending the step.

## Response Pattern

- Briefly report the detected project root and current feature.
- Report blockers first if any exist.
- Give the exact next skill to run.
- Do not write business code from this skill.

## Guardrails

- Treat official project-local `.agents/skills/speckit-*` files as the source of truth for Spec Kit commands.
- Use this plugin for orchestration and checks only.
- If `gate_phase` blocks a phase, explain the smallest artifact fix needed and stop.
