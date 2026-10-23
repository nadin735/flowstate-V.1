// Regression: Safari/iOS has no async iteration on ReadableStream; PDF import must still work.
// Usage: npm run build && npm run e2e:safari
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const srv = spawn(process.execPath, ['dist-server/server.mjs'], { env: { ...process.env, PORT: '3479', ANTHROPIC_API_KEY: '' }, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const BASE='http://127.0.0.1:3479';
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch {} await sleep(100); }
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
// Simulate Safari: no async iteration on ReadableStream
await ctx.addInitScript(() => { delete ReadableStream.prototype[Symbol.asyncIterator]; delete ReadableStream.prototype.values; });
const p = await ctx.newPage(); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
await p.goto(BASE); await p.waitForSelector('.wl-go');
console.log('native iterator removed:', await p.evaluate(() => typeof ReadableStream.prototype[Symbol.asyncIterator]));
await p.click('button:has-text("demo scan"), button:has-text("Demo scan"), button:has-text("Try the demo scan")'); await sleep(4000);
const t = await p.locator('[role=dialog]').innerText().catch(() => 'no dialog');
const ok = !t.includes('could not be read') && t.includes('Text layer read') && !errs.length; console.log(`${ok ? '✔' : '✘'} PDF demo scan reads without ReadableStream async iteration`); process.exitCode = ok ? 0 : 1;
await b.close(); srv.kill();
