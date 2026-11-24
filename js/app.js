/* =====================================================================
   Trashbelt — Frontend (páginas separadas, design limpo)
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
  if (meta) meta.setAttribute("content", tema === "light" ? "#f8fafc" : "#0f172a");
  try { localStorage.setItem("trashbelt-tema", tema); } catch (e) { }
}

aplicarTema(document.documentElement.dataset.theme === "light" ? "light" : "dark");

/* ---------- Tooltip flutuante ---------- */
const tooltip = document.getElementById("tooltip");
function moverTooltip(e) {
  if (!tooltip || !tooltip.classList.contains("visible")) return;
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
  tooltip.classList.add("visible");
  tooltip.style.display = "block";
  moverTooltip(e);
}
function esconderTooltip() {
  if (!tooltip) return;
  tooltip.classList.remove("visible");
  tooltip.style.display = "none";
}

/** Tooltip com total + detalhamento por material */
function tooltipDetalhe(point, legenda) {
  const total = Number(point?.un || 0);
  const partes = [
    ["#3b82f6", "Papel", Number(point?.papel || 0)],
    ["#10b981", "Plástico", Number(point?.plastico || 0)],
    ["#f59e0b", "Vidro", Number(point?.vidro || 0)],
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
function toast(titulo, corpo, tipo = "success") {
  if (!toastsEl) return;
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `
    <div class="toast-icon ${tipo}">
      <svg class="icon"><use href="#i-reciclar"/></svg>
    </div>
    <div class="toast-content"><b>${escapeHtml(titulo)}</b><small>${escapeHtml(corpo)}</small></div>
    <div class="toast-close" onclick="fecharToast(this.parentElement)">×</div>`;
  t.addEventListener("click", () => fecharToast(t));
  toastsEl.appendChild(t);
  while (toastsEl.children.length > 3) toastsEl.firstElementChild.remove();
  t._timer = setTimeout(() => fecharToast(t), 5200);
}

/* ---------- Dados do backend ---------- */
// Descobre a raiz pelo <script>, então funciona tanto na raiz quanto em /pages/.
const APP_SCRIPT = document.currentScript || document.querySelector('script[src*="app.js"]');
const SITE_URL = APP_SCRIPT
    ? new URL(".", APP_SCRIPT.src).href.replace(/\/js\/$/, "/")
    : ((location.hostname === "localhost" || location.hostname === "127.0.0.1") ? "/Trashbelt/" : "/");
const API_URL = SITE_URL + ((location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "api/dashboard.php"
    : "api/dashboard");

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
    if (falhasSeguidas === 1) toast("Falha de conexão", "Sem resposta do servidor. Tentando de novo em 10s…", "error");
  }
}

/* ---------- Atualização por página ---------- */
function atualizarPagina(data) {
  if (!data) return;

  setText("#monitor-update", data.ultimaAtualizacao ? formatDateTime(data.ultimaAtualizacao) : "—");

  if (Array.isArray(data.registros)) {
    registrosAtuais = data.registros;
    renderHistorico();
  }

  if (paginaAtual === "dashboard") atualizarDashboard(data);
  else if (paginaAtual === "charts") atualizarCharts(data);
  else if (paginaAtual === "monitor") atualizarMonitor(data);
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

  // Rosca sincronizada com os cards de material
  animar(document.getElementById("donut-num"), total);
  const ring = document.getElementById("donut-ring");
  if (ring) {
    if (validTotal) {
      const a = ((papel || 0) / total) * 360;
      const b = a + ((plastico || 0) / total) * 360;
      const comEspaco = papel > 0 && plastico > 0 && vidro > 0;
      const gap = 1.4;
      ring.style.background = comEspaco
        ? "conic-gradient(" +
          "var(--papel) 0deg " + (a - gap).toFixed(2) + "deg," +
          "transparent " + (a - gap).toFixed(2) + "deg " + (a + gap).toFixed(2) + "deg," +
          "var(--plastico) " + (a + gap).toFixed(2) + "deg " + (b - gap).toFixed(2) + "deg," +
          "transparent " + (b - gap).toFixed(2) + "deg " + (b + gap).toFixed(2) + "deg," +
          "var(--vidro) " + (b + gap).toFixed(2) + "deg 360deg)"
        : "conic-gradient(" +
          "var(--papel) 0deg " + a.toFixed(2) + "deg," +
          "var(--plastico) " + a.toFixed(2) + "deg " + b.toFixed(2) + "deg," +
          "var(--vidro) " + b.toFixed(2) + "deg 360deg)";
    } else {
      ring.style.background = "conic-gradient(var(--border-light) 0deg 360deg)";
    }
  }

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

  ["papel", "plastico", "vidro"].forEach((mat, i) => {
    const fill = document.getElementById("cmp-" + mat);
    const num = document.getElementById("cmp-" + mat + "-num");
    const val = compareValues[i];
    if (fill) fill.style.width = val != null ? (val / max) * 100 + "%" : "0%";
    if (num) animar(num, val);
  });
}

function atualizarMonitor(data) {
  if (data.monitoramento) {
    const m = data.monitoramento;
    setText("#coleta-taxa", m.coletaUnHora != null ? Number(m.coletaUnHora).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " un/h" : "— un/h");
    atualizarSensor("dot-esteira", "sensor-esteira", m.esteira);
    atualizarSensor("dot-separacao", "sensor-separacao", m.separacao);
    atualizarSensor("dot-coleta", "sensor-coleta", m.coleta);
    atualizarSensor("dot-manutencao", "sensor-manutencao", m.manutencao);
  }
}

function atualizarSensor(dotId, valId, value) {
  const dot = document.getElementById(dotId);
  const val = document.getElementById(valId);
  if (val) val.textContent = value;
  if (dot) {
    const off = /não|deslig|inativo|parado|aguardando|sem dados/i.test(String(value));
    dot.classList.toggle("online", !off);
    dot.classList.toggle("offline", off);
  }
}

/* ---------- Histórico ---------- */
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
  if (n.includes("plást")) return "plastico";
  if (n.includes("vid")) return "vidro";
  return "papel";
}

function renderHistorico() {
  const tbody = document.getElementById("tbody-historico");
  if (!tbody) return;

  const prefixo = filtroHistorico === "plastico" ? "plást" : filtroHistorico;
  const filtrados = filtroHistorico === "todos"
    ? [...registrosAtuais]
    : registrosAtuais.filter(r => String(r.material || "").toLowerCase().startsWith(prefixo));

  const contador = document.getElementById("historico-contador");
  if (contador) {
    const total = registrosAtuais.length;
    contador.textContent = filtroHistorico === "todos"
      ? total + (total === 1 ? " registro" : " registros")
      : filtrados.length + " de " + total + " registros";
  }

  if (sortState.key) {
    const { key, dir } = sortState;
    filtrados.sort((a, b) => {
      const va = valorOrdenacao(a, key);
      const vb = valorOrdenacao(b, key);
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb, "pt-BR") * dir;
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    });
  }

  document.querySelectorAll("th").forEach(th => th.classList.remove("sorted"));
  const activeTh = document.querySelector('th[data-key="' + sortState.key + '"]');
  if (activeTh) activeTh.classList.add("sorted");

  if (!filtrados.length) {
    const msg = filtroHistorico === "todos"
      ? "Nenhum registro disponível. Aguardando dados da esteira."
      : "Nenhum registro deste material.";
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state"><p>${escapeHtml(msg)}</p></td></tr>`;
    return;
  }

  tbody.innerHTML = filtrados.map(item => {
    const material = String(item.material || "");
    const cls = classeMaterial(material);
    const quantity = item.quantidadeUn == null ? "—" : Number(item.quantidadeUn).toLocaleString("pt-BR") + " un";
    return `<tr>
      <td>${escapeHtml(item.data)}</td>
      <td>${escapeHtml(item.horario)}</td>
      <td class="material-cell"><div class="material-dot ${cls}"></div>${escapeHtml(item.material)}</td>
      <td><b>${quantity}</b></td>
      <td><span class="status-badge">${escapeHtml(item.status)}</span></td>
    </tr>`;
  }).join("");
}

/* ---------- Gráfico de linha (dashboard) ---------- */
let coordsGrafico = [];
let labelsGrafico = [];
let linePoints = [];
let dimGrafico = { w: 700, h: 200 };

/** No celular, "17/11" vira "17": os 7 rótulos passam a caber sem se sobrepor. */
const consultaMobile = typeof window.matchMedia === "function"
  ? window.matchMedia("(max-width: 640px)")
  : null;

function rotuloEixoX(label) {
  const texto = String(label ?? "—");
  if (!consultaMobile || !consultaMobile.matches) return texto;
  const soDia = /^(\d{1,2})\/\d{1,2}$/.exec(texto);
  return soDia ? soDia[1] : texto;
}

function aplicarRotulosEixoX() {
  const visiveis = document.querySelectorAll(".x-labels span");
  if (!visiveis.length) return;
  const pontos = linePoints.slice(-visiveis.length);
  visiveis.forEach((el, i) => {
    el.textContent = pontos[i] ? rotuloEixoX(pontos[i].label ?? "—") : "—";
  });
}

// Recalcula rótulos e geometria ao girar o celular ou redimensionar a janela
let timerRedimensionar = 0;
function aoRedimensionar() {
  clearTimeout(timerRedimensionar);
  timerRedimensionar = setTimeout(() => {
    if (linePoints.length) updateDailyChart(linePoints);
    else aplicarRotulosEixoX();
  }, 80);
}
window.addEventListener("resize", aoRedimensionar, { passive: true });
window.addEventListener("orientationchange", aoRedimensionar, { passive: true });
if (consultaMobile) {
  if (typeof consultaMobile.addEventListener === "function") {
    consultaMobile.addEventListener("change", aoRedimensionar);
  } else if (typeof consultaMobile.addListener === "function") {
    consultaMobile.addListener(aoRedimensionar); // Safari antigo
  }
}

// No toque, fecha o tooltip ao tocar fora dos gráficos
document.addEventListener("touchstart", (e) => {
  const alvo = e.target && e.target.closest ? e.target.closest(".bar-column, .chart-plot") : null;
  if (!alvo) esconderTooltip();
}, { passive: true });

/** Curva suave (smoothstep): os pontos de controle ficam na mesma altura das
 *  pontas, então arredonda a subida sem passar do zero nem virar degrau. */
function caminhoSuave(pts) {
  if (!pts.length) return "";
  let d = "M" + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const meio = ((x0 + x1) / 2).toFixed(1);
    d += " C" + meio + " " + y0.toFixed(1)
       + " " + meio + " " + y1.toFixed(1)
       + " " + x1.toFixed(1) + " " + y1.toFixed(1);
  }
  return d;
}

function updateDailyChart(points) {
  linePoints = points;
  labelsGrafico = points.map(p => p.label ?? "—");
  aplicarRotulosEixoX();

  const values = points.map(p => Number(p.un || 0));
  if (!values.length) return;
  const max = Math.max(...values, 1);
  const topo = niceMax(max);

  const ySpans = document.querySelectorAll(".y-labels span");
  [1, .75, .5, .25].forEach((f, i) => {
    if (ySpans[i]) ySpans[i].textContent = Math.round(topo * f).toLocaleString("pt-BR");
  });

  const svg = document.querySelector(".line-chart-wrap svg");
  if (!svg) return;
  const plot = document.querySelector(".chart-plot");
  const rect = plot ? plot.getBoundingClientRect() : null;
  // viewBox com o tamanho real do painel: círculos redondos e texto legível no celular
  const width = rect && rect.width > 10 ? Math.round(rect.width) : 700;
  const height = rect && rect.height > 10 ? Math.round(rect.height) : 200;
  dimGrafico = { w: width, h: height };
  svg.setAttribute("viewBox", "0 0 " + width + " " + height);

  const mobile = consultaMobile && consultaMobile.matches;
  coordsGrafico = values.map((v, i) => {
    const x = values.length === 1 ? width / 2 : (i / (values.length - 1)) * width;
    const y = height - (v / topo) * (height - 25);
    return [x, y];
  });
  const linha = caminhoSuave(coordsGrafico);
  const paths = svg.querySelectorAll("path");
  if (paths[0]) paths[0].setAttribute("d", linha + " L" + width + " " + height + " L0 " + height + "Z");
  if (paths[1]) paths[1].setAttribute("d", linha);

  const circlesGroup = document.getElementById("line-circles");
  if (circlesGroup) {
    circlesGroup.innerHTML = "";
    let idxMax = -1, maior = -1;
    values.forEach((v, i) => { if (v > maior) { maior = v; idxMax = i; } });
    coordsGrafico.forEach(([x, y], i) => {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", x);
      c.setAttribute("cy", y);
      c.setAttribute("r", i === idxMax ? (mobile ? 6 : 8) : (mobile ? 4 : 6));
      c.style.fill = i === idxMax ? "var(--success)" : "var(--bg-panel)";
      c.style.stroke = i === idxMax ? "var(--success)" : "var(--primary)";
      c.setAttribute("stroke-width", mobile ? 2 : (i === idxMax ? 3 : 2));
      c.setAttribute("class", i === idxMax ? "max-dot" : "");
      circlesGroup.appendChild(c);
    });

    if (idxMax >= 0 && maior > 0) {
      const [mx, my] = coordsGrafico[idxMax];
      const rotulo = document.createElementNS("http://www.w3.org/2000/svg", "text");
      rotulo.setAttribute("x", mx.toFixed(1));
      rotulo.setAttribute("y", (my - (mobile ? 12 : 16)).toFixed(1));
      rotulo.setAttribute("text-anchor", mx < 30 ? "start" : (mx > width - 30 ? "end" : "middle"));
      rotulo.setAttribute("class", "max-label");
      rotulo.textContent = maior.toLocaleString("pt-BR") + " un";
      circlesGroup.appendChild(rotulo);
    }
  }

  const media = values.reduce((s, v) => s + v, 0) / values.length;
  const avgEl = document.getElementById("avg-line");
  if (avgEl) {
    if (media > 0) {
      avgEl.hidden = false;
      avgEl.style.display = "block";
      avgEl.style.bottom = ((media / topo) * 100).toFixed(2) + "%";
      const rot = avgEl.querySelector("span");
      if (rot) rot.textContent = "média " + Math.round(media) + " un";
    } else {
      avgEl.hidden = true;
      avgEl.style.display = "none";
    }
  }

  const chartPlot = document.querySelector(".chart-plot");
  if (chartPlot && !chartPlot._listener) {
    const guide = document.createElement("div");
    guide.style.cssText = "position:absolute;top:0;bottom:0;width:1px;border-left:1px dashed var(--primary);pointer-events:none;z-index:4;display:none";
    chartPlot.appendChild(guide);

    const hoverDot = document.createElement("div");
    hoverDot.style.cssText = "position:absolute;width:11px;height:11px;border-radius:50%;background:var(--primary);border:2px solid var(--bg-panel);transform:translate(-50%,-50%);opacity:0;transition:opacity .15s ease;pointer-events:none;z-index:6";
    chartPlot.appendChild(hoverDot);
    chartPlot._listener = true;

    const mostrarPonto = (clientX, clientY, origem) => {
      if (!coordsGrafico.length) { esconderTooltip(); return; }
      const rect = chartPlot.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const idx = Math.round(ratio * (coordsGrafico.length - 1));
      const [x, y] = coordsGrafico[idx];
      const px = (x / dimGrafico.w) * rect.width;
      const py = (y / dimGrafico.h) * rect.height;
      guide.style.display = "block";
      guide.style.left = px + "px";
      hoverDot.style.left = px + "px";
      hoverDot.style.top = py + "px";
      hoverDot.style.opacity = "1";
      mostrarTooltip(
        tooltipDetalhe(linePoints[idx], diaSemana(labelsGrafico[idx])),
        origem || { clientX, clientY }
      );
    };
    const esconderPonto = () => {
      guide.style.display = "none";
      hoverDot.style.opacity = "0";
      esconderTooltip();
    };
    const aoTocar = (e) => {
      const t = e.touches && e.touches[0];
      if (t) mostrarPonto(t.clientX, t.clientY, { clientX: t.clientX, clientY: t.clientY });
    };
    chartPlot.addEventListener("mousemove", (e) => mostrarPonto(e.clientX, e.clientY, e));
    chartPlot.addEventListener("mouseleave", esconderPonto);
    chartPlot.addEventListener("touchstart", aoTocar, { passive: true });
    chartPlot.addEventListener("touchmove", aoTocar, { passive: true });
    chartPlot.addEventListener("touchend", esconderPonto, { passive: true });
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

/* ---------- Barras empilhadas ---------- */
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
  if (description) description.textContent = descs[period] || "";

  const values = points.map(p => Number(p.un)).filter(v => Number.isFinite(v));
  const total = values.reduce((s, v) => s + v, 0);
  if (totalNum) animar(totalNum, values.length ? total : null);

  if (!points.length || !values.length) {
    if (emptyEl) { emptyEl.textContent = "Aguardando dados da esteira para exibir as coletas."; emptyEl.style.display = "block"; }
    if (barsWrap) {
      barsWrap.innerHTML = Array.from({ length: 7 }, () =>
        '<div class="bar-column"><div class="bar-value">—</div><div class="bar-stack"></div><div class="bar-label">—</div></div>'
      ).join("");
    }
    return;
  }

  if (emptyEl) emptyEl.style.display = "none";

  const max = Math.max(...values, 1);
  let idxMax = -1, maior = -1;
  points.forEach((p, i) => { const v = Number(p.un); if (Number.isFinite(v) && v > maior) { maior = v; idxMax = i; } });

  if (barsWrap) {
    barsWrap.innerHTML = points.map((point, i) => {
      const un = Number(point.un);
      const papel = Number(point.papel || 0);
      const plastico = Number(point.plastico || 0);
      const vidro = Number(point.vidro || 0);
      const seg = (v, cls) => v > 0
        ? `<div class="bar-segment ${cls}" style="height:${((v / max) * 100).toFixed(2)}%"></div>`
        : "";
      const miolo = un > 0
        ? seg(papel, "papel") + seg(plastico, "plastico") + seg(vidro, "vidro")
        : '<div class="bar-segment bar-zero"></div>';
      const destaque = i === idxMax ? " bar-column-max" : "";
      return `<div class="bar-column${destaque}" style="cursor:crosshair"
          onmouseover="mostrarTooltipBarras(this, ${i}, '${period}')" onmouseout="esconderTooltip()"
          onclick="event.stopPropagation(); mostrarTooltipBarras(this, ${i}, '${period}')">
        <div class="bar-value">${un.toLocaleString("pt-BR")}</div>
        <div class="bar-stack">${miolo}</div>
        <div class="bar-label">${escapeHtml(point.label ?? "—")}</div>
      </div>`;
    }).join("");
  }
}

function mostrarTooltipBarras(el, idx, period) {
  const point = (periodState[period] || [])[idx];
  if (!point || !Number.isFinite(Number(point.un))) { esconderTooltip(); return; }
  const label = period === "semana" ? "semana de " + point.label : (period === "mes" ? (MESES_FULL[String(point.label)] || point.label) : diaSemana(point.label));
  const rect = el.getBoundingClientRect();
  mostrarTooltip(tooltipDetalhe(point, label), { clientX: rect.left + rect.width / 2, clientY: rect.top - 10 });
}

/* ---------- Filtro material ---------- */
function filtrarMaterial(mat) {
  location.href = "history.html?filtro=" + mat;
}

/* ---------- Inicialização ---------- */
const urlParams = new URLSearchParams(location.search);
if (urlParams.get("filtro")) {
  filtroHistorico = urlParams.get("filtro");
  const sel = document.getElementById("filtro-material");
  if (sel) sel.value = filtroHistorico;
}

function iniciar() {
  // A landing busca o resumo uma única vez no shell.js; o polling é só do painel.
  if (!["dashboard", "monitor", "charts", "history"].includes(paginaAtual)) return;
  loadDashboard();
  setInterval(loadDashboard, 10000);
}

iniciar();
