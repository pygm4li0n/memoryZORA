/* ============================================================
   RANK BADGE FIX — keeps the overlay emoji in sync with balance
   Reads the balance in each rank row, computes the correct
   badge, and rewrites the emoji. Works without touching any
   other file. Only touches the rankings overlay.
============================================================ */
(function () {
    'use strict';

    /* Canonical badge logic — MUST match getBadge() in script.js */
    function getBadge(balance) {
        if (balance >= 1000000) return { emoji: '🐋', name: 'Whale' };
        if (balance >= 250000)  return { emoji: '🐬', name: 'Dolphin' };
        if (balance >= 100000)  return { emoji: '🦀', name: 'Crab' };
        return { emoji: '🦐', name: 'Shrimp' };
    }

    /* All rank-related emojis — used to strip old ones */
    var RANK_EMOJI = /[🐋🐬🦀🦐]/g;

    /* Parse a number out of a score cell, handling K/M/B suffixes
       Examples:  "123" → 123,  "1,234" → 1234,
                  "123K" → 123000,  "1.2M" → 1200000,  "2B" → 2000000000 */
    function parseBalance(text) {
        if (!text) return 0;
        var s = String(text).trim().toUpperCase();

        // Keep only digits, dot, comma, K, M, B
        s = s.replace(/[^0-9.,KMB]/g, '');
        // Strip thousands separators
        s = s.replace(/,/g, '');

        var multiplier = 1;
        if (s.endsWith('B')) {
            multiplier = 1e9; s = s.slice(0, -1);
        } else if (s.endsWith('M')) {
            multiplier = 1e6; s = s.slice(0, -1);
        } else if (s.endsWith('K')) {
            multiplier = 1e3; s = s.slice(0, -1);
        }

        var n = parseFloat(s);
        return isFinite(n) ? n * multiplier : 0;
    }

    /* Fix every row inside the rankings overlay */
    function fixRankRows() {
        var rows = document.querySelectorAll(
            '#rankingsOverlay .rank-row, ' +
            '#holdersLeaderboard .rank-row, ' +
            '#activityLeaderboard .rank-row'
        );

        rows.forEach(function (row) {
            /* Find the balance for this row */
            var scoreEl = row.querySelector('.rank-score');
            if (!scoreEl) return;

            var balance = parseBalance(scoreEl.textContent);
            var badge   = getBadge(balance);

            /* Rewrite any leading rank emoji in the name cell */
            var nameEl = row.querySelector('.rank-name');
            if (nameEl) {
                /* Replace any existing rank emoji at the start of the text */
                var current = nameEl.textContent || '';
                var fixed   = current.replace(RANK_EMOJI, '').replace(/^\s+/, '');
                /* Insert correct emoji at start */
                if (!new RegExp('^' + badge.emoji).test(current)) {
                    nameEl.textContent = badge.emoji + ' ' + fixed;
                }
            }

            /* Also fix any standalone emoji span the overlay might use */
            var emojiSpans = row.querySelectorAll(
                '.rank-badge, .rank-emoji, .rank-icon, .user-badge'
            );
            emojiSpans.forEach(function (el) {
                var t = (el.textContent || '').trim();
                /* Only rewrite if the span contains a rank emoji (or is empty) */
                if (!t || RANK_EMOJI.test(t)) {
                    el.textContent = badge.emoji;
                }
            });
        });
    }

    /* Watch for the overlay being opened or rows being added */
    function attachObserver() {
        var overlay = document.getElementById('rankingsOverlay');
        if (!overlay) return;

        /* Fix whenever the overlay becomes visible */
        var observer = new MutationObserver(function (mutations) {
            var shouldFix = false;
            mutations.forEach(function (m) {
                if (m.type === 'attributes' && m.attributeName === 'class') {
                    if (!overlay.classList.contains('hidden')) shouldFix = true;
                }
                if (m.type === 'childList' && m.addedNodes.length) {
                    shouldFix = true;
                }
            });
            if (shouldFix) {
                /* Two passes — one immediate, one after render settles */
                fixRankRows();
                requestAnimationFrame(fixRankRows);
                setTimeout(fixRankRows, 150);
                setTimeout(fixRankRows, 500);
            }
        });

        observer.observe(overlay, {
            attributes: true,
            attributeFilter: ['class'],
            childList: true,
            subtree: true
        });

        /* Also fire once now in case it's already open */
        if (!overlay.classList.contains('hidden')) {
            fixRankRows();
        }
    }

    /* Boot */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachObserver);
    } else {
        attachObserver();
    }

    /* Safety net — if anything slips through, catch it on a slow timer */
    setInterval(function () {
        var overlay = document.getElementById('rankingsOverlay');
        if (overlay && !overlay.classList.contains('hidden')) {
            fixRankRows();
        }
    }, 1200);
})();
