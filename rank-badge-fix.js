/* ============================================================
   RANK BADGE FIX — makes the emoji match the row's text label
   ------------------------------------------------------------
   If a row says "Crab" but shows a shrimp (or any wrong emoji),
   this forces the emoji to match the NAME. Bulletproof:
     • reads the text label first (Crab / Shrimp / Whale / Dolphin)
     • falls back to balance parsing only if no label found
     • fixes wrong emoji in text nodes, <img>, and CSS content
     • also kills any pseudo-element that paints a rank emoji
   Only touches the rankings overlay.
============================================================ */
(function () {
    'use strict';

    /* ── Canonical badge map ── */
    var NAME_TO_EMOJI = [
        { key: 'whale',   emoji: '🐋' },
        { key: 'dolphin', emoji: '🐬' },
        { key: 'crab',    emoji: '🦀' },
        { key: 'shrimp',  emoji: '🦐' }
    ];
    var RANK_EMOJI_RE = /[🐋🐬🦀🦐]/g;

    /* ── Balance → badge (fallback when no text label found) ── */
    function getBadge(balance) {
        if (balance >= 1000000) return { emoji: '🐋', name: 'Whale' };
        if (balance >= 250000)  return { emoji: '🐬', name: 'Dolphin' };
        if (balance >= 100000)  return { emoji: '🦀', name: 'Crab' };
        return { emoji: '🦐', name: 'Shrimp' };
    }

    /* ── Parse a score cell, handling K / M / B suffixes ── */
    function parseBalance(text) {
        if (!text) return 0;
        var s = String(text).trim().toUpperCase();
        s = s.replace(/[^0-9.,KMB]/g, '');
        s = s.replace(/,/g, '');
        var mult = 1;
        if (s.endsWith('B')) { mult = 1e9; s = s.slice(0, -1); }
        else if (s.endsWith('M')) { mult = 1e6; s = s.slice(0, -1); }
        else if (s.endsWith('K')) { mult = 1e3; s = s.slice(0, -1); }
        var n = parseFloat(s);
        return isFinite(n) ? n * mult : 0;
    }

    /* ── Emoji from a text label (Whale / Dolphin / Crab / Shrimp) ── */
    function emojiFromText(text) {
        if (!text) return null;
        var lower = String(text).toLowerCase();
        for (var i = 0; i < NAME_TO_EMOJI.length; i++) {
            if (lower.indexOf(NAME_TO_EMOJI[i].key) !== -1) {
                return NAME_TO_EMOJI[i].emoji;
            }
        }
        return null;
    }

    /* ── Force-hide any pseudo-element that might paint a rank emoji ── */
    function installPseudoKiller() {
        if (document.getElementById('rankEmojiKiller')) return;
        var style = document.createElement('style');
        style.id = 'rankEmojiKiller';
        style.textContent =
            '#rankingsOverlay .rank-row::before,' +
            '#rankingsOverlay .rank-row::after,' +
            '#rankingsOverlay .rank-name::before,' +
            '#rankingsOverlay .rank-name::after,' +
            '#rankingsOverlay .rank-avatar::before,' +
            '#rankingsOverlay .rank-avatar::after,' +
            '#rankingsOverlay .rank-info::before,' +
            '#rankingsOverlay .rank-info::after,' +
            '#rankingsOverlay .rank-meta::before,' +
            '#rankingsOverlay .rank-meta::after{' +
                'content: none !important;' +
            '}';
        document.head.appendChild(style);
    }

    /* ── Fix a single row ── */
    function fixRow(row) {
        /* 1) Decide the correct emoji: prefer the text label */
        var rowText = row.textContent || '';
        var correctEmoji = emojiFromText(rowText);

        /* 2) Fall back to balance if no label found */
        if (!correctEmoji) {
            var scoreEl = row.querySelector('.rank-score');
            if (scoreEl) {
                correctEmoji = getBadge(parseBalance(scoreEl.textContent)).emoji;
            }
        }
        if (!correctEmoji) return;

        /* 3) Fix every text node in the row */
        var walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT, null, false);
        var n;
        while ((n = walker.nextNode())) {
            var t = n.nodeValue || '';
            RANK_EMOJI_RE.lastIndex = 0;
            if (RANK_EMOJI_RE.test(t)) {
                RANK_EMOJI_RE.lastIndex = 0;
                var fixed = t.replace(RANK_EMOJI_RE, correctEmoji);
                if (fixed !== t) n.nodeValue = fixed;
            }
        }

        /* 4) Fix any <img> that carries a rank emoji as an image */
        row.querySelectorAll('img').forEach(function (img) {
            var alt = (img.getAttribute('alt') || '').toLowerCase();
            var src = (img.getAttribute('src') || '').toLowerCase();
            if (/whale|dolphin|crab|shrimp/.test(alt + ' ' + src)) {
                var span = document.createElement('span');
                span.className = 'rank-emoji';
                span.textContent = correctEmoji;
                img.parentNode.replaceChild(span, img);
            }
        });

        /* 5) Ensure the name cell starts with the correct emoji */
        var nameEl = row.querySelector('.rank-name');
        if (nameEl) {
            var txt = (nameEl.textContent || '').trim();
            if (!/^[🐋🐬🦀🦐]/.test(txt)) {
                nameEl.textContent = correctEmoji + ' ' + txt;
            }
        }

        /* 6) Fix any standalone emoji span */
        row.querySelectorAll('.rank-badge, .rank-emoji, .rank-icon, .user-badge')
            .forEach(function (el) {
                var t = (el.textContent || '').trim();
                if (!t || RANK_EMOJI_RE.test(t)) {
                    RANK_EMOJI_RE.lastIndex = 0;
                    el.textContent = correctEmoji;
                }
                RANK_EMOJI_RE.lastIndex = 0;
            });
    }

    /* ── Fix every row in the overlay ── */
    function fixRankRows() {
        installPseudoKiller();
        document
            .querySelectorAll(
                '#rankingsOverlay .rank-row, ' +
                '#holdersLeaderboard .rank-row, ' +
                '#activityLeaderboard .rank-row'
            )
            .forEach(fixRow);
    }

    /* ── Watch the overlay for changes ── */
    function attachObserver() {
        var overlay = document.getElementById('rankingsOverlay');
        if (!overlay) return;

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
                fixRankRows();
                requestAnimationFrame(fixRankRows);
                setTimeout(fixRankRows, 100);
                setTimeout(fixRankRows, 300);
                setTimeout(fixRankRows, 800);
            }
        });

        observer.observe(overlay, {
            attributes: true,
            attributeFilter: ['class'],
            childList: true,
            subtree: true
        });

        if (!overlay.classList.contains('hidden')) fixRankRows();
    }

    /* ── Boot ── */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachObserver);
    } else {
        attachObserver();
    }

    /* ── Safety net — every 1s while the overlay is open ── */
    setInterval(function () {
        var overlay = document.getElementById('rankingsOverlay');
        if (overlay && !overlay.classList.contains('hidden')) {
            fixRankRows();
        }
    }, 1000);

    /* Expose for manual debugging */
    window.fixRankBadges = fixRankRows;
    console.log('[rank-badge-fix] loaded — call window.fixRankBadges() to force a pass');
})();
