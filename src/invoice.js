// Invoice totals for a small shop.
const { taxFor } = require('./tax');

function lineTotal(item) {
  return item.price * item.quantity;
}

function subtotal(items) {
  let total = 0;
  for (const item of items) {
    total += lineTotal(item);
  }
  return total;
}

function invoiceTotal(items, region) {
  const net = subtotal(items);
  return net + taxFor(net, region);
}

module.exports = { lineTotal, subtotal, invoiceTotal };
