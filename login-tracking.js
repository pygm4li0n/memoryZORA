// login-tracking.js – fully standalone daily login tracking
// Does NOT depend on script.js internals.

(function () {
    // ── Same credentials as script.js (duplicated intentionally) ──
    const SUPABASE_URL = 'https://uxrpjfsouwxnlcbhjilz.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_cLeBoHrdvg1b7WlnyJ-oVQ_6skjHc_H';
    const STORAGE_KEY_NAME = 'msn_chat_username';   // same key script.js uses

    // ── Our own Supabase client ──
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let lastTrackedUsername = null;
    let toastTimeout = null;

    // ── Local toast (uses the same #errorToast element script.js uses) ──
    function showToast(msg) {
        const toast = document.getElementById('errorToast');
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.add('visible');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => toast.classList.remove('visible'), 2500);
    }

    // ── Update the streak badge in the sidebar ──
    function updateStreakBadge(streak) {
        const el = document.getElementById('sidebarBigStreak');
        if (!el) return;
        if (streak && streak > 0) {
            el.textContent = `🔥 ${streak} day streak`;
            el.classList.remove('hidden');
        } else {
            el.textContent = '';
            el.classList.add('hidden');
        }
    }

    // ── Call the RPC ──
    async function trackDailyLogin(name) {
        try {
            const { data, error } = await sb.rpc('track_daily_login', {
                p_username: name
            });

            if (error) {
                console.warn('Login tracking failed:', error);
                return;
            }

            if (data && data.streak) {
                updateStreakBadge(data.streak);
            }

            if (data && !data.already_logged) {
                showToast(`🔥 Day ${data.streak} login streak!`);
            }
        } catch (err) {
            console.error('Login tracking error:', err);
        }
    }

    // ── Poll localStorage for username (works regardless of script.js closure) ──
    function checkAndTrack() {
        let currentUser = null;
        try {
            currentUser = localStorage.getItem(STORAGE_KEY_NAME);
        } catch (e) { /* ignore */ }

        if (currentUser && currentUser !== lastTrackedUsername) {
            lastTrackedUsername = currentUser;
            trackDailyLogin(currentUser);
        }

        // Also refresh the badge if it's hidden but we already have a username
        if (currentUser && lastTrackedUsername === currentUser) {
            const el = document.getElementById('sidebarBigStreak');
            if (el && el.classList.contains('hidden') && !el.textContent) {
                // Re-fetch once so badge appears after page reload
                trackDailyLogin(currentUser);
            }
        }
    }

    // Poll every 1.5s — cheap and reliable
    setInterval(checkAndTrack, 1500);
    // First attempt after DOM ready
    setTimeout(checkAndTrack, 800);

    // ── Reset button listener ──
    function attachResetListener() {
        const resetBtn = document.getElementById('modResetLoginBtn');
        if (!resetBtn || resetBtn.dataset.listenerAttached) return;
        resetBtn.dataset.listenerAttached = 'true';

        resetBtn.addEventListener('click', async () => {
            if (!confirm('⚠️ Reset ALL login streaks and totals to zero?')) return;
            try {
                const { error } = await sb.rpc('reset_login_tracking');
                if (error) throw error;
                showToast('✅ All login data reset to zero.');
                lastTrackedUsername = null;
                updateStreakBadge(0);
            } catch (err) {
                console.error('Reset failed:', err);
                showToast('❌ Failed to reset: ' + err.message);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachResetListener);
    } else {
        attachResetListener();
    }
})();
