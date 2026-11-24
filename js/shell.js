/* =====================================================================
   Trashbelt — Shell

   Dois modos distintos:
   • Landing (index.html): navbar própria com botão "Dashboard"
   • Painel (dashboard/monitor/charts/history): sidebar + drawer mobile
   Rodapé é compartilhado.
   ===================================================================== */

"use strict";

(function () {
  const ICONS = {
    casa: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-7h5v7"/>',
    monitor: '<rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 18v3"/><path d="M7 14l3-3 2 2 4-4 2 2"/>',
    chart: '<path d="M4 20V10"/><path d="M9 20V4"/><path d="M14 20v-7"/><path d="M19 20V7"/>',
    history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/><path d="M3.5 9H6"/>',
    menu: '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>',
    close: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    recicla: '<path d="m7 19-3-5 2-3"/><path d="m17 19 3-5-2-3"/><path d="M12 3 9 8h6z"/><path d="M6 11h5l-2 4"/><path d="M13 11h5l-2 4"/>',
    seta: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M4.93 19.07l1.41-1.41"/><path d="M17.66 6.34l1.41-1.41"/>',
    lua: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
  };

  // A raiz vem do próprio <script>: funciona na landing, em /pages/ e também
  // quando a Vercel reescreve /dashboard.html para /pages/dashboard.html.
  const scriptTag = document.currentScript || document.querySelector('script[src*="shell.js"]');
  const SITE = scriptTag
    ? new URL(".", scriptTag.src).href.replace(/\/js\/$/, "/")
    : ((location.hostname === "localhost" || location.hostname === "127.0.0.1") ? "/Trashbelt/" : "/");
  const APP = SITE + "pages/";
  const LANDING = SITE + "index.html";
  const LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const API = SITE + (LOCAL ? "api/dashboard.php" : "api/dashboard");

  const page = (location.pathname.split("/").pop() || "index.html").replace(".html", "");
  const isLanding = page === "" || page === "index";

  const navItems = [
    { href: LANDING, label: "Início", icon: "casa", key: "index" },
    { href: APP + "dashboard.html", label: "Visão geral", icon: "chart", key: "dashboard" },
    { href: APP + "monitor.html", label: "Monitoramento", icon: "monitor", key: "monitor" },
    { href: APP + "charts.html", label: "Gráficos", icon: "chart", key: "charts" },
    { href: APP + "history.html", label: "Histórico", icon: "history", key: "history" }
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
      // Algumas páginas já trazem o símbolo no HTML; não duplicar IDs.
      if (document.getElementById("i-" + name)) continue;
      const symbol = document.createElementNS("http://www.w3.org/2000/svg", "symbol");
      symbol.setAttribute("id", "i-" + name);
      symbol.setAttribute("viewBox", "0 0 24 24");
      symbol.innerHTML = path;
      defs.appendChild(symbol);
    }
    svg.appendChild(defs);
    document.body.appendChild(svg);
  }

  function botaoTema() {
    return `<button class="icon-btn" data-tema aria-label="Alternar tema claro/escuro" title="Tema">
      <svg class="icon i-sol" aria-hidden="true"><use href="#i-sol"/></svg>
      <svg class="icon i-lua" aria-hidden="true"><use href="#i-lua"/></svg>
    </button>`;
  }

  function ligarTema(root) {
    const btn = root.querySelector("[data-tema]");
    if (!btn || typeof toggleTema !== "function") return;
    btn.addEventListener("click", () => {
      toggleTema();
      const rotulo = root.querySelector(".theme-row span");
      if (rotulo) {
        rotulo.textContent = "Tema " + (document.documentElement.dataset.theme === "light" ? "claro" : "escuro");
      }
    });
  }

  /* ---------------- Landing: navbar ---------------- */

  function renderLandingNav() {
    const header = document.createElement("header");
    header.className = "landing-nav";
    header.innerHTML = `
      <div class="nav-inner">
        <a class="landing-brand" href="${LANDING}" aria-label="Trashbelt — início">
          <span class="brand-mark">T</span>
          <span>Trashbelt</span>
        </a>
        <nav class="landing-links">
          <a href="#recursos">Recursos</a>
          <a href="#como-funciona">Como funciona</a>
        </nav>
        <div class="landing-actions">
          ${botaoTema()}
          <a class="btn btn-primary btn-dashboard" href="${APP}dashboard.html">
            Dashboard ${icon("seta")}
          </a>
        </div>
      </div>`;
    document.body.insertBefore(header, document.body.firstChild);
    ligarTema(header);
  }

  /* ---------------- Painel: sidebar + drawer ---------------- */

  function renderSidebar() {
    // "Início" fica só na navbar da landing; na sidebar o retorno é o link "Landing page".
    const links = navItems.filter(item => item.key !== "index").map(item => `
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
      <div class="sidebar-status"><span class="live-dot"></span>Sistema online</div>
      <nav class="sidebar-nav">
        <div class="nav-label">Navegação</div>
        ${links}
        <div class="nav-label">Projeto</div>
        <a class="side-link" href="${LANDING}">${icon("casa")}<span>Landing page</span></a>
        <a class="side-link" href="https://github.com/Bartho05/TrashBelt" target="_blank" rel="noopener noreferrer">
          ${icon("external")}<span>GitHub</span>${icon("external", "link-ext")}
        </a>
      </nav>
      <div class="sidebar-footer">
        <div class="theme-row">
          <span>Tema ${document.documentElement.dataset.theme === "light" ? "claro" : "escuro"}</span>
          ${botaoTema()}
        </div>
        <div class="sidebar-foot-note">TRASHBELT · 2026</div>
      </div>`;
    document.body.insertBefore(sidebar, document.body.firstChild);
  }

  function renderTopbar() {
    const topbar = document.createElement("button");
    topbar.className = "menu-toggle topbar-toggle";
    topbar.id = "menu-toggle";
    topbar.setAttribute("aria-label", "Abrir menu");
    topbar.innerHTML = icon("menu");
    document.body.appendChild(topbar);
  }

  function renderOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "sidebar-overlay";
    overlay.id = "sidebar-overlay";
    document.body.appendChild(overlay);
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
    ligarTema(sidebar);
  }

  /* ---------------- Rodapé compartilhado ---------------- */

  function renderFooter() {
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
          <a href="${APP}dashboard.html">Painel de dados</a>
          <a href="${APP}charts.html">Análises</a>
          <a href="${APP}monitor.html">Tempo real</a>
          <a href="https://github.com/Bartho05/TrashBelt" target="_blank" rel="noopener noreferrer">Código-fonte ↗</a>
        </div>
      </div>
      <div class="footer-bottom">© 2026 Trashbelt · Projeto acadêmico de monitoramento ambiental</div>`;

    const footers = document.querySelectorAll(".site-footer");
    if (footers.length) {
      footers.forEach(f => { f.innerHTML = html; });
    } else {
      const f = document.createElement("footer");
      f.className = "site-footer";
      f.innerHTML = html;
      document.body.appendChild(f);
    }
  }

  /* ---------------- Dados da landing ---------------- */

  function initLanding() {
    const total = document.getElementById("hero-total");
    if (!total) return;
    fetch(API, { cache: "no-store" })
      .then(r => r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)))
      .then(data => {
        const valor = Number(data.totalUn ?? 0);
        const formatado = valor.toLocaleString("pt-BR");
        total.textContent = formatado;
        const card = document.getElementById("hero-total-card");
        if (card) card.textContent = formatado;
        const papel = Number(data.papelUn || 0);
        const plastico = Number(data.plasticoUn || 0);
        const vidro = Number(data.vidroUn || 0);
        setTxt("hero-papel", papel);
        setTxt("hero-plastico", plastico);
        setTxt("hero-vidro", vidro);

        // Gráfico semanal real: rótulo de data, trilha visível e barra zero legível.
        const dias = Array.isArray(data.coletaPorDia) && data.coletaPorDia.length
          ? data.coletaPorDia
          : ["Papel", "Plástico", "Vidro"].map((label, i) => ({ label, un: [papel, plastico, vidro][i] }));
        const serie = dias.map(p => Number(p.un || 0));
        const max = Math.max(...serie, 1);
        document.querySelectorAll("#hero-bars .mini-col").forEach((col, i) => {
          const dado = dias[i % dias.length] || {};
          const v = Number(serie[i % serie.length]) || 0;
          const bar = col.querySelector(".mini-bar");
          const label = col.querySelector(".mini-label");
          if (bar) {
            bar.style.height = (v === 0 ? 6 : 10 + (v / max) * 76) + "px";
            bar.classList.toggle("zero", v === 0);
          }
          if (label) label.textContent = dado.label || "—";
          col.title = (dado.label || "—") + ": " + v + " un";
        });

        const meta = document.getElementById("hero-atualizacao");
        if (meta) meta.textContent = data.ultimaAtualizacao
          ? new Date(data.ultimaAtualizacao).toLocaleString("pt-BR", {
              day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
            }) : "agora";
      })
      .catch(() => { /* landing segue estática se a API falhar */ });
  }

  function setTxt(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function init() {
    criarSprite();
    renderFooter();

    if (isLanding) {
      document.body.classList.add("landing-shell");
      renderLandingNav();
      initLanding();
    } else {
      document.body.classList.add("app-shell");
      renderSidebar();
      renderTopbar();
      renderOverlay();
      initDrawer();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
