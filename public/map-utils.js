(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.QuestFitMapUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SPORT_FILTERS = Object.freeze({
    basketball: { label: 'basketball', values: ['basketball'] },
    soccer: { label: 'football', values: ['soccer', 'football'] },
    tennis: { label: 'tennis', values: ['tennis'] },
  });

  function normaliseSportTags(value) {
    return String(value || '')
      .toLowerCase()
      .split(/[;,]/)
      .map(tag => tag.trim())
      .filter(Boolean);
  }

  function matchesSportFilter(value, filter) {
    if (filter === 'all') return true;
    const filterDefinition = SPORT_FILTERS[filter];
    if (!filterDefinition) return false;
    const tags = normaliseSportTags(value);
    return tags.some(tag => filterDefinition.values.includes(tag));
  }

  function sportFilterLabel(filter) {
    return filter === 'all' ? 'sports facilities' : (SPORT_FILTERS[filter] || {}).label || 'sports facilities';
  }

  function firstTagValue(tags, keys) {
    for (const key of keys) {
      const value = typeof tags?.[key] === 'string' ? tags[key].trim() : '';
      if (value) return value;
    }
    return '';
  }

  function facilityIdentity(tags) {
    const name = firstTagValue(tags, ['name', 'official_name', 'short_name']);
    const brand = firstTagValue(tags, ['brand']);
    const operator = firstTagValue(tags, ['operator']);
    const club = firstTagValue(tags, ['club']);
    const fallback = brand || operator || club;
    const nameSource = name ? 'name' : (brand ? 'brand' : (operator ? 'operator' : (club ? 'club' : 'missing')));

    return {
      displayName: name || fallback || 'Name not listed in OpenStreetMap',
      nameSource,
      brand,
      operator,
      club,
      address: [
        [tags?.['addr:housenumber'], tags?.['addr:street']].filter(Boolean).join(' '),
        tags?.['addr:suburb'],
      ].filter(Boolean).join(', '),
    };
  }

  return { facilityIdentity, matchesSportFilter, normaliseSportTags, sportFilterLabel };
});
