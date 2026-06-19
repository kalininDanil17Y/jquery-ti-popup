/**
 * TiPopup
 * https://cdn.jsdelivr.net/gh/kalininDanil17Y/jquery-ti-popup@main/ti-popup.js
 *
 * Supported:
 * - data-ti-popup="HTML"
 * - data-ti-popup-fn="window.someFunction"
 * - data-ti-popup-z-index="20000"
 * - data-ti-popup-class="some-class"
 * - data-ti-popup-inner-class="some-inner-class"
 * - data-ti-popup-style="max-width:520px;"
 * - data-ti-popup-inner-style="font-size:18px;"
 * - data-ti-popup-refresh="500"
 *
 * JS API:
 * - $(el).tiPopup("HTML")
 * - $(el).tiPopup(function (el, event) { return "HTML"; })
 * - $(el).tiPopup(function (el, event) { return { html: "HTML" }; })
 * - $(el).tiPopup({ html: "HTML" })
 * - $(el).tiPopup({ text: "Plain text" })
 * - $(el).tiPopup({ getHtml(el, event) { return "HTML"; } })
 * - $(el).tiPopup({ getText(el, event) { return "Plain text"; } })
 * - $(el).tiPopup({ getConfig(el, event) { return { html: "HTML" }; } })
 */
(function (window, document, $) {
    'use strict';

    if (window.BT_POPUP) {
        return;
    }

    var POPUP_ID = 'bt_event_popup';
    var STYLE_ID = 'bt_event_popup_styles';
    var DATA_KEY = 'btEventPopup';

    var SELECTOR = [
        '[data-bt-popup]',
        '[data-ti-popup]',
        '[data-bt-popup-fn]',
        '[data-ti-popup-fn]',
        '[data-bt-popup-bound]',
        '[data-ti-popup-bound]'
    ].join(',');

    var defaults = {
        zIndex: 12000,
        maxWidth: 360,
        offsetX: 14,
        offsetY: 16,
        className: '',
        innerClassName: '',
        style: '',
        innerStyle: '',
        refreshInterval: 0,
        watchPointer: true,
        watchPointerInterval: 150
    };

    var activeEl = null;
    var activeEvent = null;
    var refreshTimer = null;
    var hoverShowTimer = null;
    var hoverPendingEl = null;
    var hoverPendingEvent = null;
    var HOVER_SHOW_DELAY = 200;

    var pointerX = 0;
    var pointerY = 0;
    var pointerWatchTimer = null;

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.type = 'text/css';

        style.appendChild(document.createTextNode(
            '.bt_event_popup{' +
            'position:fixed;' +
            'left:0;' +
            'top:0;' +
            'box-sizing:border-box;' +
            'background:#674025;' +
            'border-radius:13px;' +
            'padding:4px;' +
            'pointer-events:none;' +
            'display:none;' +
            'color:#52331e;' +
            'font-family:NewTahoma,Tahoma,Arial,sans-serif;' +
            'box-shadow:0 12px 28px rgba(0,0,0,.35);' +
            '}' +
            '.bt_event_popup__inner{' +
            'box-sizing:border-box;' +
            'max-width:100%;' +
            'background:#d9cbae;' +
            'border-radius:10px;' +
            'padding:12px;' +
            'font-size:14px;' +
            'line-height:1.35;' +
            '}'
        ));

        document.head.appendChild(style);
    }

    function getPopup() {
        ensureStyles();

        var popup = document.getElementById(POPUP_ID);

        if (!popup) {
            popup = document.createElement('div');
            popup.id = POPUP_ID;
            popup.className = 'bt_event_popup';
            popup.innerHTML = '<div class="bt_event_popup__inner"></div>';
            document.body.appendChild(popup);
        }

        return popup;
    }

    function extend(target, source) {
        target = target || {};
        source = source || {};

        for (var key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) {
                target[key] = source[key];
            }
        }

        return target;
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function readFn(path) {
        path = String(path || '');

        if (!path) {
            return null;
        }

        var ctx = window;
        var parts = path.split('.');

        for (var i = 0; i < parts.length; i++) {
            if (!parts[i]) {
                return null;
            }

            ctx = ctx[parts[i]];

            if (typeof ctx === 'undefined' || ctx === null) {
                return null;
            }
        }

        return typeof ctx === 'function' ? ctx : null;
    }

    function getAttr(el, names, fallback) {
        for (var i = 0; i < names.length; i++) {
            var value = el.getAttribute(names[i]);

            if (value !== null && value !== '') {
                return value;
            }
        }

        return fallback;
    }

    function parseNumber(value, fallback) {
        var result = parseInt(value, 10);
        return isNaN(result) ? fallback : result;
    }

    function normalizeReturnedConfig(result, el, event) {
        var cfg = {};

        if (typeof result === 'function') {
            result = result.call(el, el, event);
        }

        if (typeof result === 'string' || typeof result === 'number') {
            cfg.html = String(result);
            return cfg;
        }

        if (result && typeof result === 'object') {
            cfg = extend({}, result);
        }

        return cfg;
    }

    function normalizeConfig(result, el, event) {
        var cfg = extend({}, defaults);

        var attrHtml = getAttr(el, [
            'data-bt-popup',
            'data-ti-popup'
        ], '');

        var attrFn = getAttr(el, [
            'data-bt-popup-fn',
            'data-ti-popup-fn'
        ], '');

        var hideOnClickAttr = getAttr(el, [
            'data-bt-popup-hide-on-click',
            'data-ti-popup-hide-on-click'
        ], null);

        if (hideOnClickAttr !== null) {
            cfg.hideOnClick = hideOnClickAttr !== 'false' && hideOnClickAttr !== '0';
        }

        var dataCfg = $ ? $(el).data(DATA_KEY) : null;
        var attrProvider = readFn(attrFn);
        var configFromData = {};
        var configFromResult = {};

        /**
         * JS config:
         * .tiPopup("HTML")
         * .tiPopup(function () {})
         * .tiPopup({ ... })
         */
        if (typeof dataCfg !== 'undefined' && dataCfg !== null) {
            configFromData = normalizeReturnedConfig(dataCfg, el, event);
            cfg = extend(cfg, configFromData);
        }

        /**
         * Recommended: getConfig
         */
        if (typeof cfg.getConfig === 'function') {
            var dynamicConfig = cfg.getConfig.call(el, el, event);

            if (dynamicConfig && typeof dynamicConfig === 'object') {
                cfg = extend(cfg, dynamicConfig);
            } else if (typeof dynamicConfig === 'string' || typeof dynamicConfig === 'number') {
                cfg.html = String(dynamicConfig);
            }
        }

        /**
         * Legacy alias: provider
         */
        if (typeof cfg.provider === 'function') {
            var providerConfig = cfg.provider.call(el, el, event);

            if (providerConfig && typeof providerConfig === 'object') {
                cfg = extend(cfg, providerConfig);
            } else if (typeof providerConfig === 'string' || typeof providerConfig === 'number') {
                cfg.html = String(providerConfig);
            }
        }

        /**
         * data-ti-popup-fn / data-bt-popup-fn
         */
        if (attrProvider) {
            configFromResult = normalizeReturnedConfig(attrProvider, el, event);
            cfg = extend(cfg, configFromResult);
        }

        /**
         * Optional direct result
         */
        if (typeof result !== 'undefined') {
            configFromResult = normalizeReturnedConfig(result, el, event);
            cfg = extend(cfg, configFromResult);
        }

        /**
         * Recommended content callbacks
         */
        if (typeof cfg.getHtml === 'function') {
            cfg.html = cfg.getHtml.call(el, el, event);
        }

        if (typeof cfg.getText === 'function') {
            cfg.text = cfg.getText.call(el, el, event);
        }

        /**
         * Fallback to data-ti-popup / data-bt-popup
         */
        if (
            typeof cfg.html === 'undefined' &&
            typeof cfg.text === 'undefined' &&
            typeof cfg.content === 'undefined' &&
            attrHtml
        ) {
            cfg.html = attrHtml;
        }

        /**
         * html/content are inserted as HTML.
         * text is escaped.
         */
        if (typeof cfg.html !== 'undefined') {
            cfg.html = String(cfg.html);
        } else if (typeof cfg.text !== 'undefined') {
            cfg.html = escapeHtml(cfg.text);
        } else if (typeof cfg.content !== 'undefined') {
            cfg.html = String(cfg.content);
        } else {
            cfg.html = '';
        }

        /**
         * Attributes override JS config.
         */
        cfg.zIndex = parseNumber(getAttr(el, [
            'data-bt-popup-z-index',
            'data-ti-popup-z-index'
        ], cfg.zIndex), defaults.zIndex);

        cfg.maxWidth = parseNumber(getAttr(el, [
            'data-bt-popup-max-width',
            'data-ti-popup-max-width'
        ], cfg.maxWidth), defaults.maxWidth);

        cfg.offsetX = parseNumber(getAttr(el, [
            'data-bt-popup-offset-x',
            'data-ti-popup-offset-x'
        ], cfg.offsetX), defaults.offsetX);

        cfg.offsetY = parseNumber(getAttr(el, [
            'data-bt-popup-offset-y',
            'data-ti-popup-offset-y'
        ], cfg.offsetY), defaults.offsetY);

        cfg.className = String(getAttr(el, [
            'data-bt-popup-class',
            'data-ti-popup-class'
        ], cfg.className || ''));

        cfg.innerClassName = String(getAttr(el, [
            'data-bt-popup-inner-class',
            'data-ti-popup-inner-class'
        ], cfg.innerClassName || ''));

        cfg.style = String(getAttr(el, [
            'data-bt-popup-style',
            'data-ti-popup-style'
        ], cfg.style || ''));

        cfg.innerStyle = String(getAttr(el, [
            'data-bt-popup-inner-style',
            'data-ti-popup-inner-style'
        ], cfg.innerStyle || ''));

        cfg.refreshInterval = parseNumber(getAttr(el, [
            'data-bt-popup-refresh',
            'data-ti-popup-refresh'
        ], cfg.refreshInterval), 0);

        return cfg;
    }

    function applyPopupConfig(popup, inner, cfg) {
        var currentDisplay = popup.style.display;
        var currentLeft = popup.style.left;
        var currentTop = popup.style.top;

        popup.className = 'bt_event_popup' + (cfg.className ? ' ' + cfg.className : '');

        /**
         * Important:
         * Do not lose display:block during refreshContent().
         */
        popup.style.cssText = '';
        popup.style.position = 'fixed';
        popup.style.left = currentLeft || '0';
        popup.style.top = currentTop || '0';
        popup.style.boxSizing = 'border-box';
        popup.style.zIndex = cfg.zIndex;
        popup.style.maxWidth = cfg.maxWidth + 'px';

        if (currentDisplay) {
            popup.style.display = currentDisplay;
        }

        if (cfg.style) {
            popup.style.cssText += ';' + cfg.style;
        }

        inner.className = 'bt_event_popup__inner' + (
            cfg.innerClassName ? ' ' + cfg.innerClassName : ''
        );

        inner.style.cssText = cfg.innerStyle || '';
        inner.innerHTML = cfg.html;
    }

    function positionPopup(popup, event, cfg) {
        var viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
        var viewportH = window.innerHeight || document.documentElement.clientHeight || 0;

        var x = event && typeof event.clientX !== 'undefined' ? event.clientX : 0;
        var y = event && typeof event.clientY !== 'undefined' ? event.clientY : 0;

        var left = x + cfg.offsetX;
        var top = y + cfg.offsetY;

        var rect = popup.getBoundingClientRect();
        var pad = 8;

        if (left + rect.width + pad > viewportW) {
            left = Math.max(pad, x - rect.width - cfg.offsetX);
        }

        if (top + rect.height + pad > viewportH) {
            top = Math.max(pad, y - rect.height - cfg.offsetY);
        }

        popup.style.left = left + 'px';
        popup.style.top = top + 'px';
    }

    function stopRefresh() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }
    }

    function stopHoverShow() {
        if (hoverShowTimer) {
            clearTimeout(hoverShowTimer);
            hoverShowTimer = null;
        }

        hoverPendingEl = null;
        hoverPendingEvent = null;
    }

    function refreshContent(el) {
        var popup = document.getElementById(POPUP_ID);

        if (!popup || popup.style.display !== 'block' || activeEl !== el) {
            return;
        }

        var inner = popup.querySelector('.bt_event_popup__inner');

        if (!inner) {
            hide();
            return;
        }

        var cfg = normalizeConfig(undefined, el, activeEvent);

        if (!cfg.html) {
            hide();
            return;
        }

        applyPopupConfig(popup, inner, cfg);

        /**
         * Extra safety:
         * applyPopupConfig must not hide popup during refresh.
         */
        popup.style.display = 'block';

        positionPopup(popup, activeEvent, cfg);
    }

    function startRefresh(el, cfg) {
        stopRefresh();

        if (!cfg || !cfg.refreshInterval || cfg.refreshInterval < 100) {
            return;
        }

        refreshTimer = setInterval(function () {
            refreshContent(el);
        }, cfg.refreshInterval);
    }

    function show(el, event) {
        var cfg = normalizeConfig(undefined, el, event);

        if (!cfg.html) {
            hide();
            return;
        }

        var popup = getPopup();
        var inner = popup.querySelector('.bt_event_popup__inner');

        if (!inner) {
            return;
        }

        activeEl = el;
        activeEvent = event;

        pointerX = event.clientX;
        pointerY = event.clientY;

        applyPopupConfig(popup, inner, cfg);

        popup.style.display = 'block';

        positionPopup(popup, event, cfg);
        startRefresh(el, cfg);
        startPointerWatch(el, cfg);
    }

    function scheduleShow(el, event) {
        stopHoverShow();

        hoverPendingEl = el;
        hoverPendingEvent = event;
        pointerX = event.clientX;
        pointerY = event.clientY;

        hoverShowTimer = setTimeout(function () {
            var pendingEl = hoverPendingEl;
            var pendingEvent = hoverPendingEvent;

            stopHoverShow();

            if (!pendingEl || !isPointerOverElement(pendingEl)) {
                return;
            }

            show(pendingEl, pendingEvent || event);
        }, HOVER_SHOW_DELAY);
    }

    function move(el, event) {
        if (hoverPendingEl === el) {
            hoverPendingEvent = event;
            pointerX = event.clientX;
            pointerY = event.clientY;
        }

        var popup = document.getElementById(POPUP_ID);

        if (!popup || popup.style.display !== 'block' || activeEl !== el) {
            return;
        }

        activeEvent = event;
        pointerX = event.clientX;
        pointerY = event.clientY;

        positionPopup(popup, event, normalizeConfig(undefined, el, event));
    }

    function hide() {
        var popup = document.getElementById(POPUP_ID);

        stopHoverShow();
        stopRefresh();
        stopPointerWatch();

        activeEl = null;
        activeEvent = null;

        if (popup) {
            popup.style.display = 'none';
        }
    }

    function isPointerOverElement(el, x, y) {
        if (!el) {
            return false;
        }

        if (typeof x === 'undefined' || typeof y === 'undefined') {
            return false;
        }

        var target = document.elementFromPoint(x, y);

        if (!target) {
            return false;
        }

        return el === target || el.contains(target);
    }

    function stopPointerWatch() {
        if (pointerWatchTimer) {
            clearInterval(pointerWatchTimer);
            pointerWatchTimer = null;
        }
    }

    function isPointerOverElement(el) {
        if (!el) {
            return false;
        }

        var target = document.elementFromPoint(pointerX, pointerY);

        if (!target) {
            return false;
        }

        return el === target || el.contains(target);
    }

    function startPointerWatch(el, cfg) {
        stopPointerWatch();

        if (!cfg || !cfg.watchPointer) {
            return;
        }

        var interval = parseNumber(cfg.watchPointerInterval, 200);

        if (interval < 50) {
            interval = 50;
        }

        pointerWatchTimer = setInterval(function () {
            if (!activeEl || activeEl !== el) {
                stopPointerWatch();
                return;
            }

            /*
             * Если popup скрыт — watcher больше не нужен.
             */
            var popup = document.getElementById(POPUP_ID);

            if (!popup || popup.style.display !== 'block') {
                stopPointerWatch();
                return;
            }

            /*
             * Главная проверка:
             * если под курсором уже не исходный элемент,
             * значит курсор ушёл или элемент перекрыт модалкой/overlay.
             */
            if (!isPointerOverElement(el)) {
                hide();
            }
        }, interval);
    }


    function bind() {
        if (!$ || $(document).data('btEventPopupBound')) {
            return;
        }

        $(document).data('btEventPopupBound', true);

        $(document)
            .on('mouseenter.btEventPopup', SELECTOR, function (event) {
                scheduleShow(this, event);
            })
            .on('mousemove.btEventPopup', SELECTOR, function (event) {
                move(this, event);
            })
            .on('mouseleave.btEventPopup', SELECTOR, function () {
                hide();
            });
    }

    window.BT_POPUP = {
        bind: bind,
        show: show,
        hide: hide,
        normalizeConfig: normalizeConfig
    };

    window.TI_POPUP = window.BT_POPUP;

    if ($) {
        $.fn.tiPopup = function (config) {
            return this.each(function () {
                $(this)
                    .data(DATA_KEY, config)
                    .attr('data-bt-popup-bound', '1')
                    .attr('data-ti-popup-bound', '1');
            });
        };

        $.fn.newPopup = $.fn.tiPopup;

        $(bind);
    }
})(window, document, window.jQuery);
