const STRICT_DECIMAL_PATTERN = /^[+-]?\d+(?:[.,]\d{1,2})?$/;

function normalizeAmountInput(value, label) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${label} must be a finite number.`);
    }

    return String(value);
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    if (trimmedValue.length === 0) {
      throw new Error(`${label} cannot be empty.`);
    }

    return trimmedValue;
  }

  throw new Error(`${label} must be a string or number.`);
}

function parseDecimalToCents(value, label, options = {}) {
  const normalizedValue = normalizeAmountInput(value, label);

  if (/\s/.test(normalizedValue)) {
    throw new Error(`${label} must not contain spaces or thousands separators.`);
  }

  if (!STRICT_DECIMAL_PATTERN.test(normalizedValue)) {
    throw new Error(`${label} must be a valid decimal number with up to 2 decimal places.`);
  }

  const sign = normalizedValue.startsWith('-') ? -1 : 1;
  const unsignedValue = normalizedValue.replace(/^[+-]/, '');
  const [wholeUnits, fractionUnits = ''] = unsignedValue.replace(',', '.').split('.');
  const normalizedFractionUnits = fractionUnits.padEnd(2, '0');
  const centsBigInt = BigInt(wholeUnits) * 100n + BigInt(normalizedFractionUnits);
  const signedCentsBigInt = sign < 0 ? -centsBigInt : centsBigInt;

  if (
    signedCentsBigInt > BigInt(Number.MAX_SAFE_INTEGER) ||
    signedCentsBigInt < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error(`${label} is too large.`);
  }

  const cents = Number(signedCentsBigInt);
  if (!options.allowNegative && cents < 0) {
    throw new Error(`${label} must not be negative.`);
  }

  if (options.requirePositive && cents <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }

  return cents;
}

module.exports = {
  parseDecimalToCents,
};
