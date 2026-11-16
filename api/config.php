<?php
/**
 * Configuração do backend Trashbelt.
 *
 * ⚠️ Nenhuma credencial vive neste arquivo (ele vai para o GitHub).
 * As chaves são lidas, nesta ordem:
 *   1. api/credenciais.php   — arquivo local fora do versionamento
 *                              (veja credenciais.exemplo.php);
 *   2. Variáveis de ambiente — SUPABASE_URL, SUPABASE_SECRET_KEY,
 *                              SUPABASE_ANON_KEY.
 */

// Bloqueia acesso direto pelo navegador (só pode ser "require"-do por outro script)
if (count(get_included_files()) === 1) {
    http_response_code(403);
    exit('Acesso negado');
}

// ---- Credenciais -----------------------------------------------------------

$caminhoCredenciais = __DIR__ . '/credenciais.php';
if (is_file($caminhoCredenciais)) {
    require $caminhoCredenciais;
}

// Fallback: variáveis de ambiente (servidores com deploy próprio)
if (!defined('SUPABASE_URL') && getenv('SUPABASE_URL') !== false) {
    define('SUPABASE_URL', getenv('SUPABASE_URL'));
}
if (!defined('SUPABASE_SECRET_KEY') && getenv('SUPABASE_SECRET_KEY') !== false) {
    define('SUPABASE_SECRET_KEY', getenv('SUPABASE_SECRET_KEY'));
}
if (!defined('SUPABASE_ANON_KEY') && getenv('SUPABASE_ANON_KEY') !== false) {
    define('SUPABASE_ANON_KEY', getenv('SUPABASE_ANON_KEY'));
}
if (!defined('SUPABASE_ANON_KEY')) {
    define('SUPABASE_ANON_KEY', ''); // opcional — o backend usa só a secreta
}

// Falha de forma clara se faltar credencial (sem vazar detalhes)
if (!defined('SUPABASE_URL') || !defined('SUPABASE_SECRET_KEY')
    || SUPABASE_URL === '' || SUPABASE_SECRET_KEY === '') {
    $mensagem = 'Credenciais do Supabase nao configuradas. Copie api/credenciais.exemplo.php para api/credenciais.php e preencha.';
    if (PHP_SAPI === 'cli') {
        fwrite(STDERR, 'ERRO: ' . $mensagem . PHP_EOL);
        exit(1);
    }
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    exit(json_encode(['erro' => $mensagem], JSON_UNESCAPED_UNICODE));
}

// Sanidade: o endereço do Supabase deve ser HTTPS
if (stripos(SUPABASE_URL, 'https://') !== 0) {
    $mensagem = 'SUPABASE_URL deve comecar com https://.';
    if (PHP_SAPI === 'cli') {
        fwrite(STDERR, 'ERRO: ' . $mensagem . PHP_EOL);
        exit(1);
    }
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    exit(json_encode(['erro' => $mensagem], JSON_UNESCAPED_UNICODE));
}

// ---- Banco ----------------------------------------------------------------
// Tabela de estado da esteira (linha única com os totais acumulados)
define('TB_TABLE', 'trash_belt_status');

// Tabela de histórico de coletas (um registro por evento de separação)
define('TB_TABLE_HISTORICO', 'trash_belt_historico');

// Fuso horário usado para agrupar os dados por dia/semana/mês
define('TB_TIMEZONE', 'America/Sao_Paulo');

// Meta mensal exibida no painel, em unidades
define('TB_META_MENSAL_UN', 150);

// ---- Armazenamento local ---------------------------------------------------
// Histórico de coletas e cache do endpoint ficam nesta pasta do projeto
// (fora do alcance do navegador via .htaccess), garantindo que CLI e Apache
// enxerguem os mesmos dados.
define('TB_STORAGE_DIR', __DIR__ . '/storage');

// ---- Cache ----------------------------------------------------------------
// Segundos que o endpoint reutiliza a última resposta antes de consultar
// o Supabase de novo. O site consulta a cada 10s; com cache de 5s o dado
// novo aparece em até ~15s.
define('TB_CACHE_TTL', 5);
