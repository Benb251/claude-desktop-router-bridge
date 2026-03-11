# Release Notes

## Suggested Repo Description

Local bridge console for routing Claude Desktop slots into live 9router models.

## Suggested Topics

- `claude-desktop`
- `9router`
- `claude-code`
- `model-routing`
- `local-tooling`
- `ops-console`

## Suggested First Release Title

`v0.1.0 - Initial bridge console`

## Suggested First Release Body

Chrono Spirit is a local bridge controller for `Claude Desktop -> 9router`.

This first release includes:

- live model catalog loading from `/v1/models`
- alias read/write against `%APPDATA%\\9router\\db.json`
- per-apply backup creation and read-back validation
- draft vs persisted state handling
- raw-input routing and code-first filtering
- favorites, recents, and local apply history
- named profiles with preview diff, duplicate, pin, lock, import, and export
- bulk profile-set import/export with preview modes
- a smoke test script for local pre-release verification

Known limits:

- desktop labels stay Claude-shaped even when routing to non-Claude targets
- some non-Claude models may behave differently with Claude Code tool-use
- if Claude Desktop does not pick up a route change immediately, restart `9router`

## Suggested Initial Commit Message

`feat: initial chrono spirit bridge release`

## Before Opening The Repo

- decide whether to keep `"private": true` in `package.json`
- add a real license file if the repo will be shared outside a private/internal scope
- set the actual GitHub repository URL in project metadata if needed
