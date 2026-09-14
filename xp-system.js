// xp-system.js – XP badge + dual rankings overlay (WALLET-KEYED v4)
(function () {
    const SUPABASE_URL = 'https://uxrpjfsouwxnlcbhjilz.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_cLeBoHrdvg1b7WlnyJ-oVQ_6skjHc_H';
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const TIER_EMOJI = { Whale: '🐋', Dolphin: '🐬', Crab: '🦀', Shrimp: '🦐' };
    let lastWallet = null;

    // ═══════════════════════════════════════════════════════
    //  WALLET DETECTION
    // ═══════════════════════════════════════════════════════

    const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

    const KNOWN_WALLET_KEYS = [
        'msn_wallet', 'msn_wallet_address', 'wallet_address', 'walletAddress',
        'phantom_wallet', 'phantomWallet', 'sol_wallet', 'solana_wallet',
        'user_wallet', 'connected_wallet', 'wallet', 'publicKey', 'public_key',
        'solana_address', 'address', 'msn_wallet_public', 'phantom_public_key'
    ];

    function looksLikeWallet(v) {
        if (!v) return false;
        const s = String(v).trim();
        return BASE58_RE.test(s);
    }

    function findWalletInObject(obj, depth) {
        depth = depth || 0;
        if (depth > 4 || !obj || typeof obj !== 'object') return null;
        for (const k of Object.keys(obj)) {
            const v = obj[k];
            if (typeof v === 'string' && BASE58_RE.test(v.trim())) return v.trim();
            if (typeof v === 'object' && v) {
                const nested = findWalletInObject(v, depth + 1);
                if (nested) return nested;
            }
        }
        return null;
    }

    function findWallet() {
        try {
            for (const k of KNOWN_WALLET_KEYS) {
                const v = localStorage.getItem(k);
                if (looksLikeWallet(v)) return String(v).trim();
            }
        } catch (e) {}

        try {
            for (let i = 0; i < localStorage.length; i++) {
                const val = localStorage.getItem(localStorage.key(i));
                if (looksLikeWallet(val)) return String(val).trim();
            }
        } catch (e) {}

        try {
            for (let i = 0; i < sessionStorage.length; i++) {
                const val = sessionStorage.getItem(sessionStorage.key(i));
                if (looksLikeWallet(val)) return String(val).trim();
            }
        } catch (e) {}

        try {
            for (let i = 0; i < localStorage.length; i++) {
                const raw = localStorage.getItem(localStorage.key(i));
                if (!raw) continue;
                const first = raw[0];
                if (first !== '{' && first !== '[') continue;
                try {
                    const found = findWalletInObject(JSON.parse(raw));
                    if (found) return found;
                } catch (e) {}
            }
        } catch (e) {}

        return null;
    }

    let cachedWallet = null;
    let cachedWalletTime = 0;
    function getWallet() {
        const now = Date.now();
        if (cachedWallet && (now - cachedWalletTime) < 500) return cachedWallet;
        const w = findWallet();
        cachedWallet = w;
        cachedWalletTime = now;
        return w;
    }

    function refreshWallet() {
        cachedWallet = null;
        cachedWalletTime = 0;
        return getWallet();
    }
    window.msnRefreshWallet = refreshWallet;

    // ═══════════════════════════════════════════════════════

    function esc(t) {
        return String(t).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
    }

    function xpForLevel(L) { return L <= 1 ? 0 : 25 * (L - 1) * L; }

    function levelFromXp(xp) {
        if (!xp || xp < 50) return 1;
        return Math.max(1, Math.floor((1 + Math.sqrt(1 + (xp * 4.0 / 25))) / 2));
    }

    // ═══════════════════════════════════════════════════════
    //  SIDEBAR LEVEL BADGE
    // ═══════════════════════════════════════════════════════

    function updateLevelBadge(level, xp, inLevel, needed) {
        const el = document.getElementById('sidebarBigLevel');
        if (!el) return;
        if (!level || level < 1) {
            el.textContent = '';
            el.classList.add('hidden');
            return;
        }
        if (inLevel == null || needed == null) {
            const thisLvl = xpForLevel(level);
            const nextLvl = xpForLevel(level + 1);
            inLevel = (xp || 0) - thisLvl;
            needed  = nextLvl - thisLvl;
        }
        el.textContent = `⭐ Lv.${level}  (${inLevel}/${needed})`;
        el.classList.remove('hidden');
    }

    // ⚑ HARDENED — handles RPC returning a table (array of rows)
    async function loadXpForWallet(wallet) {
        if (!wallet) { updateLevelBadge(null, 0); return; }

        // RPC first
        try {
            const { data, error } = await sb.rpc('get_xp_by_wallet', { p_wallet: wallet });
            if (!error && data) {
                // RPC returns TABLE → array; pick highest-XP row if dupes remain
                const rows = Array.isArray(data) ? data : [data];
                if (rows.length) {
                    const row = rows.reduce((best, r) =>
                        (Number(r?.xp || 0) > Number(best?.xp || 0) ? r : best), rows[0]);
                    if (row) {
                        const lvl = row.level || levelFromXp(row.xp || 0);
                        updateLevelBadge(lvl, row.xp, row.in_level, row.needed);
                        return;
                    }
                }
            }
        } catch (e) {}

        // Fallback: direct read
        try {
            const { data, error } = await sb
                .from('profiles')
                .select('xp, username, avatar_url')
                .eq('wallet_address', wallet)
                .order('xp', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (error || !data) { updateLevelBadge(null, 0); return; }
            const xp  = Number(data.xp || 0);
            const lvl = levelFromXp(xp);
            updateLevelBadge(lvl, xp);
        } catch (err) { console.warn('XP load error:', err); }
    }

    // ═══════════════════════════════════════════════════════
    //  OVERLAY CONTROLS
    // ═══════════════════════════════════════════════════════

    const rankingsOverlay  = document.getElementById('rankingsOverlay');
    const rankingsBtn      = document.getElementById('rankingsBtn');
    const rankingsCloseBtn = document.getElementById('rankingsCloseBtn');

    function openRankings() {
        if (!rankingsOverlay) return;
        rankingsOverlay.classList.remove('hidden');
        refreshBoth();
    }
    function closeRankings() {
        if (!rankingsOverlay) return;
        rankingsOverlay.classList.add('hidden');
    }

    if (rankingsBtn)      rankingsBtn.addEventListener('click', openRankings);
    if (rankingsCloseBtn) rankingsCloseBtn.addEventListener('click', closeRankings);
    if (rankingsOverlay) {
        rankingsOverlay.addEventListener('click', (e) => {
            if (e.target === rankingsOverlay) closeRankings();
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && rankingsOverlay && !rankingsOverlay.classList.contains('hidden')) {
            closeRankings();
        }
    });

    // ═══════════════════════════════════════════════════════
    //  AVATAR HELPERS
    // ═══════════════════════════════════════════════════════

    function avatarHTML(row) {
        const url = row.avatar_url || row.avatar || row.profile_pic ||
                    row.profile_pic_url || row.pfp || null;
        const initial = String(row.username || '?').trim().charAt(0).toUpperCase() || '?';
        if (url) {
            return `<img class="rank-avatar" src="${esc(url)}" alt="" loading="lazy" data-initial="${esc(initial)}">`;
        }
        return `<div class="rank-avatar rank-avatar-fallback">${esc(initial)}</div>`;
    }

    function fixBrokenAvatars(container) {
        container.querySelectorAll('img.rank-avatar').forEach(img => {
            img.addEventListener('error', () => {
                const div = document.createElement('div');
                div.className = 'rank-avatar rank-avatar-fallback';
                div.textContent = img.dataset.initial || '?';
                img.replaceWith(div);
            }, { once: true });
        });
    }

    // ═══════════════════════════════════════════════════════
    //  HOLDERS BOARD
    // ═══════════════════════════════════════════════════════

    async function loadHoldersBoard() {
        const el = document.getElementById('holdersLeaderboard');
        if (!el) return;
        try {
            const { data, error } = await sb.rpc('get_holders_leaderboard', { p_limit: 10 });
            if (error) {
                console.warn('holders rpc:', error);
                el.innerHTML = '<div class="rankings-empty">Error loading</div>';
                return;
            }
            if (!data || !data.length) {
                el.innerHTML = '<div class="rankings-empty">No holders yet</div>';
                return;
            }

            const cleaned = data.filter(row => {
                const wal = String(row.wallet_address || '').trim();
                return wal.length > 0;
            });

            if (!cleaned.length) {
                el.innerHTML = '<div class="rankings-empty">No holders yet</div>';
                return;
            }

            el.innerHTML = cleaned.map(row => {
                const tier  = String(row.holder_tier || 'Shrimp').toUpperCase();
                const emoji = TIER_EMOJI[tier] || '🦐';
                const bal   = Number(row.token_balance || 0).toLocaleString();
                return `<div class="rank-row">
                    ${avatarHTML(row)}
                    <div class="rank-info">
                        <div class="rank-name">${esc(row.username || 'anon')}</div>
                        <div class="rank-meta">
                            <span class="rank-level">${emoji} ${esc(tier)}</span>
                        </div>
                    </div>
                    <div class="rank-stats">
                        <span class="rank-score">${bal}</span>
                    </div>
                </div>`;
            }).join('');
            fixBrokenAvatars(el);
        } catch (err) {
            console.warn('Holders board failed:', err);
            el.innerHTML = '<div class="rankings-empty">Error loading</div>';
        }
    }

    // ═══════════════════════════════════════════════════════
    //  ACTIVITY BOARD
    // ═══════════════════════════════════════════════════════

    async function loadActivityBoard() {
        const el = document.getElementById('activityLeaderboard');
        if (!el) return;
        try {
            const { data, error } = await sb.rpc('get_activity_leaderboard', { p_limit: 10 });
            if (error) {
                console.warn('activity rpc:', error);
                el.innerHTML = '<div class="rankings-empty">Error loading</div>';
                return;
            }
            if (!data || !data.length) {
                el.innerHTML = '<div class="rankings-empty">No activity yet</div>';
                return;
            }

            // ⚑ RELAXED — RPC already filters and sorts; only skip wallet-less rows
            const cleaned = data.filter(row => {
                const wal = String(row.wallet_address || '').trim();
                return wal.length > 0;
            });

            if (!cleaned.length) {
                el.innerHTML = '<div class="rankings-empty">No activity yet</div>';
                return;
            }

            el.innerHTML = cleaned.map(row => {
                const level = Number(row.level || levelFromXp(Number(row.xp || 0)));
                const xp    = Number(row.xp || 0);
                const today = Number(row.xp_today || 0);
                return `<div class="rank-row">
                    ${avatarHTML(row)}
                    <div class="rank-info">
                        <div class="rank-name">${esc(row.username || 'anon')}</div>
                        <div class="rank-meta">
                            <span class="rank-level">LVL ${level}</span>
                            ${today > 0 ? `<span class="rank-detail">+${today} today</span>` : ''}
                        </div>
                    </div>
                    <div class="rank-stats">
                        <span class="rank-score">${xp.toLocaleString()} XP</span>
                    </div>
                </div>`;
            }).join('');
            fixBrokenAvatars(el);
        } catch (err) {
            console.warn('Activity board failed:', err);
            el.innerHTML = '<div class="rankings-empty">Error loading</div>';
        }
    }

    function refreshBoth() { loadHoldersBoard(); loadActivityBoard(); }

    // ═══════════════════════════════════════════════════════
    //  ADD XP
    // ═══════════════════════════════════════════════════════

    window.addXP = async function (messageId) {
        const wallet   = getWallet();
        const username = localStorage.getItem('msn_chat_username');
        if (!messageId) return null;
        if (!wallet && !username) return null;

        if (wallet) {
            try {
                const { data, error } = await sb.rpc('add_xp', {
                    p_wallet:     wallet,
                    p_message_id: messageId
                });
                if (!error && data) {
                    if (data.granted > 0) {
                        const lvl = data.level || levelFromXp(data.xp || 0);
                        updateLevelBadge(lvl, data.xp, data.in_level, data.needed);
                    }
                    if (data.leveled_up) showLevelToast(data.level);
                    return data;
                }
            } catch (e) {}
        }

        if (username) {
            try {
                const { data, error } = await sb.rpc('add_xp', {
                    p_username:   username,
                    p_message_id: messageId
                });
                if (error) { console.warn('add_xp failed:', error); return null; }
                if (!data || data.error) return null;
                if (data.granted > 0) {
                    const lvl = data.level || levelFromXp(data.xp || 0);
                    updateLevelBadge(lvl, data.xp, data.in_level, data.needed);
                }
                if (data.leveled_up) showLevelToast(data.level);
                return data;
            } catch (err) {
                console.warn('add_xp error:', err);
                return null;
            }
        }
        return null;
    };

    function showLevelToast(level) {
        const toast = document.getElementById('streakToast') ||
                      document.getElementById('errorToast');
        if (!toast) return;
        toast.textContent = `🎉 Level ${level} reached!`;
        toast.classList.add('visible');
        setTimeout(() => toast.classList.remove('visible'), 3500);
    }

    // ═══════════════════════════════════════════════════════
    //  WALLET EVENT HOOKS
    // ═══════════════════════════════════════════════════════

    function tryHookPhantom() {
        const provider = window.phantom?.solana || window.solana;
        if (!provider || provider.__msnHooked) return false;
        try {
            provider.__msnHooked = true;

            provider.on?.('connect', () => {
                refreshWallet();
                const w = getWallet();
                if (w) loadXpForWallet(w);
            });

            provider.on?.('accountChanged', () => {
                refreshWallet();
                const w = getWallet();
                if (w) loadXpForWallet(w);
            });

            return true;
        } catch (e) {
            return false;
        }
    }

    tryHookPhantom();
    let phantomTries = 0;
    const phantomTimer = setInterval(() => {
        phantomTries++;
        if (tryHookPhantom() || phantomTries > 30) clearInterval(phantomTimer);
    }, 1000);

    window.addEventListener('storage', (e) => {
        if (!e.key || /wallet|phantom|sol|pubkey|address/i.test(e.key)) {
            refreshWallet();
            const w = getWallet();
            if (w && w !== lastWallet) {
                lastWallet = w;
                loadXpForWallet(w);
            }
        }
    });

    window.addEventListener('msn:wallet-connected', () => {
        refreshWallet();
        const w = getWallet();
        if (w) { lastWallet = w; loadXpForWallet(w); }
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            const w = findWallet();
            if (w && w !== lastWallet) {
                lastWallet = w;
                loadXpForWallet(w);
            }
        }
    });

    const firstTouch = () => {
        refreshWallet();
        const w = getWallet();
        if (w && w !== lastWallet) {
            lastWallet = w;
            loadXpForWallet(w);
        }
        ['click', 'keydown', 'touchstart'].forEach(ev =>
            document.removeEventListener(ev, firstTouch, true));
    };
    ['click', 'keydown', 'touchstart'].forEach(ev =>
        document.addEventListener(ev, firstTouch, true));

    // ═══════════════════════════════════════════════════════
    //  WALLET POLL
    // ═══════════════════════════════════════════════════════

    let startupTicks = 0;
    const startupPoll = setInterval(() => {
        startupTicks++;
        const w = findWallet();
        if (w && w !== lastWallet) {
            lastWallet = w;
            cachedWallet = w;
            cachedWalletTime = Date.now();
            loadXpForWallet(w);
        }
        if (startupTicks >= 40) clearInterval(startupPoll);
    }, 500);

    setInterval(() => {
        const current = getWallet();
        if (current && current !== lastWallet) {
            lastWallet = current;
            loadXpForWallet(current);
        } else if (!current && lastWallet) {
            lastWallet = null;
            updateLevelBadge(null, 0);
        }
    }, 1500);

    setTimeout(() => {
        const w = getWallet();
        if (w) { lastWallet = w; loadXpForWallet(w); }
    }, 300);

    // ═══════════════════════════════════════════════════════
    //  DEBUG
    // ═══════════════════════════════════════════════════════

    window.msnXpDebug = () => ({
        wallet: getWallet(),
        username: localStorage.getItem('msn_chat_username'),
        lastWallet,
        cacheAge: cachedWallet ? (Date.now() - cachedWalletTime) + 'ms' : 'none'
    });
    console.log('[xp-system] loaded — run msnXpDebug() to see detected wallet');
})();
