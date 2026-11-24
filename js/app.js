/* =====================================================================
   Trashbelt — Frontend (páginas separadas)
   Cada página carrega este mesmo JS, que detecta automaticamente em qual
   está e executa apenas os componentes relevantes.
   ===================================================================== */

"use strict";

/* ---------- Página atual ---------- */
const paginaAtual = (() => {
  const nome = location.pathname.split("/").pop();
  if (nome === "" || nome === "index.html") return "dashboard";
  return nome.replace(".html", "");
})();

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
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR") + " às " + date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Escala "redonda" para o topo do eixo Y */
function niceMax(v) {
  if (v <= 5) return 5;
  const ordem = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / (ordem / 2)) * (ordem / 2);
}

/** Anima um número dentro de um elemento */
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
  if (de === alvo) { el.textContent = alvo.toLocaleString("pt-BR"); return; }
  if (el._raf) cancelAnimationFrame(el._raf);
  const dur = 700;
  const t0 = performance.now();
  const frame = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(de + (alvo - de) * e).toLocaleString("pt-BR");
    if (p < 1) el._raf = requestAnimationFrame(frame);
    else el._raf = null;
  };
  el._raf = requestAnimationFrame(frame);
}

/* ---------- Tema claro/escuro ---------- */
function toggleTema() {
  const atual = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  aplicarTema(atual === "light" ? "dark" : "light");
}

function aplicarTema(tema) {
  document.documentElement.dataset.theme = tema;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", tema === "light" ? "#eef1f8" : "#070b16");
  try { localStorage.setItem("trashbelt-tema", tema); } catch (e) { }
}

aplicarTema(document.documentElement.dataset.theme === "light" ? "light" : "dark");

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
  tooltip.style.left = x + "px";
  tooltip.style.top = y + "px";
}
function mostrarTooltip(html, e) {
  if (!tooltip) return;
  tooltip.innerHTML = html;
  tooltip.hidden = false;
  moverTooltip(e);
}
function esconderTooltip() { if (tooltip) tooltip.hidden = true; }

/** Tooltip com total + detalhamento por material */
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

/* ---------- Dados do backend ---------- */
const API_URL = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "api/dashboard.php"
    : "api/dashboard";

let falhasSeguidas = 0;
let registrosAtuais = [];
let chaveTopoAnterior = null;

async function loadDashboard() {
  try {
    const res = await fetch(API_URL, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (!data || typeof data !== "object" || data.erro) {
      throw new Error(data?.erro || "Resposta inválida");
    }
    falhasSeguidas = 0;
    atualizarPagina(data);
  } catch (err) {
    console.error("Não foi possível carregar os dados da esteira:", err);
    falhasSeguidas++;
    if (falhasSeguidas === 1) toast("Falha de conexão", "Sem resposta do servidor. Tentando de novo em 10s…");
  }
}

/* ---------- Atualização por página ---------- */
function atualizarPagina(data) {
  if (!data) return;

  // Atualiza elementos comuns a todas as páginas
  setText("#monitor-update", data.ultimaAtualizacao ? formatDateTime(data.ultimaAtualizacao) : "—");

  // Atualiza histórico (comum a todas as páginas que o tenham)
  if (Array.isArray(data.registros)) {
    registrosAtuais = data.registros;
    renderHistorico();
  }

  // Página específica
  if (paginaAtual === "dashboard") {
    atualizarDashboard(data);
  } else if (paginaAtual === "charts") {
    atualizarCharts(data);
  } else if (paginaAtual === "monitor") {
    atualizarMonitor(data);
  }
}

function atualizarDashboard(data) {
  const total = data.totalUn == null ? null : Number(data.totalUn);
  const papel = data.papelUn == null ? null : Number(data.papelUn);
  const plastico = data.plasticoUn == null ? null : Number(data.plasticoUn);
  const vidro = data.vidroUn == null ? null : Number(data.vidroUn);
  const meta = data.metaMensalUn == null ? null : Number(data.metaMensalUn);

  animar(document.getElementById("num-total"), total);
  setText("#var-total", data.variacaoPercentual != null
    ? (data.variacaoPercentual >= 0 ? "↗ " : "↘ ") + Number(data.variacaoPercentual).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%"
    : "—");
  animar(document.getElementById("num-papel"), papel);
  animar(document.getElementById("num-plastico"), plastico);
  animar(document.getElementById("num-vidro"), vidro);

  setText("#meta-texto", meta != null ? "Meta mensal: " + meta.toLocaleString("pt-BR") + " un" : "Meta mensal: —");
  const progress = document.getElementById("progress-bar");
  if (progress) progress.style.width = meta > 0 && total != null ? Math.min(100, (total / meta) * 100) + "%" : "0%";

  const validTotal = total != null && total > 0;
  const percentages = validTotal ? [papel, plastico, vidro].map(v => v == null ? 0 : (v / total) * 100) : [0, 0, 0];
  setText("#pct-papel", validTotal ? percentages[0].toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "% do total" : "Aguardando dados");
  setText("#pct-plastico", validTotal ? percentages[1].toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "% do total" : "Aguardando dados");
  setText("#pct-vidro", validTotal ? percentages[2].toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "% do total" : "Aguardando dados");

  setText("#leg-papel", validTotal ? percentages[0].toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%" : "—");
  setText("#leg-plastico", validTotal ? percentages[1].toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%" : "—");
  setText("#leg-vidro", validTotal ? percentages[2].toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%" : "—");

  const donut = document.querySelector(".donut");
  if (donut) {
    donut.style.background = validTotal
      ? `conic-gradient(#3157c8 0 ${percentages[0]}%, #35b991 ${percentages[0]}% ${percentages[0] + percentages[1]}%, #efb45e ${percentages[0] + percentages[1]}% 100%)`
      : "conic-gradient(var(--donut-empty) 0 100%)";
  }
  setText("#donut-num", validTotal ? total : "—");

  // Gráfico de linha
  if (Array.isArray(data.coletaPorDia)) {
    updateDailyChart(data.coletaPorDia);
    updateBarras("dia", data.coletaPorDia);
  }
}

function atualizarCharts(data) {
  if (Array.isArray(data.coletaPorDia)) updateBarras("dia", data.coletaPorDia);
  if (Array.isArray(data.coletaPorSemana)) updateBarras("semana", data.coletaPorSemana);
  if (Array.isArray(data.coletaPorMes)) updateBarras("mes", data.coletaPorMes);

  const papel = data.papelUn == null ? null : Number(data.papelUn);
  const plastico = data.plasticoUn == null ? null : Number(data.plasticoUn);
  const vidro = data.vidroUn == null ? null : Number(data.vidroUn);
  const compareValues = [papel, plastico, vidro];
  const validValues = compareValues.filter(v => v != null && !Number.isNaN(v));
  const max = Math.max(...validValues, 1);

  const cmpPapel = document.getElementById("cmp-papel");
  const cmpPlastico = document.getElementById("cmp-plastico");
  const cmpVidro = document.getElementById("cmp-vidro");
  const cmpPapelNum = document.getElementById("cmp-papel-num");
  const cmpPlasticoNum = document.getElementById("cmp-plastico-num");
  const cmpVidroNum = document.getElementById("cmp-vidro-num");

  if (cmpPapel) cmpPapel.style.width = papel != null ? (papel / max) * 100 + "%" : "0%";
  if (cmpPlastico) cmpPlastico.style.width = plastico != null ? (plastico / max) * 100 + "%" : "0%";
  if (cmpVidro) cmpVidro.style.width = vidro != null ? (vidro / max) * 100 + "%" : "0%";
  if (cmpPapelNum) animar(cmpPapelNum, papel);
  if (cmpPlasticoNum) animar(cmpPlasticoNum, plastico);
  if (cmpVidroNum) animar(cmpVidroNum, vidro);
}

function atualizarMonitor(data) {
  if (data.monitoramento) {
    const m = data.monitoramento;
    setText("#coleta-taxa", m.coletaUnHora != null ? Number(m.coletaUnHora).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " un/h" : "— un/h");
    atualizarSensor("sensor-esteira", m.esteira);
    atualizarSensor("sensor-separacao", m.separacao);
    atualizarSensor("sensor-coleta", m.coleta);
    atualizarSensor("sensor-manutencao", m.manutencao);
  }
}

function atualizarSensor(id, value) {
  const el = document.getElementById(id);
  if (!el || value === undefined || value === null) return;
  el.textContent = value;
  const dot = el.parentElement.querySelector("i");
  const off = /não|deslig|inativo|parado|aguardando|sem dados/i.test(String(value));
  if (dot) dot.classList.toggle("off", off);
}

/* ---------- Histórico (comum) ---------- */
let filtroHistorico = "todos";
let sortState = { key: null, dir: 1 };

function filtrarHistorico(filtro) {
  filtroHistorico = filtro;
  renderHistorico();
}

function ordenar(key) {
  if (sortState.key === key) sortState.dir *= -1;
  else { sortState.key = key; sortState.dir = 1; }
  renderHistorico();
}

function parseDataBr(valor) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(valor ?? ""));
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}

function valorOrdenacao(registro, key) {
  switch (key) {
    case "data": { const d = parseDataBr(registro.data); return d ? d.getTime() : 0; }
    case "quantidadeUn": return Number(registro.quantidadeUn ?? 0);
    default: return String(registro[key] ?? "");
  }
}

function classeMaterial(nome) {
  const n = String(nome || "").toLowerCase();
  if (n.includes("plást")) return "plastic";
  if (n.includes("vid")) return "glass";
  return "paper";
}

function renderHistorico() {
  const tbody = document.getElementById("tbody-historico");
  if (!tbody) return;

  const prefixo = filtroHistorico === "plastico" ? "plást" : filtroHistorico;
  const filtrados = filtroHistorico === "todos"
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
    const msg = filtroHistorico === "todos"
      ? "Nenhum registro disponível. Aguardando dados da esteira."
      : "Nenhum registro deste material.";
    tbody.innerHTML = `<tr><td colspan="5" class="empty-history">${msg}</td></tr>`;
    return;
  }

  tbody.innerHTML = filtrados.map(item => {
    const material = String(item.material || "");
    const cls = classeMaterial(material);
    const quantity = item.quantidadeUn == null ? "—" : Number(item.quantidadeUn).toLocaleString("pt-BR") + " un";
    return `<tr>
      <td>${escapeHtml(item.data)}</td>
      <td>${escapeHtml(item.horario)}</td>
      <td><span class="material-dot ${cls}"></span> ${escapeHtml(item.material)}</td>
      <td><b>${quantity}</b></td>
      <td><span class="status">${escapeHtml(item.status)}</span></td>
    </tr>`;
  }).join("");
}

/* ---------- Gráfico de linha (dashboard) ---------- */
let coordsGrafico = [];
let labelsGrafico = [];

function caminhoSuave(pts) {
  if (pts.length < 2) return pts.length ? "M" + pts[0][0] + " " + pts[0][1] : "";
  let d = "M" + pts[0][0] + " " + pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += " C" + c1x.toFixed(1) + " " + c1y.toFixed(1) + ", " + c2x.toFixed(1) + " " + c2y.toFixed(1) + " " + p2[0] + " " + p2[1];
  }
  return d;
}

function updateDailyChart(points) {
  labelsGrafico = points.map(p => p.label ?? "—");
  const labels = document.querySelectorAll(".x-labels span");
  points.slice(-labels.length).forEach((point, i) => { if (labels[i]) labels[i].textContent = point.label ?? "—"; });

  const values = points.map(p => Number(p.un || 0));
  if (!values.length) return;
  const max = Math.max(...values, 1);
  const topo = niceMax(max);

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
  if (paths[0]) paths[0].setAttribute("d", linha + " L" + width + " " + height + " L0 " + height + "Z");
  if (paths[1]) paths[1].setAttribute("d", linha);

  const circles = document.getElementById("line-circles");
  if (circles) {
    circles.innerHTML = "";
    let idxMax = -1, maior = -1;
    values.forEach((v, i) => { if (v > maior) { maior = v; idxMax = i; } });
    coordsGrafico.forEach(([x, y], i) => {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", x);
      c.setAttribute("cy", y);
      c.setAttribute("r", i === idxMax ? 8 : 6);
      c.setAttribute("fill", "#0b1220");
      c.setAttribute("stroke", "#5f8bff");
      c.setAttribute("stroke-width", "4");
      if (i === idxMax) c.setAttribute("class", "max-dot");
      circles.appendChild(c);
    });
  }

  // Linha tracejada de média
  const media = values.reduce((s, v) => s + v, 0) / values.length;
  const avgEl = document.querySelector(".avg-line");
  if (avgEl) {
    if (media > 0) {
      avgEl.hidden = false;
      avgEl.style.bottom = (20 + (media / max) * 70).toFixed(2) + "%";
      const rot = avgEl.querySelector("span");
      if (rot) rot.textContent = "média " + Math.round(media) + " un";
    } else {
      avgEl.hidden = true;
    }
  }

  // Hover na linha
  const chartArea = document.querySelector(".chart-area");
  if (chartArea && !chartArea._listener) {
    const guide = chartArea.querySelector(".guide-line");
    const hoverDot = document.createElement("div");
    hoverDot.className = "hover-dot";
    chartArea.appendChild(hoverDot);
    chartArea._listener = true;

    chartArea.addEventListener("mousemove", (e) => {
      if (!coordsGrafico.length) { esconderTooltip(); return; }
      const rect = chartArea.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const idx = Math.round(ratio * (coordsGrafico.length - 1));
      const [x, y] = coordsGrafico[idx];
      const px = (x / 700) * rect.width;
      const py = (y / 250) * rect.height;
      if (guide) { guide.hidden = false; guide.style.left = px + "px"; }
      hoverDot.style.left = px + "px";
      hoverDot.style.top = py + "px";
      hoverDot.style.opacity = "1";
      const point = points[idx];
      mostrarTooltip(tooltipDetalhe(point, diaSemana(labelsGrafico[idx])), e);
    });
    chartArea.addEventListener("mouseleave", () => {
      if (guide) guide.hidden = true;
      hoverDot.style.opacity = "0";
      esconderTooltip();
    });
  }
}

function diaSemana(label) {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(String(label ?? ""));
  if (!m) return String(label ?? "");
  const agora = new Date();
  const d = new Date(agora.getFullYear(), Number(m[2]) - 1, Number(m[1]));
  const dias = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  return dias[d.getDay()] + ", " + m[1] + "/" + m[2];
}

/* ---------- Barras empilhadas (charts + dashboard) ---------- */
const periodState = { dia: [], semana: [], mes: [] };
let periodoAtivo = "dia";

const MESES_FULL = {
  jan: "janeiro", fev: "fevereiro", mar: "março", abr: "abril", mai: "maio",
  jun: "junho", jul: "julho", ago: "agosto", set: "setembro", out: "outubro",
  nov: "novembro", dez: "dezembro"
};

function setPeriod(period) {
  periodoAtivo = period;
  document.querySelectorAll(".period-tab").forEach(b => b.classList.remove("active"));
  const btn = document.querySelector('.period-tab[data-period="' + period + '"]');
  if (btn) btn.classList.add("active");
  renderBarras(period);
}

function updateBarras(period, points) {
  periodState[period] = points;
  if (periodoAtivo === period) renderBarras(period);
}

function renderBarras(period) {
  const points = periodState[period] || [];
  const description = document.getElementById("period-descricao");
  const totalNum = document.getElementById("period-total");
  const emptyEl = document.getElementById("period-empty");
  const barsWrap = document.getElementById("period-bars");

  const descs = { dia: "Quantidade coletada em cada dia", semana: "Quantidade coletada em cada semana", mes: "Quantidade coletada em cada mês" };
  const empties = { dia: "Aguardando dados da esteira para exibir as coletas por dia.", semana: "Aguardando dados da esteira para exibir as coletas por semana.", mes: "Aguardando dados da esteira para exibir as coletas por mês." };
  if (description) description.textContent = descs[period] || "";

  const values = points.map(p => Number(p.un)).filter(v => Number.isFinite(v));
  const total = values.reduce((s, v) => s + v, 0);
  if (totalNum) {
    const numEl = totalNum.querySelector(".num");
    if (numEl) animar(numEl, values.length ? total : null);
  }

  if (!points.length || !values.length) {
    if (emptyEl) { emptyEl.textContent = empties[period] || ""; emptyEl.hidden = false; }
    if (barsWrap) {
      barsWrap.classList.add("empty-bars");
      barsWrap.innerHTML = Array.from({ length: 7 }, () =>
        '<div><i style="height:0%"></i><span>—</span></div>'
      ).join("");
    }
    return;
  }

  if (emptyEl) emptyEl.hidden = true;
  if (barsWrap) barsWrap.classList.remove("empty-bars");

  const max = Math.max(...values, 1);
  let idxMax = -1, maior = -1;
  points.forEach((p, i) => { const v = Number(p.un); if (Number.isFinite(v) && v > maior) { maior = v; idxMax = i; } });

  if (barsWrap) {
    barsWrap.innerHTML = points.map((point, i) => {
      const un = Number(point.un);
      const papel = Number(point.papel || 0);
      const plastico = Number(point.plastico || 0);
      const vidro = Number(point.vidro || 0);
      const seg = (v, cls) => v > 0 ? '<i class="' + cls + '" style="height:' + ((v / max) * 100).toFixed(2) + '%"></i>' : "";
      const destaque = i === idxMax ? " col-max" : "";
      return '<div class="bar-col' + destaque + '" style="cursor:crosshair" onmouseover="mostrarTooltipBarras(this, ' + i + ', \'' + period + '\')" onmouseout="esconderTooltip()">' +
        '<em>' + (un > 0 ? un.toLocaleString("pt-BR") : "") + '</em>' +
        '<div class="bar-stack">' + seg(papel, "pa") + seg(plastico, "pl") + seg(vidro, "v") + '</div>' +
        '<span>' + escapeHtml(point.label ?? "—") + '</span>' +
        '</div>';
    }).join("");
  }
}

function mostrarTooltipBarras(el, idx, period) {
  const point = (periodState[period] || [])[idx];
  if (!point || !Number.isFinite(Number(point.un))) { esconderTooltip(); return; }
  const label = period === "semana" ? "semana de " + point.label : (period === "mes" ? (MESES_FULL[String(point.label)] || point.label) : diaSemana(point.label));
  mostrarTooltip(tooltipDetalhe(point, label), { clientX: el.getBoundingClientRect().left + el.offsetWidth / 2, clientY: el.getBoundingClientRect().top - 10 });
}

/* ---------- Filtro material (dashboard rosca) ---------- */
function filtrarMaterial(mat) {
  // Em páginas separadas, apenas navega para o histórico filtrado
  location.href = "history.html?filtro=" + mat;
}

/* ---------- Inicialização ---------- */
// Aplica filtro de material vindo da URL (ex: history.html?filtro=papel)
const urlParams = new URLSearchParams(location.search);
if (urlParams.get("filtro")) {
  filtroHistorico = urlParams.get("filtro");
  const sel = document.getElementById("filtro-material");
  if (sel) sel.value = filtroHistorico;
}

function iniciar() {
  loadDashboard();
  setInterval(loadDashboard, 10000);
}

// Script está no final do <body>, então DOM já está pronto
iniciar();
