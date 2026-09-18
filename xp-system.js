// xp-system.js — XP badge + dual leaderboards. Uses MSN.wallet + MSN.badge.
(function () {
  'use strict';
  const sb = window.MSN.supabase;
  let lastWallet = null;

  function esc(t) {
    return String(t).replace(/[&<>"']/g, m =>
      ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[m]));
  }
  function xpForLevel(L) { return L <= 1 ? 0 : 25 * (L - 1) * L; }
  function levelFromXp(xp) {
    if (!xp || xp < 50) return 1;
    return Math.max(1, Math.floor((1 + Math.sqrt(1 + (xp * 4 / 25))) / 2));
  }

  function updateLevelBadge(level, xp, inLevel, needed) {
    const el = document.getElementById('sidebarBigLevel');
    if (!el) return;
    if (!level || level < 1) { el.textContent = ''; el.classList.add('hidden'); return; }
    if (inLevel == null || needed == null) {
      const a = xpForLevel(level), b = xpForLevel(level + 1);
      inLevel = (xp || 0) - a; needed = b - a;
    }
    el.textContent = `⭐ Lv.${level}  (${inLevel}/${needed})`;
    el.classList.remove('hidden');
  }

  async function loadXp(wallet) {
    if (!wallet) { updateLevelBadge(null, 0); return; }
    try {
      const { data, error } = await sb.rpc('get_xp_by_wallet', { p_wallet: wallet });
      if (!error && data && data.length) {
        const row = Array.isArray(data) ? data[0] : data;
        updateLevelBadge(row.level || levelFromXp(row.xp || 0), row.xp, row.in_level, row.needed);
        return;
      }
    } catch {}
    try {
      const { data, error } = await sb.from('profiles').select('xp')
        .eq('wallet_address', wallet).limit(1).maybeSingle();
      if (error || !data) { updateLevelBadge(null, 0); return; }
      const xp = Number(data.xp || 0);
      updateLevelBadge(levelFromXp(xp), xp);
    } catch (e) { console.warn('XP load error:', e); }
  }

    // ── Rankings overlay controls ──
  function openRankings() {
    const overlay = document.getElementById('rankingsOverlay');
    if (!overlay) { console.warn('[rankings] #rankingsOverlay missing'); return; }
    console.log('[rankings] opening');
    overlay.classList.remove('hidden');
    refreshBoth();
  }
  function closeRankings() {
    const overlay = document.getElementById('rankingsOverlay');
    if (overlay) overlay.classList.add('hidden');
  }

  // Capture-phase delegation — runs BEFORE any other click handler can stopPropagation
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest && t.closest('#rankingsBtn')) {
      e.preventDefault();
      e.stopPropagation();
      openRankings();
      return;
    }
    if (t.closest && t.closest('#rankingsCloseBtn')) {
      e.preventDefault();
      e.stopPropagation();
      closeRankings();
      return;
    }
    const overlay = document.getElementById('rankingsOverlay');
    if (overlay && t === overlay) closeRankings();
  }, true);  // ← capture phase — this is the key change

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const overlay = document.getElementById('rankingsOverlay');
    if (overlay && !overlay.classList.contains('hidden')) closeRankings();
  });

  // ── Avatar helpers ──
  function cacheBust(url, row) {
    if (!url) return url;
    const tag = row.xp ?? row.token_balance ?? row.updated_at ?? Date.now();
    return url + (url.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(String(tag));
  }
  function avatarHTML(row) {
    let url = row.avatar_url || row.avatar || row.profile_pic || row.profile_pic_url || row.pfp || null;
    if (url && !/^https?:\/\//i.test(url) && url.includes('/')) {
      url = 'https://uxrpjfsouwxnlcbhjilz.supabase.co/storage/v1/object/public/' +
            url.replace(/^\/+/, '');
    }
    if (url) url = cacheBust(url, row);
    const initial = String(row.username || '?').trim().charAt(0).toUpperCase() || '?';
    if (url) return `<img class="rank-avatar" src="${esc(url)}" alt="" loading="lazy" data-initial="${esc(initial)}">`;
    return `<div class="rank-avatar rank-avatar-fallback">${esc(initial)}</div>`;
  }
  function fixBrokenAvatars(container) {
    container.querySelectorAll('img.rank-avatar').forEach(img => {
      img.addEventListener('error', () => {
        const d = document.createElement('div');
        d.className = 'rank-avatar rank-avatar-fallback';
        d.textContent = img.dataset.initial || '?';
        img.replaceWith(d);
      }, { once: true });
    });
  }

  // ── TOP HOLDERS ──
  async function loadHolders() {
    const el = document.getElementById('holdersLeaderboard');
    if (!el) return;
    try {
      const { data, error } = await sb.rpc('get_holders_leaderboard', { p_limit: 10 });
      if (error) {
        console.error('[rankings] holders RPC error:', error);
        el.innerHTML = '<div class="rankings-empty">Error loading</div>';
        return;
      }
      if (!data || !data.length) {
        el.innerHTML = '<div class="rankings-empty">No holders yet</div>';
        return;
      }
      el.innerHTML = data.map(row => {
        const tier = window.MSN.badge.fromName(row.holder_tier);
        const bal  = Number(row.token_balance || 0).toLocaleString();
        return `<div class="rank-row">
          ${avatarHTML(row)}
          <div class="rank-info">
            <div class="rank-name">${esc(row.username || 'anon')}</div>
            <div class="rank-meta"><span class="rank-level">${tier.emoji} ${esc(tier.name.toUpperCase())}</span></div>
          </div>
          <div class="rank-stats"><span class="rank-score">${bal}</span></div>
        </div>`;
      }).join('');
      fixBrokenAvatars(el);
    } catch (e) {
      console.error('[rankings] loadHolders threw:', e);
      el.innerHTML = '<div class="rankings-empty">Error loading</div>';
    }
  }

  // ── TOP ACTIVITY (by XP) ──
  async function loadActivity() {
    const el = document.getElementById('activityLeaderboard');
    if (!el) return;
    try {
      const { data, error } = await sb.rpc('get_activity_leaderboard', { p_limit: 50 });
      if (error) {
        console.error('[rankings] activity RPC error:', error);
        el.innerHTML = '<div class="rankings-empty">Error loading</div>';
        return;
      }
      if (!data || !data.length) {
        el.innerHTML = '<div class="rankings-empty">No activity yet</div>';
        return;
      }

      // Sort by XP descending — independent of RPC order
      const rows = data.slice().sort((a, b) => Number(b.xp || 0) - Number(a.xp || 0));

      el.innerHTML = rows.map(row => {
        const xp    = Number(row.xp || 0);
        const level = Number(row.level) || levelFromXp(xp);
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
          <div class="rank-stats"><span class="rank-score">${xp.toLocaleString()} XP</span></div>
        </div>`;
      }).join('');
      fixBrokenAvatars(el);
    } catch (e) {
      console.error('[rankings] loadActivity threw:', e);
      el.innerHTML = '<div class="rankings-empty">Error loading</div>';
    }
  }

  function refreshBoth() {
    loadHolders();
    loadActivity();
  }

  // ── addXP (called by script.js after each insert) ──
  window.addXP = async function (messageId) {
    const wallet = window.MSN.wallet.get();
    if (!wallet || !messageId) return null;
    try {
      const { data, error } = await sb.rpc('add_xp', { p_wallet: wallet, p_message_id: messageId });
      if (error || !data || data.error) return null;
      if (data.granted > 0) {
        const lvl = data.level || levelFromXp(data.xp || 0);
        updateLevelBadge(lvl, data.xp, data.in_level, data.needed);
      }
      if (data.leveled_up) window.MSN.toast.level(data.level);
      return data;
    } catch (e) { console.warn('add_xp error:', e); return null; }
  };

  // ── Wallet events ──
  window.MSN.events.on('msn:wallet-changed', ({ address }) => {
    if (address && address !== lastWallet) {
      lastWallet = address;
      loadXp(address);
    } else if (!address && lastWallet) {
      lastWallet = null;
      updateLevelBadge(null, 0);
    }
  });

  setTimeout(() => {
    const w = window.MSN.wallet.get();
    if (w) { lastWallet = w; loadXp(w); }
  }, 400);
})();
