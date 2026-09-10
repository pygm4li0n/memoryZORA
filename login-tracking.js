// login-tracking.js – completely standalone, no need to edit script.js

// We'll keep track of the last username we processed to avoid duplicate calls
let lastTrackedUsername = null;

async function trackDailyLogin() {
    if (!username || username === lastTrackedUsername) return;

    lastTrackedUsername = username;

    try {
        const { data, error } = await supabase.rpc('track_daily_login', {
            p_username: username
        });

        if (error) {
            console.warn('Login tracking failed:', error);
            return;
        }

        if (data && !data.already_logged) {
            showError(`🔥 Day ${data.streak} login streak!`);
        }

        // Optional: update streak badge if present in HTML
        const streakEl = document.getElementById('sidebarBigStreak');
        if (streakEl && data && data.streak) {
            streakEl.textContent = `🔥 ${data.streak} day streak`;
            streakEl.classList.remove('hidden');
        }
    } catch (err) {
        console.error('Login tracking error:', err);
    }
}

// Check every second if the username is available
// This is enough because script.js sets `username` when the user logs in
setInterval(() => {
    if (typeof username !== 'undefined' && username) {
        trackDailyLogin();
    }
}, 1000);

// Reset login data button (mod only)
document.addEventListener('DOMContentLoaded', () => {
    const resetBtn = document.getElementById('modResetLoginBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            if (!confirm('⚠️ Reset ALL login streaks and totals to zero?')) return;
            try {
                const { error } = await supabase.rpc('reset_login_tracking');
                if (error) throw error;
                showError('✅ All login data reset to zero.');
                // Reset the local tracking so it will re-track the current user if they refresh
                lastTrackedUsername = null;
            } catch (err) {
                console.error('Reset login tracking failed:', err);
                showError('❌ Failed to reset: ' + err.message);
            }
        });
    }
});
