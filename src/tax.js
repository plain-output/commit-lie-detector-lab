const RATES = { uk: 0.2, de: 0.19, us: 0.07 };

function taxFor(amount, region) {
  const rate = RATES[region];
  if (rate === undefined) throw new Error('unknown region: ' + region);
  return amount * rate;
}

module.exports = { taxFor, RATES };
