---
summary: "Personal autonomous engineering preset with workspace, policy guardrails, cron loops, and PR workflow conventions"
read_when:
  - Building a personal software engineering automation profile
  - Restricting agent shell/git/network behavior for local repos
  - Standardizing branch, commit, test, and PR policies
  - Defining failure handling and Telegram status updates
title: "Personal SWE agent preset"
---

# Personal SWE agent preset

This guide provides a copy paste config preset for an autonomous personal software engineering workflow.

Use it when you want one agent profile that can:

- stay inside approved repo roots
- follow strict shell, git, and network policies
- run maintenance loops on a schedule
- enforce branch, commit, test, and PR conventions
- stop safely with clear Telegram status reports when blocked

## Complete preset

```json5
// ~/.openclaw/openclaw.json
{
  agents: {
    defaults: {
      workspace: "~/code",
    },
  },
  cron: {
    enabled: true,
    maxConcurrentRuns: 1,
  },
}
```

> **Note:** The fields above are the only keys validated by `AgentDefaultsSchema` and the `cron` schema.
> Policy rules (system prompt, hooks, scratchpad) and cron job definitions are configured separately
> as described in the sections below.

## Agent system prompt (conceptual policy)

Set your agent's behavioral policy by providing a system prompt through the gateway's agent
configuration interface. The following is an example policy you can adapt:

```text
You are my personal SWE agent for local repositories.

Scope and safety:
- Work only under approved roots: ~/code and ~/scratch/review.
- Never cd, read, or write outside approved roots.
- Do not use destructive shell operations (rm -rf, git reset --hard, git clean -fdx) unless user explicitly authorizes in this chat.

Tool policy:
- Shell: allow read/build/test commands; deny package publish, release, and host-level admin commands.
- Git: allow status/diff/branch/log/add/commit/push on current repo; deny force-push, branch deletion, history rewrites.
- Network: allow docs and package metadata domains only; deny arbitrary curl/wget and unknown hosts.

Branch and PR workflow:
- Branch naming must be feat/<topic>, fix/<topic>, chore/<topic>, or docs/<topic>.
- Commit subject must match: <type>(<scope>): <summary>.
- Before each commit, run required checks and capture pass/fail in notes.
- PR body must include: Summary, Changes, Tests, Risks, Rollback, Follow ups.

Failure handling:
- Retry budget: at most 2 retries per failing command, with one short diagnosis step between retries.
- Stop and ask user when blocked by missing credentials, ambiguous product decisions, destructive changes, or repeated test failures.
- Telegram status must include: objective, attempted commands, first actionable error, files changed, and next request for user.
```

## Hooks (conceptual policy)

The following hook definitions describe the intended enforcement policy for this preset.
Refer to the [Hooks](/automation/hooks) documentation for the supported configuration format.

**Shell hooks:**

- `workspace-allowlist`: deny commands run outside `~/code` or `~/scratch/review`.
- `block-destructive-shell`: deny `rm -rf`, `sudo rm`, and `git clean -fdx`.
- `require-checks-before-commit`: deny `git commit` unless `pnpm test` and `pnpm build` succeeded within the last 30 minutes.

**Git hooks:**

- `branch-name-policy`: deny branch creation unless the name matches `^(feat|fix|chore|docs)/[a-z0-9._-]+$`.
- `commit-subject-policy`: deny commit unless the subject matches Conventional Commit style.
- `block-history-rewrite`: deny `git push --force` and `git push --force-with-lease`.

**Network hooks:**

- `allow-docs-and-metadata-only`: restrict outbound requests to `docs.openclaw.ai`, `registry.npmjs.org`, `api.github.com`, and `github.com`.

## Scratchpad checklist (conceptual)

Use a scratchpad or notes section to track these items before each commit:

- Run `pnpm test`
- Run `pnpm build`
- Summarize changed files
- Write a Conventional Commit message

For PRs, ensure the body includes: Summary, Changes, Tests, Risks, Rollback, and Follow ups.

## Cron maintenance jobs (conceptual)

The `cron` config key enables scheduled agent runs. The following jobs illustrate the intended
maintenance schedule. Refer to [Cron jobs](/automation/cron-jobs) for supported job configuration.

| Job | Schedule | Task |
|-----|----------|------|
| `maintenance-deps-audit` | Every Monday 09:00 UTC | Dependency and lockfile health checks |
| `maintenance-doc-link-check` | Every Wednesday 15:00 UTC | Docs link checks, report broken links |
| `maintenance-pr-hygiene` | Every Friday 12:00 UTC | Review stale branches, prepare PR drafts |

## Policy examples included in the preset

### Allowed repo roots and workspaces

- Default workspace set with `agents.defaults.workspace: "~/code"`.
- Explicit guardrail allowlist keeps execution in `~/code` and `~/scratch/review`.

### Preferred branch naming

- Required branch name format:
  - `feat/`
  - `fix/`
  - `chore/`
  - `docs/`

### Commit message pattern

- Required commit subject regex:
  - `^(feat|fix|chore|docs|refactor|test)(\([a-z0-9._-]+\))?: .+`

### Mandatory test and build before commit

- Commit is denied unless these commands succeeded recently:
  - `pnpm test`
  - `pnpm build`

### PR body template fields

- Required PR sections:
  - Summary
  - Changes
  - Tests
  - Risks
  - Rollback
  - Follow ups

## Failure handling for autonomous runs

Use these rules to keep autonomous work predictable and safe.

### Retry budget

- Maximum retries per failing command: **2**.
- Between retries, perform one focused diagnosis step:
  - inspect the first actionable error line
  - verify dependencies and current branch state
  - retry only if the root cause appears transient

### When to stop and ask user

Stop autonomous execution and ask for user input when any of these happen:

- missing credentials or unavailable secrets
- unclear product behavior or conflicting requirements
- destructive operation is required to continue
- same test or build failure persists after retry budget is exhausted
- policy denies a command needed for next progress

### What to include in Telegram status replies

For blocked or paused runs, send a concise status that includes:

1. objective and current step
2. exact commands attempted
3. first actionable error message
4. files changed so far
5. what was retried and retry count used
6. specific user decision or credential needed

Example status format:

```text
Status: blocked on test failure
Objective: add config preset docs for personal SWE agent
Commands: pnpm test; pnpm build
Error: vitest failed in docs link parser with missing fixture
Changed files: docs/automation/personal-swe-agent.md, docs/gateway/configuration.md
Retries: 2/2 used (same failure)
Need from you: confirm whether to update fixture baseline or skip this test in docs-only PR
```

## Related docs

- [Configuration](/gateway/configuration)
- [Configuration Reference](/gateway/configuration-reference)
- [Cron jobs](/automation/cron-jobs)
- [Hooks](/automation/hooks)
