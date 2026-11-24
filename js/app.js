/* =====================================================================
   Trashbelt — Frontend do painel (v6)
   Os dados vêm do backend PHP (api/dashboard.php), que lê as tabelas
   trash_belt_status e trash_belt_historico no Supabase usando credenciais
   guardadas no servidor. O navegador nunca tem acesso a nenhuma chave.
   Unidades: "un" (unidades).
   Interações: tooltips com detalhamento por material, barras empilhadas,
   linha de média, contagem animada, toasts de novas coletas, atalhos de
   teclado (1-4, T) e elementos clicáveis.
   ===================================================================== */

"use strict";

/* ---------- Preferência de movimento reduzido ---------- */
const movimentoReduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Utilidades ---------- */
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function setText(selector, value) {
  const el = document.querySelector(selector);
  if (el && value !== undefined && value !== null) el.textContent = value;
}

function formatDateTime(value) {
  if (!value) return "Aguardando atualização";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `Atualizado ${date.toLocaleDateString("pt-BR")} às ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Escala "redonda" para o topo do eixo Y (ex.: 37 → 40) */
function niceMax(v) {
  if (v <= 5) return 5;
  const ordem = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / (ordem / 2)) * (ordem / 2);
}

/** Anima um número dentro de um elemento (com estado em data-valor) */
function animar(el, destino) {
  if (!el) return;
  if (destino == null || Number.isNaN(Number(destino))) {
    el.textContent = "—";
    delete el.dataset.valor;
    return;
  }
  const alvo = Number(destino);
  const de = Number(el.dataset.valor || 0);
  el.dataset.valor = String(alvo);
  if (de === alvo || movimentoReduzido) {
    el.textContent = alvo.toLocaleString("pt-BR");
    return;
  }
  if (el._raf) cancelAnimationFrame(el._raf);
  const dur = 700;
  const t0 = performance.now();
  const frame = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
    el.textContent = Math.round(de + (alvo - de) * e).toLocaleString("pt-BR");
    if (p < 1) el._raf = requestAnimationFrame(frame);
    else el._raf = null;
  };
  el._raf = requestAnimationFrame(frame);
}

/* ---------- Tema claro/escuro (persistente) ---------- */
const themeBtn = document.querySelector(".theme-btn");

function aplicarTema(tema) {
  document.documentElement.dataset.theme = tema;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", tema === "light" ? "#eef1f8" : "#070b16");
  try { localStorage.setItem("trashbelt-tema", tema); } catch (e) { /* modo privado */ }
}

themeBtn?.addEventListener("click", () => {
  aplicarTema(document.documentElement.dataset.theme === "light" ? "dark" : "light");
});

/* ---------- Navegação ---------- */
const navItems = [...document.querySelectorAll(".nav-item")];
const sections = document.querySelectorAll(".section");
const title = document.getElementById("page-title");

const titles = {
  dashboard: "Visão geral",
  monitor: "Monitoramento",
  charts: "Gráficos",
  history: "Histórico"
};

function irParaSecao(section) {
  const item = navItems.find(i => i.dataset.section === section);
  if (item) item.click();
}

function closeMenu() {
  document.body.classList.remove("menu-open");
}

navItems.forEach(item => {
  item.addEventListener("click", () => {
    const target = item.dataset.section;
    navItems.forEach(i => i.classList.remove("active"));
    item.classList.add("active");
    sections.forEach(s => s.classList.remove("active-section"));
    document.getElementById(target)?.classList.add("active-section");
    title.textContent = titles[target];
    window.scrollTo({ top: 0, behavior: "smooth" });
    closeMenu();
  });
});

/* Menu mobile — toggle direto via onclick no HTML */
function toggleMenu() {
  const isOpen = document.body.classList.toggle("menu-open");
  const sidebar = document.querySelector(".sidebar");
  const backdrop = document.querySelector(".sidebar-backdrop");
  if (sidebar) {
    sidebar.classList.toggle("open", isOpen);
    sidebar.style.transform = isOpen ? "none" : "translateX(-100%)";
  }
  if (backdrop) {
    backdrop.style.opacity = isOpen ? "1" : "0";
    backdrop.style.pointerEvents = isOpen ? "auto" : "none";
  }
}

function closeMenu() {
  document.body.classList.remove("menu-open");
  const sidebar = document.querySelector(".sidebar");
  const backdrop = document.querySelector(".sidebar-backdrop");
  if (sidebar) {
    sidebar.classList.remove("open");
    sidebar.style.transform = "translateX(-100%)";
  }
  if (backdrop) {
    backdrop.style.opacity = "0";
    backdrop.style.pointerEvents = "none";
  }
}

/* Botão do hero */
document.querySelectorAll("[data-goto]").forEach(btn => {
  btn.addEventListener("click", () => irParaSecao(btn.dataset.goto));
});

/* Chip AO VIVO: força atualização imediata */
const liveChip = document.querySelector(".live");
if (liveChip) {
  liveChip.title = "Clique para atualizar agora";
  liveChip.addEventListener("click", () => loadDashboard());
}

/* Atalhos de teclado: 1-4 navegam, T troca o tema */
document.addEventListener("keydown", (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const tag = e.target?.tagName;
  if (tag && /^(INPUT|SELECT|TEXTAREA)$/.test(tag)) return;
  if (e.key >= "1" && e.key <= "4") {
    navItems[Number(e.key) - 1]?.click();
  } else if (e.key === "t" || e.key === "T") {
    themeBtn?.click();
  }
});

/* ---------- Tooltip flutuante ---------- */
const tooltip = document.getElementById("tooltip");

function moverTooltip(e) {
  if (!tooltip || tooltip.hidden) return;
  const margem = 14;
  let x = e.clientX + margem;
  let y = e.clientY + margem;
  const largura = tooltip.offsetWidth;
  const altura = tooltip.offsetHeight;
  if (x + largura > window.innerWidth - 8) x = e.clientX - largura - margem;
  if (y + altura > window.innerHeight - 8) y = e.clientY - altura - margem;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function mostrarTooltip(html, e) {
  if (!tooltip) return;
  tooltip.innerHTML = html;
  tooltip.hidden = false;
  moverTooltip(e);
}

function esconderTooltip() {
  if (tooltip) tooltip.hidden = true;
}

/** Tooltip com total + detalhamento por material (bolinhas coloridas) */
function tooltipDetalhe(point, legenda) {
  const total = Number(point?.un || 0);
  const partes = [
    ["#5f8bff", "Papel", Number(point?.papel || 0)],
    ["#4fd0a8", "Plástico", Number(point?.plastico || 0)],
    ["#f5c87e", "Vidro", Number(point?.vidro || 0)],
  ].filter(([, , v]) => v > 0)
   .map(([cor, nome, v]) => `<span class="tt-dot" style="background:${cor}"></span>${nome} ${v.toLocaleString("pt-BR")}`);
  const detalhe = partes.length ? `<small>${partes.join(" &nbsp;·&nbsp; ")}</small>` : "";
  return `<b>${total.toLocaleString("pt-BR")} un</b>${detalhe}<small>${escapeHtml(legenda)}</small>`;
}

/* ---------- Toasts ---------- */
const toastsEl = document.getElementById("toasts");

function fecharToast(t) {
  if (!t || t._saindo) return;
  t._saindo = true;
  clearTimeout(t._timer);
  t.classList.add("saindo");
  setTimeout(() => t.remove(), 350);
}

function toast(titulo, corpo) {
  if (!toastsEl) return;
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `
    <span class="toast-ic"><svg class="icon"><use href="#i-reciclar"/></svg></span>
    <div class="toast-tx"><b>${escapeHtml(titulo)}</b><small>${escapeHtml(corpo)}</small></div>
    <span class="toast-x">×</span>`;
  t.addEventListener("click", () => fecharToast(t));
  toastsEl.appendChild(t);
  while (toastsEl.children.length > 3) toastsEl.firstElementChild.remove();
  t._timer = setTimeout(() => fecharToast(t), 5200);
}

/* ---------- Notificações ---------- */
const notifBtn = document.querySelector(".notif-btn");
const notifPanel = document.querySelector(".notif-panel");
const notifList = document.querySelector(".notif-list");
const notifBadge = document.querySelector(".notif-badge");
let novasColetas = 0;
let chaveTopoAnterior = null;

function classeMaterial(nome) {
  const n = String(nome || "").toLowerCase();
  if (n.includes("plást")) return "plastic";
  if (n.includes("vid")) return "glass";
  return "paper";
}

function iconeMaterial(nome) {
  const cls = classeMaterial(nome);
  return { cls, id: cls === "plastic" ? "#i-plastico" : cls === "glass" ? "#i-vidro" : "#i-papel" };
}

function chaveRegistro(r) {
  return `${r.data}|${r.horario}|${r.material}|${r.quantidadeUn}`;
}

function renderNotif() {
  if (notifBadge) {
    notifBadge.textContent = novasColetas > 99 ? "99+" : String(novasColetas);
    notifBadge.hidden = novasColetas === 0;
  }
  if (notifList) {
    if (!registrosAtuais.length) {
      notifList.innerHTML = '<p class="notif-empty">Nenhuma coleta registrada ainda.</p>';
      return;
    }
    const limite = Math.max(novasColetas, 8);
    notifList.innerHTML = registrosAtuais.slice(0, limite).map((r, i) => {
      const ic = iconeMaterial(r.material);
      return `
      <div class="notif-row ${i < novasColetas ? "novo" : ""}">
        <span class="m-icon ${ic.cls}"><svg class="icon"><use href="${ic.id}"/></svg></span>
        <div>
          ${escapeHtml(r.material)}
          <small>${escapeHtml(r.data)} às ${escapeHtml(r.horario)}</small>
        </div>
        <b>${Number(r.quantidadeUn).toLocaleString("pt-BR")} un</b>
      </div>`;
    }).join("");
  }
}

function abrirNotif() {
  if (!notifPanel) return;
  notifPanel.hidden = false;
  novasColetas = 0;
  renderNotif();
}

notifBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (notifPanel.hidden) abrirNotif();
  else notifPanel.hidden = true;
});

document.addEventListener("click", (e) => {
  if (notifPanel && !notifPanel.hidden && !notifPanel.contains(e.target) && e.target !== notifBtn) {
    notifPanel.hidden = true;
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (notifPanel && !notifPanel.hidden) notifPanel.hidden = true;
    esconderTooltip();
  }
});

/* ---------- Painel: resumo ---------- */
function updateDashboard(data) {
  if (!data) return;

  const total = data.totalUn == null ? null : Number(data.totalUn);
  const papel = data.papelUn == null ? null : Number(data.papelUn);
  const plastico = data.plasticoUn == null ? null : Number(data.plasticoUn);
  const vidro = data.vidroUn == null ? null : Number(data.vidroUn);
  const meta = data.metaMensalUn == null ? null : Number(data.metaMensalUn);

  animar(document.querySelector(".stat-card.total strong .num"), total);

  const numsMaterial = document.querySelectorAll(".stat-card:not(.total) strong .num");
  [papel, plastico, vidro].forEach((v, i) => animar(numsMaterial[i], v));

  const totalCardP = document.querySelector(".stat-card.total p");
  if (totalCardP) totalCardP.textContent = meta != null ? `Meta mensal: ${meta.toLocaleString("pt-BR")} un` : "Meta mensal: —";

  const variation = document.querySelector(".stat-card.total .card-top b");
  if (variation) variation.textContent = data.variacaoPercentual != null
    ? `↗ ${Number(data.variacaoPercentual).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
    : "—";

  const update = document.querySelector("#dashboard .update");
  if (update) update.textContent = formatDateTime(data.ultimaAtualizacao);

  const progress = document.querySelector(".mini-progress span");
  if (progress) progress.style.width = meta > 0 && total != null ? `${Math.min(100, (total / meta) * 100)}%` : "0%";

  const validTotal = total != null && total > 0;
  const percentages = validTotal
    ? [papel, plastico, vidro].map(v => v == null ? 0 : (v / total) * 100)
    : [0, 0, 0];

  const materialCards = document.querySelectorAll(".stat-card:not(.total) p");
  percentages.forEach((pct, i) => {
    if (materialCards[i]) materialCards[i].textContent = validTotal ? `${pct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% do total` : "Aguardando dados";
  });

  /* Rosca + fatias para hover */
  const nomes = { papel: "Papel", plastico: "Plástico", vidro: "Vidro" };
  fatiasDonut = [
    { mat: "papel", nome: nomes.papel, valor: papel ?? 0, pct: percentages[0] },
    { mat: "plastico", nome: nomes.plastico, valor: plastico ?? 0, pct: percentages[1] },
    { mat: "vidro", nome: nomes.vidro, valor: vidro ?? 0, pct: percentages[2] },
  ];

  const donut = document.querySelector(".donut");
  if (donut) {
    const p1 = percentages[0];
    const p2 = p1 + percentages[1];
    donut.style.background = validTotal
      ? `conic-gradient(#3157c8 0 ${p1}%, #35b991 ${p1}% ${p2}%, #efb45e ${p2}% 100%)`
      : "conic-gradient(var(--donut-empty) 0 100%)";
  }
  centroDonut(null); // restaura o centro da rosca

  const legendValues = document.querySelectorAll(".legend b");
  percentages.forEach((pct, i) => {
    if (legendValues[i]) legendValues[i].textContent = validTotal ? `${pct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : "—";
  });

  if (Array.isArray(data.coletaPorDia)) {
    updateDailyChart(data.coletaPorDia);
    updatePeriodData("dia", data.coletaPorDia);
  }
  if (Array.isArray(data.coletaPorSemana)) updatePeriodData("semana", data.coletaPorSemana);
  if (Array.isArray(data.coletaPorMes)) updatePeriodData("mes", data.coletaPorMes);

  if (data.monitoramento) {
    const m = data.monitoramento;
    setText(".floating-data b", m.coletaUnHora != null ? `${Number(m.coletaUnHora).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} un/h` : "— un/h");
    updateSensor("Esteira", m.esteira);
    updateSensor("Separação", m.separacao);
    updateSensor("Coleta", m.coleta);
    updateSensor("Manutenção", m.manutencao);
  }

  const compareValues = [papel, plastico, vidro];
  const validValues = compareValues.filter(v => v != null && !Number.isNaN(v));
  const max = Math.max(...validValues, 1);
  const compareBars = document.querySelectorAll(".compare i");
  const compareLabels = document.querySelectorAll(".compare b");
  compareValues.forEach((value, i) => {
    if (compareBars[i]) compareBars[i].style.width = value != null ? `${(value / max) * 100}%` : "0%";
    if (compareLabels[i]) animar(compareLabels[i], value);
  });
}

function updateSensor(name, value) {
  const rows = [...document.querySelectorAll(".sensor")];
  const row = rows.find(el => el.querySelector("span")?.textContent.trim() === name);
  if (!row || value === undefined || value === null) return;
  row.querySelector("b").textContent = value;
  const dot = row.querySelector("i");
  const off = /não|deslig|inativo|parado|aguardando|sem dados/i.test(String(value));
  dot.classList.toggle("off", off);
}

/* ---------- Rosca: hover mostra o material ---------- */
let fatiasDonut = [];

function centroDonut(fatia) {
  const num = document.querySelector(".donut strong .num");
  const sub = document.getElementById("donut-sub");
  if (fatia) {
    animar(num, fatia.valor);
    if (sub) sub.textContent = `${fatia.nome} · ${fatia.pct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  } else {
    const total = fatiasDonut.reduce((s, f) => s + f.valor, 0);
    animar(num, total || null);
    if (sub) sub.textContent = "un total";
  }
}

function legendaAtiva(mat) {
  document.querySelectorAll(".legend > div[data-mat]").forEach(r => {
    r.classList.toggle("ativa", r.dataset.mat === mat);
  });
}

const donutEl = document.querySelector(".donut");

if (donutEl) {
  donutEl.addEventListener("mousemove", (e) => {
    const rect = donutEl.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    let ang = Math.atan2(dx, -dy) * 180 / Math.PI; // 0° no topo, sentido horário
    if (ang < 0) ang += 360;
    const posicao = ang / 3.6; // 0–100, igual às porcentagens do conic-gradient
    let acumulado = 0;
    for (const f of fatiasDonut) {
      acumulado += f.pct;
      if (posicao <= acumulado) {
        legendaAtiva(f.mat);
        centroDonut(f);
        mostrarTooltip(`<b>${Number(f.valor).toLocaleString("pt-BR")} un</b><small>${escapeHtml(f.nome)} · ${f.pct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% do total</small>`, e);
        return;
      }
    }
  });
  donutEl.addEventListener("mouseleave", () => {
    legendaAtiva(null);
    centroDonut(null);
    esconderTooltip();
  });
}

/* ---------- Gráfico de linha (últimos 7 dias) ---------- */
let coordsGrafico = [];
let labelsGrafico = [];
let chaveLinhaAnterior = null;

function caminhoSuave(pts) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]} ${pts[0][1]}` : "";
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

function updateDailyChart(points) {
  labelsGrafico = points.map(p => p.label ?? "—");

  const labels = document.querySelectorAll(".x-labels span");
  points.slice(-labels.length).forEach((point, i) => { labels[i].textContent = point.label ?? "—"; });

  const values = points.map(p => Number(p.un || 0));
  if (!values.length) return;
  const max = Math.max(...values, 1);
  const topo = niceMax(max);

  // Etiquetas do eixo Y (4 valores + "0" + "un")
  const ySpans = document.querySelectorAll(".y-labels span:not(.eixo)");
  [1, .75, .5, .25].forEach((f, i) => {
    if (ySpans[i]) ySpans[i].textContent = Math.round(topo * f).toLocaleString("pt-BR");
  });

  const svg = document.querySelector(".line-chart svg");
  if (!svg) return;
  const width = 700;
  const height = 200;
  coordsGrafico = values.map((v, i) => {
    const x = values.length === 1 ? 0 : (i / (values.length - 1)) * width;
    const y = height - (v / max) * (height - 25);
    return [x, y];
  });
  const linha = caminhoSuave(coordsGrafico);
  const paths = svg.querySelectorAll("path");
  if (paths[0]) paths[0].setAttribute("d", `${linha} L${width} ${height} L0 ${height}Z`);
  if (paths[1]) paths[1].setAttribute("d", linha);

  // Ponto de maior valor em destaque
  let idxMax = -1, maior = -1;
  values.forEach((v, i) => { if (v > maior) { maior = v; idxMax = i; } });
  const circles = svg.querySelectorAll("circle");
  circles.forEach((circle, i) => {
    circle.classList.toggle("max-dot", i === idxMax);
    circle.setAttribute("r", i === idxMax ? 8 : 6);
    if (coordsGrafico[i]) {
      circle.setAttribute("cx", coordsGrafico[i][0]);
      circle.setAttribute("cy", coordsGrafico[i][1]);
    } else circle.remove();
  });

  // Animação de "desenhar" a linha — só quando os dados mudaram
  const chave = values.join(",");
  const mudou = chave !== chaveLinhaAnterior;
  chaveLinhaAnterior = chave;
  const stroke = paths[1];
  const areaPath = paths[0];
  if (stroke && mudou && !movimentoReduzido) {
    const len = stroke.getTotalLength();
    stroke.style.transition = "none";
    stroke.style.strokeDasharray = `${len} ${len}`;
    stroke.style.strokeDashoffset = String(len);
    if (areaPath) { areaPath.style.transition = "none"; areaPath.style.opacity = "0"; }
    void stroke.getBoundingClientRect(); // força reflow antes de animar
    stroke.style.transition = "stroke-dashoffset .9s cubic-bezier(.2, .8, .2, 1)";
    stroke.style.strokeDashoffset = "0";
    if (areaPath) {
      areaPath.style.transition = "opacity .8s ease .25s";
      areaPath.style.opacity = "1";
    }
  } else if (stroke) {
    stroke.style.strokeDasharray = "none";
    stroke.style.strokeDashoffset = "0";
    if (areaPath) areaPath.style.opacity = "1";
  }

  // Linha tracejada de média
  const media = values.reduce((s, v) => s + v, 0) / values.length;
  const avgEl = document.querySelector(".line-chart .avg-line");
  if (avgEl) {
    if (media > 0) {
      avgEl.hidden = false;
      // um valor v fica a bottom% = 20% + (v/máx)·70% do gráfico
      avgEl.style.bottom = `${(20 + (media / max) * 70).toFixed(2)}%`;
      const rot = avgEl.querySelector("span");
      if (rot) rot.textContent = `média ${Math.round(media)} un`;
    } else {
      avgEl.hidden = true;
    }
  }
}

/* Hover no gráfico de linha: guia + destaque + tooltip com detalhe */
const chartArea = document.querySelector(".line-chart .chart-area");

if (chartArea) {
  const guide = chartArea.querySelector(".guide-line");
  const hoverDot = document.createElement("div");
  hoverDot.className = "hover-dot";
  chartArea.appendChild(hoverDot);

  chartArea.addEventListener("mousemove", (e) => {
    if (!coordsGrafico.length) { esconderTooltip(); return; }
    const rect = chartArea.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const idx = Math.round(ratio * (coordsGrafico.length - 1));
    const [x, y] = coordsGrafico[idx];
    const px = (x / 700) * rect.width;
    const py = (y / 250) * rect.height; // viewBox tem 250 de altura
    if (guide) { guide.hidden = false; guide.style.left = `${px}px`; }
    hoverDot.style.left = `${px}px`;
    hoverDot.style.top = `${py}px`;
    hoverDot.style.opacity = "1";
    const point = (periodState.dia || [])[idx];
    mostrarTooltip(tooltipDetalhe(point, diaSemana(labelsGrafico[idx])), e);
  });

  chartArea.addEventListener("mouseleave", () => {
    if (guide) guide.hidden = true;
    hoverDot.style.opacity = "0";
    esconderTooltip();
  });
}

/** "4/11" → "ter, 4/11" */
function diaSemana(label) {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(String(label ?? ""));
  if (!m) return String(label ?? "");
  const agora = new Date();
  const d = new Date(agora.getFullYear(), Number(m[2]) - 1, Number(m[1]));
  const dias = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  return `${dias[d.getDay()]}, ${m[1]}/${m[2]}`;
}

/* ---------- Gráfico de barras empilhadas (dia / semana / mês) ---------- */
const periodState = { dia: [], semana: [], mes: [] };
let periodoAtivo = "dia";

const MESES_FULL = {
  jan: "janeiro", fev: "fevereiro", mar: "março", abr: "abril", mai: "maio",
  jun: "junho", jul: "julho", ago: "agosto", set: "setembro", out: "outubro",
  nov: "novembro", dez: "dezembro"
};

function legendaAmigavel(periodo, label) {
  if (periodo === "semana") return `semana de ${label}`;
  if (periodo === "mes") return MESES_FULL[String(label)] || label;
  return diaSemana(label);
}

function updatePeriodData(period, points) {
  if (!Array.isArray(points)) return;
  periodState[period] = points;
  if (periodoAtivo === period) renderPeriodChart(period);
}

function renderPeriodChart(period = "dia") {
  periodoAtivo = period;

  const descriptions = {
    dia: "Quantidade coletada em cada dia",
    semana: "Quantidade coletada em cada semana",
    mes: "Quantidade coletada em cada mês"
  };
  const emptyMessages = {
    dia: "Aguardando dados da esteira para exibir as coletas por dia.",
    semana: "Aguardando dados da esteira para exibir as coletas por semana.",
    mes: "Aguardando dados da esteira para exibir as coletas por mês."
  };

  const points = periodState[period] || [];
  const description = document.getElementById("period-description");
  const totalNum = document.querySelector("#period-total .num");
  const emptyEl = document.getElementById("period-empty");
  const barsWrap = document.getElementById("period-bars");

  if (description) description.textContent = descriptions[period];

  const values = points.map(point => Number(point.un)).filter(value => Number.isFinite(value));
  const total = values.reduce((sum, value) => sum + value, 0);
  animar(totalNum, values.length ? total : null);

  // Sem dados: colunas vazias + mensagem
  if (!points.length || !values.length) {
    if (emptyEl) {
      emptyEl.textContent = emptyMessages[period];
      emptyEl.hidden = false;
    }
    barsWrap?.classList.add("empty-bars");
    if (barsWrap) {
      barsWrap.innerHTML = Array.from({ length: 7 }, () =>
        '<div class="bar-col"><em></em><div class="bar-stack"></div><span>—</span></div>'
      ).join("");
    }
    return;
  }

  if (emptyEl) emptyEl.hidden = true;
  barsWrap?.classList.remove("empty-bars");

  const max = Math.max(...values, 1);
  let idxMax = -1, maior = -1;
  points.forEach((point, i) => {
    const v = Number(point.un);
    if (Number.isFinite(v) && v > maior) { maior = v; idxMax = i; }
  });

  if (barsWrap) {
    barsWrap.innerHTML = points.map((point, i) => {
      const un = Number(point.un);
      const papel = Number(point.papel || 0);
      const plastico = Number(point.plastico || 0);
      const vidro = Number(point.vidro || 0);
      const seg = (v, cls) => v > 0 ? `<i class="${cls}" style="height:${((v / max) * 100).toFixed(2)}%"></i>` : "";
      const destaque = i === idxMax ? " col-max" : "";
      return `<div class="bar-col${destaque}" data-idx="${i}">
        <em>${un > 0 ? un.toLocaleString("pt-BR") : ""}</em>
        <div class="bar-stack">${seg(papel, "pa")}${seg(plastico, "pl")}${seg(vidro, "v")}</div>
        <span>${escapeHtml(point.label ?? "—")}</span>
      </div>`;
    }).join("");
  }
}

document.querySelectorAll(".period-tab").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".period-tab").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    renderPeriodChart(button.dataset.period);
  });
});

/* Tooltip nas barras (delegado — funciona após reconstruir as colunas) */
const barsWrap = document.getElementById("period-bars");

if (barsWrap) {
  barsWrap.addEventListener("mousemove", (e) => {
    const col = e.target.closest(".bar-col");
    if (!col) { esconderTooltip(); return; }
    const point = (periodState[periodoAtivo] || [])[Number(col.dataset.idx)];
    if (!point || !Number.isFinite(Number(point.un))) { esconderTooltip(); return; }
    mostrarTooltip(tooltipDetalhe(point, legendaAmigavel(periodoAtivo, point.label)), e);
  });
  barsWrap.addEventListener("mouseleave", esconderTooltip);
}

/* ---------- Histórico: filtro, ordenação e renderização ---------- */
const filterSelect = document.querySelector(".filter-select");
let registrosAtuais = [];
let filtroAtual = "todos";
const sortState = { key: null, dir: 1 };

const NOMES_FILTRO = { papel: "Papel", plastico: "Plástico", vidro: "Vidro" };

function irParaMaterial(mat) {
  if (filterSelect && NOMES_FILTRO[mat]) {
    filterSelect.value = mat;
    filtroAtual = mat;
    renderRegistros();
  }
  irParaSecao("history");
}

filterSelect?.addEventListener("change", () => {
  filtroAtual = filterSelect.value;
  renderRegistros();
});

document.querySelectorAll("#history thead th[data-key]").forEach(th => {
  th.addEventListener("click", () => {
    const key = th.dataset.key;
    if (sortState.key === key) sortState.dir *= -1;
    else { sortState.key = key; sortState.dir = 1; }
    document.querySelectorAll("#history thead th").forEach(x => x.classList.remove("sorted-asc", "sorted-desc"));
    th.classList.add(sortState.dir === 1 ? "sorted-asc" : "sorted-desc");
    renderRegistros();
  });
});

function parseDataBr(valor) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(valor ?? ""));
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}

function valorOrdenacao(registro, key) {
  switch (key) {
    case "data": {
      const d = parseDataBr(registro.data);
      return d ? d.getTime() : 0;
    }
    case "quantidadeUn": return Number(registro.quantidadeUn ?? 0);
    case "horario":
    case "material":
    case "status":
    default: return String(registro[key] ?? "");
  }
}

function renderRegistros() {
  const tbody = document.querySelector("#history tbody");
  if (!tbody) return;

  const prefixo = filtroAtual === "plastico" ? "plást" : filtroAtual;
  const filtrados = filtroAtual === "todos"
    ? [...registrosAtuais]
    : registrosAtuais.filter(r => String(r.material || "").toLowerCase().startsWith(prefixo));

  if (sortState.key) {
    const { key, dir } = sortState;
    filtrados.sort((a, b) => {
      const va = valorOrdenacao(a, key);
      const vb = valorOrdenacao(b, key);
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb, "pt-BR") * dir;
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    });
  }

  if (!filtrados.length) {
    const msg = filtroAtual === "todos"
      ? "Nenhum registro disponível. Aguardando dados da esteira."
      : "Nenhum registro deste material no período exibido.";
    tbody.innerHTML = `<tr><td colspan="5" class="empty-history">${msg}</td></tr>`;
    return;
  }

  tbody.innerHTML = filtrados.map(item => {
    const material = String(item.material || "");
    const cls = classeMaterial(material);
    const quantity = item.quantidadeUn == null ? "—" : `${Number(item.quantidadeUn).toLocaleString("pt-BR")} un`;
    return `<tr>
      <td>${escapeHtml(item.data)}</td>
      <td>${escapeHtml(item.horario)}</td>
      <td><span class="material-dot ${cls}"></span> ${escapeHtml(item.material)}</td>
      <td><b>${quantity}</b></td>
      <td><span class="status">${escapeHtml(item.status)}</span></td>
    </tr>`;
  }).join("");
}

function updateHistory(data) {
  if (!data || !Array.isArray(data.registros)) return;
  const registros = data.registros;

  // Notificações + toast: quantas coletas novas chegaram desde a última sincronização
  if (registros.length) {
    const chaveNova = chaveRegistro(registros[0]);
    if (chaveTopoAnterior === null) {
      chaveTopoAnterior = chaveNova;
    } else if (chaveNova !== chaveTopoAnterior) {
      let n = 0;
      for (const r of registros) {
        if (chaveRegistro(r) === chaveTopoAnterior || n >= 20) break;
        n++;
      }
      if (n > 0) {
        novasColetas += n;
        renderNotif();
        notifBtn?.classList.remove("atualizou");
        void notifBtn?.offsetWidth;
        notifBtn?.classList.add("atualizou");

        // Toast com o resumo das coletas novas
        const novos = registros.slice(0, n);
        const porMaterial = {};
        novos.forEach(r => {
          porMaterial[r.material] = (porMaterial[r.material] || 0) + Number(r.quantidadeUn || 0);
        });
        const soma = Object.values(porMaterial).reduce((a, b) => a + b, 0);
        const partes = Object.entries(porMaterial).map(([m, v]) => `${m} +${v.toLocaleString("pt-BR")}`);
        toast(`+${soma.toLocaleString("pt-BR")} un coletadas`, partes.join(" · "));
      }
      chaveTopoAnterior = chaveNova;
    }
  }

  registrosAtuais = registros;
  renderRegistros();
}

/* ---------- Cards e legenda clicáveis ---------- */
const statCards = document.querySelectorAll(".cards .stat-card");
statCards.forEach((card, i) => {
  if (i === 0) {
    card.title = "Ver gráficos detalhados";
    card.addEventListener("click", () => irParaSecao("charts"));
  } else {
    const mat = ["papel", "plastico", "vidro"][i - 1];
    card.title = `Ver coletas de ${NOMES_FILTRO[mat]} no histórico`;
    card.addEventListener("click", () => irParaMaterial(mat));
  }
});

document.querySelectorAll(".legend > div[data-mat]").forEach(row => {
  const mat = row.dataset.mat;
  row.title = `Ver coletas de ${NOMES_FILTRO[mat] || mat} no histórico`;
  row.addEventListener("mouseenter", () => {
    const fatia = fatiasDonut.find(f => f.mat === mat);
    legendaAtiva(mat);
    if (fatia) centroDonut(fatia);
  });
  row.addEventListener("mouseleave", () => {
    legendaAtiva(null);
    centroDonut(null);
  });
  row.addEventListener("click", () => irParaMaterial(mat));
});

/* ---------- Integração com o backend ---------- */
// Consulta o endpoint de dashboard a cada 10 segundos.
// Local (XAMPP):   api/dashboard.php
// Produção (Vercel): api/dashboard  (serverless function)
// O backend lê o Supabase com a chave secreta (protegida no servidor).
// O navegador nunca tem acesso a nenhuma chave.

const API_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "api/dashboard.php"
    : "api/dashboard";

let falhasSeguidas = 0;

async function loadDashboard() {
  try {
    const res = await fetch(API_URL, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || typeof data !== "object" || data.erro) {
      throw new Error(data?.erro || "Resposta inválida");
    }
    falhasSeguidas = 0;
    updateDashboard(data);
    updateHistory(data);

    // Status de sincronização na barra lateral e nas seções
    const agora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setText(".system-status small", `Sincronizado às ${agora}`);
    setText("#monitor .update", `● Atualizado ${agora.slice(0, 5)}`);

    // Pequeno destaque no indicador de atualização
    const chip = document.querySelector("#dashboard .update");
    if (chip) { chip.classList.remove("flash"); void chip.offsetWidth; chip.classList.add("flash"); }
  } catch (err) {
    console.error("Não foi possível carregar os dados da esteira:", err);
    const update = document.querySelector("#dashboard .update");
    if (update) update.textContent = "Falha na sincronização — tentando novamente…";
    falhasSeguidas++;
    if (falhasSeguidas === 1) toast("Falha de conexão", "Sem resposta do servidor. Tentando de novo em 10s…");
  }
}

/* ---------- Inicialização ---------- */
aplicarTema(document.documentElement.dataset.theme === "light" ? "light" : "dark");
renderPeriodChart("dia");
loadDashboard();
setInterval(loadDashboard, 10000);
