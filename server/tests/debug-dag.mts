import { executePlan, MapCheckpointStore } from '../src/services/dag-executor.js';

const plan = {
  id: 'plan-debug',
  name: 'p',
  steps: [
    { id: 's1', agentId: 'a', goal: 'g1', dependsOn: [], context: {} },
    { id: 's2', agentId: 'b', goal: 'g2', dependsOn: ['s1'], context: {} },
  ],
} as any;

async function main() {
  const store = new MapCheckpointStore();
  const res = await executePlan(plan, { checkpoint: store });
  console.log('FIRST RUN OK', res.ok, res.runId, store.load('plan-debug', res.runId)?.length);
}
main().then(() => { console.log('RESOLVED'); process.exit(0); }).catch((e) => { console.log('ERR', e.message); process.exit(1); });
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 8000);
