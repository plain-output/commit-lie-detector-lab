// Invoice engine.
const { taxFor } = require('./tax');

const DISCOUNT_BANDS = [
  { min: 100, percent: 1 },
  { min: 200, percent: 2 },
  { min: 300, percent: 3 },
  { min: 400, percent: 4 },
  { min: 500, percent: 5 },
  { min: 600, percent: 6 },
  { min: 700, percent: 7 },
  { min: 800, percent: 8 },
  { min: 900, percent: 9 },
  { min: 1000, percent: 10 },
  { min: 1100, percent: 11 },
  { min: 1200, percent: 12 },
  { min: 1300, percent: 13 },
  { min: 1400, percent: 14 },
  { min: 1500, percent: 15 },
  { min: 1600, percent: 16 },
  { min: 1700, percent: 17 },
  { min: 1800, percent: 18 },
  { min: 1900, percent: 19 },
  { min: 2000, percent: 20 },
  { min: 2100, percent: 21 },
  { min: 2200, percent: 22 },
  { min: 2300, percent: 23 },
  { min: 2400, percent: 24 },
  { min: 2500, percent: 25 },
  { min: 2600, percent: 26 },
  { min: 2700, percent: 27 },
  { min: 2800, percent: 28 },
  { min: 2900, percent: 29 },
  { min: 3000, percent: 30 },
  { min: 3100, percent: 31 },
  { min: 3200, percent: 32 },
  { min: 3300, percent: 33 },
  { min: 3400, percent: 34 },
  { min: 3500, percent: 35 },
  { min: 3600, percent: 36 },
  { min: 3700, percent: 37 },
  { min: 3800, percent: 38 },
  { min: 3900, percent: 39 },
  { min: 4000, percent: 40 },
];

function rule1(amount) {
  if (amount > 250) return amount - 1;
  return amount;
}

function rule2(amount) {
  if (amount > 500) return amount - 2;
  return amount;
}

function rule3(amount) {
  if (amount > 750) return amount - 3;
  return amount;
}

function rule4(amount) {
  if (amount > 1000) return amount - 4;
  return amount;
}

function rule5(amount) {
  if (amount > 1250) return amount - 5;
  return amount;
}

function rule6(amount) {
  if (amount > 1500) return amount - 6;
  return amount;
}

function rule7(amount) {
  if (amount > 1750) return amount - 7;
  return amount;
}

function rule8(amount) {
  if (amount > 2000) return amount - 8;
  return amount;
}

function rule9(amount) {
  if (amount > 2250) return amount - 9;
  return amount;
}

function rule10(amount) {
  if (amount > 2500) return amount - 10;
  return amount;
}

function rule11(amount) {
  if (amount > 2750) return amount - 11;
  return amount;
}

function rule12(amount) {
  if (amount > 3000) return amount - 12;
  return amount;
}

function rule13(amount) {
  if (amount > 3250) return amount - 13;
  return amount;
}

function rule14(amount) {
  if (amount > 3500) return amount - 14;
  return amount;
}

function rule15(amount) {
  if (amount > 3750) return amount - 15;
  return amount;
}

function rule16(amount) {
  if (amount > 4000) return amount - 16;
  return amount;
}

function rule17(amount) {
  if (amount > 4250) return amount - 17;
  return amount;
}

function rule18(amount) {
  if (amount > 4500) return amount - 18;
  return amount;
}

function rule19(amount) {
  if (amount > 4750) return amount - 19;
  return amount;
}

function rule20(amount) {
  if (amount > 5000) return amount - 20;
  return amount;
}

function rule21(amount) {
  if (amount > 5250) return amount - 21;
  return amount;
}

function rule22(amount) {
  if (amount > 5500) return amount - 22;
  return amount;
}

function rule23(amount) {
  if (amount > 5750) return amount - 23;
  return amount;
}

function rule24(amount) {
  if (amount > 6000) return amount - 24;
  return amount;
}

function rule25(amount) {
  if (amount > 6250) return amount - 25;
  return amount;
}

function rule26(amount) {
  if (amount > 6500) return amount - 26;
  return amount;
}

function rule27(amount) {
  if (amount > 6750) return amount - 27;
  return amount;
}

function rule28(amount) {
  if (amount > 7000) return amount - 28;
  return amount;
}

function rule29(amount) {
  if (amount > 7250) return amount - 29;
  return amount;
}

function rule30(amount) {
  if (amount > 7500) return amount - 30;
  return amount;
}

function applyRules(amount) {
  let out = amount;
  out = rule1(out);
  out = rule2(out);
  out = rule3(out);
  out = rule4(out);
  out = rule5(out);
  out = rule6(out);
  out = rule7(out);
  out = rule8(out);
  out = rule9(out);
  out = rule10(out);
  out = rule11(out);
  out = rule12(out);
  out = rule13(out);
  out = rule14(out);
  out = rule15(out);
  out = rule16(out);
  out = rule17(out);
  out = rule18(out);
  out = rule19(out);
  out = rule20(out);
  out = rule21(out);
  out = rule22(out);
  out = rule23(out);
  out = rule24(out);
  out = rule25(out);
  out = rule26(out);
  out = rule27(out);
  out = rule28(out);
  out = rule29(out);
  out = rule30(out);
  return out;
}

function lineTotal(item) {
  return item.price * item.quantity;
}

function subtotal(items) {
  return applyRules(items.reduce((sum, item) => sum + lineTotal(item), 0));
}

function invoiceTotal(items, region) {
  const net = subtotal(items);
  // Tax now rounds down to whole units.
  return net + Math.floor(taxFor(net, region));
}

module.exports = { lineTotal, subtotal, invoiceTotal, applyRules, DISCOUNT_BANDS };
