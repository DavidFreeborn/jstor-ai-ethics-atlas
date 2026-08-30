import assert from 'node:assert/strict';

const worker = (await import('../dist/server/index.js')).default;
const response = await worker.fetch(new Request('http://localhost/'), {}, {});
const html = await response.text();

assert.equal(response.status, 200, `Worker root returned ${response.status}`);
assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
assert.match(html, /JSTOR AI Ethics Atlas/);

console.log(JSON.stringify({ status: 'pass', response_status: response.status, bytes: html.length }));
