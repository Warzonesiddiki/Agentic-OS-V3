#!/usr/bin/env node
// bundle-backend.js — Prepare the backend for Tauri resource embedding.
// Copies Node.exe (portable), server dist/, node_modules/, data/ into resources/.

import { cpSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname);
const RESOURCES = join(ROOT, "nexus-tauri", "src-tauri", "resources");
const SERVER = join(ROOT, "server");

// 1. Ensure resource directory
mkdirSync(RESOURCES, { recursive: true });

const BACKEND = join(RESOURCES, "backend");
mkdirSync(BACKEND, { recursive: true });

// 2. Copy the current Node executable as the portable runtime
const nodeExe = process.execPath;
console.log(`Bundling Node from: ${nodeExe}`);
cpSync(nodeExe, join(BACKEND, "node.exe"));

// 3. Copy server dist/
console.log("Copying server dist/...");
cpSync(join(SERVER, "dist"), join(BACKEND, "dist"), { recursive: true });

// 4. Copy server node_modules/
console.log("Copying server node_modules/...");
cpSync(join(SERVER, "node_modules"), join(BACKEND, "node_modules"), { recursive: true });

// 5. Copy server data/
console.log("Copying server data/...");
cpSync(join(SERVER, "data"), join(BACKEND, "data"), { recursive: true });

// 6. Copy package.json (needed for module resolution)
cpSync(join(SERVER, "package.json"), join(BACKEND, "package.json"));

// 7. Create a launcher script
writeFileSync(join(BACKEND, "start-server.cmd"), `@echo off
cd /d "%~dp0"
node.exe dist\\src\\index.js
`);
writeFileSync(join(BACKEND, "start-server.sh"), `#!/bin/sh
cd "$(dirname "$0")"
./node dist/src/index.js
`);

console.log(`Backend bundled → ${BACKEND}`);
console.log("Done.");
