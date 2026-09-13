// xp-system.js – XP badge + dual rankings overlay (WALLET-KEYED)
(function () {
    const SUPABASE_URL = 'https://uxrpjfsouwxnlcbhjilz.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_cLeBoHrdvg1b7WlnyJ-oVQ_6skjHc_H';
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const TIER_EMOJI = { Whale: '🐋', Dolphin: '🐬', Crab: '🦀', Shrimp: '🦐' };
    let lastWallet = null;

    // ───── WALLET LOCALSTORAGE KEYS ─────
    // Tries every common key name so this works regardless of which one your app writes to.
    const WALLET_KEYS = [
        'msn_wallet', 'msn_wallet_address', 'wallet_address', 'walletAddress',
        'phantom_wallet', 'phantomWallet', 'sol_wallet', 'solana_wallet',
        'user_wallet', 'connected_wallet', 'wallet'
    ];

    function getWallet() {
        try {
            for (const k of WALLET_KEYS) {
                const v = localStorage.getItem(k);
                if (v && String(v).trim()) return String(v).trim();
            }
        } catch (e) {}
        return null;
    }

    function esc(t) {
        return String(t).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
    }

    // Curve: total XP to reach level L = 25 * (L-1) * L
    function xpForLevel(L) { return L <= 1 ? 0 : 25 * (L - 1) * L; }

    // Inverse: level from raw XP
    function levelFromXp(xp) {
        if (!xp || xp < 50) return 1;
        return Math.max(1, Math.floor((1 + Math.sqrt(1 + (xp * 4.0 / 25))) / 2));
    }

    // ───── LEVEL BADGE (sidebar) ─────
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

    // ───── LOAD XP FOR CURRENT WALLET ─────
    async function loadXpForWallet(wallet) {
        if (!wallet) { updateLevelBadge(null, 0); return; }

        // 1) Try the wallet-keyed RPC
        try {
            const { data, error } = await sb.rpc('get_xp_by_wallet', { p_wallet: wallet });
            if (!error && data) {
                const lvl = data.level || levelFromXp(data.xp || 0);
                updateLevelBadge(lvl, data.xp, data.in_level, data.needed);
                return;
            }
        } catch (e) {}

        // 2) Fallback: read directly from profiles
        try {
            const { data, error } = await sb
                .from('profiles')
                .select('xp, username, avatar_url')
                .eq('wallet_address', wallet)
                .order('xp', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (error || !data) return;
            const xp  = Number(data.xp || 0);
            const lvl = levelFromXp(xp);
            updateLevelBadge(lvl, xp);
        } catch (err) { console.warn('XP load error:', err); }
    }

    // ───── OVERLAY CONTROLS ─────
    const rankingsOverlay = document.getElementById('rankingsOverlay');
    const rankingsBtn = document.getElementById('rankingsBtn');
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

    if (rankingsBtn) rankingsBtn.addEventListener('click', openRankings);
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

    // ───── AVATAR HELPER ─────
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

    // ───── HOLDERS BOARD ─────
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
            el.innerHTML = data.map(row => {
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

    // ───── ACTIVITY BOARD ─────
    // Uses xp_today (no login_streak column in profiles).
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
            el.innerHTML = data.map(row => {
                const level  = Number(row.level || levelFromXp(Number(row.xp || 0)));
                const xp     = Number(row.xp || 0);
                const today  = Number(row.xp_today || 0);
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

    // ───── ADD XP (wallet-keyed, with username fallback) ─────
    window.addXP = async function (messageId) {
        const wallet   = getWallet();
        const username = localStorage.getItem('msn_chat_username');
        if (!messageId) return null;
        if (!wallet && !username) return null;

        // Try wallet-keyed RPC first
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
                // If wallet param isn't supported, fall through to username
            } catch (e) {}
        }

        // Fallback: legacy username-keyed RPC
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

    // ───── POLL WALLET ─────
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
})();
