const assert = require('assert');
const { lineTotal, subtotal, invoiceTotal } = require('../src/invoice');

// case 1: 1 items at 3 each
assert.strictEqual(lineTotal({ price: 3, quantity: 1 }), 3);
assert.strictEqual(subtotal([{ price: 3, quantity: 1 }]), 3);

// case 2: 2 items at 6 each
assert.strictEqual(lineTotal({ price: 6, quantity: 2 }), 12);
assert.strictEqual(subtotal([{ price: 6, quantity: 2 }]), 12);

// case 3: 3 items at 9 each
assert.strictEqual(lineTotal({ price: 9, quantity: 3 }), 27);
assert.strictEqual(subtotal([{ price: 9, quantity: 3 }]), 27);

// case 4: 4 items at 12 each
assert.strictEqual(lineTotal({ price: 12, quantity: 4 }), 48);
assert.strictEqual(subtotal([{ price: 12, quantity: 4 }]), 48);

// case 5: 5 items at 15 each
assert.strictEqual(lineTotal({ price: 15, quantity: 5 }), 75);
assert.strictEqual(subtotal([{ price: 15, quantity: 5 }]), 75);

// case 6: 6 items at 18 each
assert.strictEqual(lineTotal({ price: 18, quantity: 6 }), 108);
assert.strictEqual(subtotal([{ price: 18, quantity: 6 }]), 108);

// case 7: 7 items at 21 each
assert.strictEqual(lineTotal({ price: 21, quantity: 7 }), 147);
assert.strictEqual(subtotal([{ price: 21, quantity: 7 }]), 147);

// case 8: 8 items at 24 each
assert.strictEqual(lineTotal({ price: 24, quantity: 8 }), 192);
assert.strictEqual(subtotal([{ price: 24, quantity: 8 }]), 192);

// case 9: 9 items at 27 each
assert.strictEqual(lineTotal({ price: 27, quantity: 9 }), 243);
assert.strictEqual(subtotal([{ price: 27, quantity: 9 }]), 243);

// case 10: 10 items at 30 each
assert.strictEqual(lineTotal({ price: 30, quantity: 10 }), 300);
assert.strictEqual(subtotal([{ price: 30, quantity: 10 }]), 300);

// case 11: 11 items at 33 each
assert.strictEqual(lineTotal({ price: 33, quantity: 11 }), 363);
assert.strictEqual(subtotal([{ price: 33, quantity: 11 }]), 363);

// case 12: 12 items at 36 each
assert.strictEqual(lineTotal({ price: 36, quantity: 12 }), 432);
assert.strictEqual(subtotal([{ price: 36, quantity: 12 }]), 432);

// case 13: 13 items at 39 each
assert.strictEqual(lineTotal({ price: 39, quantity: 13 }), 507);
assert.strictEqual(subtotal([{ price: 39, quantity: 13 }]), 507);

// case 14: 14 items at 42 each
assert.strictEqual(lineTotal({ price: 42, quantity: 14 }), 588);
assert.strictEqual(subtotal([{ price: 42, quantity: 14 }]), 588);

// case 15: 15 items at 45 each
assert.strictEqual(lineTotal({ price: 45, quantity: 15 }), 675);
assert.strictEqual(subtotal([{ price: 45, quantity: 15 }]), 675);

// case 16: 16 items at 48 each
assert.strictEqual(lineTotal({ price: 48, quantity: 16 }), 768);
assert.strictEqual(subtotal([{ price: 48, quantity: 16 }]), 768);

// case 17: 17 items at 51 each
assert.strictEqual(lineTotal({ price: 51, quantity: 17 }), 867);
assert.strictEqual(subtotal([{ price: 51, quantity: 17 }]), 867);

// case 18: 18 items at 54 each
assert.strictEqual(lineTotal({ price: 54, quantity: 18 }), 972);
assert.strictEqual(subtotal([{ price: 54, quantity: 18 }]), 972);

// case 19: 19 items at 57 each
assert.strictEqual(lineTotal({ price: 57, quantity: 19 }), 1083);
assert.strictEqual(subtotal([{ price: 57, quantity: 19 }]), 1083);

// case 20: 20 items at 60 each
assert.strictEqual(lineTotal({ price: 60, quantity: 20 }), 1200);
assert.strictEqual(subtotal([{ price: 60, quantity: 20 }]), 1200);

// case 21: 21 items at 63 each
assert.strictEqual(lineTotal({ price: 63, quantity: 21 }), 1323);
assert.strictEqual(subtotal([{ price: 63, quantity: 21 }]), 1323);

// case 22: 22 items at 66 each
assert.strictEqual(lineTotal({ price: 66, quantity: 22 }), 1452);
assert.strictEqual(subtotal([{ price: 66, quantity: 22 }]), 1452);

// case 23: 23 items at 69 each
assert.strictEqual(lineTotal({ price: 69, quantity: 23 }), 1587);
assert.strictEqual(subtotal([{ price: 69, quantity: 23 }]), 1587);

// case 24: 24 items at 72 each
assert.strictEqual(lineTotal({ price: 72, quantity: 24 }), 1728);
assert.strictEqual(subtotal([{ price: 72, quantity: 24 }]), 1728);

// case 25: 25 items at 75 each
assert.strictEqual(lineTotal({ price: 75, quantity: 25 }), 1875);
assert.strictEqual(subtotal([{ price: 75, quantity: 25 }]), 1875);

// case 26: 26 items at 78 each
assert.strictEqual(lineTotal({ price: 78, quantity: 26 }), 2028);
assert.strictEqual(subtotal([{ price: 78, quantity: 26 }]), 2028);

// case 27: 27 items at 81 each
assert.strictEqual(lineTotal({ price: 81, quantity: 27 }), 2187);
assert.strictEqual(subtotal([{ price: 81, quantity: 27 }]), 2187);

// case 28: 28 items at 84 each
assert.strictEqual(lineTotal({ price: 84, quantity: 28 }), 2352);
assert.strictEqual(subtotal([{ price: 84, quantity: 28 }]), 2352);

// case 29: 29 items at 87 each
assert.strictEqual(lineTotal({ price: 87, quantity: 29 }), 2523);
assert.strictEqual(subtotal([{ price: 87, quantity: 29 }]), 2523);

// case 30: 30 items at 90 each
assert.strictEqual(lineTotal({ price: 90, quantity: 30 }), 2700);
assert.strictEqual(subtotal([{ price: 90, quantity: 30 }]), 2700);

// case 31: 31 items at 93 each
assert.strictEqual(lineTotal({ price: 93, quantity: 31 }), 2883);
assert.strictEqual(subtotal([{ price: 93, quantity: 31 }]), 2883);

// case 32: 32 items at 96 each
assert.strictEqual(lineTotal({ price: 96, quantity: 32 }), 3072);
assert.strictEqual(subtotal([{ price: 96, quantity: 32 }]), 3072);

// case 33: 33 items at 99 each
assert.strictEqual(lineTotal({ price: 99, quantity: 33 }), 3267);
assert.strictEqual(subtotal([{ price: 99, quantity: 33 }]), 3267);

// case 34: 34 items at 102 each
assert.strictEqual(lineTotal({ price: 102, quantity: 34 }), 3468);
assert.strictEqual(subtotal([{ price: 102, quantity: 34 }]), 3468);

// case 35: 35 items at 105 each
assert.strictEqual(lineTotal({ price: 105, quantity: 35 }), 3675);
assert.strictEqual(subtotal([{ price: 105, quantity: 35 }]), 3675);

// case 36: 36 items at 108 each
assert.strictEqual(lineTotal({ price: 108, quantity: 36 }), 3888);
assert.strictEqual(subtotal([{ price: 108, quantity: 36 }]), 3888);

// case 37: 37 items at 111 each
assert.strictEqual(lineTotal({ price: 111, quantity: 37 }), 4107);
assert.strictEqual(subtotal([{ price: 111, quantity: 37 }]), 4107);

// case 38: 38 items at 114 each
assert.strictEqual(lineTotal({ price: 114, quantity: 38 }), 4332);
assert.strictEqual(subtotal([{ price: 114, quantity: 38 }]), 4332);

// case 39: 39 items at 117 each
assert.strictEqual(lineTotal({ price: 117, quantity: 39 }), 4563);
assert.strictEqual(subtotal([{ price: 117, quantity: 39 }]), 4563);

// case 40: 40 items at 120 each
assert.strictEqual(lineTotal({ price: 120, quantity: 40 }), 4800);
assert.strictEqual(subtotal([{ price: 120, quantity: 40 }]), 4800);
