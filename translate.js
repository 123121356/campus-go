// 🌐 화면 번역: 상단 🌐 버튼 → 언어 선택 → 앱 전체(공지·AI 답변 포함)를 브라우저에서 바로 번역
// Google 웹사이트 번역 위젯을 씁니다. 고른 언어는 쿠키(googtrans)에 남아 새로고침해도 유지됩니다.
// 번역하면 안 되는 부분(로고, 지도 타일 등)은 HTML 에 translate="no" 를 붙이면 됩니다.
(function () {
  var LANGS = [
    ["ko", "한국어"], ["en", "English"], ["zh-CN", "中文(简体)"], ["vi", "Tiếng Việt"],
    ["ja", "日本語"], ["uz", "Oʻzbekcha"], ["mn", "Монгол"], ["ru", "Русский"], ["id", "Bahasa Indonesia"],
  ];

  var css = document.createElement("style");
  css.textContent =
    // 구글 위젯이 붙이는 상단 배너·말풍선 숨김 (앱 레이아웃이 밀리지 않게)
    "iframe.skiptranslate,.goog-te-banner-frame,#goog-gt-tt,.goog-te-balloon-frame,.VIpgJd-ZVi9od-ORHb-OEVmcd{display:none!important}" +
    "body{top:0!important}.goog-text-highlight{background:none!important;box-shadow:none!important}#gtEl{display:none}" +
    ".lang-menu{position:fixed;z-index:3000;min-width:180px;padding:6px;border-radius:var(--r,14px);background:var(--card,#fff);color:var(--ink,#0f172a);" +
    "border:1px solid var(--line,#e2e8f0);box-shadow:0 12px 32px rgba(15,23,42,.18);list-style:none;margin:0}" +
    ".lang-menu button{display:flex;justify-content:space-between;width:100%;padding:9px 12px;border:0;border-radius:10px;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}" +
    ".lang-menu button:hover,.lang-menu button[aria-current=true]{background:var(--soft,#eef3ff)}" +
    ".lang-menu button[aria-current=true]::after{content:'✓';color:var(--blue,#2563eb)}";
  document.head.appendChild(css);

  function current() {
    var m = document.cookie.match(/(?:^|;\s*)googtrans=\/[^/]+\/([^;]+)/);
    return m ? decodeURIComponent(m[1]) : "ko";
  }
  function setCookie(v) {
    var host = location.hostname, exp = v ? "" : ";expires=Thu, 01 Jan 1970 00:00:00 GMT";
    var val = "googtrans=" + (v ? "/ko/" + v : "") + ";path=/" + exp;
    document.cookie = val;
    if (host.indexOf(".") > 0 && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      document.cookie = val + ";domain=" + host;
      document.cookie = val + ";domain=." + host.split(".").slice(-2).join(".");
    }
  }

  var loaded = false;
  function loadWidget() {
    if (loaded) return; loaded = true;
    var el = document.createElement("div"); el.id = "gtEl"; document.body.appendChild(el);
    window.__gtInit = function () {
      new google.translate.TranslateElement({ pageLanguage: "ko", autoDisplay: false }, "gtEl");
    };
    var s = document.createElement("script");
    s.src = "https://translate.google.com/translate_a/element.js?cb=__gtInit";
    s.onerror = function () { loaded = false; alert("번역 서비스를 불러오지 못했어요. 인터넷 연결을 확인하거나 브라우저의 '번역' 기능을 써 주세요."); };
    document.body.appendChild(s);
  }
  // 위젯이 준비되면 숨은 선택 상자를 바꿔 즉시 번역 (새로고침 없이)
  function applyLang(code, tries) {
    var sel = document.querySelector("#gtEl select.goog-te-combo");
    if (!sel) { if ((tries || 0) < 40) setTimeout(function () { applyLang(code, (tries || 0) + 1); }, 150); return; }
    sel.value = code; sel.dispatchEvent(new Event("change"));
  }

  function choose(code) {
    closeMenu();
    if (code === current()) return;
    if (code === "ko") { setCookie(""); location.reload(); return; } // 원문 복귀는 새로고침이 가장 깔끔
    setCookie(code); loadWidget(); applyLang(code);
    document.documentElement.setAttribute("data-lang", code);
  }

  var menu = null;
  function closeMenu() { if (menu) { menu.remove(); menu = null; } }
  function openMenu(btn) {
    if (menu) return closeMenu();
    var cur = current();
    menu = document.createElement("ul");
    menu.className = "lang-menu notranslate"; menu.setAttribute("translate", "no"); menu.setAttribute("role", "menu");
    LANGS.forEach(function (l) {
      var li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.textContent = l[1]; b.setAttribute("role", "menuitem");
      if (l[0] === cur) b.setAttribute("aria-current", "true");
      b.onclick = function () { choose(l[0]); };
      li.appendChild(b); menu.appendChild(li);
    });
    document.body.appendChild(menu);
    var r = btn.getBoundingClientRect();
    menu.style.top = (r.bottom + 8) + "px";
    menu.style.left = Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, r.right - menu.offsetWidth)) + "px";
  }

  function init() {
    var btn = document.getElementById("langBtn");
    if (btn) {
      btn.addEventListener("click", function (e) { e.stopPropagation(); openMenu(btn); });
      document.addEventListener("click", function (e) { if (menu && !menu.contains(e.target)) closeMenu(); });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });
    }
    // ?lang=en 링크로 들어오면 그 언어로 시작 (외국인 안내용 QR 등)
    var q = new URLSearchParams(location.search).get("lang");
    if (q && LANGS.some(function (l) { return l[0] === q; })) { if (q === "ko") setCookie(""); else setCookie(q); }
    if (current() !== "ko") { loadWidget(); document.documentElement.setAttribute("data-lang", current()); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
