require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const FAVORITES = ['TSLA', 'NVDA', 'AAPL', 'MSFT', 'META', 'AMZN', 'GOOGL', 'BTC-USD', 'ETH-USD', 'APPS', 'CL=F'];

let bot = null;
if (TELEGRAM_TOKEN) {
    bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
} else {
    console.warn("⚠️ TELEGRAM_TOKEN nu este setat in .env! Alertele vor fi afisate doar in consola.");
}

async function sendAlert(message, logoUrl = null) {
    console.log('\n=========================================');
    console.log(' 🦅 TRADEPRO AI - SENDING SIGNAL... ');
    console.log('=========================================');
    console.log(message);
    if (logoUrl) console.log('🖼️  Logo:', logoUrl);
    console.log('=========================================\n');
    if (bot && CHAT_ID) {
        try {
            if (logoUrl) {
                try {
                    await bot.sendPhoto(CHAT_ID, logoUrl, { caption: message, parse_mode: 'HTML' });
                    return;
                } catch (err) {
                    console.log('⚠️ Eroare la trimiterea pozei, trimit doar text...', err.message);
                }
            }
            await bot.sendMessage(CHAT_ID, message, { parse_mode: 'HTML' });
        } catch (e) {
            console.error("Failed to send Telegram message:", e.message);
        }
    }
}

async function getCompanyMeta(sym) {
    try {
        const res = await yahooFinance.quoteSummary(sym, { modules: ['summaryProfile', 'price'] });
        const searchData = await yahooFinance.search(sym, { newsCount: 2, quotesCount: 0 });
        const name = res?.price?.shortName || res?.price?.longName || sym;
        const website = res?.summaryProfile?.website || null;
        let logoUrl = null;
        if (website) {
            try {
                let host = new URL(website).hostname;
                logoUrl = `https://logo.clearbit.com/${host}`;
            } catch(e){}
        }
        return { name, logoUrl, news: searchData?.news || [] };
    } catch(e) {
        return { name: sym, logoUrl: null, news: [] };
    }
}

function calcRSI14(data) {
    if (data.length < 15) return 50;
    let gains = 0, losses = 0;
    for (let i = data.length - 14; i < data.length; i++) {
        let diff = data[i].close - data[i - 1].close;
        if (diff > 0) gains += diff;
        else losses -= diff;
    }
    let avgGain = gains / 14;
    let avgLoss = losses / 14;
    if (avgLoss === 0) return 100;
    let rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function getReason(rsi, isUp) {
    let reason = "🔍 <b>Motivul AI-ului:</b>\n";
    if (isUp) {
        if (rsi < 35) reason += "📊 RSI arată o zonă de <b>supravânzare (Oversold)</b> extremă. Istoricul prețului confirmă un tipar de revenire în formă de V (Reversal). Balenele acumulează la reducere.";
        else if (rsi > 65) reason += "🔥 Momentum uriaș. Indicatorii arată un <b>trend ascendent agresiv</b> care abia s-a validat (Breakout). Tiparele similare din trecut au continuat să explodeze.";
        else reason += "📈 Prețul a creat o <b>bază solidă de acumulare</b> neutră. Geometria actuală a prețului a coincis în trecut cu o izbucnire bruscă în sus (Pump iminent).";
    } else {
        if (rsi > 65) reason += "⚠️ RSI indică o zonă de <b>supracumpărare (Overbought)</b>. Euforia a atins vârful, iar cumpărătorii sunt epuizați. Tiparele istorice arată o cădere bruscă de aici.";
        else if (rsi < 35) reason += "🩸 Presiune masivă de vânzare. Algoritmul detectează ruperea unor <b>suporturi critice</b>, ceea ce în trecut a dus la panică și capitulare continuă (Dump).";
        else reason += "📉 Graficul a format un <b>tipar periculos de distribuție</b>. Instituțiile își descarcă tăcut pozițiile. Istoricul arată că după o astfel de structură urmează o prăbușire.";
    }
    return reason;
}

async function runScreener() {
    console.log(`\n[${new Date().toLocaleString()}] 🚀 Start AI Screener (Global Market & Favorites)...`);
    const FRACTAL_LEN = 14;
    const FORECAST_LEN = 10;
    
    let dynamicSymbols = [];
    try {
        console.log(`[${new Date().toLocaleString()}] 🔄 Fetching Market Scanners...`);
        const actives = await yahooFinance.screener({ scrIds: 'most_actives', count: 25 });
        const gainers = await yahooFinance.screener({ scrIds: 'day_gainers', count: 25 });
        const losers = await yahooFinance.screener({ scrIds: 'day_losers', count: 25 });
        
        dynamicSymbols = [
            ...(actives.quotes || []).map(q => q.symbol),
            ...(gainers.quotes || []).map(q => q.symbol),
            ...(losers.quotes || []).map(q => q.symbol)
        ];
    } catch(e) {
        console.error("Eroare la extragerea listei globale:", e.message);
    }
    
    // Combine and deduplicate
    const allSymbolsSet = new Set([...FAVORITES, ...dynamicSymbols]);
    const ALL_SYMBOLS = Array.from(allSymbolsSet).filter(s => !!s);
    
    console.log(`[${new Date().toLocaleString()}] 📊 Total de scanat: ${ALL_SYMBOLS.length} simboluri.`);

    for (let idx = 0; idx < ALL_SYMBOLS.length; idx++) {
        const sym = ALL_SYMBOLS[idx];
        const isFavorite = FAVORITES.includes(sym);
        // Prag de 5% pentru favorite, 10% pentru globale (dinamice)
        const alertThreshold = isFavorite ? 5 : 10;

        try {
            const queryOptions = { period1: '2023-01-01', interval: '1d' };
            const result = await yahooFinance.chart(sym, queryOptions);
            
            if (!result || !result.quotes || result.quotes.length < 50) continue;
            
            // Format data
            const allData = result.quotes.map(d => ({
                time: Math.floor(new Date(d.date).getTime() / 1000),
                open: d.open,
                high: d.high,
                low: d.low,
                close: d.close,
                volume: d.volume
            }));
            
            const currentSlice = allData.slice(-FRACTAL_LEN);
            const currentBase = currentSlice[0].close;
            const currentNorm = currentSlice.map(d => d.close / currentBase);
            const currentMom = (currentSlice[FRACTAL_LEN-1].close / currentBase) - 1;
            
            let matches = [];
            for (let i = 0; i < allData.length - FRACTAL_LEN - FORECAST_LEN - Math.max(10, FRACTAL_LEN); i++) {
                const histSlice = allData.slice(i, i + FRACTAL_LEN);
                const histBase = histSlice[0].close;
                const histNorm = histSlice.map(d => d.close / histBase);
                const histMom = (histSlice[FRACTAL_LEN-1].close / histBase) - 1;
                
                if (Math.sign(currentMom) !== Math.sign(histMom)) continue;
                if (Math.abs(currentMom) > 0.03 && Math.abs(histMom) < Math.abs(currentMom) * 0.3) continue;
                
                let error = 0;
                for (let j = 0; j < FRACTAL_LEN; j++) {
                    error += Math.abs(currentNorm[j] - histNorm[j]);
                }
                
                const afterSlice = allData.slice(i + FRACTAL_LEN, i + FRACTAL_LEN + FORECAST_LEN);
                const resultBase = histSlice[FRACTAL_LEN-1].close;
                const resultFinal = afterSlice[afterSlice.length-1].close;
                const resultPct = ((resultFinal / resultBase) - 1) * 100;
                
                matches.push({ error, resultPct });
            }
            
            if (matches.length > 0) {
                matches.sort((a,b) => a.error - b.error);
                const topMatches = matches.slice(0, 3);
                
                // Calculate average predicted change
                const avgPct = topMatches.reduce((sum, m) => sum + m.resultPct, 0) / topMatches.length;
                
                // TRIGGER ALERT IF > threshold
                if (avgPct >= alertThreshold || avgPct <= -alertThreshold) {
                    const meta = await getCompanyMeta(sym);
                    const direction = avgPct > 0 ? '📈 CREȘTERE' : '📉 SCĂDERE';
                    const lastPrice = allData[allData.length - 1].close.toFixed(2);
                    const listType = isFavorite ? '⭐ FAVORITE' : '🌐 GLOBAL SCANNER';
                    
                    const rsi = calcRSI14(allData);
                    const isUp = avgPct > 0;
                    let reasonTxt = getReason(rsi, isUp);
                    if (meta.news && meta.news.length > 0) {
                        reasonTxt += `\n\n📰 <b>Context Fundamental (Știri):</b>\n${meta.news[0].title}`;
                    }

                    const msg = `🚨 <b>ALERTA AI: ${meta.name} (${sym})</b> (${listType}) 🚨\n\nDirecție: <b>${direction}</b>\nPredicție: <b>${avgPct > 0 ? '+' : ''}${avgPct.toFixed(2)}%</b>\nPreț curent: $${lastPrice}\n\n${reasonTxt}`;
                    await sendAlert(msg, meta.logoUrl);
                } else {
                    console.log(`[${idx+1}/${ALL_SYMBOLS.length}] [${sym}] Predicție: ${avgPct.toFixed(2)}% -> Ignorat (sub ${alertThreshold}%)`);
                }
            } else {
                console.log(`[${idx+1}/${ALL_SYMBOLS.length}] [${sym}] Fără tipare istorice.`);
            }
            
            // Sleep to avoid rate limits
            await new Promise(r => setTimeout(r, 1000));
        } catch(e) {
            console.error(`Error processing ${sym}:`, e.message);
        }
    }
    console.log(`[${new Date().toLocaleString()}] ✅ Screener Finalizat.`);
}

// Rulam la pornire
runScreener();

// Apoi rulam la fiecare 4 ore
setInterval(runScreener, 4 * 60 * 60 * 1000);
