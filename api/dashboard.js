/**
 * Trashbelt — Serverless function para Vercel (substitui api/dashboard.php)
 * GET /api/dashboard → JSON com dados do painel (totais, gráficos, histórico)
 *
 * Requisitos nas Environment Variables da Vercel:
 *   SUPABASE_URL      — https://<projeto>.supabase.co
 *   SUPABASE_SECRET_KEY — sb_secret_... (service role, só no servidor)
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const TB_TABLE = 'trash_belt_status';
const TB_TABLE_HISTORICO = 'trash_belt_historico';
const TB_TIMEZONE = 'America/Sao_Paulo';
const TB_META_MENSAL_UN = 150;
const MAX_LINHAS_BANCO = 500;
const MAX_REGISTROS = 40;

const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const NOMES_MATERIAL = { papel: 'Papel', plastico: 'Plástico', vidro: 'Vidro' };

function inteiro(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/* ---------- Supabase REST client ---------- */
function supabaseHeaders() {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error('Credenciais do Supabase não configuradas nas variáveis de ambiente da Vercel.');
  }
  return {
    apikey: SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function supabaseGet(table, params = {}) {
  const qs = new URLSearchParams();
  if (params.select) qs.set('select', params.select);
  if (params.order) qs.set('order', params.order);
  if (params.limit) qs.set('limit', String(params.limit));
  const url = `${SUPABASE_URL}/rest/v1/${table}?${qs.toString()}`;
  const r = await fetch(url, { headers: supabaseHeaders() });
  if (!r.ok) throw new Error(`Supabase ${table}: HTTP ${r.status}`);
  return await r.json();
}

/* ---------- Data / fuso ---------- */
/* Helper: formata partes de data no fuso São Paulo */
function partesFuso(date, parts) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TB_TIMEZONE,
    ...parts,
  }).formatToParts(date);
}

function valorParte(parts, type) {
  return parts.find(x => x.type === type).value;
}

/** Hoje no calendário de São Paulo, representado como meio-dia UTC. */
function hojeCalendario() {
  const p = partesFuso(new Date(), { year: 'numeric', month: '2-digit', day: '2-digit' });
  return new Date(Date.UTC(
    Number(valorParte(p, 'year')),
    Number(valorParte(p, 'month')) - 1,
    Number(valorParte(p, 'day')),
    12
  ));
}

/** Converte um instante para a data civil de São Paulo, sem virar o dia. */
function dataLocalComoUtc(date) {
  const p = partesFuso(date, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return new Date(Date.UTC(
    Number(valorParte(p, 'year')),
    Number(valorParte(p, 'month')) - 1,
    Number(valorParte(p, 'day')),
    12
  ));
}

/** Chaves de agrupamento — sempre calculadas no fuso do painel. */
function chaveDiaLocal(date) {
  return dataLocalComoUtc(date).toISOString().slice(0, 10); // YYYY-MM-DD
}

function chaveSemanaLocal(date) {
  const d = dataLocalComoUtc(date);
  const diaSemana = d.getUTCDay() || 7; // 1=seg ... 7=dom
  d.setUTCDate(d.getUTCDate() - (diaSemana - 1)); // segunda-feira da semana
  return d.toISOString().slice(0, 10);
}

function chaveMesLocal(date) {
  const d = dataLocalComoUtc(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Rótulos curtos, derivados da própria chave (sem depender do fuso). */
function rotuloDia(chave) {
  const d = new Date(chave + 'T12:00:00Z');
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

function rotuloSemana(chave) { return rotuloDia(chave); }

function rotuloMes(chave) {
  return MESES_PT[Number(chave.slice(5)) - 1];
}

/* ---------- Agregações ---------- */
function agrupar(eventos, chaveFn) {
  const grupos = {};
  for (const e of eventos) {
    const local = new Date(e.evento_em);
    const chave = chaveFn(local);
    if (!grupos[chave]) grupos[chave] = { papel: 0, plastico: 0, vidro: 0 };
    grupos[chave].papel += e.papel || 0;
    grupos[chave].plastico += e.plastico || 0;
    grupos[chave].vidro += e.vidro || 0;
  }
  return grupos;
}

function somaGrupo(g) { return (g && g.papel ? g.papel : 0) + (g && g.plastico ? g.plastico : 0) + (g && g.vidro ? g.vidro : 0); }

function serieDiaria(eventos, dias = 7) {
  const grupos = agrupar(eventos, chaveDiaLocal);
  const hoje = hojeCalendario();
  const serie = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoje);
    d.setUTCDate(d.getUTCDate() - i);
    const chave = d.toISOString().slice(0, 10);
    const g = grupos[chave] || {};
    serie.push({
      label: rotuloDia(chave),
      un: somaGrupo(g),
      papel: g.papel || 0,
      plastico: g.plastico || 0,
      vidro: g.vidro || 0,
    });
  }
  return serie;
}

function serieSemanal(eventos, semanas = 5) {
  const grupos = agrupar(eventos, chaveSemanaLocal);
  const hoje = hojeCalendario();
  const diaSemana = hoje.getUTCDay() || 7;
  const segunda = new Date(hoje);
  segunda.setUTCDate(segunda.getUTCDate() - (diaSemana - 1));

  const serie = [];
  for (let i = semanas - 1; i >= 0; i--) {
    const d = new Date(segunda);
    d.setUTCDate(d.getUTCDate() - i * 7);
    const chave = d.toISOString().slice(0, 10); // segunda-feira da semana
    const g = grupos[chave] || {};
    serie.push({
      label: rotuloSemana(chave),
      un: somaGrupo(g),
      papel: g.papel || 0,
      plastico: g.plastico || 0,
      vidro: g.vidro || 0,
    });
  }
  return serie;
}

function serieMensal(eventos, meses = 6) {
  const grupos = agrupar(eventos, chaveMesLocal);
  const hoje = hojeCalendario();
  const serie = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - i, 1, 12));
    const chave = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const g = grupos[chave] || {};
    serie.push({
      label: rotuloMes(chave),
      un: somaGrupo(g),
      papel: g.papel || 0,
      plastico: g.plastico || 0,
      vidro: g.vidro || 0,
    });
  }
  return serie;
}

function variacaoMensal(eventos) {
  const grupos = agrupar(eventos, chaveMesLocal);
  const hoje = hojeCalendario();
  const atual = somaGrupo(grupos[chaveMesLocal(hoje)] || {});
  const mesAnterior = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1, 12));
  const anterior = somaGrupo(grupos[chaveMesLocal(mesAnterior)] || {});
  if (anterior <= 0) return null;
  return Math.round(((atual - anterior) / anterior) * 100 * 10) / 10;
}

function unidadesUltimas24h(eventos) {
  const corte = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let soma = 0;
  for (const e of eventos) {
    if (new Date(e.evento_em) >= corte) soma += (e.papel || 0) + (e.plastico || 0) + (e.vidro || 0);
  }
  return soma;
}

function gerarRegistros(eventos) {
  const registros = [];
  for (let i = eventos.length - 1; i >= 0; i--) {
    const e = eventos[i];
    const local = new Date(e.evento_em);
    const p = partesFuso(local, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    const dia = p.find(x => x.type === 'day').value;
    const mes = p.find(x => x.type === 'month').value;
    const ano = p.find(x => x.type === 'year').value;
    const hora = p.find(x => x.type === 'hour').value;
    const minuto = p.find(x => x.type === 'minute').value;
    const data = `${dia}/${mes}/${ano}`;
    const horario = `${hora}:${minuto}`;
    for (const [campo, nome] of Object.entries(NOMES_MATERIAL)) {
      if ((e[campo] || 0) <= 0) continue;
      registros.push({
        data,
        horario,
        material: nome,
        quantidadeUn: e[campo],
        status: 'Registrada',
      });
      if (registros.length >= MAX_REGISTROS) return registros;
    }
  }
  return registros;
}

function statusSensores(minutosDesdeLeitura) {
  if (minutosDesdeLeitura == null) return null;
  if (minutosDesdeLeitura < 15) {
    return { coletaUnHora: null, esteira: 'Operando', separacao: 'Ativa', coleta: 'Coletando', manutencao: 'Nenhuma pendência' };
  }
  if (minutosDesdeLeitura < 60 * 24) {
    return { coletaUnHora: null, esteira: 'Parada', separacao: 'Parada', coleta: 'Aguardando', manutencao: 'Nenhuma pendência' };
  }
  return { coletaUnHora: null, esteira: 'Inativa', separacao: 'Inativa', coleta: 'Inativa', manutencao: 'Aguardando revisão' };
}

/* ---------- Handler principal ---------- */
// CommonJS: funciona no runtime padrão do @vercel/node sem precisar de package.json.
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).setHeader('Allow', 'GET').setHeader('Content-Type', 'application/json');
    return res.json({ erro: 'Método não permitido' });
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');

  try {
    // Último estado da esteira
    const linhas = await supabaseGet(TB_TABLE, { select: '*', order: 'updated_at.desc.nullslast,id.desc', limit: 1 });
    const linha = Array.isArray(linhas) && linhas[0] ? linhas[0] : null;

    // Histórico de eventos
    const linhasHistorico = await supabaseGet(TB_TABLE_HISTORICO, { select: '*', order: 'evento_em.asc', limit: MAX_LINHAS_BANCO });
    const eventos = (Array.isArray(linhasHistorico) ? linhasHistorico : [])
      .map(r => ({
        evento_em: r.evento_em,
        papel: inteiro(r.papel) ?? 0,
        plastico: inteiro(r.plastico) ?? 0,
        vidro: inteiro(r.vidro) ?? 0,
      }))
      .sort((a, b) => new Date(a.evento_em) - new Date(b.evento_em));

    // Minutos desde última atualização
    let minutosDesdeLeitura = null;
    if (linha && linha.updated_at) {
      try {
        minutosDesdeLeitura = Math.floor((Date.now() - new Date(linha.updated_at).getTime()) / 60000);
      } catch (_) { minutosDesdeLeitura = null; }
    }
    const sensores = statusSensores(minutosDesdeLeitura);
    if (sensores) {
      sensores.coletaUnHora = Math.round(unidadesUltimas24h(eventos) / 24 * 10) / 10;
    }

    const payload = {
      totalUn: linha ? inteiro(linha.total) : null,
      papelUn: linha ? inteiro(linha.papel) : null,
      plasticoUn: linha ? inteiro(linha.plastico) : null,
      vidroUn: linha ? inteiro(linha.vidro) : null,
      metaMensalUn: TB_META_MENSAL_UN,
      variacaoPercentual: variacaoMensal(eventos),
      ultimaAtualizacao: linha && linha.updated_at ? linha.updated_at : null,
      monitoramento: sensores,
      coletaPorDia: serieDiaria(eventos),
      coletaPorSemana: serieSemanal(eventos),
      coletaPorMes: serieMensal(eventos),
      registros: gerarRegistros(eventos),
    };

    return res.status(200).json(payload);
  } catch (err) {
    console.error('[trashbelt/dashboard]', err.message);
    return res.status(502).json({ erro: 'Não foi possível obter os dados da esteira agora.' });
  }
}
