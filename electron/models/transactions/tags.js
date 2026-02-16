const EMPTY_TAGS_JSON = '[]';

function decodeTags(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(value);
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.filter((entry) => typeof entry === 'string');
  } catch {
    return [];
  }
}

function normalizeRowTags(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    tags: decodeTags(row.tags),
  };
}

function normalizeRowsTags(rows) {
  return rows.map((row) => normalizeRowTags(row));
}

module.exports = {
  EMPTY_TAGS_JSON,
  normalizeRowTags,
  normalizeRowsTags,
};
