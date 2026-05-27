const http = require('http');
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

const server = http.createServer(async (req, res) => {
    // Enable CORS for frontend
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    if (parsedUrl.pathname !== '/proxy') {
        res.writeHead(404);
        res.end('Not found');
        return;
    }

    const targetUrlRaw = parsedUrl.query.url;
    if (!targetUrlRaw) {
        res.writeHead(400);
        res.end('Missing url parameter');
        return;
    }

    try {
        await ensureAuth();

        const targetUrl = new URL(targetUrlRaw);
        targetUrl.searchParams.set('crumb', yahooCrumb);

        console.log(`[PROXY] Fetching: ${targetUrl.toString()}`);

        const proxyReq = https.get(targetUrl.toString(), {
            headers: {
                'Cookie': yahooCookie,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept': 'application/json'
            }
        }, (proxyRes) => {
            console.log(`[PROXY] Response from Yahoo: ${proxyRes.statusCode}`);
            console.log(`[PROXY] Yahoo Headers:`, proxyRes.headers);
            res.writeHead(proxyRes.statusCode, {
                'Content-Type': proxyRes.headers['content-type'] || 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
            console.error('[ERROR]', err.message);
            res.writeHead(500);
            res.end(err.message);
        });

    } catch (e) {
        console.error('[AUTH ERROR]', e.message);
        res.writeHead(500);
        res.end('Yahoo Authentication failed: ' + e.message);
    }
});

const PORT = 3457;
server.listen(PORT, () => {
    console.log(`\n=============================================`);
    console.log(`🚀 Yahoo Finance Proxy running on port ${PORT}`);
    console.log(`=============================================\n`);
});
