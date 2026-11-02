// Applies the saved theme before first paint so the page never flashes the wrong colors.
(function () {
  var theme = 'system';
  try {
    var prefs = JSON.parse(localStorage.getItem('fcs:v2:prefs') || '{}');
    theme = prefs.theme || localStorage.getItem('flashcard-studio-theme') || 'system';
  } catch (e) { /* storage unavailable */ }
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
})();
