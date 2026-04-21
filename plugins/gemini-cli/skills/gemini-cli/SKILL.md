---
name: gemini-cli
description: Use when the user asks to install, configure, run, script, automate, or troubleshoot Google's Gemini CLI, including the `gemini` command, `@google/gemini-cli`, GEMINI.md context files, authentication, output formats, MCP settings, and non-interactive prompts.
---

# Gemini CLI

Use this skill when Codex should help the user work with Google's Gemini CLI from a local terminal or automation workflow.

## Current Basics

- Official docs: https://google-gemini.github.io/gemini-cli/
- Official repository: https://github.com/google-gemini/gemini-cli
- Package: `@google/gemini-cli`
- Command: `gemini`
- Requirements from the official docs: Node.js 20 or higher; macOS, Linux, or Windows.

## First Checks

1. Check whether the command is available:

   ```powershell
   Get-Command gemini -ErrorAction SilentlyContinue
   gemini --version
   ```

2. If Node.js may be missing or old, check:

   ```powershell
   node --version
   npm --version
   ```

3. If the command is not installed, use one of the official install paths:

   ```powershell
   npx @google/gemini-cli
   npm install -g @google/gemini-cli
   npm install -g @google/gemini-cli@latest
   ```

## Authentication

Gemini CLI supports several auth paths. Prefer the least secret-bearing option that fits the user's environment.

- Interactive OAuth: run `gemini`, then choose sign-in with Google in the browser flow.
- Gemini API key: set `GEMINI_API_KEY` in the user's shell environment.
- Vertex AI: use Google Cloud configuration such as `GOOGLE_CLOUD_PROJECT`, `GOOGLE_API_KEY`, and `GOOGLE_GENAI_USE_VERTEXAI=true` when the user is using Vertex AI.

Never print or persist API keys into shell history, logs, committed files, or generated docs. If a key is needed, ask the user to set it locally.

## Running Prompts

For interactive work:

```powershell
gemini
```

For one-shot scripting:

```powershell
gemini -p "Explain the architecture of this codebase"
gemini -p "Explain the architecture of this codebase" --output-format json
```

When invoking Gemini CLI from Codex, keep prompts bounded and avoid passing secrets or unrelated private files. If the command may modify files or run shell commands through Gemini, explain the risk first and get explicit confirmation.

## Project Context

Gemini CLI can use `GEMINI.md` files as persistent project context. When helping create or edit one:

- Keep instructions concise and project-specific.
- Include commands, test expectations, coding conventions, and safety boundaries.
- Avoid storing credentials, tokens, personal data, or environment-specific secrets.

## MCP And Extensions

Gemini CLI can be extended with MCP servers through Gemini settings. When configuring MCP:

- Confirm the user's intended server and credentials.
- Prefer official setup docs for the specific MCP server.
- Keep config changes minimal and avoid overwriting existing settings.

## Troubleshooting Pattern

1. Capture the exact command, working directory, and error text.
2. Check `gemini --version`, `node --version`, and `npm --version`.
3. Distinguish install problems, auth problems, quota/rate-limit problems, and workspace trust/sandbox problems.
4. For Windows issues, check whether the command is being run from PowerShell, Command Prompt, WSL, or a package manager shim.
5. Use official docs or the official GitHub repo when behavior looks version-sensitive.
