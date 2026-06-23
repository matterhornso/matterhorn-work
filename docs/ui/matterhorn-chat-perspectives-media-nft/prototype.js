// prototype.js — Matterhorn Chat Perspectives & Media Studio

function showScreen(id) {
  // Hide all screens
  document.querySelectorAll('.screen-block').forEach(el => {
    el.classList.remove('is-active');
  });
  // Show target screen
  const target = document.getElementById(id);
  if (target) {
    target.classList.add('is-active');
  }
  // Update nav active state
  document.querySelectorAll('.showcase-nav__link').forEach(el => {
    el.classList.remove('is-active');
  });
  const activeLink = document.querySelector(`.showcase-nav__link[onclick="showScreen('${id}')"]`);
  if (activeLink) activeLink.classList.add('is-active');

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleTheme() {
  const html = document.documentElement;
  const label = document.getElementById('themeLabel');
  if (html.getAttribute('data-theme') === 'light') {
    html.removeAttribute('data-theme');
    label.textContent = 'Dark';
  } else {
    html.setAttribute('data-theme', 'light');
    label.textContent = 'Light';
  }
}

// Auto-show screen 1 on load
document.addEventListener('DOMContentLoaded', function() {
  showScreen('screen-1');
});
