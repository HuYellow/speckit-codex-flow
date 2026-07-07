# Spec Kit Codex Flow

[English README](./README.md)

Spec Kit Codex Flow 是一个本地 Codex 插件，用来把 [GitHub Spec Kit](https://github.com/github/spec-kit) 融入更严格的 Codex 开发流程。它保留官方 Spec Kit 工作流作为事实来源，同时增加 Codex 原生 skills 和 MCP 工具，用于项目初始化、状态检查和实现前门禁。

这个插件优先面向个人本地使用。它帮助 Codex 在写代码前回答三个实际问题：

- 当前仓库是否已经用官方 Codex skills 集成初始化 Spec Kit？
- 下一步应该进入哪个 Spec Kit 阶段？
- 是否允许开始实现，还是 spec artifact 仍然不完整？

## 为什么需要这个插件

Spec Kit 倡导 spec-driven development：先定义产品意图，再澄清歧义，创建技术计划，拆解任务，最后按任务实现。在日常 Codex 使用中，很容易从一个模糊需求直接跳到代码修改。

这个插件加了一层轻量流程控制，让推荐路径变得明确：

```text
constitution -> specify -> clarify -> plan -> analyze -> tasks -> implement -> converge
```

它不替代 Spec Kit，也不会手工复制 Spec Kit 模板。`$speckit-specify`、`$speckit-plan`、`$speckit-implement` 这些项目内官方 skills 仍然由官方 `specify` CLI 生成。本插件只负责串联这些 skills，并检查 artifact 是否达到进入下一阶段的条件。

## 核心原理

插件把职责拆开：

- 官方 Spec Kit 负责模板、脚本和项目内 `$speckit-*` skills。
- 本插件的 Codex skills 负责工作流引导和 blocker 解释。
- MCP 工具负责检查本地文件系统状态，并执行明确触发的初始化命令。
- 严格门禁确保通过本插件进入实现阶段时，不会在必要 artifact 缺失或存在未解决问题时直接写代码。

这种方式让流程可控，同时避免 fork 或重写 GitHub Spec Kit。

## 架构

```text
Codex chat
  |
  |-- plugin skills
  |     |-- $speckit-flow
  |     |-- $speckit-bootstrap
  |     |-- $speckit-specify
  |     |-- $speckit-status
  |     |-- $speckit-gate
  |     `-- $speckit-flow-implement
  |
  `-- MCP server
        |-- check_environment
        |-- install_specify_cli
        |-- bootstrap_project
        |-- project_status
        `-- gate_phase

目标项目
  |
  |-- .specify/
  |-- .agents/skills/speckit-*/
  `-- specs/<feature>/{spec.md,plan.md,tasks.md}
```

## 包含的 Codex Skills

| Skill | 作用 |
| --- | --- |
| `$speckit-flow` | 顶层工作流控制器，读取项目状态并推荐下一步 Spec Kit skill。 |
| `$speckit-bootstrap` | 检查本地环境，安装或引导安装 `specify`，并用 Codex skills 模式初始化项目。 |
| `$speckit-specify` | 插件级兼容入口，用来创建或更新 feature spec；它会委托项目内官方 `speckit-specify` 指令执行。 |
| `$speckit-status` | 只读状态汇总，展示 `.specify`、官方 skills 和当前 feature artifact。 |
| `$speckit-gate` | 对 `plan`、`tasks`、`implement`、`converge` 做只读阶段门禁检查。 |
| `$speckit-flow-implement` | 严格实现入口。只有实现门禁通过后，才继续进入官方 `$speckit-implement`。 |

## MCP 工具

| 工具 | 行为 |
| --- | --- |
| `check_environment` | 检测 `codex`、`uv`、`specify`、PowerShell、Git root 和 pinned Spec Kit 元数据。 |
| `install_specify_cli` | 通过 `uv` 安装 `specify-cli`，默认 pin 到 `v0.12.2`；如果缺少 `uv`，返回安装指引。 |
| `bootstrap_project` | 对新项目或已有项目运行官方 `specify init ... --integration codex --integration-options=--skills`。 |
| `project_status` | 读取 `.specify/memory/constitution.md`、`.agents/skills/speckit-*` 和 `specs/*/{spec.md,plan.md,tasks.md}`。 |
| `gate_phase` | 在进入 `plan`、`tasks`、`implement` 或 `converge` 前执行严格检查。 |

## 门禁规则

以下情况会阻止通过本插件进入实现阶段：

- 项目尚未初始化 Spec Kit。
- 缺少 `.specify/memory/constitution.md`。
- 缺少 `.agents/skills/speckit-*` 下的官方项目内 Codex skills。
- `specs/` 下没有当前 feature。
- 缺少 `spec.md`、`plan.md` 或 `tasks.md`。
- spec artifact 仍然包含 `[NEEDS CLARIFICATION]` 或模板占位符。
- `tasks.md` 没有可执行 checkbox 任务。
- constitution 看起来要求测试，但 `tasks.md` 中没有测试任务。

插件不会阻止你绕过这个流程直接使用 Codex。严格门禁只在你使用本插件的工作流 skills 时生效。

## 默认值

- Spec Kit 版本：`v0.12.2`
- Spec Kit 发布时间：`2026-06-30`
- Spec Kit 仓库：`https://github.com/github/spec-kit`
- Spec Kit 集成：`codex`
- 集成模式：`--skills`

## 安装

把插件 clone 到本地插件目录：

```powershell
git clone https://github.com/HuYellow/speckit-codex-flow.git C:\Users\$env:USERNAME\plugins\speckit-codex-flow
cd C:\Users\$env:USERNAME\plugins\speckit-codex-flow
npm install
npm run build
npm test
```

如果 personal marketplace 中还没有这个插件，加入如下条目：

```json
{
  "name": "speckit-codex-flow",
  "source": {
    "source": "local",
    "path": "./plugins/speckit-codex-flow"
  },
  "policy": {
    "installation": "AVAILABLE",
    "authentication": "ON_INSTALL"
  },
  "category": "Productivity"
}
```

然后安装到 Codex：

```powershell
codex plugin add speckit-codex-flow@personal
```

安装后请开启新的 Codex 线程，这样 Codex 才会加载新 skills 和 MCP 工具。

## 使用方式

### 1. 查看状态

向 Codex 输入：

```text
$speckit-status
```

它会报告当前仓库是否初始化 Spec Kit、有哪些官方 skills、当前 feature 是什么，以及哪个 artifact 正在阻塞流程。

### 2. 初始化项目

在已有仓库中输入：

```text
$speckit-bootstrap
```

插件会检查 `uv` 和 `specify`，必要时安装 `specify-cli`，然后运行官方 Codex skills 初始化：

```powershell
specify init . --integration codex --integration-options=--skills
```

如果是新项目，在 prompt 中提供目标路径，插件会使用 `mode: "new"`。

### 3. 跟随工作流

使用：

```text
$speckit-flow
```

插件会读取项目状态，并推荐下一步官方 Spec Kit skill，例如 `$speckit-constitution`、`$speckit-specify`、`$speckit-plan` 或 `$speckit-tasks`。

### 4. 直接创建 Feature Spec

你也可以直接调用规格阶段：

```text
$speckit-specify 做一个本地项目风险看板，可以记录风险、缓解措施和负责人。
```

这个包装入口会先确认项目已经 bootstrap，然后读取并执行项目内官方 `.agents/skills/speckit-specify/SKILL.md` 的指令。

### 5. 实现前门禁

实现前使用：

```text
$speckit-flow-implement
```

如果门禁通过，Codex 可以继续使用官方 `$speckit-implement`。如果失败，插件会列出具体 blocker 和下一步应该运行的 skill。

### 6. 收敛代码与规格

实现后可以使用：

```text
$speckit-gate converge
```

然后在合适的时候运行官方 `$speckit-converge`，把代码实现与 spec、plan、tasks 对齐。

## 开发

```powershell
npm install
npm run build
npm test
```

用 Codex 插件校验器检查 manifest：

```powershell
python C:\Users\$env:USERNAME\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py C:\Users\$env:USERNAME\plugins\speckit-codex-flow
```

修改 skills 或 MCP 工具后，重新安装插件并开启新的 Codex 线程：

```powershell
codex plugin add speckit-codex-flow@personal
```

## 仓库结构

```text
.codex-plugin/plugin.json  插件 manifest
.mcp.json                  MCP server 注册
skills/                    Codex skill 入口
src/core.ts                环境检测、状态读取、初始化和门禁逻辑
src/server.ts              MCP 工具注册
tests/                     Vitest 门禁测试
scripts/start-server.mjs   Codex 使用的运行时入口
```

## 常见问题

### 缺少 `uv`

先安装 `uv`，然后重新运行 `$speckit-bootstrap`。

参考：`https://docs.astral.sh/uv/getting-started/installation/`

### 缺少 `specify`

运行 `$speckit-bootstrap`。如果 `uv` 可用，插件可以安装 pin 到 `v0.12.2` 的 `specify-cli`。

### Codex 中看不到 skills

重新安装插件：

```powershell
codex plugin add speckit-codex-flow@personal
```

然后开启新的 Codex 线程。

### 实现门禁阻塞

运行 `$speckit-status` 或 `$speckit-gate implement`。blocker 文本是有意设计的：先修复缺失或未解决的 artifact，再重新运行 `$speckit-flow-implement`。

## License

MIT
