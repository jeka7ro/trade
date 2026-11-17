'use strict';

/**
 * Automated Security & Read-Only Verification Suite for eToroSyncService
 * Fails immediately if any write operation (POST, PUT, PATCH, DELETE) or
 * non-whitelisted endpoint is allowed toward eToro Public API.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  createEtoroSyncService,
  assertReadOnlyEtoroRequest,
  ALLOWED_READ_ENDPOINTS,
  ETORO_API_HOST
} = require('./etoro-sync-service');

async function runTests() {
  console.log('1. Verificare whitelist înghețat (Object.isFrozen)...');
  assert.strictEqual(Object.isFrozen(ALLOWED_READ_ENDPOINTS), true, 'ALLOWED_READ_ENDPOINTS must be frozen');
  assert.deepStrictEqual(ALLOWED_READ_ENDPOINTS, [
    '/api/v1/trading/info/portfolio',
    '/api/v1/trading/info/real/pnl',
    '/api/v1/market-data/instruments'
  ]);

  console.log('2. Verificare blocare metode de scriere (POST, PUT, PATCH, DELETE)...');
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
    let blocked = false;
    try {
      assertReadOnlyEtoroRequest(method, `https://${ETORO_API_HOST}/api/v1/trading/info/portfolio`);
    } catch (err) {
      blocked = /SECURITY_VIOLATION/.test(err.message);
    }
    assert.strictEqual(blocked, true, `Method ${method} MUST be blocked`);
  }

  console.log('3. Verificare blocare body în cereri GET...');
  let bodyBlocked = false;
  try {
    assertReadOnlyEtoroRequest('GET', `https://${ETORO_API_HOST}/api/v1/trading/info/portfolio`, { body: '{"amount":100}' });
  } catch (err) {
    bodyBlocked = /SECURITY_VIOLATION/.test(err.message);
  }
  assert.strictEqual(bodyBlocked, true, 'Request with body MUST be blocked');

  console.log('4. Verificare blocare endpoint-uri de execuție / modificare poziții / transferuri...');
  const forbiddenPaths = [
    '/api/v1/trading/execution/market-open-orders',
    '/api/v1/trading/execution/market-close-orders',
    '/api/v2/trading/positions/123456',
    '/api/v1/trading/positions/123456',
    '/api/v1/payments/withdraw',
    '/api/v1/payments/deposit',
    '/api/v1/orders/cancel'
  ];
  for (const p of forbiddenPaths) {
    let blocked = false;
    try {
      assertReadOnlyEtoroRequest('GET', `https://${ETORO_API_HOST}${p}`);
    } catch (err) {
      blocked = /SECURITY_VIOLATION/.test(err.message);
    }
    assert.strictEqual(blocked, true, `Endpoint ${p} MUST be blocked`);
  }

  console.log('5. Verificare sincronizare poziții individuale (APPS, ONDS) și valori SL/TP...');
  let syncedResult = null;
  const mockFetch = async (url, opts) => {
    assert.strictEqual(opts.method, 'GET', 'Fetch call must strictly use GET');
    assert.strictEqual(opts.body, undefined, 'Fetch call must never send a body');
    if (url.includes('/api/v1/market-data/instruments')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          instruments: [
            { instrumentId: 1001, symbolFull: 'APPS', instrumentDisplayName: 'Digital Turbine Inc' },
            { instrumentId: 1002, symbolFull: 'ONDS', instrumentDisplayName: 'Ondas Inc' }
          ]
        })
      };
    }
    if (url.endsWith('/api/v1/trading/info/portfolio')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          clientPortfolio: {
            credit: 520.5,
            positions: [
              { positionId: 901, instrumentId: 1001, isBuy: true, units: 200, amount: 300, openRate: 7.31, leverage: 5, stopLossRate: 6.53, takeProfitRate: 21.93, openDateTime: '10/11/2026 17:09' },
              { positionId: 902, instrumentId: 1001, isBuy: true, units: 250, amount: 450, openRate: 9.116, leverage: 5, stopLossRate: 6.53, takeProfitRate: 27.33, openDateTime: '02/11/2026 17:44' },
              { positionId: 903, instrumentId: 1002, isBuy: true, units: 300, amount: 400, openRate: 5.35, leverage: 5, stopLossRate: 4.00, takeProfitRate: 16.05, openDateTime: '12/11/2026 18:34' }
            ],
            ordersForOpen: []
          }
        })
      };
    }
    if (url.endsWith('/api/v1/trading/info/real/pnl')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          clientPortfolio: {
            credit: 520.5,
            positions: [
              { positionId: 901, currentRate: 7.06, netProfit: -50.0 },
              { positionId: 902, currentRate: 7.06, netProfit: -514.0 },
              { positionId: 903, currentRate: 4.63, netProfit: -216.0 }
            ]
          }
        })
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  process.env.ETORO_API_KEY = 'test_pub_key_123456';
  process.env.ETORO_USER_KEY = 'test_usr_key_654321';

  const svc = createEtoroSyncService({
    fetchImpl: mockFetch,
    onPortfolioSynced: async (payload) => {
      syncedResult = svc.buildRealPortfolioFromEtoro({
        existingPortfolio: { assets: [] },
        snapshot: payload.snapshot,
        positions: payload.positions
      });
    }
  });

  const syncOut = await svc.syncNow('test_user');
  assert.strictEqual(syncOut.ok, true);
  assert.strictEqual(syncOut.positionsCount, 3);
  assert.ok(syncedResult, 'buildRealPortfolioFromEtoro must produce portfolio');
  const appsAsset = syncedResult.assets.find(a => a.brokerSym === 'APPS');
  const ondsAsset = syncedResult.assets.find(a => a.brokerSym === 'ONDS');
  assert.strictEqual(appsAsset.lots.length, 2, 'Individual APPS positions must NOT be collapsed into 1 lot');
  assert.strictEqual(appsAsset.lots[0].positionId, '901');
  assert.strictEqual(appsAsset.lots[1].positionId, '902');
  assert.strictEqual(appsAsset.lots[0].sl, 6.53);
  assert.strictEqual(ondsAsset.lots.length, 1);
  assert.strictEqual(ondsAsset.lots[0].positionId, '903');

  console.log('6. Verificare comportament când API-ul eToro este indisponibil...');
  const svcFail = createEtoroSyncService({
    fetchImpl: async () => ({ ok: false, status: 503, text: async () => JSON.stringify({ message: 'Service Unavailable' }) })
  });
  let caughtUnavailable = false;
  try {
    await svcFail.syncNow('test_user');
  } catch (err) {
    caughtUnavailable = /503|Service Unavailable/.test(err.message);
  }
  assert.strictEqual(caughtUnavailable, true, 'Unavailable API must be handled gracefully');

  console.log('7. Audit static cod sursă: zero metode de scriere către public-api.etoro.com...');
  const src = fs.readFileSync(path.join(__dirname, 'etoro-sync-service.js'), 'utf8');
  assert.strictEqual(/method\s*:\s*['"](POST|PUT|PATCH|DELETE)['"]/i.test(src), false, 'Source code must not contain POST/PUT/PATCH/DELETE fetch calls');

  // Clean up test state file
  const testStateFile = path.join(__dirname, 'etoro_state.json');
  if (fs.existsSync(testStateFile)) fs.unlinkSync(testStateFile);

  console.log('ALL_ETORO_READONLY_SECURITY_TESTS_PASSED: 7/7');
}

runTests().catch((err) => {
  console.error('SECURITY_TEST_FAILED:', err);
  process.exit(1);
});
