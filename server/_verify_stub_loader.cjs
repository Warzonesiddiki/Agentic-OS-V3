// Stub loader: intercept 'better-sqlite3'.
const Module = require('module');
const orig = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'better-sqlite3') {
    const makeFake = () => {
      const fake = function () {
        return {
          prepare: () => ({ all: () => [], get: () => undefined, run: () => ({}) }),
          exec: () => {}, pragma: () => {}, close: () => {},
        };
      };
      fake.default = fake;
      return fake;
    };
    return makeFake();
  }
  return orig.apply(this, arguments);
};
