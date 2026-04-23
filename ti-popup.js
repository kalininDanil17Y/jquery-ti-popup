/**
 * TiPopup
 *
 * https://codepen.io/kalinindanil17Y/pen/RNGzKad
 */
(function (window, document, $) {
    if (window.BT_POPUP) {
        return;
    }

    var POPUP_ID = 'bt_event_popup';
    var STYLE_ID = 'bt_event_popup_styles';
    var DATA_KEY = 'btEventPopup';
    var SELECTOR = '[data-bt-popup],[data-ti-popup],[data-bt-popup-fn],[data-ti-popup-fn],[data-bt-popup-bound]';
    var defaults = {
        zIndex: 12000,
        maxWidth: 360,
        offsetX: 14,
        offsetY: 16,
        className: '',
        innerClassName: '',
        style: '',
        innerStyle: '',
        refreshInterval: 0
    };
    var activeEl = null;
    var activeEvent = null;
    var refreshTimer = null;

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
                'border-radius:20px;' +
                'padding:11px;' +
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

    function normalizeConfig(result, el, event) {
        var cfg = extend({}, defaults);
        var attrHtml = el.getAttribute('data-bt-popup') || el.getAttribute('data-ti-popup') || '';
        var attrFn = el.getAttribute('data-bt-popup-fn') || el.getAttribute('data-ti-popup-fn') || '';
        var dataCfg = $ ? $(el).data(DATA_KEY) : null;
        var provider = null;

        if (dataCfg) {
            if (typeof dataCfg === 'function') {
                provider = dataCfg;
            } else {
                cfg = extend(cfg, dataCfg);
                if (typeof dataCfg.provider === 'function') {
                    provider = dataCfg.provider;
                }
            }
        }

        if (!provider && attrFn) {
            provider = readFn(attrFn);
        }

        if (typeof result === 'undefined' && provider) {
            result = provider.call(el, el, event);
        }
        if (typeof result === 'undefined' && dataCfg && typeof dataCfg !== 'function') {
            result = dataCfg;
        }
        if (typeof result === 'undefined') {
            result = attrHtml;
        }

        if (typeof result === 'string' || typeof result === 'number') {
            cfg.html = String(result);
        } else {
            cfg = extend(cfg, result || {});
        }

        cfg.html = typeof cfg.html !== 'undefined' ? String(cfg.html) : String(cfg.content || cfg.text || '');
        cfg.zIndex = parseInt(el.getAttribute('data-bt-popup-z-index') || el.getAttribute('data-ti-popup-z-index') || cfg.zIndex, 10) || defaults.zIndex;
        cfg.className = String(el.getAttribute('data-bt-popup-class') || el.getAttribute('data-ti-popup-class') || cfg.className || '');
        cfg.innerClassName = String(el.getAttribute('data-bt-popup-inner-class') || el.getAttribute('data-ti-popup-inner-class') || cfg.innerClassName || '');
        cfg.style = String(el.getAttribute('data-bt-popup-style') || el.getAttribute('data-ti-popup-style') || cfg.style || '');
        cfg.innerStyle = String(el.getAttribute('data-bt-popup-inner-style') || el.getAttribute('data-ti-popup-inner-style') || cfg.innerStyle || '');
        cfg.refreshInterval = parseInt(el.getAttribute('data-bt-popup-refresh') || el.getAttribute('data-ti-popup-refresh') || cfg.refreshInterval, 10) || 0;

        return cfg;
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

    function show(el, event) {
        var cfg = normalizeConfig(undefined, el, event);
        if (!cfg.html) {
            hide();
            return;
        }

        var popup = getPopup();
        var inner = popup.querySelector('.bt_event_popup__inner');
        activeEl = el;
        activeEvent = event;

        popup.className = 'bt_event_popup' + (cfg.className ? (' ' + cfg.className) : '');
        popup.style.cssText = '';
        popup.style.position = 'fixed';
        popup.style.left = '0';
        popup.style.top = '0';
        popup.style.boxSizing = 'border-box';
        popup.style.zIndex = cfg.zIndex;
        popup.style.maxWidth = (parseInt(cfg.maxWidth, 10) || defaults.maxWidth) + 'px';
        if (cfg.style) {
            popup.style.cssText += ';' + cfg.style;
        }

        inner.className = 'bt_event_popup__inner' + (cfg.innerClassName ? (' ' + cfg.innerClassName) : '');
        inner.style.cssText = cfg.innerStyle || '';
        inner.innerHTML = cfg.html;

        popup.style.display = 'block';
        positionPopup(popup, event, cfg);
        startRefresh(el, cfg);
    }

    function move(el, event) {
        var popup = document.getElementById(POPUP_ID);
        if (!popup || popup.style.display !== 'block' || activeEl !== el) {
            return;
        }
        activeEvent = event;
        positionPopup(popup, event, normalizeConfig(undefined, el, event));
    }

    function stopRefresh() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }
    }

    function refreshContent(el) {
        var popup = document.getElementById(POPUP_ID);
        if (!popup || popup.style.display !== 'block' || activeEl !== el) {
            return;
        }

        var cfg = normalizeConfig(undefined, el, activeEvent);
        var inner = popup.querySelector('.bt_event_popup__inner');
        if (!cfg.html || !inner) {
            hide();
            return;
        }

        popup.className = 'bt_event_popup' + (cfg.className ? (' ' + cfg.className) : '');
        popup.style.zIndex = cfg.zIndex;
        popup.style.maxWidth = (parseInt(cfg.maxWidth, 10) || defaults.maxWidth) + 'px';
        inner.className = 'bt_event_popup__inner' + (cfg.innerClassName ? (' ' + cfg.innerClassName) : '');
        inner.style.cssText = cfg.innerStyle || '';
        inner.innerHTML = cfg.html;
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

    function hide() {
        var popup = document.getElementById(POPUP_ID);
        stopRefresh();
        activeEl = null;
        activeEvent = null;
        if (popup) {
            popup.style.display = 'none';
        }
    }

    function bind() {
        if (!$ || $(document).data('btEventPopupBound')) {
            return;
        }
        $(document).data('btEventPopupBound', true);
        $(document)
            .on('mouseenter.btEventPopup', SELECTOR, function (event) {
                show(this, event);
            })
            .on('mousemove.btEventPopup', SELECTOR, function (event) {
                move(this, event);
            })
            .on('mouseleave.btEventPopup click.btEventPopup', SELECTOR, function () {
                hide();
            });
    }

    window.BT_POPUP = {
        bind: bind,
        show: show,
        hide: hide
    };
    window.TI_POPUP = window.BT_POPUP;

    if ($) {
        $.fn.tiPopup = function (config) {
            return this.each(function () {
                $(this)
                    .data(DATA_KEY, config)
                    .attr('data-bt-popup-bound', '1');
            });
        };
        $.fn.newPopup = $.fn.tiPopup;

        $(bind);
    }
})(window, document, window.jQuery);
