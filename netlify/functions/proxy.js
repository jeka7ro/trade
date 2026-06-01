const https = require('https');
const url = require('url');

let yahooCookie = '';
let yahooCrumb = '';

async function getCookie() {
    return new Promise((resolve, reject) => {
        https.get('https://fc.yahoo.com', (res) => {
            const cookies = res.headers['set-cookie'];
            if (cookies) {
                yahooCookie = cookies.map(c => c.split(';')[0]).join('; ');
                resolve(yahooCookie);
            } else {
                reject(new Error("No cookie received from Yahoo"));
            }
        }).on('error', reject);
    });
}

async function getCrumb() {
    return new Promise((resolve, reject) => {
        https.get('https://query1.finance.yahoo.com/v1/test/getcrumb', {
            headers: {
                'Cookie': yahooCookie,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    yahooCrumb = data;
                    resolve(yahooCrumb);
                } else {
                    reject(new Error(`Failed to get crumb: ${res.statusCode}`));
                }
            });
        }).on('error', reject);
    });
}

async function ensureAuth() {
    if (!yahooCookie || !yahooCrumb) {
        await getCookie();
        await getCrumb();
        console.log(`[AUTH] Yahoo Crumb obtained: ${yahooCrumb}`);
    }
}

exports.handler = async function(event, context) {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
    }

    const path = event.path;
    const targetUrlRaw = event.queryStringParameters.url;

    if (!targetUrlRaw && !path.includes('/api/meta')) {
        return { statusCode: 400, headers: {'Access-Control-Allow-Origin': '*'}, body: 'Missing url parameter' };
    }

    try {
        await ensureAuth();

        const targetUrl = new URL(targetUrlRaw);
        targetUrl.searchParams.set('crumb', yahooCrumb);

        return new Promise((resolve) => {
            https.get(targetUrl.toString(), {
                headers: {
                    'Cookie': yahooCookie,
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    'Accept': 'application/json'
                }
            }, (proxyRes) => {
                let data = [];
                proxyRes.on('data', chunk => data.push(chunk));
                proxyRes.on('end', () => {
                    resolve({
                        statusCode: proxyRes.statusCode,
                        headers: {
                            'Content-Type': proxyRes.headers['content-type'] || 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        },
                        body: Buffer.concat(data).toString()
                    });
                });
            }).on('error', err => {
                resolve({ statusCode: 500, headers: {'Access-Control-Allow-Origin': '*'}, body: err.message });
            });
        });
    } catch (e) {
        return { statusCode: 500, headers: {'Access-Control-Allow-Origin': '*'}, body: 'Yahoo Authentication failed: ' + e.message };
    }
};
