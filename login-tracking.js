// login-tracking.js – wallet-based daily login tracking
// Independent of script.js internals.

(function () {
    const SUPABASE_URL = 'https://uxrpjfsouwxnlcbhjilz.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_cLeBoHrdvg1b7WlnyJ-oVQ_6skjHc_H';

    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let lastTrackedWallet = null;
    let toastTimeout = null;

    // ── Read wallet from Phantom provider (globally accessible) ──
    function getWalletAddress() {
        try {
            if (window.phantom?.solana?.publicKey) {
                return window.phantom.solana.publicKey.toBase58();
            }
            if (window.solana?.publicKey) {
                return window.solana.publicKey.toBase58();
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    // ── Toast (reuses script.js's #errorToast) ──
    function showToast(msg) {
        const toast = document.getElementById('errorToast');
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.add('visible');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => toast.classList.remove('visible'), 2500);
    }

    // ── Badge ──
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

    // ── Track ──
    async function trackDailyLogin(wallet) {
        try {
            const { data, error } = await sb.rpc('track_daily_login_wallet', {
                p_wallet: wallet
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

    // ── Main poll: track when wallet changes / connects ──
    function checkAndTrack() {
        const wallet = getWalletAddress();

        // Wallet disconnected – hide badge
        if (!wallet) {
            if (lastTrackedWallet) {
                lastTrackedWallet = null;
                updateStreakBadge(0);
            }
            return;
        }

        // Wallet connected – track if not already tracked in this session
        if (wallet !== lastTrackedWallet) {
            lastTrackedWallet = wallet;
            trackDailyLogin(wallet);
        }
    }

    setInterval(checkAndTrack, 1500);
    setTimeout(checkAndTrack, 800);

    // ── React instantly to Phantom connect/disconnect/account change ──
    function attachPhantomListeners() {
        const provider = window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null);
        if (!provider) return;

        provider.on?.('connect', () => {
            lastTrackedWallet = null;
            checkAndTrack();
        });

        provider.on?.('disconnect', () => {
            lastTrackedWallet = null;
            updateStreakBadge(0);
        });

        provider.on?.('accountChanged', () => {
            lastTrackedWallet = null;
            checkAndTrack();
        });
    }
    attachPhantomListeners();

    // ── Reset button in Mod Settings ──
    function attachResetListener() {
        const resetBtn = document.getElementById('modResetLoginBtn');
        if (!resetBtn || resetBtn.dataset.listenerAttached) return;
        resetBtn.dataset.listenerAttached = 'true';

        resetBtn.addEventListener('click', async () => {
            if (!confirm('⚠️ Reset ALL wallet login streaks to zero?')) return;
            try {
                const { error } = await sb.rpc('reset_login_tracking');
                if (error) throw error;
                showToast('✅ All login data reset to zero.');
                lastTrackedWallet = null;
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
