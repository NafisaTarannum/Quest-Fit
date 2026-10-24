const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSportsQuery,
  cacheKeyForCoordinates,
  createSportsLocationsHandler,
  fetchSportsFacilities,
  validateCoordinates,
} = require('../server/sports-locations');
const { matchesSportFilter, normaliseSportTags, sportFilterLabel } = require('../public/map-utils');

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function makeResponse() {
  return {
    statusCode: null,
    body: null,
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('accepts valid coordinates and builds a scoped basketball, football and tennis query', () => {
  assert.equal(validateCoordinates(-33.8688, 151.2093), true);
  assert.equal(validateCoordinates(91, 151.2093), false);
  assert.equal(cacheKeyForCoordinates(-33.8688, 151.2093), '-33.869,151.209');

  const query = buildSportsQuery(-33.8688, 151.2093);
  assert.match(query, /\["sport"="basketball"\]/);
  assert.match(query, /\["sport"="soccer"\]/);
  assert.match(query, /\["sport"="football"\]/);
  assert.match(query, /\["sport"="tennis"\]/);
  assert.match(query, /around:3000,-33\.868800,151\.209300/);
});

test('matches semicolon-delimited sport tags and treats football as soccer', () => {
  assert.deepEqual(normaliseSportTags('Basketball; Tennis'), ['basketball', 'tennis']);
  assert.equal(matchesSportFilter('football; rugby', 'soccer'), true);
  assert.equal(matchesSportFilter('american_football', 'soccer'), false);
  assert.equal(matchesSportFilter('basketball;tennis', 'tennis'), true);
  assert.equal(matchesSportFilter('basketball', 'soccer'), false);
  assert.equal(sportFilterLabel('soccer'), 'football');
});

test('falls back to the next Overpass endpoint after a 429 response', async () => {
  const calls = [];
  const result = await fetchSportsFacilities('query', {
    endpoints: ['https://primary.example/interpreter', 'https://secondary.example/interpreter'],
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), method: options.method || 'GET' });
      return calls.length === 1
        ? jsonResponse(429, {})
        : jsonResponse(200, { elements: [{ id: 1 }] });
    },
  });

  assert.deepEqual(result.elements, [{ id: 1 }]);
  assert.deepEqual(calls.map(call => call.method), ['POST', 'POST']);
});

test('retries a 406 form POST as a GET data query', async () => {
  const calls = [];
  const result = await fetchSportsFacilities('query', {
    endpoints: ['https://primary.example/interpreter'],
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), method: options.method || 'GET' });
      return options.method === 'POST'
        ? jsonResponse(406, {})
        : jsonResponse(200, { elements: [{ id: 2 }] });
    },
  });

  assert.deepEqual(result.elements, [{ id: 2 }]);
  assert.equal(calls[1].method, 'GET');
  assert.match(calls[1].url, /data=query/);
});

test('returns an empty successful result when no nearby facilities match', async () => {
  const handler = createSportsLocationsHandler({
    fetchFacilities: async () => ({ elements: [] }),
  });
  const res = makeResponse();

  await handler({ query: { lat: '-33.8688', lng: '151.2093' } }, res);

  assert.equal(res.statusCode, null);
  assert.deepEqual(res.body, { elements: [], stale: false });
});

test('uses a stale cached result when the live provider is unavailable', async () => {
  const cache = new Map([
    ['-33.869,151.209', { timestamp: 0, data: { elements: [{ id: 9 }] } }],
  ]);
  const handler = createSportsLocationsHandler({
    cache,
    now: () => 31 * 60 * 1000,
    fetchFacilities: async () => { throw new Error('provider unavailable'); },
    logger: { error() {} },
  });
  const res = makeResponse();

  await handler({ query: { lat: '-33.8688', lng: '151.2093' } }, res);

  assert.equal(res.statusCode, null);
  assert.deepEqual(res.body, {
    elements: [{ id: 9 }],
    stale: true,
    warning: 'Live sports data is temporarily unavailable. Showing saved results.',
  });
});

test('returns a displayable 503 error when there is no cached result', async () => {
  const handler = createSportsLocationsHandler({
    fetchFacilities: async () => { throw new Error('provider unavailable'); },
    logger: { error() {} },
  });
  const res = makeResponse();

  await handler({ query: { lat: '-33.8688', lng: '151.2093' } }, res);

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    error: 'Sports locations are temporarily unavailable. Please try again.',
    code: 'SPORTS_LOCATIONS_UNAVAILABLE',
  });
});
