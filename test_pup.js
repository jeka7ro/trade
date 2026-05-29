const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    page.on('requestfailed', request => console.log('REQ FAILED:', request.url(), request.failure().errorText));

    await page.goto('http://localhost:3456/TradePro_AI.html', { waitUntil: 'networkidle2' });
    
    await new Promise(r => setTimeout(r, 3000));
    await browser.close();
})();
