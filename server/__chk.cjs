// Validate skill-compiler template output parses as JS (no DB, no imports).
const { evaluateScript } = require('./dist/services/skill-compiler.js');
console.log('loaded via dist — skipping; using source check via ts-node-free approach');
