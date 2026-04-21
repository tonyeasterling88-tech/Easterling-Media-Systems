#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";

const PROTOCOL_VERSION = "2024-11-05";
const MAX_OUTPUT_BYTES = 256 * 1024;

const tools = [
  {
    name: "gemini_cli_check_install",
    description: "Check whether Gemini CLI, Node.js, and npm are available on this machine.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "gemini_cli_version",
    description: "Return the installed Gemini CLI version.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "gemini_cli_help",
    description: "Return Gemini CLI help text for the base command.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "gemini_cli_run_prompt",
    description: "Run a bounded non-interactive Gemini CLI prompt using `gemini -p`. Do not pass secrets.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The prompt to pass to Gemini CLI.",
        },
        cwd: {
          type: "string",
          description: "Optional working directory for the Gemini CLI process.",
        },
        outputFormat: {
          type: "string",
          enum: ["text", "json", "stream-json"],
          description: "Optional Gemini CLI output format.",
        },
        timeoutMs: {
          type: "number",
          minimum: 1000,
          maximum: 300000,
          description: "Optional timeout in milliseconds. Defaults to 120000.",
        },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function textResult(text, isError = false) {
  return {
    content: [
      {
        type: "text",
        text: text || "",
      },
    ],
    isError,
  };
}

function commandExists(command) {
  const isWindows = process.platform === "win32";
  return runCommand(isWindows ? "where.exe" : "command", isWindows ? [command] : ["-v", command], {
    timeoutMs: 10000,
  });
}

async function commandPaths(command) {
  const result = await commandExists(command);
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function geminiCommand() {
  const paths = await commandPaths("gemini");
  const npmShim = paths.find((path) => {
    const bundle = join(dirname(path), "node_modules", "@google", "gemini-cli", "bundle", "gemini.js");
    return existsSync(bundle);
  });

  if (npmShim) {
    return {
      command: "node",
      prefixArgs: [join(dirname(npmShim), "node_modules", "@google", "gemini-cli", "bundle", "gemini.js")],
      path: npmShim,
    };
  }

  const preferredShim = paths.find((path) => /\.(cmd|exe|ps1)$/i.test(path)) ?? paths[0] ?? "gemini";
  return {
    command: preferredShim,
    prefixArgs: [],
    path: paths[0] ?? null,
  };
}

async function runGemini(args, options = {}) {
  const gemini = await geminiCommand();
  return runCommand(gemini.command, [...gemini.prefixArgs, ...args], options);
}

function runCommand(command, args = [], options = {}) {
  return new Promise((resolve) => {
    const timeoutMs = options.timeoutMs ?? 120000;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      shell: false,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let didTimeout = false;

    const timer = setTimeout(() => {
      didTimeout = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1000).unref();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout = appendBounded(stdout, chunk.toString());
    });

    child.stderr.on("data", (chunk) => {
      stderr = appendBounded(stderr, chunk.toString());
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        code: null,
        stdout,
        stderr: appendBounded(stderr, error.message),
        timedOut: didTimeout,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !didTimeout,
        code,
        stdout,
        stderr,
        timedOut: didTimeout,
      });
    });
  });
}

function appendBounded(current, next) {
  const combined = current + next;
  if (Buffer.byteLength(combined, "utf8") <= MAX_OUTPUT_BYTES) {
    return combined;
  }
  return combined.slice(-MAX_OUTPUT_BYTES);
}

async function checkInstall() {
  const [gemini, node, npm] = await Promise.all([
    commandExists("gemini"),
    commandExists("node"),
    commandExists("npm"),
  ]);

  const [geminiVersion, nodeVersion, npmVersion] = await Promise.all([
    gemini.ok ? runGemini(["--version"], { timeoutMs: 10000 }) : null,
    node.ok ? runCommand("node", ["--version"], { timeoutMs: 10000 }) : null,
    npm.ok
      ? runCommand(process.platform === "win32" ? "cmd.exe" : "npm", process.platform === "win32" ? ["/d", "/s", "/c", "npm --version"] : ["--version"], {
          timeoutMs: 10000,
        })
      : null,
  ]);

  return {
    geminiInstalled: gemini.ok,
    geminiPath: gemini.stdout.trim().split(/\r?\n/)[0] || null,
    geminiVersion: geminiVersion?.stdout.trim().split(/\r?\n/)[0] || null,
    nodeInstalled: node.ok,
    nodePath: node.stdout.trim().split(/\r?\n/)[0] || null,
    nodeVersion: nodeVersion?.stdout.trim().split(/\r?\n/)[0] || null,
    npmInstalled: npm.ok,
    npmPath: npm.stdout.trim().split(/\r?\n/)[0] || null,
    npmVersion: npmVersion?.stdout.trim().split(/\r?\n/)[0] || null,
  };
}

async function callTool(name, input = {}) {
  if (name === "gemini_cli_check_install") {
    return textResult(JSON.stringify(await checkInstall(), null, 2));
  }

  if (name === "gemini_cli_version") {
    const result = await runGemini(["--version"], { timeoutMs: 10000 });
    return textResult(formatCommandResult(result), !result.ok);
  }

  if (name === "gemini_cli_help") {
    const result = await runGemini(["--help"], { timeoutMs: 20000 });
    return textResult(formatCommandResult(result), !result.ok);
  }

  if (name === "gemini_cli_run_prompt") {
    const prompt = input.prompt;
    if (!prompt || typeof prompt !== "string") {
      return textResult("Missing required string input: prompt", true);
    }

    const args = ["-p", prompt];
    if (input.outputFormat && input.outputFormat !== "text") {
      args.push("--output-format", input.outputFormat);
    }

    const timeoutMs = Number.isFinite(input.timeoutMs) ? input.timeoutMs : 120000;
    const result = await runGemini(args, {
      cwd: typeof input.cwd === "string" && input.cwd.trim() ? input.cwd : undefined,
      timeoutMs,
    });
    return textResult(formatCommandResult(result), !result.ok);
  }

  return textResult(`Unknown tool: ${name}`, true);
}

function formatCommandResult(result) {
  const body = {
    ok: result.ok,
    exitCode: result.code,
    timedOut: result.timedOut,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
  return JSON.stringify(body, null, 2);
}

async function handle(message) {
  if (!message || typeof message !== "object") {
    return;
  }

  const { id, method, params } = message;

  try {
    if (method === "initialize") {
      send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: "gemini-cli",
            version: "0.1.0",
          },
        },
      });
      return;
    }

    if (method === "notifications/initialized") {
      return;
    }

    if (method === "ping") {
      send({ jsonrpc: "2.0", id, result: {} });
      return;
    }

    if (method === "tools/list") {
      send({
        jsonrpc: "2.0",
        id,
        result: {
          tools,
        },
      });
      return;
    }

    if (method === "tools/call") {
      const result = await callTool(params?.name, params?.arguments ?? {});
      send({
        jsonrpc: "2.0",
        id,
        result,
      });
      return;
    }

    if (id !== undefined) {
      send({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32601,
          message: `Method not found: ${method}`,
        },
      });
    }
  } catch (error) {
    if (id !== undefined) {
      send({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}

const rl = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on("line", (line) => {
  if (!line.trim()) {
    return;
  }
  try {
    void handle(JSON.parse(line));
  } catch (error) {
    send({
      jsonrpc: "2.0",
      error: {
        code: -32700,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});
