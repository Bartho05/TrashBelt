/* =====================================================================
   Trashbelt — Shell (sidebar, drawer mobile, rodapé)
   ===================================================================== */

"use strict";

(function () {
  const ICONS = {
    casa: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-7h5v7"/>',
    monitor: '<rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 18v3"/><path d="M7 14l3-3 2 2 4-4 2 2"/>',
    chart: '<path d="M4 20V10"/><path d="M9 20V4"/><path d="M14 20v-7"/><path d="M19 20V7"/>',
    history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/><path d="M3.5 9H6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    menu: '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>',
    close: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    recicla: '<path d="m7 19-3-5 2-3"/><path d="m17 19 3-5-2-3"/><path d="M12 3 9 8h6z"/><path d="M6 11h5l-2 4"/><path d="M13 11h5l-2 4"/>'
  };

  const page = (location.pathname.split("/").pop() || "index.html").replace(".html", "");
  const apps = ["dashboard", "monitor", "charts", "history"];
  const isLanding = page === "" || page === "index";

  const navItems = [
    { href: "index.html", label: "Início", icon: "casa", key: "index" },
    { href: "dashboard.html", label: "Visão geral", icon: "chart", key: "dashboard" },
    { href: "monitor.html", label: "Monitoramento", icon: "monitor", key: "monitor" },
    { href: "charts.html", label: "Gráficos", icon: "chart", key: "charts" },
    { href: "history.html", label: "Histórico", icon: "history", key: "history" }
  ];

  function icon(name, cls) {
    return '<svg class="icon ' + (cls || "") + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }

  function criarSprite() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.style.display = "none";
    svg.setAttribute("aria-hidden", "true");
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    for (const [name, path] of Object.entries(ICONS)) {
      const symbol = document.createElementNS("http://www.w3.org/2000/svg", "symbol");
      symbol.setAttribute("id", "i-" + name);
      symbol.setAttribute("viewBox", "0 0 24 24");
      symbol.innerHTML = path;
      defs.appendChild(symbol);
    }
    svg.appendChild(defs);
    document.body.appendChild(svg);
  }

  function renderSidebar() {
    const links = navItems.map(item => `
      <a href="${item.href}" class="side-link ${item.key === page ? "active" : ""}">
        ${icon(item.icon)}<span>${item.label}</span>
      </a>`).join("");

    const sidebar = document.createElement("aside");
    sidebar.className = "sidebar";
    sidebar.id = "sidebar";
    sidebar.innerHTML = `
      <div class="sidebar-brand">
        <div class="brand-mark">T</div>
        <div class="brand">Trashbelt<small>Smart Waste</small></div>
        <button class="menu-toggle sidebar-close" data-fechar aria-label="Fechar menu">${icon("close")}</button>
      </div>
      ${apps.indexOf(page) !== -1 ? '<div class="sidebar-status"><span class="live-dot"></span>Sistema online</div>' : ""}
      <nav class="sidebar-nav">
        <div class="nav-label">Navegação</div>
        ${links}
        <div class="nav-label">Projeto</div>
        <a class="side-link" href="https://github.com/Bartho05/TrashBelt" target="_blank" rel="noopener noreferrer">
          ${icon("external")}<span GitHub</span>${icon("external", "link-ext")}
        </a>
      </nav>
      <div class="sidebar-footer">
        <div class="theme-row">
          <span>Tema ${document.documentElement.dataset.theme === "light" ? "claro" : "escuro"}</span>
          <button class="icon-btn" data-tema aria-label="Alternar tema claro/escuro" title="Tema">
            <svg class="icon i-sol" aria-hidden="true"><use href="#i-sol"/></svg>
            <svg class="icon i-lua" aria-hidden="true"><use href="#i-lua"/></svg>
          </button>
        </div>
        <div class="sidebar-foot-note">TRASHBELT · 2026</div>
      </div>`;
    document.body.insertBefore(sidebar, document.body.firstChild);
  }

  function renderTopbar() {
    const topbar = document.createElement("button");
    topbar.className = "menu-toggle topbar-toggle";
    topbar.id="menu-toggle";
    topbar.setAttribute("aria-label", "Abrir menu");
    topbar.innerHTML = icon("menu");
    document.body.appendChild(topbar);
  }

  function renderOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "sidebar-overlay";
    overlay.id = "sidebar-overlay";
    document.body.appendChild(overlay);
    return overlay;
  }

  function renderFooter() {
    const footers = document.querySelectorAll(".site-footer");
    const html = `
      <div class="footer-inner">
        <div class="footer-brand">
          <div class="footer-brand-title">${icon("recicla")} Trashbelt</div>
          <p>Sistema inteligente de separação e monitoramento de resíduos. Dados em tempo real da esteira, com transparência de ponta a ponta.</p>
        </div>
        <div class="footer-col">
          <h4>Navegação</h4>
          ${navItems.map(i => `<a href="${i.href}">${i.label}</a>`).join("")}
        </div>
        <div class="footer-col">
          <h4>Recursos</h4>
          <a href="dashboard.html">Painel de dados</a>
          <a href="charts.html">Análises</a>
          <a href="monitor.html">Tempo real</a>
          <a href="https://github.com/Bartho05/TrashBelt" target="_blank" rel="noopener noreferrer">Código-fonte ↗</a>
        </div>
      </div>
      <div class="footer-bottom">© 2026 Trashbelt · Projeto acadêmico de monitoramento ambiental</div>`;
    if (footers.length) {
      footers.forEach(f => { f.innerHTML = html; });
    } else {
      const f = document.createElement("footer");
      f.className = "site-footer";
      f.innerHTML = html;
      document.body.appendChild(f);
    }
  }

  function initDrawer() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    const topbar = document.getElementById("menu-toggle");

    function open() {
      sidebar.classList.add("aberto");
      overlay.classList.add("visivel");
      document.body.style.overflow = "hidden";
    }
    function close() {
      sidebar.classList.remove("aberto");
      overlay.classList.remove("visivel");
      document.body.style.overflow = "";
    }

    topbar.addEventListener("click", open);
    overlay.addEventListener("click", close);
    sidebar.querySelectorAll("[data-fechar]").forEach(b => b.addEventListener("click", close));
    sidebar.querySelectorAll("a").forEach(a => a.addEventListener("click", close));
    document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });

    const themeBtn = sidebar.querySelector("[data-tema]");
    if (themeBtn && typeof toggleTema === "function") {
      themeBtn.addEventListener("click", () => {
        toggleTema();
        const rotulo = sidebar.querySelector(".theme-row span");
        if (rotulo) {
          rotulo.textContent = "Tema " + (document.documentElement.dataset.theme === "light" ? "claro" : "escuro");
        }
      });
    }
  }

  function init() {
    criarSprite();
    renderSidebar();
    renderTopbar();
    const overlay = renderOverlay();
    renderFooter();
    initDrawer();
    if (isLanding) initLanding();
  }

  function initLanding() {
    const total = document.getElementById("hero-total");
    if (!total) return;
    const fetchUrl = location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? "api/dashboard.php" : "api/dashboard";
    fetch(fetchUrl, { cache: "no-store" })
      .then(r => r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)))
      .then(data => {
        const valor = Number(data.totalUn ?? 0);
        animarNumero(total, valor);
        const card = document.getElementById("hero-total-card");
        if (card) card.textContent = valor.toLocaleString("pt-BR");
        const papel = Number(data.papelUn || 0), plastico = Number(data.plasticoUn || 0), vidro = Number(data.vidroUn || 0);
        setTxt("hero-papel", papel); setTxt("hero-plastico", plastico); setTxt("hero-vidro", vidro);
        const stats = [papel, plastico, vidro];
        const max = Math.max(...stats, 1);
        const bars = document.querySelectorAll("#hero-bars .mini-bar");
        bars.forEach((b, i) => {
          const v = stats[i % stats.length] || 0;
          b.style.height = Math.max(3, (v / max) * 95) + "px";
          if (v === 0) b.classList.add("zero");
        });
        const meta = document.getElementById("hero-atualizacao");
        if (meta) meta.textContent = data.ultimaAtualizacao ? new Date(data.ultimaAtualizacao).toLocaleString("pt-BR") : "agora";
      })
      .catch(() => { /* landing segue estática se a API falhar */ });
  }

  function setTxt(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function animarNumero(el, alvo) {
    const inicio = performance.now();
    const dur = 900;
    function frame(now) {
      const p = Math.min(1, (now - inicio) / dur);
      el.textContent = Math.round(alvo * (1 - Math.pow(1 - p, 3))).toLocaleString("pt-BR");
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
