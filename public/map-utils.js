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

  return { matchesSportFilter, normaliseSportTags, sportFilterLabel };
});
