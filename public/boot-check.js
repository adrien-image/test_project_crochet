// Plain script, separate from the app bundle: if the app's JavaScript can't
// even be parsed by this browser, say so instead of leaving a blank page.
(function () {
  var lastError = '';
  window.addEventListener('error', function (e) {
    lastError = (e && (e.message || (e.error && e.error.message))) || lastError;
  }, true);
  function check() {
    var app = document.getElementById('app');
    if (!app || app.querySelector('main, [role="alert"]')) return;
    var fr = (navigator.language || 'fr').slice(0, 2) !== 'en';
    app.innerHTML = '';
    var box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.cssText = 'max-width:32rem;margin:3rem auto;padding:1rem;font:16px/1.5 system-ui,sans-serif;text-align:center';
    var p = function (text, css) {
      var el = document.createElement('p');
      el.textContent = text;
      if (css) el.style.cssText = css;
      box.appendChild(el);
    };
    p('🧶', 'font-size:2rem;margin:0');
    p(fr ? 'Mon Crochet n’a pas pu démarrer dans ce navigateur. Mettez-le à jour, ou essayez un autre navigateur.' : 'Mon Crochet couldn’t start in this browser. Update it, or try another browser.');
    p(navigator.userAgent, 'font-size:12px;color:#777;word-break:break-word');
    if (lastError) p(lastError, 'font-size:12px;color:#b33;word-break:break-word');
    var b = document.createElement('button');
    b.textContent = fr ? 'Recharger' : 'Reload';
    b.style.cssText = 'padding:.5rem 1rem;border-radius:10px;border:1px solid #ccc;background:#fff';
    b.onclick = function () { location.reload(); };
    box.appendChild(b);
    app.appendChild(box);
  }
  window.addEventListener('load', function () { setTimeout(check, 6000); });
})();
