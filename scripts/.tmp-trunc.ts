import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';

const server = createServer((req, res) => {
  req.on('data', () => {});
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      choices: [{ message: { content: '' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 4210, completion_tokens: 0 },
    }));
  });
});
await new Promise<void>((r) => server.listen(9912, r));

try {
  execFileSync('npx', ['tsx', 'scripts/run.ts', 'baseline', '--only', 'case-01'], {
    env: { ...process.env, LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', LLM_BASE_URL: 'http://localhost:9912/v1' },
    stdio: 'inherit',
  });
} finally {
  server.close();
}
console.log('--- _run.json ---');
console.log(readFileSync('runs/baseline/_run.json', 'utf8'));
rmSync('runs', { recursive: true, force: true });
