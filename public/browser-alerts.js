(() => {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const hasServiceWorker = 'serviceWorker' in navigator;
  const hasNotification = 'Notification' in window;
  const hasPush = 'PushManager' in window;
  const supportsBackgroundPush = hasServiceWorker && hasNotification && hasPush;
  let deferredInstallPrompt = null;

  window.AnnapurnaNotificationSupport = {
    isIOS,
    isAndroid,
    isStandalone,
    supportsBackgroundPush
  };

  const css = document.createElement('style');
  css.textContent = `
    .ap-install-banner{position:fixed;left:12px;right:12px;bottom:82px;z-index:80;max-width:720px;margin:auto;background:#173f18;color:#fff;border:1px solid #ffffff22;border-radius:18px;padding:13px 14px;box-shadow:0 14px 34px #17301844;display:flex;gap:10px;align-items:center}
    .ap-install-banner strong{display:block;font-size:14px}.ap-install-banner small{display:block;color:#e3eee0;margin-top:2px;line-height:1.3}.ap-install-banner button{border:0;border-radius:11px;padding:9px 11px;font-weight:800;white-space:nowrap}.ap-install-banner .ap-how{background:#d6ad3e;color:#173018}.ap-install-banner .ap-dismiss{background:transparent;color:#fff;font-size:20px;padding:3px 5px}
    .ap-guide-backdrop{position:fixed;inset:0;z-index:120;background:#10220fc7;display:flex;align-items:flex-end;justify-content:center;padding:10px}
    .ap-guide{width:min(520px,100%);background:#fffdf8;color:#173018;border-radius:26px 26px 18px 18px;padding:22px;box-shadow:0 22px 55px #0005}
    .ap-guide h2{font-family:Georgia,serif;color:#244d1c;margin:0 0 8px}.ap-guide p{color:#5e695a;line-height:1.45}.ap-guide ol{padding-left:22px;line-height:1.65}.ap-guide .ap-close{width:100%;border:0;border-radius:14px;padding:13px;background:#244d1c;color:#fff;font-weight:800}.ap-guide .ap-install-now{width:100%;border:0;border-radius:14px;padding:13px;background:#d6ad3e;color:#173018;font-weight:800;margin-bottom:9px}
    @media(min-width:760px){.ap-guide-backdrop{align-items:center}.ap-guide{border-radius:24px}}
  `;
  document.head.appendChild(css);

  function installMessage() {
    if (isIOS && !isStandalone) {
      return 'For background order alerts on iPhone/iPad, add Annapurna Panipuri to your Home Screen and open it from the app icon.';
    }
    if (!supportsBackgroundPush) {
      return 'Live sound alerts work while this page is open. Install the PWA to your Home Screen for the best background-alert support.';
    }
    return 'Background notifications are supported on this device. Allow notifications when asked.';
  }

  function showGuide() {
    if (document.querySelector('.ap-guide-backdrop')) return;
    const wrap = document.createElement('div');
    wrap.className = 'ap-guide-backdrop';
    const iosSteps = `
      <h2>Enable background order alerts</h2>
      <p>iPhone and iPad require the PWA to be opened from the Home Screen before Web Push notifications are available.</p>
      <ol>
        <li>Tap the <b>Share</b> button in your browser.</li>
        <li>Choose <b>Add to Home Screen</b>.</li>
        <li>Tap <b>Add</b>, then open Annapurna Panipuri from the new Home Screen icon.</li>
        <li>Log in and tap <b>Enable notifications</b> again.</li>
      </ol>`;
    const androidSteps = `
      <h2>Install for reliable alerts</h2>
      <p>Keep the app installed on your Home Screen for the most reliable background order notifications.</p>
      <ol>
        <li>Open your browser menu.</li>
        <li>Choose <b>Install app</b> or <b>Add to Home screen</b>.</li>
        <li>Open Annapurna Panipuri from the installed icon.</li>
        <li>Tap <b>Enable notifications</b> and allow permission.</li>
      </ol>`;
    const generalSteps = `
      <h2>Notification setup</h2>
      <p>${installMessage()}</p>
      <ol>
        <li>Keep the app open for live in-app sound alerts.</li>
        <li>If your browser offers <b>Install app</b>, install the PWA.</li>
        <li>Allow notification permission when prompted.</li>
      </ol>`;
    wrap.innerHTML = `<div class="ap-guide">${isIOS ? iosSteps : isAndroid ? androidSteps : generalSteps}<div class="ap-install-slot"></div><button class="ap-close">Got it</button></div>`;
    document.body.appendChild(wrap);
    const slot = wrap.querySelector('.ap-install-slot');
    if (deferredInstallPrompt && !isIOS) {
      const b = document.createElement('button');
      b.className = 'ap-install-now';
      b.textContent = 'Install Annapurna Panipuri';
      b.addEventListener('click', async () => {
        try {
          deferredInstallPrompt.prompt();
          await deferredInstallPrompt.userChoice;
          deferredInstallPrompt = null;
          wrap.remove();
        } catch {}
      });
      slot.appendChild(b);
    }
    wrap.querySelector('.ap-close').addEventListener('click', () => wrap.remove());
    wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
  }

  function showBanner() {
    if (localStorage.getItem('annapurnaInstallTipDismissed') === '1') return;
    if (document.querySelector('.ap-install-banner')) return;
    if (isStandalone && supportsBackgroundPush) return;
    const banner = document.createElement('div');
    banner.className = 'ap-install-banner';
    banner.innerHTML = `<div style="flex:1"><strong>🔔 Reliable order alerts</strong><small>${installMessage()}</small></div><button class="ap-how">Show me</button><button class="ap-dismiss" aria-label="Dismiss">×</button>`;
    document.body.appendChild(banner);
    banner.querySelector('.ap-how').addEventListener('click', showGuide);
    banner.querySelector('.ap-dismiss').addEventListener('click', () => {
      localStorage.setItem('annapurnaInstallTipDismissed', '1');
      banner.remove();
    });
  }

  function friendlyNotice(el) {
    if (!el || el.dataset.apCompatPatched === '1') return;
    const text = el.textContent || '';
    if (text.includes('Background push is not supported on this browser')) {
      el.dataset.apCompatPatched = '1';
      el.textContent = isIOS && !isStandalone
        ? '🔔 Live sound alerts are enabled while this page is open. For background alerts on iPhone/iPad, add Annapurna Panipuri to your Home Screen, open it from the icon, then enable notifications again.'
        : '🔔 Live sound alerts are enabled while this app is open. Install Annapurna Panipuri to your Home Screen for the best background notification support.';
      if (isIOS && !isStandalone) setTimeout(showGuide, 150);
    } else if (text.includes('Push setup could not finish')) {
      el.dataset.apCompatPatched = '1';
      el.textContent = isIOS && !isStandalone
        ? '🔔 Live alerts are enabled. To receive background alerts on iPhone/iPad, add this app to your Home Screen and enable notifications from the installed app.'
        : '🔔 Live alerts are enabled while the app is open. Background push could not be enabled on this browser.';
    }
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    showBanner();
  });

  window.addEventListener('appinstalled', () => {
    document.querySelector('.ap-install-banner')?.remove();
    localStorage.removeItem('annapurnaInstallTipDismissed');
  });

  document.addEventListener('DOMContentLoaded', () => {
    if ((isIOS && !isStandalone) || !supportsBackgroundPush) showBanner();

    document.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const label = (btn.textContent || '').toLowerCase();
      if (label.includes('enable') && (label.includes('alert') || label.includes('notification'))) {
        if (isIOS && !isStandalone) setTimeout(showGuide, 100);
      }
    }, true);

    const observer = new MutationObserver(() => {
      document.querySelectorAll('.notice').forEach(friendlyNotice);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.querySelectorAll('.notice').forEach(friendlyNotice);
  });
})();
