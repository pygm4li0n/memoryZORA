// xp-system.js – XP badge + dual rankings overlay
(function () {
    const SUPABASE_URL = 'https://uxrpjfsouwxnlcbhjilz.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_cLeBoHrdvg1b7WlnyJ-oVQ_6skjHc_H';
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const TIER_EMOJI = { Whale: '🐋', Dolphin: '🐬', Crab: '🦀', Shrimp: '🦐' };
    let lastUsername = null;

    function esc(t) {
        return String(t).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
    }

    // Curve: total XP to reach level L = 25 * (L-1) * L
    // Lv.2 = 50, Lv.3 = 150, Lv.4 = 300, Lv.5 = 500, Lv.10 = 2250 ...
    function xpForLevel(L) { return L <= 1 ? 0 : 25 * (L - 1) * L; }

    // ───── LEVEL BADGE ─────
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

    async function loadXp(username) {
        if (!username) { updateLevelBadge(null, 0); return; }
        try {
            const { data, error } = await sb.rpc('get_xp', { p_username: username });
            if (error || !data) return;
            updateLevelBadge(data.level, data.xp, data.in_level, data.needed);
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
    // Tries multiple possible field names from the RPC payload.
    // Falls back to a glowing initial-letter circle when no image exists.
    function avatarHTML(row) {
        const url = row.avatar_url || row.avatar || row.profile_pic ||
                    row.profile_pic_url || row.pfp || null;
        if (url) {
            return `<img class="rank-avatar" src="${esc(url)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=\\'rank-avatar rank-avatar-fallback\\'>${esc((row.username || '?').trim().charAt(0).toUpperCase() || '?')}</div>'">`;
        }
        const initial = (row.username || '?').trim().charAt(0).toUpperCase() || '?';
        return `<div class="rank-avatar rank-avatar-fallback">${esc(initial)}</div>`;
    }

    // ───── HOLDERS BOARD ─────
    async function loadHoldersBoard() {
        const el = document.getElementById('holdersLeaderboard');
        if (!el) return;
        try {
            const { data, error } = await sb.rpc('get_holders_leaderboard', { p_limit: 10 });
            if (error || !data || data.length === 0) {
                el.innerHTML = '<div class="rankings-empty">No holders yet</div>';
                return;
            }
            el.innerHTML = data.map(row => {
                const emoji = TIER_EMOJI[row.holder_tier] || '🦐';
                const tier  = (row.holder_tier || 'Holder').toUpperCase();
                const bal   = Number(row.token_balance || 0).toLocaleString();
                return `<div class="rank-row">
                    ${avatarHTML(row)}
                    <div class="rank-info">
                        <div class="rank-name">${esc(row.username)}</div>
                        <div class="rank-meta">
                            <span class="rank-level">${emoji} ${tier}</span>
                        </div>
                    </div>
                    <div class="rank-stats">
                        <span class="rank-score">${bal}</span>
                    </div>
                </div>`;
            }).join('');
        } catch (err) { console.warn('Holders board failed:', err); }
    }

    // ───── ACTIVITY BOARD ─────
    async function loadActivityBoard() {
        const el = document.getElementById('activityLeaderboard');
        if (!el) return;
        try {
            const { data, error } = await sb.rpc('get_activity_leaderboard', { p_limit: 10 });
            if (error || !data || data.length === 0) {
                el.innerHTML = '<div class="rankings-empty">No activity yet</div>';
                return;
            }
            el.innerHTML = data.map(row => {
                const streak = Number(row.login_streak || 0);
                const level  = Number(row.level || 1);
                const xp     = Number(row.xp || row.total_xp || 0);
                return `<div class="rank-row">
                    ${avatarHTML(row)}
                    <div class="rank-info">
                        <div class="rank-name">${esc(row.username)}</div>
                        <div class="rank-meta">
                            <span class="rank-level">LVL ${level}</span>
                            <span class="rank-detail">${xp.toLocaleString()} XP</span>
                        </div>
                    </div>
                    <div class="rank-stats">
                        <div class="rank-streak">
                            <span class="streak-fire">🔥</span>
                            <span class="streak-num">${streak}</span>
                        </div>
                    </div>
                </div>`;
            }).join('');
        } catch (err) { console.warn('Activity board failed:', err); }
    }

    function refreshBoth() { loadHoldersBoard(); loadActivityBoard(); }

    // ───── ADD XP (called from script.js with a message id) ─────
    window.addXP = async function (messageId) {
        const username = localStorage.getItem('msn_chat_username');
        if (!username || !messageId) return null;
        try {
            const { data, error } = await sb.rpc('add_xp', {
                p_username: username,
                p_message_id: messageId
            });
            if (error) { console.warn('add_xp failed:', error); return null; }
            if (!data || data.error) return null;

            if (data.granted > 0) {
                updateLevelBadge(data.level, data.xp, data.in_level, data.needed);
            }

            if (data.leveled_up) {
                const toast = document.getElementById('streakToast') ||
                              document.getElementById('errorToast');
                if (toast) {
                    toast.textContent = `🎉 Level ${data.level} reached!`;
                    toast.classList.add('visible');
                    setTimeout(() => toast.classList.remove('visible'), 3500);
                }
            }
            return data;
        } catch (err) { console.warn('add_xp error:', err); return null; }
    };

    // ───── POLL USERNAME ─────
    setInterval(() => {
        let current = null;
        try { current = localStorage.getItem('msn_chat_username'); } catch (e) {}
        if (current && current !== lastUsername) {
            lastUsername = current;
            loadXp(current);
        } else if (!current && lastUsername) {
            lastUsername = null;
            updateLevelBadge(null, 0);
        }
    }, 1500);

    setTimeout(() => {
        const u = localStorage.getItem('msn_chat_username');
        if (u) { lastUsername = u; loadXp(u); }
    }, 800);
})();
