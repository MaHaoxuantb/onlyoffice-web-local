/* Compatibility APIs required by the bundled ONLYOFFICE SDK on older WebKit. */
(function (window) {
    'use strict'

    if (typeof window.requestIdleCallback !== 'function') {
        window.requestIdleCallback = function (callback, options) {
            var startedAt = Date.now()
            var timeout = options && Number(options.timeout)
            var delay = Number.isFinite(timeout) ? Math.max(0, timeout) : 1

            return window.setTimeout(function () {
                callback({
                    didTimeout: Number.isFinite(timeout) && Date.now() - startedAt >= timeout,
                    timeRemaining: function () {
                        return Math.max(0, 50 - (Date.now() - startedAt))
                    },
                })
            }, delay)
        }
    }

    if (typeof window.cancelIdleCallback !== 'function') {
        window.cancelIdleCallback = function (handle) {
            window.clearTimeout(handle)
        }
    }
})(window)
