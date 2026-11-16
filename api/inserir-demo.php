<?php
/**
 * Simulador da esteira Trashbelt — Uso exclusivo via linha de comando (CLI).
 *
 * Simula a esteira reportando uma nova coleta:
 *   1. Atualiza os totais acumulados em trash_belt_status (linha id=1);
 *   2. Registra o evento em trash_belt_historico (quando a tabela existir).
 * Assim os dados de teste ficam NO BANCO DE DADOS, não só no site.
 *
 * Uso (na pasta do projeto):
 *   C:\xampp\php\php.exe api\inserir-demo.php              → insere de 2 a 9 un
 *   C:\xampp\php\php.exe api\inserir-demo.php 20           → insere exatamente 20 un
 *   C:\xampp\php\php.exe api\inserir-demo.php --loop       → roda continuamente
 *                                                          (inserção a cada 15s, Ctrl+C para parar)
 *   C:\xampp\php\php.exe api\inserir-demo.php --loop 30    → contínuo, inserção a cada 30s
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Acesso negado (use via CLI)');
}

require __DIR__ . '/config.php';
require __DIR__ . '/supabase.php';

// ---------- Argumentos ----------
$modoLoop = false;
$intervaloLoop = 15;
$total = null;
foreach (array_slice($argv, 1) as $arg) {
    if ($arg === '--loop') {
        $modoLoop = true;
    } elseif (is_numeric($arg)) {
        $v = (int) $arg;
        if ($modoLoop && $total === null && $v >= 1 && $v <= 3600) {
            $intervaloLoop = $v; // primeiro número após --loop é o intervalo
        } elseif ($v > 0 && $v <= 500) {
            $total = $v;
        }
    }
}

// ---------- Distribuição realista por material ----------
function distribuir(int $unidades): array
{
    $papel    = (int) round($unidades * (random_int(45, 75) / 100));
    $plastico = (int) round($unidades * (random_int(12, 32) / 100));
    $vidro    = $unidades - $papel - $plastico;
    if ($vidro < 0) {
        $vidro = 0;
        if ($plastico > $unidades - $papel) {
            $plastico = $unidades - $papel;
        }
    }
    return [$papel, $plastico, $vidro];
}

/** Executa uma inserção completa (status + evento). Retorna true em caso de sucesso. */
function inserirColeta(SupabaseClient $cliente, int $total): bool
{
    [$papel, $plastico, $vidro] = distribuir($total);
    if ($papel + $plastico + $vidro === 0) {
        return false;
    }

    $timestamp = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format(DateTimeInterface::ATOM);

    // 1. Estado atual (linha única)
    $linhas = $cliente->from(TB_TABLE, ['select' => '*', 'limit' => 1]);
    $linha = (is_array($linhas) && isset($linhas[0]) && is_array($linhas[0])) ? $linhas[0] : null;
    if ($linha === null) {
        fwrite(STDERR, 'A tabela ' . TB_TABLE . ' está vazia — insira a primeira linha no Supabase.' . "\n");
        exit(1);
    }

    $novosTotais = [
        'total'      => (int) $linha['total'] + $total,
        'papel'      => (int) $linha['papel'] + $papel,
        'plastico'   => (int) $linha['plastico'] + $plastico,
        'vidro'      => (int) $linha['vidro'] + $vidro,
        'updated_at' => $timestamp,
    ];

    // 2. Atualiza os totais no banco
    $cliente->update(TB_TABLE, ['id' => 'eq.' . urlencode((string) ($linha['id'] ?? 1))], $novosTotais);

    // 3. Registra o evento no histórico (se a tabela existir)
    $modoEvento = 'arquivo local (tabela de histórico indisponível)';
    try {
        $cliente->from(TB_TABLE_HISTORICO, ['select' => 'id', 'limit' => 1]);
        $cliente->insert(TB_TABLE_HISTORICO, [[
            'evento_em' => $timestamp,
            'papel'     => $papel,
            'plastico'  => $plastico,
            'vidro'     => $vidro,
        ]]);
        $modoEvento = 'Supabase (' . TB_TABLE_HISTORICO . ')';
    } catch (SupabaseException) {
        // Sem tabela de histórico: o backend sincroniza pela diferença de totais
    }

    printf(
        "[%s] ✔ +{$total} un no banco (papel +{$papel}, plástico +{$plastico}, vidro +{$vidro}) " .
        "| totais: {$novosTotais['total']} un (papel {$novosTotais['papel']}, plástico {$novosTotais['plastico']}, vidro {$novosTotais['vidro']}) " .
        "| evento: {$modoEvento}\n",
        date('H:i:s')
    );
    return true;
}

try {
    $cliente = new SupabaseClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

    if ($modoLoop) {
        echo "Modo contínuo: inserções aleatórias (2–9 un) a cada {$intervaloLoop}s. Ctrl+C para parar.\n";
        while (true) {
            inserirColeta($cliente, random_int(2, 9));
            sleep($intervaloLoop);
        }
    } else {
        $total = $total ?? random_int(2, 9);
        inserirColeta($cliente, $total);
        echo "O painel atualiza em até ~15s (site aberto).\n";
    }
} catch (Throwable $e) {
    fwrite(STDERR, 'Erro: ' . $e->getMessage() . "\n");
    exit(1);
}
