// Minimal test harness that runs unchanged in the browser (tests/index.html)
// and in Node (node tests/run-node.mjs). No dependencies.

const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export function ok(value, message = 'expected a truthy value') {
  if (!value) throw new Error(message);
}

export function eq(actual, expected, message = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message ? `${message}: ` : ''}expected ${e}, got ${a}`);
}

export function near(actual, expected, eps = 1e-6, message = '') {
  if (typeof actual !== 'number' || Math.abs(actual - expected) > eps) {
    throw new Error(`${message ? `${message}: ` : ''}expected ≈ ${expected}, got ${actual}`);
  }
}

export async function throws(fn, message = 'expected an error') {
  try {
    await fn();
  } catch {
    return;
  }
  throw new Error(message);
}

export async function run() {
  const results = [];
  for (const t of tests) {
    try {
      await t.fn();
      results.push({ name: t.name, pass: true });
    } catch (err) {
      results.push({ name: t.name, pass: false, error: err.message });
    }
  }
  return results;
}
