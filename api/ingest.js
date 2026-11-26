/**
 * Trashbelt — endpoint de ingestão para o ESP32 (Vercel / Node.js).
 * POST /api/ingest
 *
 * Headers:
 *   x-device-token: <token do dispositivo>   (mesmo valor de TB_DEVICE_TOKEN)
 *   Content-Type: application/json
 * Body (contadores ACUMULADOS do firmware):
 *   { "total": 12, "papel": 5, "plastico": 4, "vidro": 3 }
 *
 * A chave secreta do Supabase fica SÓ aqui (variável de ambiente da Vercel).
 * O firmware nunca recebe sb_secret_... — apenas o token do dispositivo.
 *
 * Environment Variables necessárias na Vercel:
 *   SUPABASE_URL, SUPABASE_SECRET_KEY, TB_DEVICE_TOKEN
 */

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const DEVICE_TOKEN = process.env.TB_DEVICE_TOKEN;

const TB_TABLE = 'trash_belt_status';
const TB_TABLE_HISTORICO = 'trash_belt_historico';

function responder(res, status, objeto) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.json(objeto);
}

function inteiro(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

function tokenValido(recebido) {
  if (!DEVICE_TOKEN || typeof recebido !== 'string') return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(DEVICE_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function supabase(metodo, tabela, params = {}, corpo) {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error('Credenciais do Supabase não configuradas na Vercel.');
  }
  const qs = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) qs.set(chave, String(valor));
  const sufixo = qs.toString() ? '?' + qs.toString() : '';
  const url = `${SUPABASE_URL}/rest/v1/${tabela}${sufixo}`;

  const resposta = await fetch(url, {
    method: metodo,
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });

  if (!resposta.ok) {
    throw new Error(`Supabase ${tabela}: HTTP ${resposta.status}`);
  }
  const texto = await resposta.text();
  return texto ? JSON.parse(texto) : [];
}

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return responder(res, 405, { erro: 'Método não permitido' });
  }
  if (!DEVICE_TOKEN || !SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    console.error('[trashbelt/ingest] variáveis de ambiente faltando');
    return responder(res, 503, { erro: 'Servidor sem configuração.' });
  }
  if (!tokenValido(req.headers['x-device-token'])) {
    return responder(res, 401, { erro: 'Token de dispositivo inválido.' });
  }

  let corpo = req.body;
  if (typeof corpo === 'string') {
    try { corpo = JSON.parse(corpo); } catch (_) { corpo = null; }
  }
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
    return responder(res, 400, { erro: 'JSON esperado.' });
  }

  const total = inteiro(corpo.total);
  const papel = inteiro(corpo.papel);
  const plastico = inteiro(corpo.plastico);
  const vidro = inteiro(corpo.vidro);
  if ([total, papel, plastico, vidro].some(v => v === null)) {
    return responder(res, 400, { erro: 'Contadores inválidos (use inteiros >= 0).' });
  }

  try {
    const linhas = await supabase('GET', TB_TABLE, {
      select: 'id,total,papel,plastico,vidro',
      id: 'eq.1',
      limit: 1,
    });
    const anterior = Array.isArray(linhas) && linhas[0] ? linhas[0] : null;

    // O firmware manda totais acumulados. O histórico guarda só o incremento.
    const delta = (atual, antes) => {
      if (!antes) return atual;
      return atual > antes ? atual - antes : 0; // ZERAR => sem evento negativo
    };
    const papelNovo = delta(papel, inteiro(anterior && anterior.papel));
    const plasticoNovo = delta(plastico, inteiro(anterior && anterior.plastico));
    const vidroNovo = delta(vidro, inteiro(anterior && anterior.vidro));

    const agora = new Date().toISOString();
    const estado = {
      id: 1,
      total,
      papel,
      plastico,
      vidro,
      updated_at: agora,
    };

    const gravado = await supabase('PATCH', TB_TABLE, { id: 'eq.1' }, estado);
    if (!Array.isArray(gravado) || gravado.length === 0) {
      // Linha id=1 ainda não existe (banco recém-criado)
      await supabase('POST', TB_TABLE, {}, estado);
    }

    if (papelNovo + plasticoNovo + vidroNovo > 0) {
      await supabase('POST', TB_TABLE_HISTORICO, {}, {
        evento_em: agora,
        papel: papelNovo,
        plastico: plasticoNovo,
        vidro: vidroNovo,
      });
    }

    return responder(res, 200, {
      ok: true,
      recebido: { total, papel, plastico, vidro },
      registradoAgora: { papel: papelNovo, plastico: plasticoNovo, vidro: vidroNovo },
    });
  } catch (err) {
    console.error('[trashbelt/ingest]', err.message);
    return responder(res, 502, { erro: 'Não foi possível gravar no banco.' });
  }
};
