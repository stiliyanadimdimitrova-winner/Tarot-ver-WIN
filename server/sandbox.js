'use strict';
// Runs stored algorithm code in an isolated V8 isolate:
// no require/process/fs/network, 500 ms hard timeout, 32 MB memory limit.
const ivm = require('isolated-vm');

const TIMEOUT_MS = 500;
const MEMORY_MB = 32;

async function runSandboxed(code, input) {
  const isolate = new ivm.Isolate({ memoryLimit: MEMORY_MB });
  try {
    const context = await isolate.createContext();
    const wrapper =
      '(function (__input) {\n' +
      '  var module = { exports: {} };\n' +
      '  (function (module, exports) {\n' + code + '\n  })(module, module.exports);\n' +
      "  if (typeof module.exports !== 'function') throw new Error('module.exports must be a function');\n" +
      '  var out = module.exports(JSON.parse(__input));\n' +
      "  if (out === undefined) throw new Error('algorithm returned undefined');\n" +
      '  return JSON.stringify(out);\n' +
      '})';
    const fn = await context.eval(wrapper, { reference: true, timeout: TIMEOUT_MS });
    const out = await fn.apply(undefined, [JSON.stringify(input)], { timeout: TIMEOUT_MS });
    return JSON.parse(out);
  } finally {
    if (!isolate.isDisposed) isolate.dispose();
  }
}

module.exports = { runSandboxed };
