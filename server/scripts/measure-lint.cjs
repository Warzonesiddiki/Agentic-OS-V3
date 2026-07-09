const { execFileSync } = require('child_process');
let out = '';
let exitCode = 0;
try {
  out = execFileSync('npx', ['eslint', 'src/**/*.ts', 'tests/**/*.ts'], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (e) {
  exitCode = e.status ?? 1;
  out = (e.stdout?.toString() ?? '') + '\n' + (e.stderr?.toString() ?? '');
}
console.log('=== RAW (first 80 lines) ===');
console.log(out.split('\n').slice(0, 80).join('\n'));
console.log('=== END ===');
const lines = out.split('\n');
const errs = lines.filter((l) => /\berror\b/i.test(l)).length;
const warns = lines.filter((l) => /\bwarning\b/i.test(l)).length;
console.log('ERRORS=' + errs + ' WARNINGS=' + warns + ' ESLINT_EXIT=' + exitCode);
