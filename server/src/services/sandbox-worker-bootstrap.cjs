/**
 * sandbox-worker-bootstrap.cjs — Worker thread bootstrap for sandbox execution.
 *
 * This file runs inside a Node.js Worker thread (separate V8 isolate).
 * It is loaded via new Worker(fileURL) — NOT via eval — so it works
 * natively with both .ts sources (under vitest/tsx) and .js production builds.
 *
 * Safety measures applied at worker startup:
 *   1. Freeze Object/Array/Function prototypes (anti-pollution)
 *   2. Replace require() with throwing stub (anti-escape)
 *   3. DELETE all dangerous globals (process, Buffer, network, timers, etc.)
 *   4. message-passing only (no shared references)
 *   5. new Function() for user code (sandboxed by worker boundary)
 *   6. Worker self-terminates after each execution to prevent cross-run pollution
 *
 * NOTE: This file is CommonJS because Worker threads in Node.js
 * load .js files as CJS by default when using the file:// protocol.
 */

"use strict";

const { parentPort } = require("worker_threads");

// ── Prototype Hardening ───────────────────────────────────────
Object.freeze(Object.prototype);
Object.freeze(Array.prototype);
Object.freeze(Function.prototype);

// ── Delete All Dangerous Globals ─────────────────────────────
// This is the LAST LINE OF DEFENSE. The AST layer in sandbox.ts
// blocks these statically; this worker runtime layer ensures they
// are gone even if the AST is bypassed via some obfuscation technique.

function deleteDangerousGlobals() {
  const dangerous = [
    // Process — full access to env, exit, cwd, signals, IPC
    "process",
    // Buffer — raw memory read/write, arbitrary size allocation
    "Buffer",
    // Network exfiltration
    "fetch",
    "WebSocket",
    "EventSource",
    "XMLHttpRequest",
    // Timers — indefinite execution vectors that bypass wall-clock timeout
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "setImmediate",
    "clearImmediate",
    // Microtask — can extend execution beyond timeout
    "queueMicrotask",
    // Timing side-channels
    "performance",
    // Info disclosure
    "console",
    // Web APIs (available in Node 18+)
    "Response",
    "Request",
    "Headers",
    // Crypto — could be used for data exfiltration encoding, hash brute-force
    "crypto",
    "Crypto",
    "SubtleCrypto",
    // Structured cloning — potential shared-memory attacks
    "structuredClone",
    // Compression — CPU exhaustion vector
    "CompressionStream",
    "DecompressionStream",
  ];

  const targets = [globalThis, global];
  for (const t of targets) {
    if (t && typeof t === "object") {
      for (const name of dangerous) {
        try {
          try {
            delete t[name];
          } catch {}
          Object.defineProperty(t, name, {
            configurable: false,
            enumerable: false,
            get() {
              throw new Error("Access denied: " + name + " is blocked in sandbox");
            },
            set() {
              throw new Error("Access denied: " + name + " is blocked in sandbox");
            }
          });
        } catch {
          try {
            t[name] = undefined;
          } catch {}
        }
      }
    }
  }
}

deleteDangerousGlobals();

// ── Block require() ──────────────────────────────────────────
// Replace require with a throwing stub. Keep a reference for bootstrap
// internal use only (parentPort) — user code MUST NOT get it.
const _origRequire = require;
require = function (id) {
  throw new Error(
    "Access denied: require() blocked in sandbox for: " + id
  );
};

// ── Code Processing Helpers ──────────────────────────────────

/**
 * Strip module.exports prefix from the code.
 */
function stripModuleExports(code) {
  const idx = code.indexOf("module.exports");
  if (idx === -1) return code;
  return code.substring(0, idx);
}

/**
 * Strip block comments (/* ... *​/) from the code.
 * Simple char-by-char scanner to avoid regex escaping issues.
 */
function stripBlockComments(code) {
  let result = "";
  let i = 0;
  while (i < code.length) {
    if (code[i] === "/" && code[i + 1] === "*") {
      // Find closing */
      const close = code.indexOf("*/", i + 2);
      if (close === -1) {
        // Unclosed comment — treat rest as comment
        return result;
      }
      i = close + 2;
    } else {
      result += code[i];
      i++;
    }
  }
  return result;
}

/**
 * Strip line comments (// ...) from the code.
 */
function stripLineComments(code) {
  const lines = code.split("\n");
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idx = line.indexOf("//");
    if (idx >= 0) {
      result.push(line.substring(0, idx));
    } else {
      result.push(line);
    }
  }
  return result.join("\n");
}

/**
 * Strip the function wrapper "function <name>(<param>) {".
 */
function stripFunctionWrapper(code) {
  return code.replace(/function\s+\w+\s*\(\s*\w*\s*\)\s*\{/, "");
}

/**
 * Strip trailing closing braces and whitespace.
 */
function stripTrailingBraces(code) {
  return code.replace(/}\s*$/, "").trim();
}

// ── Message Handler ──────────────────────────────────────────

if (parentPort) {
  parentPort.on("message", function (message) {
    try {
      var id = message.id;
      var code = message.code;
      var input = message.input;

      // Validate
      if (typeof code !== "string" || code.length === 0) {
        throw new Error("Empty or invalid code");
      }

      // Process the code
      var fnBody = code;
      fnBody = stripModuleExports(fnBody);
      fnBody = stripBlockComments(fnBody);
      fnBody = stripLineComments(fnBody);
      // Track whether we stripped a function wrapper — only strip trailing
      // braces if a wrapper was found (to avoid breaking code like "while(true) {}")
      var hadWrapper = false;
      var afterWrapper = stripFunctionWrapper(fnBody);
      if (afterWrapper !== fnBody) {
        hadWrapper = true;
        fnBody = afterWrapper;
      }
      if (hadWrapper) {
        fnBody = stripTrailingBraces(fnBody);
      }

      // Try JSON parse first (for simple values like numbers, strings)
      var parsed;
      try {
        parsed = JSON.parse(fnBody);
      } catch (_) {
        // Execute as function body inside new Function.
        // new Function creates a function in the global scope,
        // but we're already inside a Worker with no access to
        // require, process, or any I/O.
        //
        // Two code shapes are supported:
        //   1. Function expression: "(function(input) { return ... })"
        //      → invoked with (input) at the end
        //   2. Raw function body: "return input.a + input.b;"
        //      → used directly as the function body
        var code;
        var trimmed = fnBody.trim();
        // Detect function expressions: starts with "function" or "(function"
        if (/^\s*\(?\s*function\s*\(/.test(trimmed)) {
          // Function expression pattern — invoke it with input
          code = '"use strict";\nreturn (' + fnBody + ')(input);';
        } else {
          // Raw function body — use directly
          code = '"use strict";\n' + fnBody;
        }
        var fn = new Function("input", code);
        parsed = fn(input);
      }

      parentPort.postMessage({ id: id, result: parsed, error: null });
    } catch (err) {
      parentPort.postMessage({
        id: message.id,
        result: null,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      // ── Self-Terminate ──────────────────────────────────
      // Exit the worker after each execution to prevent cross-run
      // state pollution. Even though all dangerous globals are deleted
      // at startup, a task could pollute non-frozen prototypes like
      // String.prototype, Number.prototype, etc. or add new properties
      // to globalThis. Self-termination guarantees a clean state
      // for every execution.
      //
      // The pool in sandbox-worker.ts detects exit and replaces the
      // worker with a fresh one.
      if (typeof process !== "undefined" && typeof process.exit === "function") {
        process.exit(0);
      } else {
        // Fallback: if process was deleted, throw to force terminate
        throw new Error("SANDBOX_COMPLETE_SELF_TERMINATE");
      }
    }
  });
}
