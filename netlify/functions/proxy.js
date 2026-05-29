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
    const defaultHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: defaultHeaders, body: '' };
    }

    const targetUrlRaw = event.queryStringParameters.url;
    if (!targetUrlRaw) {
        return { statusCode: 400, headers: defaultHeaders, body: 'Missing url parameter' };
    }

    try {
        await ensureAuth();
        const targetUrl = new URL(targetUrlRaw);
        targetUrl.searchParams.set('crumb', yahooCrumb);

        return new Promise((resolve, reject) => {
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
                    const bodyString = Buffer.concat(data).toString();
                    resolve({
                        statusCode: proxyRes.statusCode,
                        headers: {
                            ...defaultHeaders,
                            'Content-Type': proxyRes.headers['content-type'] || 'application/json'
                        },
                        body: bodyString
                    });
                });
            }).on('error', (err) => {
                resolve({ statusCode: 500, headers: defaultHeaders, body: err.message });
            });
        });
    } catch (e) {
        return { statusCode: 500, headers: defaultHeaders, body: e.message };
    }
};
