// Invoice totals for a small shop.
const { taxFor } = require('./tax');

function lineTotal(item) {
  return item.price * item.quantity;
}

function sumLines(items) {
  let total = 0;
  for (const item of items) {
    total += lineTotal(item);
  }
  return total;
}

function subtotal(items) {
  return sumLines(items);
}

function invoiceTotal(items, region) {
  const net = subtotal(items);
  return net + taxFor(net, region);
}

module.exports = { lineTotal, subtotal, invoiceTotal };
