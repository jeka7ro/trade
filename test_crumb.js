const https = require('https');

async function getCookie() {
    return new Promise((resolve, reject) => {
        https.get('https://fc.yahoo.com', (res) => {
            const cookies = res.headers['set-cookie'];
            if (cookies) {
                const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');
                resolve(cookieStr);
            } else {
                reject(new Error("No cookie"));
            }
        }).on('error', reject);
    });
}

async function getCrumb(cookie) {
    return new Promise((resolve, reject) => {
        https.get('https://query1.finance.yahoo.com/v1/test/getcrumb', {
            headers: {
                'Cookie': cookie,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function fetchChart(symbol, cookie, crumb) {
    return new Promise((resolve, reject) => {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d&crumb=${crumb}`;
        https.get(url, {
            headers: {
                'Cookie': cookie,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        }).on('error', reject);
    });
}

async function run() {
    try {
        const cookie = await getCookie();
        console.log("Cookie:", cookie);
        const crumb = await getCrumb(cookie);
        console.log("Crumb:", crumb);
        const { status, data } = await fetchChart('AAPL', cookie, crumb);
        console.log("Status:", status);
        console.log("Data sample:", data.substring(0, 100));
    } catch(e) {
        console.error(e);
    }
}
run();
