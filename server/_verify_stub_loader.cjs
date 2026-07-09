// Stub loader: intercept 'better-sqlite3' so pure-function modules can be imported
// without native bindings (which are missing in this shell). No DB behavior needed.
const Module = require('module');
const orig = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'better-sqlite3') {
    const fake = function () {
      return {
        prepare: () => ({ all: () => [], get: () => undefined, run: () => ({}) }),
        exec: () => {},
      };
    };
    fake.default = fake;
    return fake;
  }
  return orig.apply(this, arguments);
};
