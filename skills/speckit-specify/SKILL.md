---
name: speckit-specify
description: Compatibility entrypoint for GitHub Spec Kit feature specification in Codex. Use when the user invokes $speckit-specify, asks to create or update a Spec Kit feature spec, describes a feature to turn into spec.md, or wants an easy plugin-level trigger before project-local official Spec Kit skills are loaded.
---

# Spec Kit Specify

Use this skill as the plugin-level entrypoint for the Spec Kit specification phase.

## Required Behavior

1. Treat the text after `$speckit-specify` as the feature description.
2. Call `project_status` for the current workspace.
3. If the project is not initialized, or official project-local `speckit-*` skills are missing, tell the user to run `$speckit-bootstrap` and stop.
4. If the feature description is empty, ask the user for the concrete feature they want to specify and stop.
5. Read the project-local official skill file at `.agents/skills/speckit-specify/SKILL.md` under the detected project root.
6. Execute that file's instructions directly, using the feature description as `$ARGUMENTS`.
7. After creating or updating the spec, call `project_status` again and report the next recommended skill.

## Guardrails

- Do not call `$speckit-specify` from inside this skill; that can recurse back into this wrapper.
- Do not copy or reimplement Spec Kit templates manually when the project-local official skill exists.
- Keep this phase focused on what and why. Do not choose the tech stack here; leave technical decisions for `$speckit-plan`.
- Do not implement code from this skill.

## Fallback

If `.agents/skills/speckit-specify/SKILL.md` is missing even though the project appears initialized, report the missing path and recommend `$speckit-bootstrap` to restore official project-local Spec Kit skills.
