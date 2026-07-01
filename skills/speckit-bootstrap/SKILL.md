---
name: speckit-bootstrap
description: Bootstrap GitHub Spec Kit for Codex in a new or existing local project. Use when Spec Kit is not initialized, specify-cli is missing, official project-local $speckit-* skills are missing, or the user asks to set up Spec Kit for Codex.
---

# Spec Kit Bootstrap

Use this skill to prepare a project for Spec Kit with the official Codex skills integration.

## Required Behavior

1. Call `check_environment` for the target path.
2. If `uv` is missing, explain that `install_specify_cli` cannot run until `uv` is installed and provide the uv installation URL from the tool result.
3. If `uv` exists but `specify` is missing, call `install_specify_cli` with tag `v0.12.2`.
4. Call `bootstrap_project` only after `specify` is available.
5. Use `mode: "current"` for an existing repo or current directory. Use `mode: "new"` only when the user provides a new project path.
6. Use `force: true` only when the user asked to merge into a non-empty project or when initialization failed because the directory was non-empty.
7. After bootstrap, call `project_status` and report the next skill.

## Defaults

- Spec Kit tag: `v0.12.2`
- Integration: `codex`
- Integration options: `--skills`

## Guardrails

- Do not copy Spec Kit templates manually.
- Do not create `.agents/skills/speckit-*` by hand.
- Let the official `specify init ... --integration codex --integration-options=--skills` command generate project-local skills.
