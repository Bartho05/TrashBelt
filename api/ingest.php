<?php
/**
 * Trashbelt — endpoint de ingestão para o ESP32 (XAMPP / PHP local).
 * POST /api/ingest.php
 *
 * Headers:
 *   x-device-token: <token do dispositivo>
 *   Content-Type: application/json
 * Body (contadores ACUMULADOS do firmware):
 *   { "total": 12, "papel": 5, "plastico": 4, "vidro": 3 }
 *
 * Espelho de api/ingest.js (Vercel). Usa a chave secreta do Supabase
 * apenas no servidor; o firmware conhece só o token do dispositivo.
 */

declare(strict_types=1);

require __DIR__ . '/config.php';
require __DIR__ . '/supabase.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function responder(int $status, array $dados): void
{
    http_response_code($status);
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function contadorInteiro($valor): ?int
{
    if ($valor === null || $valor === '' || !is_numeric($valor)) {
        return null;
    }
    $numero = (int) $valor;
    return $numero >= 0 ? $numero : null;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    header('Allow: POST');
    responder(405, ['erro' => 'Metodo nao permitido']);
}

$tokenEsperado = defined('TB_DEVICE_TOKEN') ? TB_DEVICE_TOKEN : getenv('TB_DEVICE_TOKEN');
$tokenRecebido = $_SERVER['HTTP_X_DEVICE_TOKEN'] ?? '';
if (!is_string($tokenEsperado) || $tokenEsperado === ''
    || !is_string($tokenRecebido) || !hash_equals($tokenEsperado, $tokenRecebido)) {
    responder(401, ['erro' => 'Token de dispositivo invalido.']);
}

$corpo = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($corpo)) {
    responder(400, ['erro' => 'JSON esperado.']);
}

$total    = contadorInteiro($corpo['total'] ?? null);
$papel    = contadorInteiro($corpo['papel'] ?? null);
$plastico = contadorInteiro($corpo['plastico'] ?? null);
$vidro    = contadorInteiro($corpo['vidro'] ?? null);
if ($total === null || $papel === null || $plastico === null || $vidro === null) {
    responder(400, ['erro' => 'Contadores invalidos (use inteiros >= 0).']);
}

try {
    $cliente = new SupabaseClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

    $linhas = $cliente->from(TB_TABLE, [
        'select' => 'id,total,papel,plastico,vidro',
        'id'     => 'eq.1',
        'limit'  => 1,
    ]);
    $anterior = (is_array($linhas) && isset($linhas[0]) && is_array($linhas[0])) ? $linhas[0] : null;

    // O firmware manda totais acumulados. O historico guarda so o incremento.
    $delta = static function (int $atual, $antes): int {
        $antes = contadorInteiro($antes);
        if ($antes === null) return $atual;
        return $atual > $antes ? $atual - $antes : 0; // ZERAR => sem evento negativo
    };
    $papelNovo    = $delta($papel,    $anterior['papel'] ?? null);
    $plasticoNovo = $delta($plastico, $anterior['plastico'] ?? null);
    $vidroNovo    = $delta($vidro,    $anterior['vidro'] ?? null);

    $estado = [
        'id'         => 1,
        'total'      => $total,
        'papel'      => $papel,
        'plastico'   => $plastico,
        'vidro'      => $vidro,
        'updated_at' => gmdate('c'),
    ];

    $gravado = $cliente->update(TB_TABLE, ['id' => 'eq.1'], $estado);
    if (!is_array($gravado) || count($gravado) === 0) {
        $cliente->insert(TB_TABLE, [$estado]);
    }

    if ($papelNovo + $plasticoNovo + $vidroNovo > 0) {
        $cliente->insert(TB_TABLE_HISTORICO, [[
            'evento_em' => gmdate('c'),
            'papel'     => $papelNovo,
            'plastico'  => $plasticoNovo,
            'vidro'     => $vidroNovo,
        ]]);
    }

    responder(200, [
        'ok'             => true,
        'recebido'       => ['total' => $total, 'papel' => $papel, 'plastico' => $plastico, 'vidro' => $vidro],
        'registradoAgora' => ['papel' => $papelNovo, 'plastico' => $plasticoNovo, 'vidro' => $vidroNovo],
    ]);
} catch (Throwable $e) {
    error_log('[trashbelt/ingest] ' . $e->getMessage());
    responder(502, ['erro' => 'Nao foi possivel gravar no banco.']);
}
