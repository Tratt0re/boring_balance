function pad2(value) {
  return String(value).padStart(2, '0');
}

function normalizeDateFormat(value) {
  if (value === undefined) {
    return 'DD-MM-YYYY';
  }

  if (value === 'DD-MM-YYYY' || value === 'YYYY-MM-DD') {
    return value;
  }

  throw new Error('format must be "DD-MM-YYYY" or "YYYY-MM-DD".');
}

function formatUnixTimestampMillisecondsToDate(unixTimestampMilliseconds, options = {}) {
  const normalizedTimestamp = Number(unixTimestampMilliseconds);
  if (!Number.isFinite(normalizedTimestamp)) {
    throw new Error('unixTimestampMilliseconds must be a finite number.');
  }

  const date = new Date(normalizedTimestamp);
  if (Number.isNaN(date.getTime())) {
    throw new Error('unixTimestampMilliseconds must be a valid Unix timestamp in milliseconds.');
  }

  const normalizedFormat = normalizeDateFormat(options.format);
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());

  if (normalizedFormat === 'YYYY-MM-DD') {
    return `${year}-${month}-${day}`;
  }

  return `${day}-${month}-${year}`;
}

module.exports = {
  formatUnixTimestampMillisecondsToDate,
};
