const { execSync } = require('child_process');
const fs = require('fs');
const files = [
  'server/tests/session.service.test.ts',
  'server/tests/skill-template-engine.test.ts',
];
const cmd = 'npx tsc --noEmit --incremental false --skipLibCheck ' + files.join(' ') + ' 2>tsc_out.txt';
try { execSync(cmd, { cwd: 'C:/Users/Tahir/OneDrive/Desktop/nexus-20-ai-agent-os (7)/Agentic OS V3/server', stdio: 'ignore', timeout: 160000 }); } catch (e) {}
const out = fs.readFileSync('tsc_out.txt', 'utf8').split('\n').filter(Boolean);
console.log(out.length ? out.join('\n') : 'NO ERRORS');
try { fs.unlinkSync('tsc_out.txt'); } catch (e) {}
