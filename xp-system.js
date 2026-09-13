// xp-system.js – XP badge + dual rankings overlay
(function () {
    const SUPABASE_URL = 'https://uxrpjfsouwxnlcbhjilz.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_cLeBoHrdvg1b7WlnyJ-oVQ_6skjHc_H';
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const XP_PER_LEVEL = 100;
    const TIER_EMOJI = { Whale: '🐋', Dolphin: '🐬', Crab: '🦀', Shrimp: '🦐' };
    let lastUsername = null;

    function esc(t) {
        return String(t).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
    }

    // ───── LEVEL BADGE ─────
    function updateLevelBadge(level, xp) {
        const el = document.getElementById('sidebarBigLevel');
        if (!el) return;
        if (!level || level < 1) { el.textContent = ''; el.classList.add('hidden'); return; }
        const currentInLevel = xp - (level - 1) * XP_PER_LEVEL;
        el.textContent = `⭐ Lv.${level}  (${currentInLevel}/${XP_PER_LEVEL})`;
        el.classList.remove('hidden');
    }

    async function loadXp(username) {
        if (!username) { updateLevelBadge(null, 0); return; }
        try {
            const { data, error } = await sb.rpc('get_xp', { p_username: username });
            if (error || !data) return;
            updateLevelBadge(data.level, data.xp);
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
                const medal = row.position === 1 ? '🥇' : row.position === 2 ? '🥈' : row.position === 3 ? '🥉' : `#${row.position}`;
                const emoji = TIER_EMOJI[row.holder_tier] || '🦐';
                const bal = Number(row.token_balance || 0).toLocaleString();
                return `<div class="ranking-row">
                    <span class="rk-pos">${medal}</span>
                    <span class="rk-tier">${emoji}</span>
                    <span class="rk-name">${esc(row.username)}</span>
                    <span class="rk-stat">${bal}</span>
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
                const medal = row.position === 1 ? '🥇' : row.position === 2 ? '🥈' : row.position === 3 ? '🥉' : `#${row.position}`;
                return `<div class="ranking-row">
                    <span class="rk-pos">${medal}</span>
                    <span class="rk-tier">🔥</span>
                    <span class="rk-name">${esc(row.username)}</span>
                    <span class="rk-streak">${row.login_streak}d</span>
                    <span class="rk-stat">Lv.${row.level}</span>
                </div>`;
            }).join('');
        } catch (err) { console.warn('Activity board failed:', err); }
    }

    function refreshBoth() { loadHoldersBoard(); loadActivityBoard(); }

    // ───── ADD XP (called from script.js) ─────
    window.addXP = async function (amount) {
        const username = localStorage.getItem('msn_chat_username');
        if (!username || !amount) return null;
        try {
            const { data, error } = await sb.rpc('add_xp', {
                p_username: username,
                p_amount: amount
            });
            if (error) { console.warn('add_xp failed:', error); return null; }
            if (data && data.error) return null;
            updateLevelBadge(data.level, data.xp);
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
