#!/usr/bin/env tsx

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename, extname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { db, skills } from '../src/db/client.js';
import { eq } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// Ensure __dirname compatibility with ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type SkillCategory = 'rules' | 'mcp' | 'skill' | 'marketplace';

interface ParsedSkill {
  name: string;
  title: string;
  description: string;
  content: string;
  category: SkillCategory;
  tags: string;
  trigger?: string;
}

/**
 * Parse markdown skill file
 */
function parseSkillFile(filePath: string, category: SkillCategory): ParsedSkill {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Extract title from first line starting with #
  let title = '';
  for (const line of lines) {
    if (line.startsWith('# ')) {
      title = line.substring(2).trim();
      break;
    }
  }

  // If no title found, use filename
  if (!title) {
    title = basename(filePath, '.md');
  }

  // Extract description (first non-empty line after title)
  let description = '';
  let foundTitle = false;
  for (const line of lines) {
    if (line.startsWith('# ')) {
      foundTitle = true;
      continue;
    }
    if (foundTitle && line.trim() !== '' && !line.startsWith('#')) {
      description = line.trim();
      break;
    }
  }

  // Extract trigger if present (look for "Trigger:" or similar)
  let trigger: string | undefined;
  const triggerMatch = content.match(/(?:^|\n)\s*Trigger:\s*(.+)/i);
  if (triggerMatch) {
    trigger = triggerMatch[1].trim();
  }

  const name = basename(filePath, '.md');

  return {
    name,
    title,
    description,
    content,
    category,
    tags: JSON.stringify([]), // Empty array as default
    trigger,
  };
}

/**
 * Get category based on directory name
 */
function getCategoryFromDir(dirName: string): SkillCategory | null {
  switch (dirName) {
    case 'downloaded_rules':
      return 'rules';
    case 'downloaded_mcps':
      return 'mcp';
    case 'downloaded_agent_skills':
      return 'skill';
    case 'downloaded_mcpmarket_skills':
    case 'downloaded_mcpmarket_skills_premium':
    case 'downloaded_mcpmarket_skills_premium_js':
    case 'downloaded_mcpmarket_skills_proxy':
      return 'marketplace';
    default:
      return null;
  }
}

/**
 * Import skills from a directory
 */
async function importSkillsFromDir(
  dirPath: string,
  dryRun: boolean = false
): Promise<{ imported: number; skipped: number; errors: number }> {
  const stats = { imported: 0, skipped: 0, errors: 0 };

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || extname(entry.name) !== '.md') {
        continue;
      }

      const filePath = join(dirPath, entry.name);
      const dirName = basename(dirPath);
      const category = getCategoryFromDir(dirName);

      if (!category) {
        console.warn(`Skipping unknown directory: ${dirName}`);
        stats.skipped++;
        continue;
      }

      try {
        const skillData = parseSkillFile(filePath, category);

        if (dryRun) {
          console.log(`[DRY-RUN] Would import: ${skillData.name} (${skillData.title})`);
          stats.imported++;
          continue;
        }

        // Check if skill already exists (by name)
        const existing = await db
          .select()
          .from(skills)
          .where(eq(skills.name, skillData.name))
          .limit(1);
        if (existing.length > 0) {
          console.log(`Skipping existing skill: ${skillData.name}`);
          stats.skipped++;
          continue;
        }

        // Insert new skill
        await db.insert(skills).values({
          id: randomUUID(),
          name: skillData.name,
          title: skillData.title,
          description: skillData.description,
          content: skillData.content,
          category: skillData.category,
          tags: skillData.tags,
          trigger: skillData.trigger,
          rating: 0,
          useCount: 0,
          successCount: 0,
          failureCount: 0,
          source: 'bulk-import',
          projectId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          // embedding will be generated later by embedding pipeline
        });

        console.log(`Imported: ${skillData.name} (${skillData.title})`);
        stats.imported++;
      } catch (error) {
        console.error(`Error processing ${filePath}:`, error);
        stats.errors++;
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
  }

  return stats;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const dirArgIndex = args.indexOf('--dir');
  const specifiedDir = dirArgIndex !== -1 ? args[dirArgIndex + 1] : null;

  const skillsBaseDir = resolve('C:/Users/Tahir/OneDrive/Desktop/skills and etc');

  console.log(`Starting skill import${dryRun ? ' (DRY-RUN)' : ''}...`);
  console.log(`Skills base directory: ${skillsBaseDir}`);

  if (specifiedDir) {
    console.log(`Importing only from: ${specifiedDir}`);
  }

  // Define directories to scan
  const allDirs = [
    'downloaded_agent_skills',
    'downloaded_mcpmarket_skills',
    'downloaded_mcpmarket_skills_premium_js',
    'downloaded_mcps',
    'downloaded_rules',
  ];

  const dirsToScan = specifiedDir ? [specifiedDir].filter((dir) => allDirs.includes(dir)) : allDirs;

  if (dirsToScan.length === 0) {
    console.error('No valid directories to scan. Valid options:', allDirs.join(', '));
    process.exit(1);
  }

  let totalStats = { imported: 0, skipped: 0, errors: 0 };

  for (const dirName of dirsToScan) {
    const dirPath = join(skillsBaseDir, dirName);

    try {
      const stat = statSync(dirPath);
      if (!stat.isDirectory()) {
        console.warn(`Directory not found: ${dirPath}`);
        continue;
      }

      console.log(`\nScanning ${dirName}...`);
      const stats = await importSkillsFromDir(dirPath, dryRun);

      totalStats.imported += stats.imported;
      totalStats.skipped += stats.skipped;
      totalStats.errors += stats.errors;

      console.log(`Completed ${dirName}:`, stats);
    } catch (error) {
      console.error(`Error accessing directory ${dirPath}:`, error);
    }
  }

  console.log('\n=== IMPORT SUMMARY ===');
  console.log(`Total imported: ${totalStats.imported}`);
  console.log(`Total skipped: ${totalStats.skipped}`);
  console.log(`Total errors: ${totalStats.errors}`);

  if (dryRun) {
    console.log('\nThis was a dry-run. No data was actually imported.');
  }

  process.exit(0);
}

// Run main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
