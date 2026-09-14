// xp-system.js – XP badge + dual rankings overlay (WALLET-KEYED v2)
(function () {
    const SUPABASE_URL = 'https://uxrpjfsouwxnlcbhjilz.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_cLeBoHrdvg1b7WlnyJ-oVQ_6skjHc_H';
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const TIER_EMOJI = { Whale: '🐋', Dolphin: '🐬', Crab: '🦀', Shrimp: '🦐' };
    let lastWallet = null;

    // ═══════════════════════════════════════════════════════
    //  WALLET DETECTION — auto-scan (no key names needed)
    // ═══════════════════════════════════════════════════════

    // Solana base58 addresses: 32–44 chars, no 0/O/I/l
    const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

    // Known keys to try first (fast path)
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

    function findWallet() {
        // 1) Try known keys first
        try {
            for (const k of KNOWN_WALLET_KEYS) {
                const v = localStorage.getItem(k);
                if (looksLikeWallet(v)) {
                    console.log('[xp] wallet found in known key:', k, '→', v);
                    return String(v).trim();
                }
            }
        } catch (e) {}

        // 2) Scan every localStorage entry for a base58 value
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const val = localStorage.getItem(key);
                if (looksLikeWallet(val)) {
                    console.log('[xp] wallet auto-detected in localStorage key:', key, '→', val);
                    return String(val).trim();
                }
            }
        } catch (e) {}

        // 3) Same scan on sessionStorage
        try {
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                const val = sessionStorage.getItem(key);
                if (looksLikeWallet(val)) {
                    console.log('[xp] wallet auto-detected in sessionStorage key:', key, '→', val);
                    return String(val).trim();
                }
            }
        } catch (e) {}

        console.warn('[xp] no wallet found in storage');
        return null;
    }

    // Cache so we don't re-scan on every 1.5s tick
    let cachedWallet = null;
    let cachedWalletTime = 0;
    function getWallet() {
        const now = Date.now();
        if (cachedWallet && (now - cachedWalletTime) < 5000) return cachedWallet;
        const w = findWallet();
        cachedWallet = w;
        cachedWalletTime = now;
        return w;
    }

    // Force re-scan (call when Phantom connects)
    function refreshWallet() {
        cachedWallet = null;
        cachedWalletTime = 0;
        return getWallet();
    }
    window.msnRefreshWallet = refreshWallet;  // expose for debug

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

    async function loadXpForWallet(wallet) {
        if (!wallet) { updateLevelBadge(null, 0); return; }

        // Try RPC first
        try {
            const { data, error } = await sb.rpc('get_xp_by_wallet', { p_wallet: wallet });
            if (!error && data && data.length) {
                const row = Array.isArray(data) ? data[0] : data;
                const lvl = row.level || levelFromXp(row.xp || 0);
                updateLevelBadge(lvl, row.xp, row.in_level, row.needed);
                return;
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
    //  HOLDERS BOARD — filters ghosts client-side too
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

            // 🚫 Client-side ghost filter — belt & suspenders
            const cleaned = data.filter(row => {
                const bal = Number(row.token_balance || 0);
                const wal = String(row.wallet_address || '').trim();
                return bal > 0.000001 && wal.length > 0;
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

            // Also filter to wallets with actual XP
            const cleaned = data.filter(row => {
                const xp = Number(row.xp || 0);
                const wal = String(row.wallet_address || '').trim();
                return xp > 0 && wal.length > 0;
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
    //  ADD XP — wallet-keyed with username fallback
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
    //  WALLET POLL — also catches Phantom connect events
    // ═══════════════════════════════════════════════════════

    // Listen for Phantom connect (fires when wallet links)
    window.addEventListener('storage', () => { refreshWallet(); });

    // Listen for our own wallet-connect flow if the app dispatches one
    window.addEventListener('msn:wallet-connected', () => { refreshWallet(); });

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
    }, 800);

    // Expose diagnostics for debugging
    window.msnXpDebug = () => ({
        wallet: getWallet(),
        username: localStorage.getItem('msn_chat_username'),
        lastWallet
    });
    console.log('[xp-system] loaded — run msnXpDebug() to see detected wallet');
})();
