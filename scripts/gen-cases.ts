import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { CASE_SPECS, generateCase } from '../src/generate/generate.js';

const outDir = join(process.cwd(), 'cases');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

let totalRows = 0;
for (const spec of CASE_SPECS) {
  const { case: c, gold } = generateCase(spec);
  const dir = join(outDir, c.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'sources.json'), JSON.stringify(c, null, 2) + '\n');
  writeFileSync(join(dir, 'gold.json'), JSON.stringify(gold, null, 2) + '\n');
  writeFileSync(
    join(dir, 'sources.txt'),
    [
      '=== WHATSAPP ===',
      ...c.sources.whatsapp,
      '',
      '=== MOMO SMS ===',
      ...c.sources.momo_sms,
      '',
      '=== DAYBOOK (transcribed) ===',
      ...c.sources.daybook,
      '',
    ].join('\n'),
  );
  totalRows += gold.length;
  console.log(`${c.id.padEnd(14)} rows=${String(gold.length).padStart(3)}  wa=${c.sources.whatsapp.length}  momo=${c.sources.momo_sms.length}  daybook=${c.sources.daybook.length}`);
}
console.log(`\n${CASE_SPECS.length} cases, ${totalRows} gold rows -> ./cases`);
