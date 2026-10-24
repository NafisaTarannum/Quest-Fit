const DEFAULT_OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const SEARCH_RADIUS_METRES = 3_000;
const OVERPASS_REQUEST_TIMEOUT_MS = 15_000;

function validateCoordinates(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function cacheKeyForCoordinates(lat, lng) {
  // Keep the cached search centre within roughly 100 metres of the request,
  // so a facility near the edge of the 3 km radius is not misrepresented.
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

function buildSportsQuery(lat, lng) {
  const safeLat = Number(lat).toFixed(6);
  const safeLng = Number(lng).toFixed(6);
  const around = `(around:${SEARCH_RADIUS_METRES},${safeLat},${safeLng})`;

  // Exact sport values use Overpass's tag index and are far more reliable
  // than a broad regular-expression scan. OSM convention uses "soccer",
  // while a few facilities use "football", so include both.
  const searches = ['basketball', 'soccer', 'football', 'tennis']
    .map(sport => `  nwr${around}["sport"="${sport}"];`)
    .join('\n');
  return `
[out:json][timeout:25];
(
${searches}
);
out center;
`;
}

function upstreamError(endpoint, response) {
  const error = new Error(`Overpass returned ${response.status} from ${endpoint}`);
  error.status = response.status;
  return error;
}

async function readOverpassResponse(response, endpoint) {
  if (!response.ok) throw upstreamError(endpoint, response);
  const data = await response.json();
  return { elements: Array.isArray(data.elements) ? data.elements : [] };
}

async function requestFromEndpoint(endpoint, query, fetchImpl) {
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'Quest-Fit nearby sports map/1.0',
  };
  const postResponse = await fetchWithTimeout(fetchImpl, endpoint, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ data: query }),
  });

  if (postResponse.ok) return readOverpassResponse(postResponse, endpoint);

  // A few public instances reject form POSTs with 406. The standard
  // interpreter also accepts the same query as a GET data= parameter.
  if (postResponse.status === 406) {
    const url = new URL(endpoint);
    url.searchParams.set('data', query);
    const getResponse = await fetchWithTimeout(fetchImpl, url, { headers });
    return readOverpassResponse(getResponse, endpoint);
  }

  throw upstreamError(endpoint, postResponse);
}

async function fetchWithTimeout(fetchImpl, url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OVERPASS_REQUEST_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSportsFacilities(query, {
  fetchImpl = globalThis.fetch,
  endpoints = DEFAULT_OVERPASS_ENDPOINTS,
} = {}) {
  const errors = [];

  for (const endpoint of endpoints) {
    try {
      return await requestFromEndpoint(endpoint, query, fetchImpl);
    } catch (error) {
      errors.push(error);
    }
  }

  const statuses = errors.map(error => error.status).filter(Boolean);
  const error = new Error('All Overpass endpoints were unavailable.');
  error.statuses = statuses;
  throw error;
}

function createSportsLocationsHandler({
  cache = new Map(),
  inFlight = new Map(),
  now = () => Date.now(),
  cacheDuration = 30 * 60 * 1000,
  fetchFacilities = fetchSportsFacilities,
  logger = console,
} = {}) {
  return async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!validateCoordinates(lat, lng)) {
      return res.status(400).json({ error: 'Invalid coordinates.' });
    }

    const cacheKey = cacheKeyForCoordinates(lat, lng);
    const cached = cache.get(cacheKey);
    if (cached && now() - cached.timestamp < cacheDuration) {
      return res.json({ ...cached.data, stale: false });
    }

    let request = inFlight.get(cacheKey);
    if (!request) {
      request = fetchFacilities(buildSportsQuery(lat, lng))
        .then(data => {
          const normalised = { elements: Array.isArray(data.elements) ? data.elements : [] };
          cache.set(cacheKey, { data: normalised, timestamp: now() });
          return normalised;
        })
        .finally(() => inFlight.delete(cacheKey));
      inFlight.set(cacheKey, request);
    }

    try {
      const data = await request;
      return res.json({ ...data, stale: false });
    } catch (error) {
      logger.error('Sports API error:', error.message, error.statuses || '');
      // An expired response is preferable to an empty map when the upstream
      // service is overloaded. Tell the browser so it can make that clear.
      if (cached) {
        return res.json({
          ...cached.data,
          stale: true,
          warning: 'Live sports data is temporarily unavailable. Showing saved results.',
        });
      }
      return res.status(503).json({
        error: 'Sports locations are temporarily unavailable. Please try again.',
        code: 'SPORTS_LOCATIONS_UNAVAILABLE',
      });
    }
  };
}

module.exports = {
  DEFAULT_OVERPASS_ENDPOINTS,
  buildSportsQuery,
  cacheKeyForCoordinates,
  createSportsLocationsHandler,
  fetchSportsFacilities,
  validateCoordinates,
};
