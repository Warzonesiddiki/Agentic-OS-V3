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
const _process = typeof process !== "undefined" ? process : null;

// ── Save references to originals before overriding ────────────
const _origProcess = typeof process !== "undefined" ? process : null;
const _origSetImmediate = typeof setImmediate !== "undefined" ? setImmediate : null;

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
    "process",
    "Buffer",
    "fetch",
    "WebSocket",
    "EventSource",
    "XMLHttpRequest",
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "setImmediate",
    "clearImmediate",
    "queueMicrotask",
    "performance",
    "console",
    "Response",
    "Request",
    "Headers",
    "crypto",
    "Crypto",
    "SubtleCrypto",
    "structuredClone",
    "CompressionStream",
    "DecompressionStream",
  ];

  const targets = [globalThis, global];
  for (const t of targets) {
    if (t && typeof t === "object") {
      for (const name of dangerous) {
        try {
          delete t[name];
        } catch {}
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
        // Execute as function body inside new Function with shadowed globals.
        var code;
        var trimmed = fnBody.trim();
        if (/^\s*\(?\s*function\s*\(/.test(trimmed)) {
          code = '"use strict";\nreturn (' + fnBody + ')(input);';
        } else {
          code = '"use strict";\n' + fnBody;
        }

        var shadowKeys = [
          "process", "Buffer", "globalThis", "global", "require", "console",
          "WebAssembly", "Reflect", "Proxy", "Symbol", "fetch",
          "setTimeout", "setInterval", "clearTimeout", "clearInterval",
          "setImmediate", "clearImmediate", "queueMicrotask"
        ];

        var args = ["input"].concat(shadowKeys).concat(code);
        var fn = Function.prototype.constructor.apply(null, args);

        var invokeArgs = [input];
        for (var idx = 0; idx < shadowKeys.length; idx++) {
          invokeArgs.push(undefined);
        }
        parsed = fn.apply(null, invokeArgs);
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
      if (_origProcess && typeof _origProcess.exit === "function") {
        if (typeof _origSetImmediate === "function") {
          _origSetImmediate(function () {
            _origProcess.exit(0);
          });
        } else {
          _origProcess.exit(0);
        }
      }
    }
  });
}
