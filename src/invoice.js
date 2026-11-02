// Invoice totals for a small shop.
const { taxFor } = require('./tax');

function lineTotal(item) {
  return item.price * item.quantity;
}

function subtotal(items) {
  let runningTotal = 0;
  for (const item of items) {
    runningTotal += lineTotal(item);
  }
  return runningTotal;
}

function invoiceTotal(items, region) {
  const net = subtotal(items);
  return net + taxFor(net, region);
}

module.exports = { lineTotal, subtotal, invoiceTotal };
