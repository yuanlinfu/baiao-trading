(function () {
  const isChinese = document.body && document.body.dataset.locale === 'zh';
  const widgetLocale = isChinese ? 'zh_CN' : 'en';
  const assetPrefix = window.location.pathname.includes('/zh/') ? '../' : '';
  const messages = {
    expectedPath: isChinese
      ? '预期本地路径：vendor/charting_library/charting_library.js。添加已授权的本地包后即可启用 Advanced Charts。'
      : 'Expected local path: vendor/charting_library/charting_library.js. Add the licensed package locally to enable Advanced Charts.',
    loading: isChinese
      ? '正在尝试从 vendor/charting_library/ 加载本地授权版 Charting Library。'
      : 'Trying to load the local licensed Charting Library package from vendor/charting_library/.',
    missing: isChinese
      ? '尚未检测到本地授权包。当前保留公开预览占位；将授权版 Charting Library 文件放入 vendor/charting_library/ 后，此挂载区会自动激活。'
      : 'Local package not found. Keep the public fallback in place, then drop the licensed Charting Library files into vendor/charting_library/ to activate this mount.',
    missingContainer: isChinese
      ? '页面中未找到授权图表容器。'
      : 'Licensed container not found in the page layout.',
    ready: isChinese
      ? '已检测到并挂载本地授权包。图表当前通过本地市场 API 层提供的 Alpha Vantage 代理接口读取数据。'
      : 'Local package detected and mounted. The chart now reads from the Alpha Vantage proxy endpoints exposed by the local market API layer.',
  };
  const scriptPath = `${assetPrefix}vendor/charting_library/charting_library.js`;
  const libraryPath = `${assetPrefix}vendor/charting_library/`;
  const state = {
    status: 'idle',
    message: messages.expectedPath,
    widget: null,
    options: null,
    scriptPromise: null,
  };

  function setStatus(status, message, callback) {
    state.status = status;
    state.message = message;

    if (typeof callback === 'function') {
      callback();
    }
  }

  function getContainer(containerId) {
    return document.getElementById(containerId);
  }

  function toggleLicensedShell(isVisible, containerId) {
    const container = getContainer(containerId);
    const shell = container ? container.closest('.chart-shell') : null;

    if (!shell) {
      return;
    }

    shell.classList.toggle('chart-shell--licensed', Boolean(isVisible));
  }

  function loadLibrary() {
    if (typeof TradingView !== 'undefined' && typeof TradingView.widget === 'function') {
      return Promise.resolve(true);
    }

    if (state.scriptPromise) {
      return state.scriptPromise;
    }

    state.scriptPromise = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = scriptPath;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });

    return state.scriptPromise;
  }

  function buildWidgetOptions(options) {
    return {
      symbol: options.symbol,
      interval: options.interval,
      container: options.containerId,
      library_path: libraryPath,
      locale: widgetLocale,
      autosize: true,
      theme: 'dark',
      timezone: 'Etc/UTC',
      datafeed: window.BaiaoDatafeedFactory.create(),
      disabled_features: ['header_compare', 'use_localstorage_for_settings'],
      enabled_features: ['study_templates'],
    };
  }

  async function init(options) {
    state.options = options;
    setStatus('loading', messages.loading, options.onStatusChange);

    const hasLibrary = await loadLibrary();

    if (!hasLibrary || typeof TradingView === 'undefined' || typeof TradingView.widget !== 'function') {
      toggleLicensedShell(false, options.containerId);
      setStatus(
        'missing',
        messages.missing,
        options.onStatusChange
      );
      return false;
    }

    const container = getContainer(options.containerId);

    if (!container) {
      setStatus('missing', messages.missingContainer, options.onStatusChange);
      return false;
    }

    container.innerHTML = '';
    state.widget = new TradingView.widget(buildWidgetOptions(options));
    toggleLicensedShell(true, options.containerId);
    setStatus(
      'ready',
      messages.ready,
      options.onStatusChange
    );
    return true;
  }

  function updateSymbol(symbol, interval = '240') {
    if (!state.widget || typeof state.widget.setSymbol !== 'function') {
      return;
    }

    state.widget.setSymbol(symbol, interval);
  }

  window.BaiaoAdvancedCharting = {
    init,
    updateSymbol,
    getStatus() {
      return { status: state.status, message: state.message };
    },
  };
})();