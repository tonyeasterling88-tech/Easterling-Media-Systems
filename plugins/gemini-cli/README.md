# Gemini CLI Codex Plugin

This local plugin adds a Codex skill for helping with Google's Gemini CLI:

- Install and version checks for `@google/gemini-cli`
- Authentication guidance without exposing secrets
- Interactive and non-interactive `gemini` usage
- `GEMINI.md` project context guidance
- Basic troubleshooting flow for local developer machines
- MCP tools for callable Gemini CLI actions inside Codex

The plugin manifest still has publisher, repository, legal, and image placeholders for you to fill before sharing or publishing it.

## Quick Check

From PowerShell:

```powershell
.\scripts\check-gemini-cli.ps1
.\scripts\check-gemini-cli.ps1 -Json
```

## Callable MCP Tools

When the plugin is installed and its MCP server is loaded, Codex can call:

- `gemini_cli_check_install`
- `gemini_cli_version`
- `gemini_cli_help`
- `gemini_cli_run_prompt`

The prompt runner uses `gemini -p` and supports `text`, `json`, and `stream-json` output. Do not pass secrets in prompts.

## Optional Marketplace Registration

If you want this plugin to appear in a Codex marketplace file for this repo, run the plugin-creator scaffold with `--with-marketplace`, or ask Codex to add a repo-local marketplace entry for `gemini-cli`.
