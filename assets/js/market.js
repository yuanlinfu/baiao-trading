const isChinese = document.body && document.body.dataset.locale === 'zh';
const pageLocale = isChinese ? 'zh-CN' : 'en-US';
const widgetLocale = isChinese ? 'zh_CN' : 'en';
const apiLocale = isChinese ? 'zh' : 'en';
const copy = {
  searchAllAssets: isChinese ? '全部资产' : 'all assets',
  curatedDefault: isChinese ? '默认展示精选市场标的。' : 'Showing curated market symbols by default.',
  searchLoading: isChinese ? '正在加载搜索结果...' : 'Loading search results...',
  searchUnavailable: isChinese ? '符号搜索暂时不可用。' : 'Symbol search is temporarily unavailable.',
  searchUnavailableBody: isChinese ? '暂时无法加载搜索结果。' : 'Unable to load search results.',
  noMatches: isChinese ? '未找到匹配的标的。' : 'No matching symbols found.',
  searching: (typeLabel, query) =>
    isChinese ? `正在搜索${typeLabel}“${query}”...` : `Searching ${typeLabel} for “${query}”...`,
  searchResultsSummary: (count) =>
    isChinese
      ? `展示 ${count} 条来自精选标的与 Alpha Vantage 搜索的结果。`
      : `Showing ${count} result${count === 1 ? '' : 's'} from curated symbols and Alpha Vantage search.`,
  snapshotLoading: isChinese ? '正在加载 Alpha Vantage 快照...' : 'Loading Alpha Vantage snapshot...',
  snapshotTableLoading: isChinese ? '正在加载市场快照...' : 'Loading market snapshot...',
  snapshotDaily: isChinese ? '日线快照' : 'Daily snapshot',
  snapshotNoData: isChinese ? '该标的暂无返回数据。' : 'No data returned for this symbol.',
  snapshotUnavailable: isChinese ? 'Alpha Vantage 数据当前不可用，暂无快照。' : 'Alpha Vantage data is currently unavailable. Showing no snapshot.',
  snapshotUnavailableBody: isChinese ? '无法加载快照数据。' : 'Unable to load snapshot data.',
  packageReady: isChinese ? '本地已挂载授权版 Advanced Charts' : 'Licensed Advanced Charts mounted locally',
  packageLoading: isChinese ? '正在加载本地 Charting Library 包' : 'Loading local Charting Library package',
  packageWaiting: isChinese ? '等待本地 Charting Library 包' : 'Waiting for local Charting Library package',
  widgetUnavailable: isChinese
    ? '公开预览小组件仅对精选标的提供。当前搜索结果仍可通过 Advanced Charts 与 Alpha Vantage 快照查看。'
    : 'Public widget preview is available for curated symbols only. Advanced Charts and the Alpha Vantage snapshot still support this search result.',
  dynamicLabelSuffix: isChinese ? '结构复盘' : 'structure review',
  dynamicDescriptionFallback: isChinese ? '市场结构观察' : 'market structure',
  dynamicText: (description) =>
    isChinese
      ? `${description}。可结合图表与快照面板查看日线结构、支撑阻力区域以及延续质量。`
      : `${description}. Use the chart and snapshot panels to inspect daily structure, support zones, and continuation quality.`,
  metaSource: {
    market: isChinese ? '市场' : 'market',
    curated: isChinese ? '精选' : 'curated',
    'alpha-vantage': 'Alpha Vantage',
  },
  assetType: {
    all: isChinese ? '全部资产' : 'all assets',
    stock: isChinese ? '股票' : 'stock',
    forex: isChinese ? '外汇' : 'forex',
    crypto: isChinese ? '数字资产' : 'crypto',
  },
};

const marketConfigs = {
  'BITSTAMP:BTCUSD': {
    label: isChinese ? 'BTCUSD 结构复盘' : 'BTCUSD structure review',
    text: isChinese
      ? '价格正从更高低点形成的基底继续上推。当前重点观察下一轮上冲能否稳住前一摆动平台上方。'
      : 'Price is extending from a higher-low base. The active reading focuses on whether the next push can hold above the prior swing shelf.',
    line: 'M10 300 L120 290 L210 246 L302 260 L396 180 L490 194 L592 124 L700 148 L812 88 L910 102',
    area: 'M10 300 L120 290 L210 246 L302 260 L396 180 L490 194 L592 124 L700 148 L812 88 L910 102 L910 360 L10 360 Z',
    widget: 'BITSTAMP:BTCUSD',
  },
  'FX:EURUSD': {
    label: isChinese ? 'EURUSD 区间压力图' : 'EURUSD range pressure map',
    text: isChinese
      ? '该货币对仍在清晰的阻力带内部运行。当前观察重点是下一次回撤能否继续在最近高点枢纽上方保持有序。'
      : 'The pair is trading inside a well-defined resistance band. Analysts are watching whether the next retracement stays orderly above the recent higher pivot.',
    line: 'M10 250 L118 238 L214 230 L320 244 L418 214 L518 220 L610 180 L714 194 L812 168 L910 176',
    area: 'M10 250 L118 238 L214 230 L320 244 L418 214 L518 220 L610 180 L714 194 L812 168 L910 176 L910 360 L10 360 Z',
    widget: 'FX:EURUSD',
  },
  'NASDAQ:AAPL': {
    label: isChinese ? 'AAPL 周线回撤画像' : 'AAPL weekly pullback profile',
    text: isChinese
      ? '更大级别的序列仍偏建设性，当前回撤则在检验上一轮推动失去连贯性之前，需求是否重新出现。'
      : 'The broader sequence remains constructive while the current pullback tests whether demand returns before the prior impulse loses coherence.',
    line: 'M10 312 L124 276 L218 220 L318 162 L406 178 L512 134 L614 152 L706 102 L822 74 L910 94',
    area: 'M10 312 L124 276 L218 220 L318 162 L406 178 L512 134 L614 152 L706 102 L822 74 L910 94 L910 360 L10 360 Z',
    widget: 'NASDAQ:AAPL',
  },
};

const symbolButtons = document.querySelectorAll('.symbol-button');
const analysisTitle = document.getElementById('analysis-title');
const analysisText = document.getElementById('analysis-text');
const placeholderLine = document.getElementById('placeholder-line');
const placeholderArea = document.getElementById('placeholder-area');
const widgetTarget = document.getElementById('tv-widget');
const statusTarget = document.getElementById('advanced-chart-status');
const snapshotRefreshButton = document.getElementById('snapshot-refresh');
const snapshotProvider = document.getElementById('snapshot-provider');
const snapshotClose = document.getElementById('snapshot-close');
const snapshotChange = document.getElementById('snapshot-change');
const snapshotRefreshed = document.getElementById('snapshot-refreshed');
const snapshotSeries = document.getElementById('snapshot-series');
const snapshotTableBody = document.getElementById('snapshot-table-body');
const searchForm = document.getElementById('symbol-search-form');
const searchInput = document.getElementById('symbol-search-input');
const searchType = document.getElementById('symbol-search-type');
const searchResults = document.getElementById('search-results');
const searchFeedback = document.getElementById('search-feedback');
const chartToolbar = document.querySelector('.chart-toolbar');

let activeSymbol = 'BITSTAMP:BTCUSD';
let widgetLoaded = false;
let searchRequestId = 0;

const numberFormatter = new Intl.NumberFormat(pageLocale, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 5,
});

function formatNumber(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return '--';
  }

  return numberFormatter.format(numericValue);
}

function formatDate(value) {
  if (!value) {
    return '--';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return date.toLocaleDateString(pageLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getSymbolButtons() {
  return Array.from(document.querySelectorAll('.symbol-button'));
}

function buildDynamicPaths(symbol) {
  const charCodes = Array.from(symbol).map((character) => character.charCodeAt(0));
  const seed = charCodes.reduce((total, value) => total + value, 0);
  const points = Array.from({ length: 10 }, (_, index) => {
    const x = 10 + index * 100;
    const yBase = 310 - ((seed + index * 17) % 170);
    return `${x} ${yBase}`;
  });
  const line = `M${points.join(' L')}`;
  const area = `${line} L910 360 L10 360 Z`;
  return { line, area };
}

function ensureMarketConfig(symbol, metadata = {}) {
  if (!marketConfigs[symbol]) {
    const shortName = metadata.symbol || symbol.split(':').pop() || symbol;
    const description = metadata.description || `${shortName} ${copy.dynamicDescriptionFallback}`;
    const { line, area } = buildDynamicPaths(symbol);
    marketConfigs[symbol] = {
      label: `${shortName} ${copy.dynamicLabelSuffix}`,
      text: copy.dynamicText(description),
      line,
      area,
      widget: metadata.widgetSymbol || null,
    };
  } else if (Object.prototype.hasOwnProperty.call(metadata, 'widgetSymbol')) {
    marketConfigs[symbol].widget = metadata.widgetSymbol;
  }

  return marketConfigs[symbol];
}

function ensureToolbarButton(symbol, label) {
  if (!chartToolbar) {
    return;
  }

  const existing = getSymbolButtons().find((button) => button.dataset.symbol === symbol);
  if (existing) {
    return;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'symbol-button symbol-button--dynamic';
  button.dataset.symbol = symbol;
  button.dataset.label = label;
  button.textContent = label;
  button.addEventListener('click', () => {
    updatePlaceholder(symbol);
  });
  chartToolbar.appendChild(button);

  const dynamicButtons = getSymbolButtons().filter((item) => item.classList.contains('symbol-button--dynamic'));
  if (dynamicButtons.length > 6) {
    const removable = dynamicButtons.find((item) => item.dataset.symbol !== activeSymbol);
    if (removable) {
      removable.remove();
    }
  }
}

function renderSearchResults(results) {
  if (!searchResults) {
    return;
  }

  if (!results.length) {
    searchResults.innerHTML = `<div class="search-result-empty">${copy.noMatches}</div>`;
    return;
  }

  searchResults.innerHTML = '';

  results.forEach((result) => {
    const button = document.createElement('button');
    const title = document.createElement('strong');
    const description = document.createElement('span');
    const meta = document.createElement('em');

    button.type = 'button';
    button.className = 'search-result-card';
    button.dataset.symbol = result.ticker;
    button.dataset.label = result.symbol;
    button.dataset.description = result.description || '';
    button.dataset.widget = result.widgetSymbol || '';

    title.textContent = result.symbol;
    description.textContent = result.description || result.full_name;
    const sourceLabel = copy.metaSource[result.source] || result.source || copy.metaSource.market;
    const typeLabel = copy.assetType[result.type] || result.type;
    meta.textContent = `${result.exchange} · ${typeLabel} · ${sourceLabel}`;

    button.append(title, description, meta);
    searchResults.appendChild(button);
  });

  Array.from(searchResults.querySelectorAll('.search-result-card')).forEach((button) => {
    button.addEventListener('click', () => {
      const symbol = button.dataset.symbol;
      const label = button.dataset.label || symbol;
      const description = button.dataset.description || label;
      const widgetSymbol = button.dataset.widget || null;
      ensureMarketConfig(symbol, { symbol: label, description, widgetSymbol: widgetSymbol || null });
      ensureToolbarButton(symbol, label);
      updatePlaceholder(symbol);
    });
  });
}

async function loadSearchResults(query = '', type = 'all') {
  if (!searchResults || !searchFeedback) {
    return;
  }

  const requestId = ++searchRequestId;
  const params = new URLSearchParams();
  if (query.trim()) {
    params.set('query', query.trim());
  }
  if (type && type !== 'all') {
    params.set('type', type);
  }
  params.set('locale', apiLocale);

  const typeLabel = copy.assetType[type] || type;
  searchFeedback.textContent = query.trim() ? copy.searching(typeLabel, query.trim()) : copy.curatedDefault;
  searchResults.innerHTML = `<div class="search-result-empty">${copy.searchLoading}</div>`;

  try {
    const response = await fetch(`/api/market/symbols?${params.toString()}`);
    if (!response.ok) {
      throw new Error('Search request failed');
    }

    const payload = await response.json();
    if (requestId !== searchRequestId) {
      return;
    }

    const results = Array.isArray(payload.symbols) ? payload.symbols : [];
    searchFeedback.textContent = results.length
      ? copy.searchResultsSummary(results.length)
      : copy.noMatches;
    renderSearchResults(results);
  } catch (error) {
    if (requestId !== searchRequestId) {
      return;
    }
    searchFeedback.textContent = copy.searchUnavailable;
    searchResults.innerHTML = `<div class="search-result-empty">${copy.searchUnavailableBody}</div>`;
  }
}

async function renderSnapshot(symbol) {
  if (!snapshotTableBody || !snapshotProvider) {
    return;
  }

  snapshotProvider.textContent = copy.snapshotLoading;
  snapshotTableBody.innerHTML = `<tr><td colspan="5">${copy.snapshotTableLoading}</td></tr>`;

  try {
    const params = new URLSearchParams({ symbol, locale: apiLocale });
    const response = await fetch(`/api/market/snapshot?${params.toString()}`);

    if (!response.ok) {
      throw new Error('Snapshot request failed');
    }

    const payload = await response.json();
    const summary = payload.summary || {};
    const recentBars = Array.isArray(payload.recentBars) ? payload.recentBars : [];
    const providerLabel = payload.meta && payload.meta.provider ? payload.meta.provider : 'Alpha Vantage';
    const noteLabel = payload.meta && payload.meta.note ? payload.meta.note : copy.snapshotDaily;

    snapshotProvider.textContent = `${providerLabel} | ${noteLabel}`;
    snapshotClose.textContent = formatNumber(summary.close);
    snapshotChange.textContent = Number.isFinite(Number(summary.change))
      ? `${Number(summary.change) >= 0 ? '+' : ''}${formatNumber(summary.change)} (${formatNumber(summary.changePercent)}%)`
      : '--';
    snapshotRefreshed.textContent = formatDate(summary.lastRefreshed);
    snapshotSeries.textContent = summary.seriesType || '--';

    snapshotTableBody.innerHTML = recentBars.length
      ? recentBars
          .map(
            (bar) => `
              <tr>
                <td>${formatDate(bar.time)}</td>
                <td>${formatNumber(bar.open)}</td>
                <td>${formatNumber(bar.high)}</td>
                <td>${formatNumber(bar.low)}</td>
                <td>${formatNumber(bar.close)}</td>
              </tr>`
          )
          .join('')
      : `<tr><td colspan="5">${copy.snapshotNoData}</td></tr>`;
  } catch (error) {
    snapshotProvider.textContent = copy.snapshotUnavailable;
    snapshotClose.textContent = '--';
    snapshotChange.textContent = '--';
    snapshotRefreshed.textContent = '--';
    snapshotSeries.textContent = '--';
    snapshotTableBody.innerHTML = `<tr><td colspan="5">${copy.snapshotUnavailableBody}</td></tr>`;
  }
}

function updatePlaceholder(symbol) {
  const config = ensureMarketConfig(symbol, { symbol: symbol.split(':').pop() || symbol });

  if (!config || !analysisTitle || !analysisText || !placeholderLine || !placeholderArea) {
    return;
  }

  activeSymbol = symbol;
  analysisTitle.textContent = config.label;
  analysisText.textContent = config.text;
  placeholderLine.setAttribute('d', config.line);
  placeholderArea.setAttribute('d', config.area);

  getSymbolButtons().forEach((button) => {
    button.classList.toggle('is-active', button.dataset.symbol === symbol);
  });

  if (window.BaiaoAdvancedCharting && typeof window.BaiaoAdvancedCharting.updateSymbol === 'function') {
    window.BaiaoAdvancedCharting.updateSymbol(symbol, '1D');
  }

  renderSnapshot(symbol);

  if (widgetLoaded) {
    renderTradingViewWidget(config.widget);
  }
}

function updateIntegrationStatus() {
  if (!statusTarget || !window.BaiaoAdvancedCharting) {
    return;
  }

  const { status, message } = window.BaiaoAdvancedCharting.getStatus();
  const title = statusTarget.querySelector('strong');
  const body = statusTarget.querySelector('p');

  statusTarget.dataset.state = status;

  if (title) {
    title.textContent =
      status === 'ready'
        ? copy.packageReady
        : status === 'loading'
          ? copy.packageLoading
          : copy.packageWaiting;
  }

  if (body) {
    body.textContent = message;
  }
}

function renderTradingViewWidget(symbol) {
  if (!widgetTarget) {
    return;
  }

  if (!symbol) {
    widgetLoaded = true;
    widgetTarget.innerHTML = `<div class="widget-unavailable">${copy.widgetUnavailable}</div>`;
    return;
  }

  if (typeof TradingView === 'undefined') {
    return;
  }

  widgetLoaded = true;
  widgetTarget.innerHTML = '';
  new TradingView.widget({
    autosize: true,
    symbol,
    interval: '1D',
    timezone: 'Etc/UTC',
    theme: 'dark',
    style: '1',
    locale: widgetLocale,
    enable_publishing: false,
    withdateranges: true,
    hide_side_toolbar: false,
    allow_symbol_change: false,
    container_id: 'tv-widget',
  });
}

getSymbolButtons().forEach((button) => {
  button.addEventListener('click', () => {
    updatePlaceholder(button.dataset.symbol);
  });
});

if (snapshotRefreshButton) {
  snapshotRefreshButton.addEventListener('click', () => {
    renderSnapshot(activeSymbol);
  });
}

if (searchForm) {
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    loadSearchResults(searchInput ? searchInput.value : '', searchType ? searchType.value : 'all');
  });
}

window.addEventListener('load', () => {
  loadSearchResults('', 'all');
  updatePlaceholder(activeSymbol);
  updateIntegrationStatus();

  if (window.BaiaoAdvancedCharting && typeof window.BaiaoAdvancedCharting.init === 'function') {
    window.BaiaoAdvancedCharting.init({
      symbol: activeSymbol,
      interval: '1D',
      containerId: 'tv_chart_container',
      onStatusChange: updateIntegrationStatus,
    });
  }

  if (widgetTarget && typeof TradingView !== 'undefined') {
    renderTradingViewWidget(marketConfigs[activeSymbol].widget);
  }
});