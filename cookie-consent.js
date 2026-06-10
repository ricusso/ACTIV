(function () {
  const COOKIE_NAME = 'aktiv_consent';
  const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

  const COOKIES_CONFIG = {
    essential: [
      { name: 'aktiv_consent',     desc: 'Хранит ваш выбор настроек конфиденциальности',  maxAge: COOKIE_MAX_AGE },
      { name: 'aktiv_session',     desc: 'Поддерживает сессию пользователя',               maxAge: 86400 },
    ],
    analytics: [
      { name: 'aktiv_analytics',   desc: 'Помогает улучшать платформу (анонимно)',          maxAge: COOKIE_MAX_AGE },
    ],
    preferences: [
      { name: 'aktiv_theme',       desc: 'Сохраняет тему и визуальные настройки',           maxAge: COOKIE_MAX_AGE },
      { name: 'aktiv_lang',        desc: 'Запоминает выбранный язык интерфейса',             maxAge: COOKIE_MAX_AGE },
    ],
  };

  function setCookie(name, value, maxAge) {
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax`;
  }

  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(?:^|;)\\s*' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function applyConsent(mode) {
    COOKIES_CONFIG.essential.forEach(c => {
      setCookie(c.name, mode === 'accepted' ? 'true' : 'essential', c.maxAge);
    });

    if (mode === 'accepted') {
      COOKIES_CONFIG.analytics.forEach(c => { setCookie(c.name, 'true', c.maxAge); });
      COOKIES_CONFIG.preferences.forEach(c => { setCookie(c.name, 'true', c.maxAge); });
    }

    setCookie(COOKIE_NAME, mode, COOKIE_MAX_AGE);
  }

  function createBanner() {
    const banner = document.createElement('div');
    banner.id = 'aktiv-cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Согласие на использование файлов cookie');
    banner.innerHTML = `
      <div class="act-banner-inner">
        <div class="act-banner-left">
          <div class="act-banner-icon">🍪</div>
          <div class="act-banner-text">
            <strong>АКТИВ использует файлы cookie</strong>
            <p>Мы используем cookie для работы платформы, аналитики и персонализации.
               <a href="cookie.html" target="_blank" rel="noopener">Подробнее →</a></p>
          </div>
        </div>
        <div class="act-banner-btns">
          <button id="aktiv-btn-reject"  class="act-btn act-btn-ghost">Только необходимые</button>
          <button id="aktiv-btn-accept"  class="act-btn act-btn-primary">Принять все</button>
        </div>
      </div>
    `;
    document.body.appendChild(banner);
    requestAnimationFrame(() => { requestAnimationFrame(() => { banner.classList.add('act-banner-visible'); }); });

    document.getElementById('aktiv-btn-accept').addEventListener('click', () => {
      applyConsent('accepted');
      banner.classList.remove('act-banner-visible');
      setTimeout(() => banner.remove(), 400);
    });

    document.getElementById('aktiv-btn-reject').addEventListener('click', () => {
      applyConsent('essential');
      banner.classList.remove('act-banner-visible');
      setTimeout(() => banner.remove(), 400);
    });
  }

  function injectStyles() {
    if (document.getElementById('aktiv-cookie-styles')) return;
    const style = document.createElement('style');
    style.id = 'aktiv-cookie-styles';
    style.textContent = `
      #aktiv-cookie-banner {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(120px);
        z-index: 9999;
        width: min(900px, calc(100vw - 32px));
        background: rgba(15, 15, 22, 0.97);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(232, 168, 216, 0.25);
        border-radius: 20px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04);
        opacity: 0;
        transition: transform 0.4s cubic-bezier(0.16,1,0.3,1), opacity 0.4s ease;
      }
      #aktiv-cookie-banner.act-banner-visible {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
      }
      .act-banner-inner {
        display: flex;
        align-items: center;
        gap: 20px;
        padding: 20px 24px;
        flex-wrap: wrap;
      }
      .act-banner-left {
        display: flex;
        align-items: center;
        gap: 14px;
        flex: 1;
        min-width: 220px;
      }
      .act-banner-icon {
        font-size: 28px;
        flex-shrink: 0;
      }
      .act-banner-text strong {
        display: block;
        font-size: 14px;
        font-weight: 700;
        color: #f0f0f6;
        margin-bottom: 2px;
        font-family: 'Plus Jakarta Sans', sans-serif;
      }
      .act-banner-text p {
        font-size: 12.5px;
        color: #8888a0;
        margin: 0;
        line-height: 1.5;
        font-family: 'Plus Jakarta Sans', sans-serif;
      }
      .act-banner-text a {
        color: #e8a8d8;
        text-decoration: none;
      }
      .act-banner-text a:hover { text-decoration: underline; }
      .act-banner-btns {
        display: flex;
        gap: 10px;
        flex-shrink: 0;
      }
      .act-btn {
        padding: 10px 20px;
        border-radius: 12px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        font-family: 'Plus Jakarta Sans', sans-serif;
        transition: transform 0.15s ease, opacity 0.15s ease, box-shadow 0.2s ease;
        white-space: nowrap;
      }
      .act-btn:hover { transform: translateY(-1px); opacity: .9; }
      .act-btn:active { transform: translateY(0); }
      .act-btn-primary {
        background: linear-gradient(135deg, #e8a8d8, #b088d0);
        color: #0e0010;
        box-shadow: 0 4px 16px rgba(232,168,216,0.35);
      }
      .act-btn-primary:hover { box-shadow: 0 6px 22px rgba(232,168,216,0.5); }
      .act-btn-ghost {
        background: rgba(255,255,255,0.06);
        color: #c0c0d4;
        border: 1px solid rgba(255,255,255,0.1);
      }
      .act-btn-ghost:hover { background: rgba(255,255,255,0.1); }

      @media (max-width: 600px) {
        .act-banner-inner { flex-direction: column; align-items: flex-start; }
        .act-banner-btns { width: 100%; }
        .act-btn { flex: 1; text-align: center; }
      }
    `;
    document.head.appendChild(style);
  }

  function init() {
    injectStyles();
    const existing = getCookie(COOKIE_NAME);
    if (!existing) {
      setTimeout(createBanner, 600);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
