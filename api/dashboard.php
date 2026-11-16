<?php
/**
 * Endpoint do painel Trashbelt.
 * GET /api/dashboard.php → JSON no formato que o frontend (js/app.js) espera.
 *
 * Fonte dos dados (tudo no Supabase):
 * - trash_belt_status: linha única (id=1) com os totais acumulados da esteira
 *   (total, papel, plastico, vidro, updated_at);
 * - trash_belt_historico: um registro por evento de separação
 *   (evento_em, papel, plastico, vidro).
 *
 * Se a tabela de histórico ainda não existir, o backend usa um arquivo local
 * e migra automaticamente os eventos para o Supabase quando a tabela surgir.
 * Unidades: "un" (unidades), não kg.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

// Apenas GET
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    header('Allow: GET');
    echo json_encode(['erro' => 'Metodo nao permitido']);
    exit;
}

require __DIR__ . '/config.php';
require __DIR__ . '/supabase.php';

const TZ_BELT        = TB_TIMEZONE;
const TZ_UTC         = 'UTC';
const ARQUIVO_HISTORICO = 'trashbelt_historico.json';
const MAX_EVENTOS    = 2000;   // limite de segurança do histórico local
const MAX_LINHAS_BANCO = 500;  // quantos eventos buscar do Supabase
const MAX_REGISTROS  = 40;     // quantos registros o painel exibe

/** Nomes de exibição por material */
const NOMES_MATERIAL = ['papel' => 'Papel', 'plastico' => 'Plástico', 'vidro' => 'Vidro'];

/** Abreviações de mês em pt-BR */
const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Data/hora "agora" em UTC */
function agoraUtc(): DateTimeImmutable
{
    return new DateTimeImmutable('now', new DateTimeZone(TZ_UTC));
}

/** Fuso do painel */
function fusoPainel(): DateTimeZone
{
    return new DateTimeZone(TZ_BELT);
}

/** Inteiro seguro (null se não for numérico) */
function inteiro($valor): ?int
{
    if ((is_int($valor) || is_float($valor) || is_string($valor)) && is_numeric($valor)) {
        return (int) $valor;
    }
    return null;
}

/** Pasta de armazenamento local (histórico + cache) */
function pastaArmazenamento(): string
{
    if (!is_dir(TB_STORAGE_DIR)) {
        @mkdir(TB_STORAGE_DIR, 0775, true);
    }
    return TB_STORAGE_DIR;
}

// --------------------------------------------------------------------------
// Histórico local (modo fallback / migração)
// --------------------------------------------------------------------------

function carregarHistorico(string $arquivo): array
{
    if (!is_file($arquivo)) {
        return ['lastSeen' => null, 'eventos' => []];
    }
    $dados = json_decode((string) file_get_contents($arquivo), true);
    if (!is_array($dados)) {
        return ['lastSeen' => null, 'eventos' => []];
    }
    if (!isset($dados['lastSeen'])) $dados['lastSeen'] = null;
    if (!isset($dados['eventos']) || !is_array($dados['eventos'])) $dados['eventos'] = [];
    return $dados;
}

/** Salva o histórico local com bloqueio (evita duplicar evento em acessos simultâneos) */
function salvarHistorico(string $arquivo, array $historico): void
{
    $json = json_encode($historico, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return;
    }
    $fp = @fopen($arquivo, 'c');
    if ($fp === false) {
        return;
    }
    @flock($fp, LOCK_EX);
    @ftruncate($fp, 0);
    @fwrite($fp, $json);
    @flock($fp, LOCK_UN);
    @fclose($fp);
}

/** Converte a lista crua de eventos em [t=>DateTimeImmutable, papel, plastico, vidro] ordenada */
function normalizarEventos(array $cruas): array
{
    $limite = agoraUtc()->modify('-400 days');
    $agora  = agoraUtc();
    $lista  = [];
    foreach ($cruas as $e) {
        if (!is_array($e) || empty($e['t']) || !is_string($e['t'])) continue;
        try {
            $t = new DateTimeImmutable($e['t']);
        } catch (Exception) {
            continue;
        }
        if ($t < $limite || $t > $agora) continue;
        $lista[] = [
            't'        => $t,
            'papel'    => max(0, inteiro($e['papel'] ?? 0) ?? 0),
            'plastico' => max(0, inteiro($e['plastico'] ?? 0) ?? 0),
            'vidro'    => max(0, inteiro($e['vidro'] ?? 0) ?? 0),
        ];
    }
    usort($lista, static fn($a, $b) => $a['t'] <=> $b['t']);
    return $lista;
}

/** Estado numérico atual da linha de status */
function estadoAtual(?array $linha): ?array
{
    if ($linha === null) {
        return null;
    }
    return [
        'total'    => inteiro($linha['total'] ?? null) ?? 0,
        'papel'    => inteiro($linha['papel'] ?? null) ?? 0,
        'plastico' => inteiro($linha['plastico'] ?? null) ?? 0,
        'vidro'    => inteiro($linha['vidro'] ?? null) ?? 0,
    ];
}

/**
 * Modo ARQUIVO: mantém o histórico em disco.
 * Se o total do banco aumentou desde a última leitura, registra um evento.
 */
function sincronizarHistoricoArquivo(string $arquivo, ?array $linha): array
{
    $historico = carregarHistorico($arquivo);
    if ($linha === null) {
        return $historico;
    }

    $atual    = estadoAtual($linha);
    $anterior = $historico['lastSeen'];

    if (!is_array($anterior) || !isset($anterior['total']) || $atual['total'] < (int) $anterior['total']) {
        // Primeira leitura, ou o contador foi zerado/corrigido no banco
        $historico['lastSeen'] = $atual;
        salvarHistorico($arquivo, $historico);
        return $historico;
    }

    if ($atual['total'] > (int) $anterior['total']) {
        $historico['eventos'][] = [
            't'        => agoraUtc()->format(DateTimeInterface::ATOM),
            'papel'    => max(0, $atual['papel'] - (int) ($anterior['papel'] ?? 0)),
            'plastico' => max(0, $atual['plastico'] - (int) ($anterior['plastico'] ?? 0)),
            'vidro'    => max(0, $atual['vidro'] - (int) ($anterior['vidro'] ?? 0)),
        ];
        if (count($historico['eventos']) > MAX_EVENTOS) {
            $historico['eventos'] = array_slice($historico['eventos'], -MAX_EVENTOS);
        }
        $historico['lastSeen'] = $atual;
        salvarHistorico($arquivo, $historico);
    }

    return $historico;
}

/**
 * Verifica se a tabela de histórico existe (resultado em cache por 60s).
 */
function detectarTabelaHistorico(SupabaseClient $cliente): bool
{
    $cache = pastaArmazenamento() . '/deteccao_historico.json';
    if (is_file($cache)) {
        $j = json_decode((string) file_get_contents($cache), true);
        if (is_array($j) && isset($j['t'], $j['existe']) && (time() - (int) $j['t']) < 60) {
            return (bool) $j['existe'];
        }
    }
    try {
        $cliente->from(TB_TABLE_HISTORICO, ['select' => 'id', 'limit' => 1]);
        $existe = true;
    } catch (SupabaseException) {
        $existe = false;
    }
    @file_put_contents($cache, json_encode(['t' => time(), 'existe' => $existe]));
    return $existe;
}

/**
 * Modo BANCO: eventos vivem em trash_belt_historico.
 * - Migra o histórico local para o Supabase na primeira execução;
 * - Se o status avançou sem evento correspondente (ajuste manual no painel),
 *   registra o evento que falta.
 * Retorna a lista de eventos normalizada.
 */
function sincronizarHistoricoBanco(SupabaseClient $cliente, ?array $linha): array
{
    $arquivo    = pastaArmazenamento() . '/' . ARQUIVO_HISTORICO;
    $historico  = carregarHistorico($arquivo);
    $parametros = ['select' => '*', 'order' => 'evento_em.asc', 'limit' => MAX_LINHAS_BANCO];
    $linhasBanco = $cliente->from(TB_TABLE_HISTORICO, $parametros);

    // ---- Migração inicial: banco vazio + eventos locais → sobe tudo ----
    if (empty($linhasBanco) && !empty($historico['eventos'])) {
        $lote = [];
        foreach (normalizarEventos($historico['eventos']) as $e) {
            $lote[] = [
                'evento_em' => $e['t']->format(DateTimeInterface::ATOM),
                'papel'     => $e['papel'],
                'plastico'  => $e['plastico'],
                'vidro'     => $e['vidro'],
            ];
        }
        if ($lote) {
            $cliente->insert(TB_TABLE_HISTORICO, $lote);
            $historico['eventos'] = [];
            $historico['migrado'] = true;
            salvarHistorico($arquivo, $historico);
            $linhasBanco = $cliente->from(TB_TABLE_HISTORICO, $parametros);
        }
    }

    // ---- Evento faltante: soma dos eventos abaixo do total do estado ----
    // (cobre ajustes manuais no painel do Supabase sem evento correspondente)
    if ($linha !== null) {
        $atual    = estadoAtual($linha);
        $anterior = $historico['lastSeen'];

        $somaEventos = 0;
        foreach ((is_array($linhasBanco) ? $linhasBanco : []) as $e) {
            $somaEventos += (int) ($e['papel'] ?? 0) + (int) ($e['plastico'] ?? 0) + (int) ($e['vidro'] ?? 0);
        }
        $atingiuLimite = count((is_array($linhasBanco) ? $linhasBanco : [])) >= MAX_LINHAS_BANCO;

        if (!is_array($anterior) || !isset($anterior['total']) || $atual['total'] < (int) $anterior['total']) {
            // Primeira leitura, ou o contador foi zerado/corrigido no banco
            $historico['lastSeen'] = $atual;
            salvarHistorico($arquivo, $historico);
        } elseif (!$atingiuLimite && $somaEventos < $atual['total']) {
            // Falta registro: cria um evento com a diferença
            $faltante = [
                'evento_em' => !empty($linha['updated_at']) && is_string($linha['updated_at'])
                    ? $linha['updated_at']
                    : agoraUtc()->format(DateTimeInterface::ATOM),
                'papel'    => max(0, $atual['papel'] - array_sum(array_column($linhasBanco, 'papel'))),
                'plastico' => max(0, $atual['plastico'] - array_sum(array_column($linhasBanco, 'plastico'))),
                'vidro'    => max(0, $atual['vidro'] - array_sum(array_column($linhasBanco, 'vidro'))),
            ];
            if ($faltante['papel'] + $faltante['plastico'] + $faltante['vidro'] > 0) {
                $cliente->insert(TB_TABLE_HISTORICO, [$faltante]);
                $linhasBanco[] = $faltante;
            }
            $historico['lastSeen'] = $atual;
            salvarHistorico($arquivo, $historico);
        } else {
            $historico['lastSeen'] = $atual;
            salvarHistorico($arquivo, $historico);
        }
    }

    // ---- Converte linhas do banco para eventos ----
    $cruas = [];
    foreach ((is_array($linhasBanco) ? $linhasBanco : []) as $r) {
        if (!is_array($r)) continue;
        $cruas[] = [
            't'        => isset($r['evento_em']) && is_string($r['evento_em']) ? $r['evento_em'] : null,
            'papel'    => inteiro($r['papel'] ?? 0) ?? 0,
            'plastico' => inteiro($r['plastico'] ?? 0) ?? 0,
            'vidro'    => inteiro($r['vidro'] ?? 0) ?? 0,
        ];
    }
    return normalizarEventos($cruas);
}

// --------------------------------------------------------------------------
// Agregações para o painel
// --------------------------------------------------------------------------

function agrupar(array $eventos, string $formatoChave): array
{
    $grupos = [];
    foreach ($eventos as $e) {
        $local = $e['t']->setTimezone(fusoPainel());
        $chave = $local->format($formatoChave);
        foreach (['papel', 'plastico', 'vidro'] as $m) {
            $grupos[$chave][$m] = ($grupos[$chave][$m] ?? 0) + $e[$m];
        }
    }
    return $grupos;
}

function somaGrupo(array $grupo): int
{
    return ($grupo['papel'] ?? 0) + ($grupo['plastico'] ?? 0) + ($grupo['vidro'] ?? 0);
}

function serieDiaria(array $eventos, int $dias = 7): array
{
    $grupos = agrupar($eventos, 'Y-m-d');
    $hoje = agoraUtc()->setTimezone(fusoPainel());
    $serie = [];
    for ($i = $dias - 1; $i >= 0; $i--) {
        $d = $hoje->modify("-{$i} days");
        $g = $grupos[$d->format('Y-m-d')] ?? [];
        $serie[] = [
            'label'    => $d->format('j/n'),
            'un'       => somaGrupo($g),
            'papel'    => (int) ($g['papel'] ?? 0),
            'plastico' => (int) ($g['plastico'] ?? 0),
            'vidro'    => (int) ($g['vidro'] ?? 0),
        ];
    }
    return $serie;
}

function serieSemanal(array $eventos, int $semanas = 5): array
{
    $grupos = agrupar($eventos, 'o-W');
    $hoje = agoraUtc()->setTimezone(fusoPainel());
    $serie = [];
    for ($i = $semanas - 1; $i >= 0; $i--) {
        $segunda = $hoje->modify('monday this week')->modify("-{$i} weeks");
        $g = $grupos[$segunda->format('o-W')] ?? [];
        $serie[] = [
            'label'    => $segunda->format('j/n'),
            'un'       => somaGrupo($g),
            'papel'    => (int) ($g['papel'] ?? 0),
            'plastico' => (int) ($g['plastico'] ?? 0),
            'vidro'    => (int) ($g['vidro'] ?? 0),
        ];
    }
    return $serie;
}

function serieMensal(array $eventos, int $meses = 6): array
{
    $grupos = agrupar($eventos, 'Y-m');
    $hoje = agoraUtc()->setTimezone(fusoPainel());
    $serie = [];
    for ($i = $meses - 1; $i >= 0; $i--) {
        $d = $hoje->modify('first day of this month')->modify("-{$i} months");
        $g = $grupos[$d->format('Y-m')] ?? [];
        $serie[] = [
            'label'    => MESES_PT[(int) $d->format('n') - 1],
            'un'       => somaGrupo($g),
            'papel'    => (int) ($g['papel'] ?? 0),
            'plastico' => (int) ($g['plastico'] ?? 0),
            'vidro'    => (int) ($g['vidro'] ?? 0),
        ];
    }
    return $serie;
}

function variacaoMensal(array $eventos): ?float
{
    $grupos = agrupar($eventos, 'Y-m');
    $hoje = agoraUtc()->setTimezone(fusoPainel());
    $atual = somaGrupo($grupos[$hoje->format('Y-m')] ?? []);
    $anterior = somaGrupo($grupos[$hoje->modify('first day of previous month')->format('Y-m')] ?? []);
    if ($anterior <= 0) {
        return null;
    }
    return round((($atual - $anterior) / $anterior) * 100, 1);
}

function unidadesUltimas24h(array $eventos): int
{
    $corte = agoraUtc()->modify('-24 hours');
    $soma = 0;
    foreach ($eventos as $e) {
        if ($e['t'] >= $corte) {
            $soma += $e['papel'] + $e['plastico'] + $e['vidro'];
        }
    }
    return $soma;
}

function gerarRegistros(array $eventos): array
{
    $registros = [];
    foreach (array_reverse($eventos) as $e) {
        $local = $e['t']->setTimezone(fusoPainel());
        foreach (NOMES_MATERIAL as $campo => $nome) {
            if ($e[$campo] <= 0) continue;
            $registros[] = [
                'data'         => $local->format('d/m/Y'),
                'horario'      => $local->format('H:i'),
                'material'     => $nome,
                'quantidadeUn' => $e[$campo],
                'status'       => 'Registrada',
            ];
            if (count($registros) >= MAX_REGISTROS) {
                return $registros;
            }
        }
    }
    return $registros;
}

function statusSensores(?int $minutos): ?array
{
    if ($minutos === null) {
        return null;
    }
    if ($minutos < 15) {
        return [
            'coletaUnHora' => null,
            'esteira'      => 'Operando',
            'separacao'    => 'Ativa',
            'coleta'       => 'Coletando',
            'manutencao'   => 'Nenhuma pendência',
        ];
    }
    if ($minutos < 60 * 24) {
        return [
            'coletaUnHora' => null,
            'esteira'      => 'Parada',
            'separacao'    => 'Parada',
            'coleta'       => 'Aguardando',
            'manutencao'   => 'Nenhuma pendência',
        ];
    }
    return [
        'coletaUnHora' => null,
        'esteira'      => 'Inativa',
        'separacao'    => 'Inativa',
        'coleta'       => 'Inativa',
        'manutencao'   => 'Aguardando revisão',
    ];
}

// ---------- Cache ----------

$arquivoCache = pastaArmazenamento() . '/dashboard_cache.json';
if (TB_CACHE_TTL > 0 && is_file($arquivoCache)) {
    $idade = time() - (int) filemtime($arquivoCache);
    $cache = file_get_contents($arquivoCache);
    if ($idade < TB_CACHE_TTL && is_string($cache) && strlen($cache) > 2) {
        echo $cache;
        exit;
    }
}

try {
    $cliente = new SupabaseClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

    // Última leitura de estado da esteira
    $linhas = $cliente->from(TB_TABLE, [
        'select' => '*',
        'order'  => 'updated_at.desc.nullslast,id.desc',
        'limit'  => 1,
    ]);
    $linha = (is_array($linhas) && isset($linhas[0]) && is_array($linhas[0])) ? $linhas[0] : null;

    // Histórico: banco se disponível, arquivo como fallback
    $eventos = detectarTabelaHistorico($cliente)
        ? sincronizarHistoricoBanco($cliente, $linha)
        : (function () use ($linha): array {
            $arquivoHistorico = pastaArmazenamento() . '/' . ARQUIVO_HISTORICO;
            $historico = sincronizarHistoricoArquivo($arquivoHistorico, $linha);
            return normalizarEventos($historico['eventos']);
        })();

    $agora = agoraUtc();

    // Sensores
    $minutosDesdeLeitura = null;
    if ($linha !== null && !empty($linha['updated_at']) && is_string($linha['updated_at'])) {
        try {
            $ultima = new DateTimeImmutable($linha['updated_at']);
            $minutosDesdeLeitura = (int) floor(($agora->getTimestamp() - $ultima->getTimestamp()) / 60);
        } catch (Exception) {
            $minutosDesdeLeitura = null;
        }
    }
    $sensores = statusSensores($minutosDesdeLeitura);
    if ($sensores !== null) {
        $sensores['coletaUnHora'] = round(unidadesUltimas24h($eventos) / 24, 1);
    }

    $payload = [
        'totalUn'            => $linha !== null ? inteiro($linha['total'] ?? null) : null,
        'papelUn'            => $linha !== null ? inteiro($linha['papel'] ?? null) : null,
        'plasticoUn'         => $linha !== null ? inteiro($linha['plastico'] ?? null) : null,
        'vidroUn'            => $linha !== null ? inteiro($linha['vidro'] ?? null) : null,
        'metaMensalUn'       => TB_META_MENSAL_UN,
        'variacaoPercentual' => variacaoMensal($eventos),
        'ultimaAtualizacao'  => isset($linha['updated_at']) && is_string($linha['updated_at'])
            ? $linha['updated_at']
            : null,
        'monitoramento'      => $sensores,
        'coletaPorDia'       => serieDiaria($eventos),
        'coletaPorSemana'    => serieSemanal($eventos),
        'coletaPorMes'       => serieMensal($eventos),
        'registros'          => gerarRegistros($eventos),
    ];

    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json !== false && TB_CACHE_TTL > 0) {
        @file_put_contents($arquivoCache, $json);
    }
    echo $json;
} catch (Throwable $e) {
    // Detalhe interno só no log do servidor; navegador recebe mensagem genérica
    error_log('[trashbelt/dashboard] ' . $e->getMessage());
    http_response_code(502);
    echo json_encode(['erro' => 'Nao foi possivel obter os dados da esteira agora.'], JSON_UNESCAPED_UNICODE);
}
