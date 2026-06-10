
window.authFetch = async (url, options = {}) => {
  const token = localStorage.getItem('ludo_token');
  if (!options.headers) options.headers = {};
  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    options.body = JSON.stringify(options.body);
    options.headers['Content-Type'] = 'application/json';
  }
  
  const response = await fetch(url, options);
  if (response.status === 401 || response.status === 403) {
    
    
  }
  return response;
};

document.addEventListener('DOMContentLoaded', () => {
  const userData = JSON.parse(localStorage.getItem('ludo_user'));
  const token = localStorage.getItem('ludo_token');

  if (!userData && !window.location.pathname.includes('index.html') && !window.location.pathname.includes('auth.html')) {
    return;
  }

  if (userData) {
    updateUserUI(userData);
  }
});

function updateUserUI(user) {
  
  const nameEls = document.querySelectorAll('.s-user-name, .user-name, #topbarUserName');
  nameEls.forEach(el => el.textContent = user.username);

  
  const xpEls = document.querySelectorAll('.s-user-xp, .user-xp');
  xpEls.forEach(el => el.textContent = (user.xp || 0).toLocaleString() + ' XP');

  const subEls = document.querySelectorAll('.s-user-sub, .user-role');
  subEls.forEach(el => {
    if (el.classList.contains('s-user-sub')) {
        el.textContent = user.role === 'admin' ? 'Администратор' : `Ур. ${user.level || 1}`;
    } else {
        el.textContent = user.role === 'expert' ? 'Эксперт' : 'Игрок';
    }
  });

  
  const avatarEls = document.querySelectorAll('.s-avatar, .user-avatar');
  avatarEls.forEach(el => {
    if (user.avatar_url) {
      el.style.backgroundImage = `url(${user.avatar_url})`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.textContent = ''; 
    } else {
      el.style.backgroundImage = 'none';
      el.textContent = user.username ? user.username.slice(0, 2).toUpperCase() : 'Я';
    }
  });

  
  if (user.role !== 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }
  if (user.role !== 'expert') {
    document.querySelectorAll('.expert-only').forEach(el => el.style.display = 'none');
  }
}

window.logout = function() {
  localStorage.removeItem('ludo_token');
  localStorage.removeItem('ludo_user');
  localStorage.removeItem('ludo_ai_chat_history');
  localStorage.removeItem('АКТИВ_joined_quests');
  location.href = 'index.html';
};


function closestElement(target, selector) {
  const el = target && target.nodeType === Node.ELEMENT_NODE ? target : target && target.parentElement;
  return el && el.closest ? el.closest(selector) : null;
}

function getMobileMenuParts() {
  return {
    burger: document.getElementById('burgerBtn'),
    sidebar: document.querySelector('.sidebar'),
    overlays: Array.from(document.querySelectorAll('#sidebarOverlay, .sidebar-overlay'))
  };
}

function setMobileMenuOpen(isOpen) {
  const parts = getMobileMenuParts();
  if (!parts.sidebar || !parts.overlays.length) return;

  parts.sidebar.classList.toggle('open', isOpen);
  parts.overlays.forEach(overlay => overlay.classList.toggle('active', isOpen));

  if (parts.burger) {
    parts.burger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    parts.burger.classList.toggle('active', isOpen);
  }
}

function bindAktivMobileMenu() {
  const parts = getMobileMenuParts();

  if (parts.burger) {
    parts.burger.setAttribute('type', 'button');
    parts.burger.setAttribute('aria-label', 'Открыть меню');
    parts.burger.setAttribute('aria-expanded', parts.sidebar && parts.sidebar.classList.contains('open') ? 'true' : 'false');
  }

  if (parts.sidebar && !parts.sidebar.id) {
    parts.sidebar.id = 'mobileSidebar';
  }
  if (parts.burger && parts.sidebar) {
    parts.burger.setAttribute('aria-controls', parts.sidebar.id);
  }

  if (window.__aktivMobileMenuBound) return;
  window.__aktivMobileMenuBound = true;

  document.addEventListener('click', event => {
    const burger = closestElement(event.target, '#burgerBtn');
    const overlay = closestElement(event.target, '#sidebarOverlay, .sidebar-overlay');
    if (!burger && !overlay) return;

    const currentParts = getMobileMenuParts();
    if (!currentParts.sidebar || !currentParts.overlays.length) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (burger) {
      setMobileMenuOpen(!currentParts.sidebar.classList.contains('open'));
    } else {
      setMobileMenuOpen(false);
    }
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') setMobileMenuOpen(false);
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) setMobileMenuOpen(false);
  });
}

window.initMobileMenu = bindAktivMobileMenu;

document.addEventListener('DOMContentLoaded', bindAktivMobileMenu);
if (document.readyState !== 'loading') {
  bindAktivMobileMenu();
}

function initCodexBrowserCommentCompat() {
  if (document.getElementById('codex-comment-compat-style')) return;

  const style = document.createElement('style');
  style.id = 'codex-comment-compat-style';
  style.textContent = `
    #codex-browser-sidebar-comments-root {
      pointer-events: none !important;
    }

    #codex-browser-sidebar-comments-root > *,
    #codex-browser-sidebar-comments-root * {
      pointer-events: auto;
    }

    @media (max-width: 980px) {
      .codex-comments-safe .mobile-header {
        padding-left: 56px !important;
      }
    }
  `;
  document.head.appendChild(style);

  const syncCommentCompat = () => {
    const hasCommentsRoot = !!document.getElementById('codex-browser-sidebar-comments-root');
    document.documentElement.classList.toggle('codex-comments-safe', hasCommentsRoot);
  };

  syncCommentCompat();

  const observer = new MutationObserver(syncCommentCompat);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

document.addEventListener('DOMContentLoaded', initCodexBrowserCommentCompat);


if (!window.showToast) {
  window.showToast = function(msg, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    container.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3200);
  };
}

function shouldHideAiAssistantOnPage() {
  const path = (window.location.pathname || '/').toLowerCase();
  return path === '/' || path.endsWith('/index.html') || path.endsWith('/auth.html');
}


(async function() {
  if (!localStorage.getItem('ludo_token')) return;
  if (shouldHideAiAssistantOnPage()) return;
  try {
    const res = await fetch('/api/ai/config');
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.aiEnabled) return;
  } catch (e) { return; }
  const s = document.createElement('script');
  s.src = 'ai-chat.js';
  s.async = true;
  document.head.appendChild(s);
})();
