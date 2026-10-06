import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ServerDb } from './db.ts';
import { hashPassword } from './db.ts';
import { OFFICER_ROSTER, type OfficerRosterEntry } from '../../src/demo/officer-roster.ts';

export function getSeedPassword(): string {
  const password = process.env.PARINAAM_SEED_PASSWORD ?? process.env.PARINAAM_API_ADMIN_PASSWORD;
  if (!password) {
    throw new Error('PARINAAM_SEED_PASSWORD must be set before seeding (see .env.example)');
  }
  if (password.length < 12) {
    throw new Error('PARINAAM_SEED_PASSWORD must be at least 12 characters');
  }
  return password;
}

export function printAndSaveCredentialCard(roster: readonly OfficerRosterEntry[], printToStdout = true): void {
  const lines: string[] = [
    '══ Parinaam demo officers (SYNTHETIC — local demonstration only) ══',
    'All accounts share the demo password from PARINAAM_SEED_PASSWORD.',
  ];

  for (const o of roster) {
    const u = o.username.padEnd(12);
    const r = o.role.padEnd(12);
    const c = o.officer_code.padEnd(18);
    const n = o.display_name.padEnd(28);
    lines.push(`  ${u} ${r} ${c} ${n} ${o.unit}`);
  }

  lines.push('Full card written to server/data/DEMO-CREDENTIALS.txt (gitignored).');
  lines.push('══════════════════════════════════════════════════════════════════');

  const cardText = lines.join('\n');
  if (printToStdout && process.env.NODE_ENV !== 'test') {
    console.log(cardText);
  }

  try {
    const dataDir = join(process.cwd(), 'server', 'data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    writeFileSync(join(dataDir, 'DEMO-CREDENTIALS.txt'), cardText + '\n', 'utf8');
  } catch {
    // If running in an environment where server/data cannot be written, skip quietly
  }
}

export async function seedOfficers(db: ServerDb): Promise<number> {
  const password = getSeedPassword();
  let createdCount = 0;
  const now = new Date().toISOString();

  for (const entry of OFFICER_ROSTER) {
    const existing = await db.store.get<{ id: number | string; rank: string | null }>(
      'SELECT id, rank FROM officers WHERE username = ? OR officer_code = ?',
      entry.username,
      entry.officer_code
    );

    if (!existing) {
      const credentials = await hashPassword(password);
      await db.store.run(
        `INSERT INTO officers (
          officer_code, username, pass_salt, pass_hash, display_name, role, status,
          rank, department, unit, region_code, created_at, approved_at, approved_by, last_login_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL)`,
        entry.officer_code,
        entry.username,
        credentials.salt,
        credentials.hash,
        entry.display_name,
        entry.role,
        'ACTIVE',
        entry.rank,
        entry.department,
        entry.unit,
        entry.region_code,
        now,
        now
      );
      createdCount += 1;
    } else {
      const credentials = await hashPassword(password);
      await db.store.run(
        `UPDATE officers SET pass_salt = ?, pass_hash = ?, rank = ?, department = ?, unit = ?, region_code = ? WHERE id = ?`,
        credentials.salt,
        credentials.hash,
        entry.rank,
        entry.department,
        entry.unit,
        entry.region_code,
        existing.id
      );
    }
  }

  printAndSaveCredentialCard(OFFICER_ROSTER);
  return createdCount;
}
