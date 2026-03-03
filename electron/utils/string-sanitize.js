const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;
const FORMULA_PREFIX_PATTERN = /^[=+\-@]/;

function ensureString(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string.`);
  }

  return value;
}

function containsControlCharacters(value) {
  return CONTROL_CHARACTER_PATTERN.test(String(value ?? ''));
}

function startsWithFormulaPrefix(value) {
  return FORMULA_PREFIX_PATTERN.test(String(value ?? '').trim());
}

function normalizeWhitespace(value) {
  return ensureString(value, 'value').trim().replace(/\s+/g, ' ');
}

function normalizeTrimmedString(value) {
  return ensureString(value, 'value').trim();
}

function toCaseInsensitiveLookupKey(value) {
  return normalizeWhitespace(value).toLocaleLowerCase();
}

module.exports = {
  containsControlCharacters,
  normalizeTrimmedString,
  normalizeWhitespace,
  startsWithFormulaPrefix,
  toCaseInsensitiveLookupKey,
};
