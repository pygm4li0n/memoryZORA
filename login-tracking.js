// login-tracking.js – wallet-based daily login tracking + wallet-based rank badge
// Fully standalone. Does NOT depend on script.js internals.

(function () {
    const SUPABASE_URL = 'https://uxrpjfsouwxnlcbhjilz.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_cLeBoHrdvg1b7WlnyJ-oVQ_6skjHc_H';

    const SOLANA_RPC = 'https://mainnet.helius-rpc.com/?api-key=fa7e6515-19de-45de-a7d1-35a64a0d9a1a';
    const TOKEN_MINT = 'HJ5trLqpexXA4WoCHVeUGCpH9Je9x9Sfi2BEz4jHpump';

    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let lastTrackedWallet = null;
    let streakToastTimeout = null;

    // ─────────────────────────────────────────────
    // Wallet helper
    // ─────────────────────────────────────────────
    function getWalletAddress() {
        try {
            if (window.phantom?.solana?.publicKey) return window.phantom.solana.publicKey.toBase58();
            if (window.solana?.publicKey) return window.solana.publicKey.toBase58();
        } catch (e) { /* ignore */ }
        return null;
    }

    // ─────────────────────────────────────────────
    // Dedicated streak toast (separate from wallet connect toast)
    // ─────────────────────────────────────────────
    function getOrCreateStreakToast() {
        let el = document.getElementById('streakToast');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'streakToast';
        el.className = 'streak-toast';
        document.body.appendChild(el);
        return el;
    }

    function showStreakToast(msg) {
        const el = getOrCreateStreakToast();
        el.textContent = msg;
        // Reset animation so it can replay if triggered multiple times
        el.classList.remove('visible');
        void el.offsetWidth;
        el.classList.add('visible');
        clearTimeout(streakToastTimeout);
        streakToastTimeout = setTimeout(() => el.classList.remove('visible'), 4500);
    }

    // ─────────────────────────────────────────────
    // Streak badge (sidebar profile card)
    // ─────────────────────────────────────────────
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

    // ─────────────────────────────────────────────
    // Rank badge (wallet balance based)
    // ─────────────────────────────────────────────
    function getBadge(balance) {
        if (balance >= 1000000) return { emoji: '🐋', name: 'Whale' };
        if (balance >= 250000)  return { emoji: '🐬', name: 'Dolphin' };
        if (balance >= 100000)  return { emoji: '🦀', name: 'Crab' };
        return { emoji: '🦐', name: 'Shrimp' };
    }

    function updateRankBadge(balance) {
        const el = document.getElementById('sidebarBigRank');
        if (!el) return;
        if (balance === null || balance === undefined) {
            el.textContent = '';
            el.classList.add('hidden');
            return;
        }
        const badge = getBadge(balance);
        el.textContent = `${badge.emoji} ${badge.name}`;
        el.classList.remove('hidden');
    }

    // ─────────────────────────────────────────────
    // Fetch real token balance from chain
    // ─────────────────────────────────────────────
    async function fetchWalletBalance(wallet) {
        try {
            const connection = new solanaWeb3.Connection(SOLANA_RPC);
            const pubkey = new solanaWeb3.PublicKey(wallet);
            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
                programId: new solanaWeb3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
            });
            let balance = 0;
            for (const acc of tokenAccounts.value) {
                const info = acc.account.data.parsed.info;
                if (info.mint === TOKEN_MINT) {
                    balance += parseFloat(info.tokenAmount.uiAmountString);
                }
            }
            return balance;
        } catch (err) {
            console.warn('Balance fetch failed:', err);
            return null;
        }
    }

    // ─────────────────────────────────────────────
    // Show cached balance instantly on reload
    // ─────────────────────────────────────────────
    async function loadCachedBalance(wallet) {
        try {
            const { data, error } = await sb.rpc('get_wallet_balance', { p_wallet: wallet });
            if (!error && data !== null && data !== undefined) {
                updateRankBadge(Number(data));
            }
        } catch (e) { /* ignore */ }
    }

    // ─────────────────────────────────────────────
    // Track daily login (streak) – toast only on NEW day
    // ─────────────────────────────────────────────
    async function trackDailyLogin(wallet) {
        try {
            const { data, error } = await sb.rpc('track_daily_login_wallet', {
                p_wallet: wallet
            });

            if (error) {
                console.warn('Login tracking failed:', error);
                return;
            }

            if (!data || !data.streak) return;

            // Always update the badge
            updateStreakBadge(data.streak);

            // Only show the streak toast when it's a NEW day
            // (prevents duplicate toasts on refresh or reconnect)
            if (!data.already_logged) {
                const msg = data.streak === 1
                    ? `🔥 Day 1 login streak!`
                    : `🔥 Day ${data.streak} login streak!`;
                showStreakToast(msg);
            }
        } catch (err) {
            console.error('Login tracking error:', err);
        }
    }

    // ─────────────────────────────────────────────
    // Refresh balance: chain → badge → DB cache
    // ─────────────────────────────────────────────
    async function refreshBalance(wallet) {
        const balance = await fetchWalletBalance(wallet);
        if (balance === null) return;

        updateRankBadge(balance);

        try {
            await sb.rpc('update_wallet_balance', { p_wallet: wallet, p_balance: balance });
        } catch (e) { /* ignore */ }
    }

    // ─────────────────────────────────────────────
    // Clear badges on disconnect
    // ─────────────────────────────────────────────
    function clearBadges() {
        updateStreakBadge(0);
        updateRankBadge(null);
    }

    // ─────────────────────────────────────────────
    // Main poll: track when wallet changes / connects
    // ─────────────────────────────────────────────
    function checkAndTrack() {
        const wallet = getWalletAddress();

        // Wallet disconnected – hide badges
        if (!wallet) {
            if (lastTrackedWallet) {
                lastTrackedWallet = null;
                clearBadges();
            }
            return;
        }

        // New wallet session – run all tasks
        if (wallet !== lastTrackedWallet) {
            lastTrackedWallet = wallet;
            loadCachedBalance(wallet);
            trackDailyLogin(wallet);
            refreshBalance(wallet);
        }
    }

    setInterval(checkAndTrack, 1500);
    setTimeout(checkAndTrack, 800);

    // ─────────────────────────────────────────────
    // React instantly to Phantom connect/disconnect/account change
    // ─────────────────────────────────────────────
    function attachPhantomListeners() {
        const provider = window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null);
        if (!provider) return;

        provider.on?.('connect', () => {
            lastTrackedWallet = null;
            checkAndTrack();
        });

        provider.on?.('disconnect', () => {
            lastTrackedWallet = null;
            clearBadges();
        });

        provider.on?.('accountChanged', () => {
            lastTrackedWallet = null;
            clearBadges();
            checkAndTrack();
        });
    }
    attachPhantomListeners();

    // ─────────────────────────────────────────────
    // Reset button in Mod Settings
    // ─────────────────────────────────────────────
    function attachResetListener() {
        const resetBtn = document.getElementById('modResetLoginBtn');
        if (!resetBtn || resetBtn.dataset.listenerAttached) return;
        resetBtn.dataset.listenerAttached = 'true';

        resetBtn.addEventListener('click', async () => {
            if (!confirm('⚠️ Reset ALL wallet streaks and cached balances to zero?')) return;
            try {
                const { error } = await sb.rpc('reset_login_tracking');
                if (error) throw error;
                showStreakToast('✅ All wallet data reset to zero.');
                lastTrackedWallet = null;
                clearBadges();
            } catch (err) {
                console.error('Reset failed:', err);
                showStreakToast('❌ Failed to reset: ' + err.message);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachResetListener);
    } else {
        attachResetListener();
    }
})();
