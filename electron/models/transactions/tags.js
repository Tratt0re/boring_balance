const EMPTY_TAGS_JSON = '[]';

// Rows already reported, so a damaged row is logged once per run instead of on every refresh of a list.
const reportedDamagedRowIds = new Set();

/**
 * Decodes the stored tags. Returns the tags plus whether the stored text was damaged, so the caller can
 * say so. Damaged text still gives an empty (or reduced) list: a row with bad tags must keep loading.
 */
function decodeTags(value) {
  // Nothing stored is the normal "no tags" case.
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return { tags: [], damaged: false };
  }

  // Something stored that is not text cannot be decoded.
  if (typeof value !== 'string') {
    return { tags: [], damaged: true };
  }

  try {
    const parsedValue = JSON.parse(value);
    if (!Array.isArray(parsedValue)) {
      return { tags: [], damaged: true };
    }

    const tags = parsedValue.filter((entry) => typeof entry === 'string');
    return { tags, damaged: tags.length !== parsedValue.length };
  } catch {
    return { tags: [], damaged: true };
  }
}

function normalizeRowTags(row) {
  if (!row) {
    return null;
  }

  const { plan_item_id: _ignoredPlanItemId, ...publicRow } = row;
  const { tags, damaged } = decodeTags(row.tags);

  if (damaged && !reportedDamagedRowIds.has(row.id)) {
    reportedDamagedRowIds.add(row.id);
    // The row id only: the stored text can hold private notes and does not belong in a log.
    console.warn(
      `[electron] Row ${row.id ?? '(unknown)'} has damaged tags; some or all were dropped.`,
    );
  }

  return {
    ...publicRow,
    tags,
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
