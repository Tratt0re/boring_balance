const STRICT_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function parseDdMmYyyyToUnixMilliseconds(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string.`);
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    throw new Error(`${label} cannot be empty.`);
  }

  const match = STRICT_DATE_PATTERN.exec(trimmedValue);
  if (!match) {
    throw new Error(`${label} must be in dd/mm/yyyy format.`);
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  if (year < MIN_YEAR || year > MAX_YEAR) {
    throw new Error(`${label} year must be between ${MIN_YEAR} and ${MAX_YEAR}.`);
  }

  if (month < 1 || month > 12) {
    throw new Error(`${label} month must be between 1 and 12.`);
  }

  if (day < 1 || day > 31) {
    throw new Error(`${label} day must be between 1 and 31.`);
  }

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(`${label} must be a valid calendar date.`);
  }

  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

module.exports = {
  parseDdMmYyyyToUnixMilliseconds,
};
