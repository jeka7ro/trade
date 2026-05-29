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

async function sendAlert(message) {
    console.log(message);
    if (bot && CHAT_ID) {
        try {
            await bot.sendMessage(CHAT_ID, message, { parse_mode: 'HTML' });
        } catch (e) {
            console.error("Failed to send Telegram message:", e.message);
        }
    }
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
        const alertThreshold = isFavorite ? 10 : 20; // 10% for favorites, 20% for others

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
                    const direction = avgPct > 0 ? '📈 CREȘTERE' : '📉 SCĂDERE';
                    const lastPrice = allData[allData.length - 1].close.toFixed(2);
                    const listType = isFavorite ? '⭐ FAVORITE' : '🌐 GLOBAL SCANNER';
                    const msg = `🚨 <b>ALERTA AI: ${sym}</b> (${listType}) 🚨\n\nDirecție: <b>${direction}</b>\nPredicție: <b>${avgPct > 0 ? '+' : ''}${avgPct.toFixed(2)}%</b>\nPreț curent: $${lastPrice}\n\nTiparele istorice sugerează o mișcare masivă în următoarele ${FORECAST_LEN} zile.`;
                    await sendAlert(msg);
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
