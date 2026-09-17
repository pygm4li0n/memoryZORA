/* ============================================================
   TOKEN CA — injects a copy-able contract address pill next
   to the header token tracker. Desktop only (CSS hides on
   mobile). No other file is touched.
============================================================ */
(function () {
    'use strict';

    var CA = '6imhRyMYu5xoGJ5W7yveymB5o5yfyAvXxveozWpbU5ix';
    var SHORT = CA.slice(0, 6) + '…' + CA.slice(-6);

    function copyText(text) {
        /* Modern API */
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        /* Fallback for older browsers */
        return new Promise(function (resolve, reject) {
            try {
                var ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                ta.style.pointerEvents = 'none';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    }

    function inject() {
        var center = document.querySelector('.header-center');
        if (!center) return;
        if (center.querySelector('.token-ca')) return;

        var el = document.createElement('div');
        el.className = 'token-ca';
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.setAttribute('title', 'Click to copy contract address');
        el.innerHTML =
            '<span class="ca-label">CA</span>' +
            '<span class="ca-value">' + SHORT + '</span>' +
            '<span class="ca-copy">📋</span>';

        function flashCopied() {
            el.classList.add('copied');
            var icon = el.querySelector('.ca-copy');
            if (icon) icon.textContent = '✅';
            setTimeout(function () {
                el.classList.remove('copied');
                if (icon) icon.textContent = '📋';
            }, 1500);
        }

        function doCopy() {
            copyText(CA)
                .then(flashCopied)
                .catch(function (err) {
                    console.warn('[token-ca] copy failed', err);
                    /* Last-ditch fallback */
                    try {
                        window.prompt('Copy the contract address:', CA);
                    } catch (e) {}
                });
        }

        el.addEventListener('click', doCopy);
        el.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                doCopy();
            }
        });

        center.appendChild(el);
    }

    /* Boot */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject);
    } else {
        inject();
    }

    /* Re-inject if script.js rebuilds the header */
    var mo = new MutationObserver(inject);
    document.addEventListener('DOMContentLoaded', function () {
        var center = document.querySelector('.header-center');
        if (center) mo.observe(center, { childList: true });
    });
})();
