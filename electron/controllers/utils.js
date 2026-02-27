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
 * Validates a non-negative integer (zero or positive).
 *
 * @param {unknown} value - Input value.
 * @param {string} label - Field label used in error messages.
 * @returns {number} Non-negative integer.
 * @throws {Error} If value is not a non-negative integer.
 */
function normalizeNonNegativeInteger(value, label) {
  const normalizedValue = Number(value);
  if (!Number.isInteger(normalizedValue) || normalizedValue < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
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
 * Validates an optional array of positive integers.
 *
 * @param {unknown} value - Input value.
 * @param {string} label - Field label used in error messages.
 * @param {{ dedupe?: boolean }} [options={}] - Optional behavior flags.
 * @returns {number[]|undefined} Normalized ids array.
 */
function normalizeOptionalIdArray(value, label, options = {}) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  const normalizedEntries = value.map((entry, index) => normalizePositiveInteger(entry, `${label}[${index}]`));
  return options.dedupe ? Array.from(new Set(normalizedEntries)) : normalizedEntries;
}

/**
 * Validates an optional array of enum values.
 *
 * @param {unknown} value - Input value.
 * @param {string} label - Field label used in error messages.
 * @param {Set<string>} allowedValues - Allowed values.
 * @param {{ dedupe?: boolean }} [options={}] - Optional behavior flags.
 * @returns {string[]|undefined} Normalized enum array.
 */
function normalizeOptionalEnumArray(value, label, allowedValues, options = {}) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  const normalizedEntries = value.map((entry, index) => {
    const normalizedValue = requireString(entry, `${label}[${index}]`, { allowEmpty: false });
    if (!allowedValues.has(normalizedValue)) {
      throw new Error(`${label}[${index}] must be one of: ${Array.from(allowedValues).join(', ')}.`);
    }

    return normalizedValue;
  });

  return options.dedupe === false ? normalizedEntries : Array.from(new Set(normalizedEntries));
}

/**
 * Normalizes an optional amount filter into absolute cents.
 *
 * @param {unknown} value - Input value.
 * @param {string} label - Field label used in error messages.
 * @returns {number|undefined} Absolute amount in cents.
 */
function normalizeOptionalAmountFilterToCents(value, label) {
  if (value === undefined) {
    return undefined;
  }

  let normalizedValue = value;
  if (typeof normalizedValue === 'string') {
    const trimmedValue = normalizedValue.trim();
    if (trimmedValue.length === 0) {
      throw new Error(`${label} cannot be empty.`);
    }

    normalizedValue = Number(trimmedValue);
  }

  return Math.abs(normalizeAmountToCents(normalizedValue, label));
}

/**
 * Reads an internal-only `plan_item_id` from an options object.
 *
 * @param {unknown} options - Internal options object.
 * @returns {number|undefined} Positive integer plan item id.
 */
function normalizeInternalPlanItemId(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    return undefined;
  }

  if (options.plan_item_id === undefined) {
    return undefined;
  }

  return normalizePositiveInteger(options.plan_item_id, 'options.plan_item_id');
}

function normalizePaginationFromBody(body, options = {}) {
  const defaultPage = options.defaultPage ?? 1;
  const defaultPageSize = options.defaultPageSize ?? 10;
  const maxPageSize = options.maxPageSize ?? 250;
  const payloadLabel = options.payloadLabel ?? 'payload';

  const page =
    body.page === undefined ? defaultPage : normalizePositiveInteger(body.page, `${payloadLabel}.page`);
  const pageSize =
    body.page_size === undefined
      ? defaultPageSize
      : normalizePositiveInteger(body.page_size, `${payloadLabel}.page_size`);

  if (pageSize > maxPageSize) {
    throw new Error(`${payloadLabel}.page_size cannot be greater than ${maxPageSize}.`);
  }

  return {
    page,
    page_size: pageSize,
  };
}

/**
 * Parses a standard `{ where, options, page, page_size, all }` list payload.
 *
 * @param {unknown} payload - Incoming payload.
 * @param {{
 *   allowedPayloadFields: Set<string>,
 *   defaultPage?: number,
 *   defaultPageSize?: number,
 *   maxPageSize?: number
 * }} config - Parser config.
 * @returns {{ where: Record<string, unknown>, options: Record<string, unknown>, pagination: { page: number, page_size: number }, all: boolean }}
 */
function normalizeWhereOptionsListPayload(payload, config) {
  const defaultPage = config.defaultPage ?? 1;
  const defaultPageSize = config.defaultPageSize ?? 10;

  if (payload === undefined || payload === null) {
    return {
      where: {},
      options: {},
      pagination: {
        page: defaultPage,
        page_size: defaultPageSize,
      },
      all: false,
    };
  }

  const body = ensurePlainObject(payload, 'payload');
  assertAllowedKeys(body, config.allowedPayloadFields, 'payload');

  const where = body.where ?? {};
  const options = body.options ?? {};
  ensurePlainObject(where, 'payload.where');
  ensurePlainObject(options, 'payload.options');

  const all = body.all === undefined ? false : normalizeBooleanFlag(body.all, 'payload.all') === 1;
  if (all) {
    return {
      where,
      options,
      pagination: {
        page: defaultPage,
        page_size: defaultPageSize,
      },
      all: true,
    };
  }

  return {
    where,
    options,
    pagination: normalizePaginationFromBody(body, {
      defaultPage,
      defaultPageSize,
      maxPageSize: config.maxPageSize ?? 250,
      payloadLabel: 'payload',
    }),
    all: false,
  };
}

/**
 * Parses a standard `{ filters, page, page_size }` list payload.
 *
 * @param {unknown} payload - Incoming payload.
 * @param {{
 *   allowedPayloadFields: Set<string>,
 *   allowedFilterFields: Set<string>,
 *   defaultPage?: number,
 *   defaultPageSize?: number,
 *   maxPageSize?: number
 * }} config - Parser config.
 * @returns {{ filters: Record<string, unknown>, pagination: { page: number, page_size: number } }}
 */
function normalizeFiltersListPayload(payload, config) {
  const defaultPage = config.defaultPage ?? 1;
  const defaultPageSize = config.defaultPageSize ?? 10;

  if (payload === undefined || payload === null) {
    return {
      filters: {},
      pagination: {
        page: defaultPage,
        page_size: defaultPageSize,
      },
    };
  }

  const body = ensurePlainObject(payload, 'payload');
  assertAllowedKeys(body, config.allowedPayloadFields, 'payload');
  const filters = body.filters === undefined ? {} : ensurePlainObject(body.filters, 'payload.filters');
  assertAllowedKeys(filters, config.allowedFilterFields, 'payload.filters');

  return {
    filters,
    pagination: normalizePaginationFromBody(body, {
      defaultPage,
      defaultPageSize,
      maxPageSize: config.maxPageSize ?? 250,
      payloadLabel: 'payload',
    }),
  };
}

/**
 * Resolves page and offset from a total count and requested pagination.
 *
 * @param {number} total - Total rows count.
 * @param {{ page: number, page_size: number }} pagination - Pagination input.
 * @param {{ defaultPage?: number }} [options={}] - Pagination defaults.
 * @returns {{ page: number, page_size: number, offset: number, total_pages: number }}
 */
function resolvePaginationWindow(total, pagination, options = {}) {
  const defaultPage = options.defaultPage ?? 1;
  const pageSize = Number.isInteger(pagination?.page_size) && pagination.page_size > 0 ? pagination.page_size : 10;
  const requestedPage =
    Number.isInteger(pagination?.page) && pagination.page > 0 ? pagination.page : defaultPage;
  const totalPages = total === 0 ? defaultPage : Math.max(defaultPage, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);

  return {
    page,
    page_size: pageSize,
    offset: (page - 1) * pageSize,
    total_pages: totalPages,
  };
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
 * Validates a calendar year integer.
 *
 * @param {unknown} value - Input value.
 * @param {string} label - Field label used in error messages.
 * @param {{ min?: number, max?: number }} [options={}] - Inclusive year bounds.
 * @returns {number} Normalized calendar year.
 * @throws {Error} If value is not an integer inside the allowed range.
 */
function normalizeCalendarYear(value, label, options = {}) {
  const minYear = Number.isInteger(options.min) ? options.min : 1;
  const maxYear = Number.isInteger(options.max) ? options.max : 9999;
  const normalizedValue = Number(value);

  if (!Number.isInteger(normalizedValue) || normalizedValue < minYear || normalizedValue > maxYear) {
    throw new Error(`${label} must be an integer between ${minYear} and ${maxYear}.`);
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
  normalizeCalendarYear,
  normalizeFiltersListPayload,
  normalizeInternalPlanItemId,
  normalizeInteger,
  normalizeNonNegativeInteger,
  normalizeOptionalAmountFilterToCents,
  normalizeOptionalBooleanFlag,
  normalizeOptionalEnumArray,
  normalizeOptionalIdArray,
  normalizeOptionalInteger,
  normalizeOptionalString,
  normalizePositiveInteger,
  normalizeWhereOptionsListPayload,
  normalizeUnixTimestampMilliseconds,
  nowUnixTimestampMilliseconds,
  pickDefined,
  resolvePaginationWindow,
  requireString,
};
