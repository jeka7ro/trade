const https = require('https');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
};

// Cache auth per Lambda warm instance
let cachedCookie = '';
let cachedCrumb  = '';
let authAt = 0;
const AUTH_TTL = 25 * 60 * 1000; // refresh every 25 min

function httpsGet(urlStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        ...headers
      },
      timeout: 12000
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

async function refreshAuth() {
  // Step 1: Get cookie from fc.yahoo.com
  const cookieRes = await httpsGet('https://fc.yahoo.com');
  const rawCookies = cookieRes.headers['set-cookie'] || [];
  if (!rawCookies.length) throw new Error('No cookie from Yahoo');
  cachedCookie = rawCookies.map(c => c.split(';')[0]).join('; ');

  // Step 2: Get crumb
  const crumbRes = await httpsGet('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    'Cookie': cachedCookie,
    'Accept': 'application/json, text/plain, */*',
  });
  if (crumbRes.status !== 200 || !crumbRes.body || crumbRes.body.startsWith('<')) {
    throw new Error(`Crumb failed: ${crumbRes.status} ${crumbRes.body.slice(0, 100)}`);
  }
  cachedCrumb = crumbRes.body.trim();
  authAt = Date.now();
  console.log('[PROXY] Auth refreshed, crumb:', cachedCrumb.slice(0, 8) + '...');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const targetUrl = (event.queryStringParameters || {}).url;
  if (!targetUrl) {
    return { statusCode: 400, headers: CORS_HEADERS, body: 'Missing ?url= parameter' };
  }

  // Refresh auth if stale
  if (!cachedCrumb || Date.now() - authAt > AUTH_TTL) {
    try {
      await refreshAuth();
    } catch (e) {
      console.error('[PROXY] Auth failed:', e.message);
      // Try to proceed without crumb (some endpoints still work)
    }
  }

  // Build final URL with crumb appended if we have one
  let finalUrl = targetUrl;
  if (cachedCrumb) {
    const sep = targetUrl.includes('?') ? '&' : '?';
    finalUrl = targetUrl + sep + 'crumb=' + encodeURIComponent(cachedCrumb);
  }

  console.log('[PROXY] Fetching:', finalUrl.slice(0, 120));

  try {
    const result = await httpsGet(finalUrl, {
      'Cookie': cachedCookie,
      'Accept': 'application/json, */*',
      'Referer': 'https://finance.yahoo.com',
    });

    // If Yahoo returned 401, force re-auth and retry once
    if (result.status === 401 || result.status === 403) {
      console.log('[PROXY] Auth expired, retrying...');
      try {
        await refreshAuth();
        const retryUrl = targetUrl + (targetUrl.includes('?') ? '&' : '?') + 'crumb=' + encodeURIComponent(cachedCrumb);
        const retry = await httpsGet(retryUrl, { 'Cookie': cachedCookie, 'Accept': 'application/json, */*', 'Referer': 'https://finance.yahoo.com' });
        return {
          statusCode: retry.status,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          body: retry.body
        };
      } catch (e2) {
        console.error('[PROXY] Retry failed:', e2.message);
      }
    }

    return {
      statusCode: result.status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
      body: result.body
    };
  } catch (e) {
    console.error('[PROXY] Fetch error:', e.message);
    return { statusCode: 502, headers: CORS_HEADERS, body: JSON.stringify({ error: e.message }) };
  }
};
