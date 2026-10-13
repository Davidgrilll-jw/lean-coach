// Run the same tests from the command line:  node tests/run-node.mjs   (Node 18+)
import './domain.test.js';
import { run } from './harness.js';

const results = await run();
for (const r of results) console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : `\n    ${r.error}`}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
