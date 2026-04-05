const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const host = '127.0.0.1';
const port = Number(process.env.PORT || 3000);
const rootDir = __dirname;
const alphaVantageApiKey = process.env.ALPHA_VANTAGE_API_KEY || 'demo';

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

const supportedResolutions = ['1D', '1W'];
const cacheStore = new Map();
const dynamicSymbolStore = new Map();
const alphaPolicy = {
  minIntervalMs: alphaVantageApiKey === 'demo' ? 20000 : 14000,
  seriesTtlMs: 20 * 60 * 1000,
  seriesStaleMs: 24 * 60 * 60 * 1000,
  searchTtlMs: 24 * 60 * 60 * 1000,
  searchStaleMs: 7 * 24 * 60 * 60 * 1000,
  maxSearchResults: 12,
};
const alphaStats = {
  queueDepth: 0,
  remoteCalls: 0,
  cacheHits: 0,
  cacheMisses: 0,
  staleResponses: 0,
  totalWaitMs: 0,
};

let alphaQueue = Promise.resolve();
let alphaNextAvailableAt = 0;

function detectLocale(request, requestUrl) {
  const queryLocale = String(requestUrl.searchParams.get('locale') || '').toLowerCase();
  if (queryLocale.startsWith('zh')) {
    return 'zh';
  }

  const acceptLanguage = String(request.headers['accept-language'] || '').toLowerCase();
  if (acceptLanguage.startsWith('zh')) {
    return 'zh';
  }

  return 'en';
}

function isChineseLocale(locale) {
  return locale === 'zh';
}

function localizedText(locale, englishText, chineseText) {
  return isChineseLocale(locale) ? chineseText : englishText;
}

function getLocalizedDescription(record, locale) {
  if (!isChineseLocale(locale)) {
    return record.description;
  }

  const descriptionByTicker = {
    'BITSTAMP:BTCUSD': '比特币 / 美元',
    'BITSTAMP:ETHUSD': '以太坊 / 美元',
    'BITSTAMP:SOLUSD': 'Solana / 美元',
    'FX:EURUSD': '欧元 / 美元',
    'FX:GBPUSD': '英镑 / 美元',
    'FX:USDJPY': '美元 / 日元',
    'NASDAQ:AAPL': '苹果公司',
    'NASDAQ:MSFT': '微软公司',
    'NASDAQ:NVDA': '英伟达公司',
    'NASDAQ:TSLA': '特斯拉公司',
  };

  if (descriptionByTicker[record.ticker]) {
    return descriptionByTicker[record.ticker];
  }

  if (record.source === 'parsed' && record.type === 'forex' && record.alpha && record.alpha.from && record.alpha.to) {
    return `${record.alpha.from} / ${record.alpha.to} 汇率`;
  }

  if (record.source === 'parsed' && record.type === 'crypto' && record.alpha && record.alpha.symbol && record.alpha.market) {
    return `${record.alpha.symbol} / ${record.alpha.market === 'USD' ? '美元' : record.alpha.market}`;
  }

  if (record.type === 'stock' && / equity$/i.test(record.description || '')) {
    return `${record.name} 股票`;
  }

  return record.description;
}

function getLocalizedExchangeDesc(exchangeValue, locale) {
  const descriptions = {
    BITSTAMP: localizedText(locale, 'Bitstamp', 'Bitstamp 数字资产市场'),
    FX: localizedText(locale, 'Foreign Exchange', '外汇市场'),
    NASDAQ: 'NASDAQ',
    US: localizedText(locale, 'Alpha Vantage stock search results', 'Alpha Vantage 股票搜索结果'),
  };

  return descriptions[exchangeValue] || exchangeValue;
}

function getLocalizedSeriesType(seriesType, locale) {
  const mapping = {
    Daily: localizedText(locale, 'Daily', '日线'),
    'Weekly aggregate': localizedText(locale, 'Weekly aggregate', '周线聚合'),
    'Sample Daily': localizedText(locale, 'Sample Daily', '示例日线'),
  };

  return mapping[seriesType] || seriesType;
}

function localizeAlphaErrorMessage(message, locale) {
  const errorText = String(message || '');

  if (!isChineseLocale(locale)) {
    return errorText;
  }

  if (errorText.includes('The **demo** API key is for demo purposes only.')) {
    return '当前使用的是 Alpha Vantage 演示 Key，仅适用于演示用途。请配置私有 API Key 以访问完整接口能力。';
  }

  if (errorText.includes('Alpha Vantage request failed with status')) {
    return 'Alpha Vantage 远程请求失败，返回了异常状态码。';
  }

  if (errorText.includes('Alpha Vantage series was not found in the response.')) {
    return 'Alpha Vantage 返回中未找到对应的时间序列数据。';
  }

  if (errorText === 'Unknown symbol') {
    return '未知标的';
  }

  return errorText;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createSymbolRecord(options) {
  return {
    ticker: options.ticker,
    name: options.name,
    full_name: options.full_name || options.ticker,
    description: options.description,
    type: options.type,
    session: options.session,
    exchange: options.exchange,
    listed_exchange: options.listed_exchange || options.exchange,
    timezone: 'Etc/UTC',
    minmov: 1,
    pricescale: options.pricescale,
    has_intraday: false,
    has_daily: true,
    has_weekly_and_monthly: true,
    supported_resolutions: supportedResolutions,
    volume_precision: 2,
    data_status: 'streaming',
    widgetSymbol: options.widgetSymbol === undefined ? options.ticker : options.widgetSymbol,
    alpha: options.alpha,
    provider: 'Alpha Vantage',
    source: options.source || 'curated',
  };
}

const symbolCatalog = {
  'BITSTAMP:BTCUSD': createSymbolRecord({
    ticker: 'BITSTAMP:BTCUSD',
    name: 'BTCUSD',
    description: 'Bitcoin / U.S. Dollar',
    type: 'crypto',
    session: '24x7',
    exchange: 'BITSTAMP',
    pricescale: 100,
    alpha: { category: 'crypto', symbol: 'BTC', market: 'USD' },
  }),
  'BITSTAMP:ETHUSD': createSymbolRecord({
    ticker: 'BITSTAMP:ETHUSD',
    name: 'ETHUSD',
    description: 'Ethereum / U.S. Dollar',
    type: 'crypto',
    session: '24x7',
    exchange: 'BITSTAMP',
    pricescale: 100,
    alpha: { category: 'crypto', symbol: 'ETH', market: 'USD' },
  }),
  'BITSTAMP:SOLUSD': createSymbolRecord({
    ticker: 'BITSTAMP:SOLUSD',
    name: 'SOLUSD',
    description: 'Solana / U.S. Dollar',
    type: 'crypto',
    session: '24x7',
    exchange: 'BITSTAMP',
    pricescale: 100,
    alpha: { category: 'crypto', symbol: 'SOL', market: 'USD' },
  }),
  'FX:EURUSD': createSymbolRecord({
    ticker: 'FX:EURUSD',
    name: 'EURUSD',
    description: 'Euro / U.S. Dollar',
    type: 'forex',
    session: '24x7',
    exchange: 'FX',
    pricescale: 100000,
    alpha: { category: 'forex', from: 'EUR', to: 'USD' },
  }),
  'FX:GBPUSD': createSymbolRecord({
    ticker: 'FX:GBPUSD',
    name: 'GBPUSD',
    description: 'British Pound / U.S. Dollar',
    type: 'forex',
    session: '24x7',
    exchange: 'FX',
    pricescale: 100000,
    alpha: { category: 'forex', from: 'GBP', to: 'USD' },
  }),
  'FX:USDJPY': createSymbolRecord({
    ticker: 'FX:USDJPY',
    name: 'USDJPY',
    description: 'U.S. Dollar / Japanese Yen',
    type: 'forex',
    session: '24x7',
    exchange: 'FX',
    pricescale: 1000,
    alpha: { category: 'forex', from: 'USD', to: 'JPY' },
  }),
  'NASDAQ:AAPL': createSymbolRecord({
    ticker: 'NASDAQ:AAPL',
    name: 'AAPL',
    description: 'Apple Inc.',
    type: 'stock',
    session: '0900-1630',
    exchange: 'NASDAQ',
    pricescale: 100,
    alpha: { category: 'stock', symbol: 'AAPL' },
  }),
  'NASDAQ:MSFT': createSymbolRecord({
    ticker: 'NASDAQ:MSFT',
    name: 'MSFT',
    description: 'Microsoft Corporation',
    type: 'stock',
    session: '0900-1630',
    exchange: 'NASDAQ',
    pricescale: 100,
    alpha: { category: 'stock', symbol: 'MSFT' },
  }),
  'NASDAQ:NVDA': createSymbolRecord({
    ticker: 'NASDAQ:NVDA',
    name: 'NVDA',
    description: 'NVIDIA Corporation',
    type: 'stock',
    session: '0900-1630',
    exchange: 'NASDAQ',
    pricescale: 100,
    alpha: { category: 'stock', symbol: 'NVDA' },
  }),
  'NASDAQ:TSLA': createSymbolRecord({
    ticker: 'NASDAQ:TSLA',
    name: 'TSLA',
    description: 'Tesla, Inc.',
    type: 'stock',
    session: '0900-1630',
    exchange: 'NASDAQ',
    pricescale: 100,
    alpha: { category: 'stock', symbol: 'TSLA' },
  }),
};

function registerDynamicSymbol(record) {
  dynamicSymbolStore.set(record.ticker, record);
  return record;
}

function getAllKnownSymbols() {
  return [...Object.values(symbolCatalog), ...dynamicSymbolStore.values()];
}

function resolveSymbolRecord(symbol) {
  if (symbolCatalog[symbol]) {
    return symbolCatalog[symbol];
  }

  if (dynamicSymbolStore.has(symbol)) {
    return dynamicSymbolStore.get(symbol);
  }

  const stockMatch = /^AV:([A-Z0-9.\-]+)$/i.exec(symbol);
  if (stockMatch) {
    return registerDynamicSymbol(
      createSymbolRecord({
        ticker: `AV:${stockMatch[1].toUpperCase()}`,
        name: stockMatch[1].toUpperCase(),
        description: `${stockMatch[1].toUpperCase()} equity`,
        type: 'stock',
        session: '0900-1630',
        exchange: 'US',
        listed_exchange: 'US',
        pricescale: 100,
        widgetSymbol: null,
        source: 'alpha-search',
        alpha: { category: 'stock', symbol: stockMatch[1].toUpperCase() },
      })
    );
  }

  const forexMatch = /^FX:([A-Z]{6})$/.exec(symbol);
  if (forexMatch) {
    const pair = forexMatch[1].toUpperCase();
    return registerDynamicSymbol(
      createSymbolRecord({
        ticker: `FX:${pair}`,
        name: pair,
        description: `${pair.slice(0, 3)} / ${pair.slice(3)} exchange rate`,
        type: 'forex',
        session: '24x7',
        exchange: 'FX',
        listed_exchange: 'FX',
        pricescale: pair.endsWith('JPY') ? 1000 : 100000,
        widgetSymbol: `FX:${pair}`,
        source: 'parsed',
        alpha: { category: 'forex', from: pair.slice(0, 3), to: pair.slice(3) },
      })
    );
  }

  const cryptoMatch = /^BITSTAMP:([A-Z]{3,10})USD$/.exec(symbol);
  if (cryptoMatch) {
    const crypto = cryptoMatch[1].toUpperCase();
    return registerDynamicSymbol(
      createSymbolRecord({
        ticker: `BITSTAMP:${crypto}USD`,
        name: `${crypto}USD`,
        description: `${crypto} / U.S. Dollar`,
        type: 'crypto',
        session: '24x7',
        exchange: 'BITSTAMP',
        listed_exchange: 'BITSTAMP',
        pricescale: 100,
        widgetSymbol: `BITSTAMP:${crypto}USD`,
        source: 'parsed',
        alpha: { category: 'crypto', symbol: crypto, market: 'USD' },
      })
    );
  }

  return null;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function sendFile(response, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = mimeTypes[ext] || 'application/octet-stream';
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendJson(response, 404, { error: 'Not found' });
      return;
    }

    response.writeHead(200, { 'Content-Type': mimeType });
    response.end(data);
  });
}

function resolveStaticPath(urlPath) {
  const safePath = decodeURIComponent(urlPath.split('?')[0]);
  const relativePath = safePath === '/' ? '/index.html' : safePath;
  const fullPath = path.normalize(path.join(rootDir, relativePath));

  if (!fullPath.startsWith(rootDir)) {
    return null;
  }

  return fullPath;
}

function fetchJson(remoteUrl) {
  return new Promise((resolve, reject) => {
    https
      .get(remoteUrl, (remoteResponse) => {
        let rawData = '';

        remoteResponse.on('data', (chunk) => {
          rawData += chunk;
        });

        remoteResponse.on('end', () => {
          try {
            if (remoteResponse.statusCode && remoteResponse.statusCode >= 400) {
              reject(new Error(`Alpha Vantage request failed with status ${remoteResponse.statusCode}`));
              return;
            }

            const payload = JSON.parse(rawData || '{}');
            resolve(payload);
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject);
  });
}

function enqueueAlphaRequest(label, loader) {
  alphaStats.queueDepth += 1;

  const scheduled = alphaQueue
    .catch(() => undefined)
    .then(async () => {
      alphaStats.queueDepth = Math.max(0, alphaStats.queueDepth - 1);
      const waitMs = Math.max(0, alphaNextAvailableAt - Date.now());

      if (waitMs > 0) {
        alphaStats.totalWaitMs += waitMs;
        await wait(waitMs);
      }

      alphaNextAvailableAt = Date.now() + alphaPolicy.minIntervalMs;
      alphaStats.remoteCalls += 1;
      return loader(label);
    });

  alphaQueue = scheduled;
  return scheduled;
}

function getCachedValue(cacheKey, ttlMs, staleMs, loader) {
  const cached = cacheStore.get(cacheKey);
  const now = Date.now();

  if (cached && cached.value !== undefined && cached.expiresAt > now) {
    alphaStats.cacheHits += 1;
    return Promise.resolve({ value: cached.value, cacheStatus: 'fresh' });
  }

  if (cached && cached.promise) {
    return cached.promise;
  }

  alphaStats.cacheMisses += 1;

  const promise = loader()
    .then((value) => {
      cacheStore.set(cacheKey, {
        value,
        expiresAt: Date.now() + ttlMs,
        staleUntil: Date.now() + ttlMs + staleMs,
      });
      return { value, cacheStatus: cached && cached.value !== undefined ? 'refreshed' : 'miss' };
    })
    .catch((error) => {
      if (cached && cached.value !== undefined && cached.staleUntil > Date.now()) {
        alphaStats.staleResponses += 1;
        return { value: cached.value, cacheStatus: 'stale', staleReason: error.message };
      }

      cacheStore.delete(cacheKey);
      throw error;
    })
    .finally(() => {
      const current = cacheStore.get(cacheKey);
      if (current && current.promise === promise) {
        delete current.promise;
        cacheStore.set(cacheKey, current);
      }
    });

  cacheStore.set(cacheKey, {
    ...(cached || {}),
    promise,
  });

  return promise;
}

function toIsoDay(timeMs) {
  return new Date(timeMs).toISOString().slice(0, 10);
}

function parseAlphaPayload(record, payload) {
  if (payload['Error Message']) {
    throw new Error(payload['Error Message']);
  }

  if (payload.Information) {
    throw new Error(payload.Information);
  }

  if (payload.Note) {
    throw new Error(payload.Note);
  }

  let sourceSeries = null;
  let seriesType = 'Daily';

  if (record.alpha.category === 'stock') {
    sourceSeries = payload['Time Series (Daily)'];
  }

  if (record.alpha.category === 'forex') {
    sourceSeries = payload['Time Series FX (Daily)'];
  }

  if (record.alpha.category === 'crypto') {
    sourceSeries = payload['Time Series (Digital Currency Daily)'];
  }

  if (!sourceSeries) {
    throw new Error('Alpha Vantage series was not found in the response.');
  }

  const bars = Object.entries(sourceSeries)
    .map(([day, values]) => {
      if (record.alpha.category === 'crypto') {
        return {
          time: Date.parse(`${day}T00:00:00Z`),
          open: Number(values['1a. open (USD)']),
          high: Number(values['2a. high (USD)']),
          low: Number(values['3a. low (USD)']),
          close: Number(values['4a. close (USD)']),
          volume: Number(values['5. volume'] || 0),
        };
      }

      return {
        time: Date.parse(`${day}T00:00:00Z`),
        open: Number(values['1. open']),
        high: Number(values['2. high']),
        low: Number(values['3. low']),
        close: Number(values['4. close']),
        volume: Number(values['5. volume'] || 0),
      };
    })
    .filter((bar) => Number.isFinite(bar.open) && Number.isFinite(bar.close))
    .sort((left, right) => left.time - right.time);

  return { bars, seriesType };
}

function parseAlphaSearchPayload(payload) {
  if (payload['Error Message']) {
    throw new Error(payload['Error Message']);
  }

  if (payload.Information) {
    throw new Error(payload.Information);
  }

  if (payload.Note) {
    throw new Error(payload.Note);
  }

  return Array.isArray(payload.bestMatches) ? payload.bestMatches : [];
}

function aggregateWeekly(bars) {
  const grouped = new Map();

  bars.forEach((bar) => {
    const date = new Date(bar.time);
    const year = date.getUTCFullYear();
    const startOfYear = Date.UTC(year, 0, 1);
    const week = Math.ceil((((bar.time - startOfYear) / 86400000) + new Date(startOfYear).getUTCDay() + 1) / 7);
    const key = `${year}-${String(week).padStart(2, '0')}`;
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, { ...bar });
      return;
    }

    existing.high = Math.max(existing.high, bar.high);
    existing.low = Math.min(existing.low, bar.low);
    existing.close = bar.close;
    existing.volume = Number(existing.volume || 0) + Number(bar.volume || 0);
  });

  return Array.from(grouped.values()).sort((left, right) => left.time - right.time);
}

function buildAlphaUrl(record) {
  const params = new URLSearchParams({ apikey: alphaVantageApiKey, outputsize: 'compact' });

  if (record.alpha.category === 'stock') {
    params.set('function', 'TIME_SERIES_DAILY');
    params.set('symbol', record.alpha.symbol);
  }

  if (record.alpha.category === 'forex') {
    params.set('function', 'FX_DAILY');
    params.set('from_symbol', record.alpha.from);
    params.set('to_symbol', record.alpha.to);
  }

  if (record.alpha.category === 'crypto') {
    params.set('function', 'DIGITAL_CURRENCY_DAILY');
    params.set('symbol', record.alpha.symbol);
    params.set('market', record.alpha.market);
  }

  return `https://www.alphavantage.co/query?${params.toString()}`;
}

async function fetchAlphaSeries(symbol) {
  const record = resolveSymbolRecord(symbol);

  if (!record) {
    throw new Error('Unknown symbol');
  }

  const cachedResult = await getCachedValue(`alpha-daily:${symbol}`, alphaPolicy.seriesTtlMs, alphaPolicy.seriesStaleMs, async () => {
    return enqueueAlphaRequest(`series:${symbol}`, async () => {
      const payload = await fetchJson(buildAlphaUrl(record));
      return parseAlphaPayload(record, payload);
    });
  });

  return { ...cachedResult.value, cacheStatus: cachedResult.cacheStatus, staleReason: cachedResult.staleReason };
}

async function fetchAlphaSearch(query) {
  const normalizedQuery = query.trim().toUpperCase();
  const searchUrl = `https://www.alphavantage.co/query?${new URLSearchParams({ function: 'SYMBOL_SEARCH', keywords: normalizedQuery, apikey: alphaVantageApiKey }).toString()}`;
  const cachedResult = await getCachedValue(`alpha-search:${normalizedQuery}`, alphaPolicy.searchTtlMs, alphaPolicy.searchStaleMs, async () => {
    return enqueueAlphaRequest(`search:${normalizedQuery}`, async () => {
      const payload = await fetchJson(searchUrl);
      return parseAlphaSearchPayload(payload);
    });
  });

  return { matches: cachedResult.value, cacheStatus: cachedResult.cacheStatus, staleReason: cachedResult.staleReason };
}

function buildBars(anchor, spread, drift, fromSec, toSec) {
  const bars = [];
  const fromMs = fromSec * 1000;
  const toMs = toSec * 1000;
  const steps = Math.max(40, Math.min(240, Math.floor((toSec - fromSec) / (60 * 60 * 6))));
  const stepMs = Math.max(60 * 60 * 1000, Math.floor((toMs - fromMs) / steps));

  for (let index = 0; index <= steps; index += 1) {
    const time = fromMs + index * stepMs;
    const wave = Math.sin(index / 5) * spread * 0.3;
    const trend = anchor * drift * (index / Math.max(steps, 1));
    const open = anchor + trend + wave;
    const close = open + Math.cos(index / 3) * spread * 0.11;
    const high = Math.max(open, close) + spread * 0.07;
    const low = Math.min(open, close) - spread * 0.07;

    bars.push({
      time,
      open: Number(open.toFixed(5)),
      high: Number(high.toFixed(5)),
      low: Number(low.toFixed(5)),
      close: Number(close.toFixed(5)),
      volume: 1000 + index * 12,
    });
  }

  return bars;
}

function buildHistory(symbol, fromSec, toSec) {
  if (symbol === 'BITSTAMP:BTCUSD') {
    return buildBars(68420, 4200, 0.03, fromSec, toSec);
  }

  if (symbol === 'BITSTAMP:ETHUSD') {
    return buildBars(3250, 220, 0.028, fromSec, toSec);
  }

  if (symbol === 'BITSTAMP:SOLUSD') {
    return buildBars(182, 18, 0.026, fromSec, toSec);
  }

  if (symbol === 'FX:EURUSD') {
    return buildBars(1.0842, 0.024, 0.008, fromSec, toSec);
  }

  if (symbol === 'FX:GBPUSD') {
    return buildBars(1.264, 0.03, 0.006, fromSec, toSec);
  }

  if (symbol === 'FX:USDJPY') {
    return buildBars(151.3, 2.6, 0.004, fromSec, toSec);
  }

  if (symbol === 'NASDAQ:MSFT') {
    return buildBars(421, 22, 0.014, fromSec, toSec);
  }

  if (symbol === 'NASDAQ:NVDA') {
    return buildBars(902, 78, 0.02, fromSec, toSec);
  }

  if (symbol === 'NASDAQ:TSLA') {
    return buildBars(182, 24, -0.004, fromSec, toSec);
  }

  if (symbol.startsWith('AV:')) {
    return buildBars(120, 12, 0.01, fromSec, toSec);
  }

  return buildBars(198.17, 18, 0.012, fromSec, toSec);
}

function buildFallbackSnapshot(symbol, locale = 'en') {
  const toSec = Math.floor(Date.now() / 1000);
  const fromSec = toSec - 30 * 24 * 60 * 60;
  const bars = buildHistory(symbol, fromSec, toSec);
  const recentBars = bars.slice(-5).reverse();
  const latest = bars[bars.length - 1];
  const previous = bars[bars.length - 2] || latest;
  const change = latest.close - previous.close;
  const changePercent = previous.close ? (change / previous.close) * 100 : 0;

  return {
    recentBars,
    summary: {
      close: latest.close,
      change: Number(change.toFixed(5)),
      changePercent: Number(changePercent.toFixed(3)),
      lastRefreshed: toIsoDay(latest.time),
      seriesType: getLocalizedSeriesType('Sample Daily', locale),
    },
    meta: {
      provider: localizedText(locale, 'Alpha Vantage fallback sample', 'Alpha Vantage 回退样本'),
      note: localizedText(
        locale,
        'Fallback values are shown because the live Alpha Vantage request is unavailable or rate-limited.',
        '由于实时 Alpha Vantage 请求暂不可用或触发限频，当前显示回退样本数据。'
      ),
      apiKeyMode: alphaVantageApiKey === 'demo' ? 'demo' : 'configured',
      seriesType: getLocalizedSeriesType('Sample Daily', locale),
    },
  };
}

function formatSearchResult(record, locale = 'en') {
  return {
    symbol: record.name,
    full_name: record.full_name,
    description: getLocalizedDescription(record, locale),
    exchange: record.exchange,
    ticker: record.ticker,
    type: record.type,
    widgetSymbol: record.widgetSymbol,
    source: record.source,
    provider: record.provider,
  };
}

function searchLocalSymbols(query, type, locale = 'en') {
  const normalized = query.trim().toUpperCase();

  return getAllKnownSymbols()
    .filter((record) => {
      const matchesType = !type || type === 'all' || record.type === type;
      const matchesQuery =
        !normalized ||
        record.ticker.includes(normalized) ||
        record.name.includes(normalized) ||
        record.description.toUpperCase().includes(normalized);
      return matchesType && matchesQuery;
    })
    .slice(0, alphaPolicy.maxSearchResults)
    .map((record) => formatSearchResult(record, locale));
}

async function searchSymbols(query, type, locale = 'en') {
  const trimmedQuery = query.trim();
  const localResults = searchLocalSymbols(trimmedQuery, type, locale);
  const deduped = new Map(localResults.map((item) => [item.ticker, item]));
  const pairMatch = /^[A-Z]{6}$/i.test(trimmedQuery);
  const cryptoUsdMatch = /^[A-Z]{3,10}USD$/i.test(trimmedQuery);
  const allowForex = !type || type === 'all' || type === 'forex';
  const allowCrypto = !type || type === 'all' || type === 'crypto';

  if (pairMatch && allowForex) {
    const ticker = `FX:${trimmedQuery.toUpperCase()}`;
    const record = resolveSymbolRecord(ticker);
    if (record) {
      deduped.set(record.ticker, formatSearchResult(record, locale));
    }
  }

  if (cryptoUsdMatch && allowCrypto) {
    const cryptoTicker = `BITSTAMP:${trimmedQuery.toUpperCase()}`;
    const record = resolveSymbolRecord(cryptoTicker);
    if (record) {
      deduped.set(record.ticker, formatSearchResult(record, locale));
    }
  }

  if (trimmedQuery.length >= 2 && (!type || type === 'all' || type === 'stock')) {
    try {
      const { matches } = await fetchAlphaSearch(trimmedQuery);
      matches.slice(0, alphaPolicy.maxSearchResults).forEach((match) => {
        const stockSymbol = String(match['1. symbol'] || '').trim().toUpperCase();
        if (!stockSymbol) {
          return;
        }

        const region = String(match['4. region'] || 'US').trim();
        const exchange = region === 'United States' ? 'US' : region.slice(0, 12).toUpperCase();
        const record = registerDynamicSymbol(
          createSymbolRecord({
            ticker: `AV:${stockSymbol}`,
            name: stockSymbol,
            full_name: `AV:${stockSymbol}`,
            description: String(match['2. name'] || `${stockSymbol} equity`).trim(),
            type: 'stock',
            session: '0900-1630',
            exchange,
            listed_exchange: exchange,
            pricescale: 100,
            widgetSymbol: null,
            source: 'alpha-search',
            alpha: { category: 'stock', symbol: stockSymbol },
          })
        );

        deduped.set(record.ticker, formatSearchResult(record, locale));
      });
    } catch (error) {
      // Fall back to local results only when Alpha Vantage search is unavailable or rate-limited.
    }
  }

  return Array.from(deduped.values()).slice(0, alphaPolicy.maxSearchResults);
}

async function fetchMarketHistory(symbol, resolution, fromSec, toSec, locale = 'en') {
  const normalizedResolution = resolution === '1W' ? '1W' : '1D';
  const record = resolveSymbolRecord(symbol);

  if (!record) {
    throw new Error('Unknown symbol');
  }

  try {
    const { bars: dailyBars, seriesType, cacheStatus, staleReason } = await fetchAlphaSeries(symbol);
    const filteredDailyBars = dailyBars.filter((bar) => bar.time >= fromSec * 1000 && bar.time <= toSec * 1000);
    const bars = normalizedResolution === '1W' ? aggregateWeekly(filteredDailyBars) : filteredDailyBars;

    return {
      bars,
      meta: {
        provider: 'Alpha Vantage',
        note:
          alphaVantageApiKey === 'demo'
            ? localizedText(locale, 'Using Alpha Vantage demo mode. Some symbols may be restricted until a private API key is configured.', '当前使用 Alpha Vantage 演示模式。在配置私有 API Key 前，部分标的可能受限。')
            : localizedText(locale, 'Live Alpha Vantage daily data served through the local proxy.', '实时 Alpha Vantage 日线数据正通过本地代理提供。'),
        apiKeyMode: alphaVantageApiKey === 'demo' ? 'demo' : 'configured',
        seriesType: getLocalizedSeriesType(normalizedResolution === '1W' ? 'Weekly aggregate' : seriesType, locale),
        cacheStatus,
        staleReason: staleReason ? localizeAlphaErrorMessage(staleReason, locale) : null,
        symbolSource: record.source,
      },
    };
  } catch (error) {
    const fallbackMeta = buildFallbackSnapshot(symbol, locale).meta;
    const fallbackBars = buildHistory(symbol, fromSec, toSec);
    return {
      bars: normalizedResolution === '1W' ? aggregateWeekly(fallbackBars) : fallbackBars,
      meta: {
        ...fallbackMeta,
        seriesType: normalizedResolution === '1W' ? getLocalizedSeriesType('Weekly aggregate', locale) : fallbackMeta.seriesType,
        cacheStatus: 'fallback',
        staleReason: error.message ? localizeAlphaErrorMessage(error.message, locale) : null,
        symbolSource: record.source,
      },
    };
  }
}

async function buildMarketSnapshot(symbol, locale = 'en') {
  const historyPayload = await fetchMarketHistory(symbol, '1D', 0, Math.floor(Date.now() / 1000), locale);
  const bars = historyPayload.bars || [];
  const recentBars = bars.slice(-5).reverse();

  if (!bars.length) {
    return {
      recentBars: [],
      summary: {
        close: null,
        change: null,
        changePercent: null,
        lastRefreshed: null,
        seriesType: historyPayload.meta.seriesType,
      },
      meta: historyPayload.meta,
    };
  }

  const latest = bars[bars.length - 1];
  const previous = bars[bars.length - 2] || latest;
  const change = latest.close - previous.close;
  const changePercent = previous.close ? (change / previous.close) * 100 : 0;

  return {
    recentBars,
    summary: {
      close: latest.close,
      change: Number(change.toFixed(5)),
      changePercent: Number(changePercent.toFixed(3)),
      lastRefreshed: toIsoDay(latest.time),
      seriesType: historyPayload.meta.seriesType,
    },
    meta: historyPayload.meta,
  };
}

function localizeSymbolRecord(record, locale) {
  return {
    ...record,
    description: getLocalizedDescription(record, locale),
  };
}

function handleMarketApi(request, requestUrl, response) {
  const pathname = requestUrl.pathname;
  const locale = detectLocale(request, requestUrl);

  if (pathname === '/api/market/config') {
    sendJson(response, 200, {
      source: 'alpha-vantage-proxy',
      provider: 'Alpha Vantage',
      apiKeyMode: alphaVantageApiKey === 'demo' ? 'demo' : 'configured',
      rateLimit: {
        minIntervalMs: alphaPolicy.minIntervalMs,
      },
      supported_resolutions: supportedResolutions,
      exchanges: [
        { value: 'BITSTAMP', name: 'Bitstamp', desc: getLocalizedExchangeDesc('BITSTAMP', locale) },
        { value: 'FX', name: 'FX', desc: getLocalizedExchangeDesc('FX', locale) },
        { value: 'NASDAQ', name: 'NASDAQ', desc: getLocalizedExchangeDesc('NASDAQ', locale) },
        { value: 'US', name: 'US', desc: getLocalizedExchangeDesc('US', locale) },
      ],
      symbols_types: [
        { name: localizedText(locale, 'Crypto', '数字资产'), value: 'crypto' },
        { name: localizedText(locale, 'Forex', '外汇'), value: 'forex' },
        { name: localizedText(locale, 'Stock', '股票'), value: 'stock' },
      ],
    });
    return;
  }

  if (pathname === '/api/market/symbols') {
    const query = String(requestUrl.searchParams.get('query') || '');
    const type = requestUrl.searchParams.get('type') || 'all';

    searchSymbols(query, type, locale)
      .then((symbols) => {
        sendJson(response, 200, {
          source: 'alpha-vantage-proxy',
          provider: 'Alpha Vantage',
          query,
          symbols,
        });
      })
      .catch((error) => {
        sendJson(response, 500, { error: error.message || 'Symbol search failed' });
      });
    return;
  }

  if (pathname === '/api/market/symbol') {
    const symbol = requestUrl.searchParams.get('symbol');
    const record = symbol ? resolveSymbolRecord(symbol) : null;

    if (!record) {
      sendJson(response, 404, { error: 'Symbol not found' });
      return;
    }

    sendJson(response, 200, { source: 'alpha-vantage-proxy', provider: 'Alpha Vantage', symbol: localizeSymbolRecord(record, locale) });
    return;
  }

  if (pathname === '/api/market/provider-status') {
    sendJson(response, 200, {
      source: 'alpha-vantage-proxy',
      provider: 'Alpha Vantage',
      apiKeyMode: alphaVantageApiKey === 'demo' ? 'demo' : 'configured',
      rateLimit: {
        minIntervalMs: alphaPolicy.minIntervalMs,
        nextAvailableInMs: Math.max(0, alphaNextAvailableAt - Date.now()),
      },
      cache: {
        entries: cacheStore.size,
        dynamicSymbols: dynamicSymbolStore.size,
      },
      stats: alphaStats,
    });
    return;
  }

  if (pathname === '/api/market/snapshot') {
    const symbol = requestUrl.searchParams.get('symbol') || 'NASDAQ:AAPL';

    if (!resolveSymbolRecord(symbol)) {
      sendJson(response, 400, { error: 'Unknown symbol' });
      return;
    }

    buildMarketSnapshot(symbol, locale)
      .then((payload) => {
        sendJson(response, 200, {
          source: 'alpha-vantage-proxy',
          symbol,
          ...payload,
        });
      })
      .catch((error) => {
        sendJson(response, 500, { error: error.message || 'Snapshot unavailable' });
      });
    return;
  }

  if (pathname === '/api/market/history') {
    const symbol = requestUrl.searchParams.get('symbol');
    const resolution = requestUrl.searchParams.get('resolution') || '1D';
    const fromSec = Number(requestUrl.searchParams.get('from') || Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60);
    const toSec = Number(requestUrl.searchParams.get('to') || Math.floor(Date.now() / 1000));

    if (!symbol || !resolveSymbolRecord(symbol)) {
      sendJson(response, 400, { error: 'Unknown symbol' });
      return;
    }

    fetchMarketHistory(symbol, resolution, fromSec, toSec, locale)
      .then((payload) => {
        sendJson(response, 200, {
          source: 'alpha-vantage-proxy',
          symbol,
          resolution,
          bars: payload.bars,
          meta: payload.meta,
        });
      })
      .catch((error) => {
        sendJson(response, 500, { error: error.message || 'History unavailable' });
      });
    return;
  }

  sendJson(response, 404, { error: 'API route not found' });
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);

  if (requestUrl.pathname.startsWith('/api/market/')) {
    handleMarketApi(request, requestUrl, response);
    return;
  }

  const filePath = resolveStaticPath(requestUrl.pathname);

  if (!filePath) {
    sendJson(response, 400, { error: 'Bad request' });
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error) {
      sendJson(response, 404, { error: 'Not found' });
      return;
    }

    if (stats.isDirectory()) {
      sendFile(response, path.join(filePath, 'index.html'));
      return;
    }

    sendFile(response, filePath);
  });
});

server.listen(port, host, () => {
  console.log(`Baiao site server running at http://${host}:${port}`);
  console.log(`Alpha Vantage key mode: ${alphaVantageApiKey === 'demo' ? 'demo' : 'configured'}`);
  console.log(`Alpha Vantage min interval: ${alphaPolicy.minIntervalMs}ms`);
});