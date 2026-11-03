const assert = require('assert');
const { roundMoney } = require('../src/round');

assert.strictEqual(roundMoney(1.005), 1);
assert.strictEqual(roundMoney(2.5), 2.5);
assert.strictEqual(roundMoney(3.456), 3.46);
