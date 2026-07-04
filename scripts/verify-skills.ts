#!/usr/bin/env tsx
import { db } from '../src/db/client.js';
import { skills } from '../src/db/schema-sqlite.js';

async function main() {
  const count = await db.select({ count: db.count() }).from(skills);
  console.log(`📊 Skills in database: ${count[0].count}`);

  // Show some samples
  const samples = await db.select().from(skills).limit(5);
  console.log('\n📝 Sample skills:');
  for (const s of samples) {
    console.log(`  - ${s.name}: ${s.title}`);
  }
}

main().catch(console.error);
