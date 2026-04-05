(function () {
  const pageLocale = document.body && document.body.dataset.locale === 'zh' ? 'zh' : 'en';
  const isChinese = pageLocale === 'zh';
  const runtimeConfig = {
    apiBase: '/api/market',
    preferBackend: true,
    pollIntervalMs: 15000,
    locale: pageLocale,
  };

  const copy = {
    descriptions: {
      btc: isChinese ? '比特币 / 美元' : 'Bitcoin / U.S. Dollar',
      eurusd: isChinese ? '欧元 / 美元' : 'Euro / U.S. Dollar',
      aapl: isChinese ? '苹果公司' : 'Apple Inc.',
    },
    exchanges: {
      bitstamp: isChinese ? 'Bitstamp 数字资产市场' : 'Bitstamp',
      fx: isChinese ? '外汇市场' : 'Foreign Exchange',
      nasdaq: 'NASDAQ',
    },
    symbolTypes: {
      crypto: isChinese ? '数字资产' : 'Crypto',
      forex: isChinese ? '外汇' : 'Forex',
      stock: isChinese ? '股票' : 'Stock',
    },
    errors: {
      symbolNotFound: isChinese ? '未找到该标的' : 'Symbol not found',
      fetchConfig: isChinese ? '获取市场配置失败' : 'Failed to fetch market config',
      searchSymbols: isChinese ? '搜索标的失败' : 'Failed to search symbols',
      resolveSymbol: isChinese ? '解析标的失败' : 'Failed to resolve symbol',
      fetchHistory: isChinese ? '获取历史数据失败' : 'Failed to fetch history',
    },
  };

  const symbolCatalog = {
    'BITSTAMP:BTCUSD': {
      name: 'BTCUSD',
      full_name: 'BITSTAMP:BTCUSD',
      description: copy.descriptions.btc,
      exchange: 'BITSTAMP',
      listed_exchange: 'BITSTAMP',
      type: 'crypto',
      pricescale: 100,
      session: '24x7',
      provider: 'Alpha Vantage',
    },
    'FX:EURUSD': {
      name: 'EURUSD',
      full_name: 'FX:EURUSD',
      description: copy.descriptions.eurusd,
      exchange: 'FX',
      listed_exchange: 'FX',
      type: 'forex',
      pricescale: 100000,
      session: '24x7',
      provider: 'Alpha Vantage',
    },
    'NASDAQ:AAPL': {
      name: 'AAPL',
      full_name: 'NASDAQ:AAPL',
      description: copy.descriptions.aapl,
      exchange: 'NASDAQ',
      listed_exchange: 'NASDAQ',
      type: 'stock',
      pricescale: 100,
      session: '0900-1630',
      provider: 'Alpha Vantage',
    },
  };

  const barCache = {
    'BITSTAMP:BTCUSD': buildBars(68420, 4200, 0.032),
    'FX:EURUSD': buildBars(1.0842, 0.024, 0.008),
    'NASDAQ:AAPL': buildBars(198.17, 18, 0.012),
  };

  function buildBars(anchor, spread, drift) {
    const bars = [];
    const now = Date.now();
    const start = now - 240 * 24 * 60 * 60 * 1000;

    for (let index = 0; index < 240; index += 1) {
      const time = start + index * 24 * 60 * 60 * 1000;
      const wave = Math.sin(index / 6) * spread * 0.35;
      const trend = anchor * drift * (index / 240);
      const open = anchor + trend + wave;
      const close = open + Math.cos(index / 4) * spread * 0.12;
      const high = Math.max(open, close) + spread * 0.08;
      const low = Math.min(open, close) - spread * 0.08;

      bars.push({
        time,
        open: roundValue(open),
        high: roundValue(high),
        low: roundValue(low),
        close: roundValue(close),
        volume: 1000 + index * 4,
      });
    }

    return bars;
  }

  function roundValue(value) {
    return Number(value.toFixed(5));
  }

  function toSymbolInfo(symbolName) {
    const symbol = symbolCatalog[symbolName];

    if (!symbol) {
      return null;
    }

    return {
      ticker: symbol.full_name,
      name: symbol.name,
      full_name: symbol.full_name,
      description: symbol.description,
      type: symbol.type,
      session: symbol.session,
      exchange: symbol.exchange,
      listed_exchange: symbol.listed_exchange,
      timezone: 'Etc/UTC',
      minmov: 1,
      pricescale: symbol.pricescale,
      has_intraday: true,
      has_daily: true,
      has_weekly_and_monthly: true,
      supported_resolutions: ['1D', '1W'],
      volume_precision: 2,
      data_status: 'streaming',
    };
  }

  const config = {
    supported_resolutions: ['1D', '1W'],
    exchanges: [
      { value: 'BITSTAMP', name: 'Bitstamp', desc: copy.exchanges.bitstamp },
      { value: 'FX', name: 'FX', desc: copy.exchanges.fx },
      { value: 'NASDAQ', name: 'NASDAQ', desc: copy.exchanges.nasdaq },
    ],
    symbols_types: [
      { name: copy.symbolTypes.crypto, value: 'crypto' },
      { name: copy.symbolTypes.forex, value: 'forex' },
      { name: copy.symbolTypes.stock, value: 'stock' },
    ],
  };

  function normalizeBarsResponse(payload) {
    if (!payload) {
      return [];
    }

    if (Array.isArray(payload)) {
      return payload;
    }

    if (Array.isArray(payload.bars)) {
      return payload.bars;
    }

    return [];
  }

  function pickSymbolRecord(symbolName) {
    return symbolCatalog[symbolName] || symbolCatalog[`BITSTAMP:${symbolName}`] || symbolCatalog[`FX:${symbolName}`] || symbolCatalog[`NASDAQ:${symbolName}`] || null;
  }

  function buildFallbackSearch(userInput, exchange, symbolType) {
    const keyword = String(userInput || '').toLowerCase();

    return Object.values(symbolCatalog)
      .filter((item) => {
        const matchesKeyword = !keyword || item.full_name.toLowerCase().includes(keyword) || item.name.toLowerCase().includes(keyword);
        const matchesExchange = !exchange || item.exchange === exchange;
        const matchesType = !symbolType || item.type === symbolType;
        return matchesKeyword && matchesExchange && matchesType;
      })
      .map((item) => ({
        symbol: item.name,
        full_name: item.full_name,
        description: item.description,
        exchange: item.exchange,
        ticker: item.full_name,
        type: item.type,
      }));
  }

  function createPollingSubscriber(adapter, symbolInfo, resolution, onRealtimeCallback, subscriberUID) {
    let lastBarTime = null;
    const timerId = window.setInterval(async () => {
      try {
        const now = Math.floor(Date.now() / 1000);
        const from = now - 2 * 24 * 60 * 60;
        const payload = await adapter.fetchHistory(symbolInfo.ticker, resolution, from, now);
        const bars = normalizeBarsResponse(payload);
        const lastBar = bars[bars.length - 1];

        if (!lastBar) {
          return;
        }

        if (lastBarTime === lastBar.time) {
          return;
        }

        lastBarTime = lastBar.time;
        onRealtimeCallback(lastBar);
      } catch (error) {
        window.clearInterval(timerId);
      }
    }, runtimeConfig.pollIntervalMs);

    window.BaiaoRealtimeSubscriptions = window.BaiaoRealtimeSubscriptions || {};
    window.BaiaoRealtimeSubscriptions[subscriberUID] = timerId;
  }

  window.BaiaoDatafeedFactory = {
    create() {
      const adapter = this.createAlphaVantageAdapter();

      return {
        onReady(callback) {
          if (!runtimeConfig.preferBackend) {
            setTimeout(() => callback(config), 0);
            return;
          }

          adapter
            .fetchConfig()
            .then((remoteConfig) => callback({ ...config, ...remoteConfig }))
            .catch(() => callback(config));
        },
        searchSymbols(userInput, exchange, symbolType, onResultReadyCallback) {
          if (!runtimeConfig.preferBackend) {
            onResultReadyCallback(buildFallbackSearch(userInput, exchange, symbolType));
            return;
          }

          adapter
            .searchSymbols(userInput, exchange, symbolType)
            .then((payload) => onResultReadyCallback(Array.isArray(payload.symbols) ? payload.symbols : buildFallbackSearch(userInput, exchange, symbolType)))
            .catch(() => onResultReadyCallback(buildFallbackSearch(userInput, exchange, symbolType)));
        },
        resolveSymbol(symbolName, onSymbolResolvedCallback, onResolveErrorCallback) {
          if (!runtimeConfig.preferBackend) {
            const resolved = toSymbolInfo(symbolName);

            if (resolved) {
              onSymbolResolvedCallback(resolved);
              return;
            }

            onResolveErrorCallback(copy.errors.symbolNotFound);
            return;
          }

          adapter
            .resolveSymbol(symbolName)
            .then((payload) => {
              const symbolInfo = payload && payload.symbol ? payload.symbol : toSymbolInfo(symbolName);

              if (symbolInfo) {
                onSymbolResolvedCallback(symbolInfo);
                return;
              }

              onResolveErrorCallback(copy.errors.symbolNotFound);
            })
            .catch(() => {
              const fallback = toSymbolInfo(symbolName);

              if (fallback) {
                onSymbolResolvedCallback(fallback);
                return;
              }

              onResolveErrorCallback(copy.errors.symbolNotFound);
            });
        },
        getBars(symbolInfo, resolution, periodParams, onHistoryCallback, onErrorCallback) {
          const from = periodParams.from || 0;
          const to = periodParams.to || Number.MAX_SAFE_INTEGER;

          if (!runtimeConfig.preferBackend) {
            try {
              const bars = barCache[symbolInfo.ticker] || [];
              const fromMs = from * 1000;
              const toMs = to * 1000;
              const filtered = bars.filter((bar) => bar.time >= fromMs && bar.time <= toMs);
              onHistoryCallback(filtered, { noData: filtered.length === 0 });
            } catch (error) {
              onErrorCallback(error);
            }
            return;
          }

          adapter
            .fetchHistory(symbolInfo.ticker, resolution, from, to)
            .then((payload) => {
              const bars = normalizeBarsResponse(payload);
              onHistoryCallback(bars, { noData: bars.length === 0 });
            })
            .catch(() => {
              try {
                const bars = barCache[symbolInfo.ticker] || [];
                const fromMs = from * 1000;
                const toMs = to * 1000;
                const filtered = bars.filter((bar) => bar.time >= fromMs && bar.time <= toMs);
                onHistoryCallback(filtered, { noData: filtered.length === 0 });
              } catch (error) {
                onErrorCallback(error);
              }
            });
        },
        subscribeBars(symbolInfo, resolution, onRealtimeCallback, subscriberUID) {
          if (runtimeConfig.preferBackend) {
            createPollingSubscriber(adapter, symbolInfo, resolution, onRealtimeCallback, subscriberUID);
            return;
          }

          let pointer = 0;
          const seedBars = barCache[symbolInfo.ticker] || [];
          const timerId = window.setInterval(() => {
            if (!seedBars.length) {
              return;
            }

            const source = seedBars[seedBars.length - 1];
            const nextTime = source.time + (pointer + 1) * 60 * 1000;
            const offset = Math.sin(pointer / 3) * 0.0025 * source.close;

            onRealtimeCallback({
              time: nextTime,
              open: roundValue(source.close),
              high: roundValue(source.close + Math.abs(offset)),
              low: roundValue(source.close - Math.abs(offset) * 0.8),
              close: roundValue(source.close + offset),
              volume: source.volume + pointer * 2,
            });

            pointer += 1;
          }, 3500);

          window.BaiaoRealtimeSubscriptions = window.BaiaoRealtimeSubscriptions || {};
          window.BaiaoRealtimeSubscriptions[subscriberUID] = timerId;
        },
        unsubscribeBars(subscriberUID) {
          if (!window.BaiaoRealtimeSubscriptions || !window.BaiaoRealtimeSubscriptions[subscriberUID]) {
            return;
          }

          window.clearInterval(window.BaiaoRealtimeSubscriptions[subscriberUID]);
          delete window.BaiaoRealtimeSubscriptions[subscriberUID];
        },
      };
    },
    createAlphaVantageAdapter(fetchImpl = window.fetch.bind(window)) {
      function buildApiUrl(endpoint, params = new URLSearchParams()) {
        params.set('locale', runtimeConfig.locale);
        return `${runtimeConfig.apiBase}${endpoint}?${params.toString()}`;
      }

      return {
        async fetchConfig() {
          const response = await fetchImpl(buildApiUrl('/config'));

          if (!response.ok) {
            throw new Error(copy.errors.fetchConfig);
          }

          return response.json();
        },
        async searchSymbols(query, exchange, type) {
          const params = new URLSearchParams();

          if (query) {
            params.set('query', query);
          }
          if (exchange) {
            params.set('exchange', exchange);
          }
          if (type) {
            params.set('type', type);
          }

          const response = await fetchImpl(buildApiUrl('/symbols', params));

          if (!response.ok) {
            throw new Error(copy.errors.searchSymbols);
          }

          return response.json();
        },
        async resolveSymbol(symbol) {
          const params = new URLSearchParams({ symbol });
          const response = await fetchImpl(buildApiUrl('/symbol', params));

          if (!response.ok) {
            throw new Error(copy.errors.resolveSymbol);
          }

          return response.json();
        },
        async fetchHistory(symbol, resolution, from, to) {
          const params = new URLSearchParams({ symbol, resolution, from: String(from), to: String(to) });
          const response = await fetchImpl(buildApiUrl('/history', params));

          if (!response.ok) {
            throw new Error(copy.errors.fetchHistory);
          }

          return response.json();
        },
      };
    },
  };
})();