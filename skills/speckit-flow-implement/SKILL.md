---
name: speckit-flow-implement
description: Strict implementation entrypoint for GitHub Spec Kit in Codex. Use when the user asks to implement a Spec Kit feature through this plugin or continue implementation after specs, plan, and tasks exist.
---

# Spec Kit Flow Implement

Use this skill as the strict implementation gate for this plugin.

## Required Behavior

1. Call `gate_phase` with `phase: "implement"`.
2. If the gate is blocked:
   - report blockers first
   - tell the user the exact `nextSkill`
   - do not edit code
3. If the gate is allowed:
   - state that the Spec Kit implementation gate passed
   - invoke or instruct the official `$speckit-implement` skill to execute tasks
   - keep following the project-local official Spec Kit instructions

## Guardrails

- Do not implement directly from this skill when `gate_phase` returns blockers.
- Do not treat this plugin's checks as a replacement for official `$speckit-implement`.
- If task execution exposes drift between code and spec, use `$speckit-converge` after implementation.
