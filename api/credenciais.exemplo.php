<?php
/**
 * MODELO de credenciais — copie para "credenciais.php" e preencha.
 *
 *   1. Copie:      cp api/credenciais.exemplo.php api/credenciais.php
 *   2. Preencha as três constantes com os valores do seu projeto.
 *
 * Onde encontrar: painel do Supabase → Project Settings → API Keys.
 * A "secret key" (sb_secret_...) é usada SÓ pelo backend PHP.
 * NUNCA envie credenciais.php para o GitHub (ele está no .gitignore).
 */

// Bloqueia acesso direto pelo navegador (só pode ser "require"-do)
if (count(get_included_files()) === 1) {
    http_response_code(403);
    exit('Acesso negado');
}

define('SUPABASE_URL', 'https://SEU-PROJETO.supabase.co');

// Chave SECRETA — usada apenas no backend, nunca vai para o navegador
define('SUPABASE_SECRET_KEY', 'sb_secret_XXXX...');

// Chave pública (anon/publishable) — opcional para este projeto
define('SUPABASE_ANON_KEY', 'sb_publishable_XXXX...');
