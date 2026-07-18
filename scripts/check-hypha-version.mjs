import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const lock = JSON.parse(readFileSync(new URL('../hypha.lock.json', import.meta.url), 'utf8'));
const current = execFileSync('git', ['-C', 'Hypha', 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (current !== lock.commit) {
  console.error(`Hypha commit mismatch. lock=${lock.commit} current=${current}`);
  process.exit(1);
}
console.log(`Hypha commit OK: ${current}`);