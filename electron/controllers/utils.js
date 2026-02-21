/**
 * Ensures a value is a plain object (not null and not an array).
 *
 * @template {Record<string, unknown>} T
 * @param {unknown} value - Value to validate.
 * @param {string} label - Field label used in error messages.
 * @returns {T} The same value, narrowed to an object shape.
 * @throws {Error} If the value is not a plain object.
 */
function ensurePlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a plain object.`);
  }

  return value;
}

/**
 * Ensures a value is a plain object with at least one key.
 *
 * @template {Record<string, unknown>} T
 * @param {unknown} value - Value to validate.
 * @param {string} label - Field label used in error messages.
 * @returns {T} The validated non-empty object.
 * @throws {Error} If value is not an object or has no keys.
 */
function ensureNonEmptyObject(value, label) {
  const objectValue = ensurePlainObject(value, label);
  if (Object.keys(objectValue).length === 0) {
    throw new Error(`${label} cannot be empty.`);
  }

  return objectValue;
}

/**
 * Normalizes and validates a required string.
 *
 * @param {unknown} value - Input value.
 * @param {string} label - Field label used in error messages.
 * @param {{ trim?: boolean, allowEmpty?: boolean, minLength?: number, maxLength?: number }} [options={}] - String normalization options.
 * @returns {string} Normalized string.
 * @throws {Error} If value is not a string or is empty when `allowEmpty` is false.
 */
function requireString(value, label, options = {}) {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string.`);
  }

  const normalizedValue = options.trim === false ? value : value.trim();
  if (!options.allowEmpty && normalizedValue.length === 0) {
    throw new Error(`${label} cannot be empty.`);
  }

  if (options.minLength !== undefined && normalizedValue.length < options.minLength) {
    throw new Error(`${label} must be at least ${options.minLength} characters.`);
  }

  if (options.maxLength !== undefined && normalizedValue.length > options.maxLength) {
    throw new Error(`${label} must be at most ${options.maxLength} characters.`);
  }

  return normalizedValue;
}

/**
 * Normalizes an optional string value.
 *
 * @param {unknown} value - Input value.
 * @param {string} label - Field label used in error messages.
 * @param {{ trim?: boolean, allowEmpty?: boolean, allowNull?: boolean, minLength?: number, maxLength?: number }} [options={}] - String normalization options.
 * @returns {string|null|undefined} Normalized value.
 * @throws {Error} If value type is invalid or null is disallowed.
 */
function normalizeOptionalString(value, label, options = {}) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    if (options.allowNull === false) {
      throw new Error(`${label} cannot be null.`);
    }

    return null;
  }

  return requireString(value, label, options);
}

/**
 * Converts a boolean-like flag to SQLite integer storage (0/1).
 *
 * @param {unknown} value - Input value.
 * @param {string} label - Field label used in error messages.
 * @returns {0|1} Normalized flag.
 * @throws {Error} If value is not boolean, 0, or 1.
 */
function normalizeBooleanFlag(value, label) {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (value === 0 || value === 1) {
    return value;
  }

  throw new Error(`${label} must be a boolean or 0/1.`);
}

/**
 * Converts an optional boolean-like flag to SQLite integer storage.
 *
 * @param {unknown} value - Input value.
 * @param {string} label - Field label used in error messages.
 * @returns {0|1|undefined} Normalized flag.
 */
function normalizeOptionalBooleanFlag(value, label) {
  if (value === undefined) {
    return undefined;
  }

  return normalizeBooleanFlag(value, label);
}

/**
 * Validates a positive integer.
 *
 * @param {unknown} value - Input value.
 * @param {string} label - Field label used in error messages.
 * @returns {number} Positive integer.
 * @throws {Error} If value is not a positive integer.
 */
function normalizePositiveInteger(value, label) {
  const normalizedValue = Number(value);
  if (!Number.isInteger(normalizedValue) || normalizedValue <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return normalizedValue;
}

/**
 * Validates an optional positive integer.
 *
 * @param {unknown} value - Input value.
 * @param {string} label - Field label used in error messages.
 * @returns {number|null|undefined} Normalized number.
 */
function normalizeOptionalInteger(value, label) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return normalizePositiveInteger(value, label);
}

/**
 * Validates an integer (positive, zero, or negative).
 *
 * @param {unknown} value - Input value.
 * @param {string} label - Field label used in error messages.
 * @returns {number} Integer.
 * @throws {Error} If value is not an integer.
 */
function normalizeInteger(value, label) {
  const normalizedValue = Number(value);
  if (!Number.isInteger(normalizedValue)) {
    throw new Error(`${label} must be an integer.`);
  }

  return normalizedValue;
}

/**
 * Converts a numeric amount value to integer cents.
 *
 * @param {unknown} value - Input amount as a number (e.g. 1.5).
 * @param {string} label - Field label used in error messages.
 * @returns {number} Integer cents value (e.g. 150).
 * @throws {Error} If value is not a finite number.
 */
function normalizeAmountToCents(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a number.`);
  }

  const scaledAmount = Math.abs(value) * 100;
  const roundedAmount = Math.round(scaledAmount + Number.EPSILON);

  return value < 0 ? -roundedAmount : roundedAmount;
}

/**
 * Extracts and validates an id from either a primitive or payload object.
 *
 * @param {number|string|Record<string, unknown>} payload - Primitive id or object containing id field.
 * @param {string} [idField='id'] - Object key to read id from when payload is an object.
 * @returns {number} Positive integer id.
 */
function extractId(payload, idField = 'id') {
  if (typeof payload === 'number' || typeof payload === 'string') {
    return normalizePositiveInteger(payload, idField);
  }

  const body = ensurePlainObject(payload, 'payload');
  return normalizePositiveInteger(body[idField], idField);
}

/**
 * Extracts and validates a required string from either a primitive or payload object.
 *
 * @param {string|Record<string, unknown>} payload - Primitive string or object containing the key.
 * @param {string} key - Key to read when payload is an object.
 * @returns {string} Non-empty normalized string.
 */
function extractString(payload, key) {
  if (typeof payload === 'string') {
    return requireString(payload, key, { allowEmpty: false });
  }

  const body = ensurePlainObject(payload, 'payload');
  return requireString(body[key], key, { allowEmpty: false });
}

/**
 * Extracts a list payload in the shape `{ where, options }`.
 *
 * @param {unknown} payload - Incoming request payload.
 * @returns {{ where: Record<string, unknown>, options: Record<string, unknown> }} Parsed list input.
 */
function extractListPayload(payload) {
  if (payload === undefined || payload === null) {
    return { where: {}, options: {} };
  }

  const body = ensurePlainObject(payload, 'payload');
  const where = body.where ?? {};
  const options = body.options ?? {};

  ensurePlainObject(where, 'payload.where');
  ensurePlainObject(options, 'payload.options');

  return { where, options };
}

/**
 * Extracts query options from either `{ options }` or a plain options object.
 *
 * @param {unknown} payload - Incoming request payload.
 * @returns {Record<string, unknown>} Parsed options object.
 */
function extractOptionsPayload(payload) {
  if (payload === undefined || payload === null) {
    return {};
  }

  const body = ensurePlainObject(payload, 'payload');
  const options = body.options ?? body;

  ensurePlainObject(options, 'options');
  return options;
}

/**
 * Removes keys whose values are `undefined`.
 *
 * @param {Record<string, unknown>} values - Source object.
 * @returns {Record<string, unknown>} Object containing only defined values.
 */
function pickDefined(values) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

/**
 * Ensures an object has at least one key.
 *
 * @param {Record<string, unknown>} value - Object to validate.
 * @param {string} label - Field label used in error messages.
 * @returns {void}
 * @throws {Error} If object has no keys.
 */
function ensureHasKeys(value, label) {
  if (Object.keys(value).length === 0) {
    throw new Error(`${label} cannot be empty.`);
  }
}

/**
 * Ensures all keys in an object are part of the allowed key set.
 *
 * @param {Record<string, unknown>} value - Object to validate.
 * @param {Set<string>} allowedKeys - Whitelisted key names.
 * @param {string} label - Field label used in error messages.
 * @returns {void}
 * @throws {Error} If an unsupported key is found.
 */
function assertAllowedKeys(value, allowedKeys, label) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unsupported ${label} field: "${key}"`);
    }
  }
}

/**
 * Validates a Unix timestamp in milliseconds.
 *
 * @param {unknown} value - Input value.
 * @param {string} label - Field label used in error messages.
 * @returns {number} Unix timestamp in milliseconds.
 * @throws {Error} If value is not a positive integer timestamp.
 */
function normalizeUnixTimestampMilliseconds(value, label) {
  const normalizedValue = Number(value);
  if (!Number.isInteger(normalizedValue) || normalizedValue <= 0) {
    throw new Error(`${label} must be a Unix timestamp in milliseconds.`);
  }

  return normalizedValue;
}

/**
 * Returns the current Unix timestamp in milliseconds.
 *
 * @returns {number} Current Unix timestamp in milliseconds.
 */
function nowUnixTimestampMilliseconds() {
  return Date.now();
}

module.exports = {
  assertAllowedKeys,
  ensureHasKeys,
  ensureNonEmptyObject,
  ensurePlainObject,
  extractId,
  extractListPayload,
  extractOptionsPayload,
  extractString,
  normalizeAmountToCents,
  normalizeBooleanFlag,
  normalizeInteger,
  normalizeOptionalBooleanFlag,
  normalizeOptionalInteger,
  normalizeOptionalString,
  normalizePositiveInteger,
  normalizeUnixTimestampMilliseconds,
  nowUnixTimestampMilliseconds,
  pickDefined,
  requireString,
};
