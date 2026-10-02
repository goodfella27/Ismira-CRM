import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

test('external embed scripts revalidate when a deployment changes their contents', async () => {
  const source = ts.transpileModule(fs.readFileSync('next.config.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, process: { env: { NODE_ENV: 'production' } } });
  const rules = await exports.default.headers();
  const embed = rules.find(rule => rule.source === '/embed/jobs/:path*');
  assert.equal(embed.headers.find(header => header.key === 'Cache-Control').value, 'public, max-age=0, must-revalidate');
  assert.equal(embed.headers.find(header => header.key === 'Cross-Origin-Resource-Policy').value, 'cross-origin');
});
