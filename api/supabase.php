<?php
/**
 * Cliente mínimo para a API REST (PostgREST) do Supabase, via cURL.
 * Operações suportadas: SELECT (from), INSERT (insert) e UPDATE (update)
 * em tabelas do schema público.
 */

// Bloqueia acesso direto pelo navegador
if (count(get_included_files()) === 1) {
    http_response_code(403);
    exit('Acesso negado');
}

final class SupabaseException extends RuntimeException
{
}

final class SupabaseClient
{
    private string $url;
    private string $key;

    public function __construct(string $url, string $key)
    {
        $this->url = rtrim($url, '/');
        $this->key = $key;
    }

    /** Monta o caminho da tabela, sanitizando o nome */
    private function caminho(string $table, array $params = []): string
    {
        $table = preg_replace('/[^A-Za-z0-9_]/', '', $table);
        $query = http_build_query($params);
        return "/rest/v1/{$table}" . ($query !== '' ? '?' . $query : '');
    }

    /** Requisição HTTP de baixo nível. Retorna [status, corpo] */
    private function request(string $method, string $path, ?string $body = null, array $extraHeaders = []): array
    {
        $ch = curl_init($this->url . $path);
        $headers = [
            'apikey: ' . $this->key,
            'Authorization: Bearer ' . $this->key,
            'Accept: application/json',
        ];
        if ($body !== null) {
            $headers[] = 'Content-Type: application/json';
        }
        foreach ($extraHeaders as $h) {
            $headers[] = $h;
        }

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_HTTPHEADER     => $headers,
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }

        $res   = curl_exec($ch);
        $stat  = (int) (curl_getinfo($ch, CURLINFO_RESPONSE_CODE) ?: 0);
        $err   = curl_error($ch);
        curl_close($ch);

        if ($res === false) {
            throw new SupabaseException('Falha de conexao com o Supabase: ' . $err);
        }
        return [$stat, $res];
    }

    /**
     * GET /rest/v1/{tabela}?{parametros}
     * Ex.: $client->from('trash_belt_status', ['select' => '*', 'limit' => 1]);
     *
     * @return array Linhas decodificadas (array de arrays associativos)
     * @throws SupabaseException Em falha de rede ou erro HTTP >= 400
     */
    public function from(string $table, array $params = []): array
    {
        [$status, $corpo] = $this->request('GET', $this->caminho($table, $params));
        if ($status >= 400) {
            throw new SupabaseException('Supabase respondeu HTTP ' . $status);
        }
        $data = json_decode($corpo, true);
        if (!is_array($data)) {
            throw new SupabaseException('Resposta inesperada do Supabase');
        }
        return $data;
    }

    /**
     * POST /rest/v1/{tabela} — insere linhas e retorna o que foi gravado.
     * @throws SupabaseException
     */
    public function insert(string $table, array $rows): array
    {
        $corpo = json_encode(array_values($rows), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($corpo === false) {
            throw new SupabaseException('Nao foi possivel serializar as linhas');
        }
        [$status, $res] = $this->request('POST', $this->caminho($table), $corpo, ['Prefer: return=representation']);
        if ($status >= 300) {
            throw new SupabaseException('Supabase respondeu HTTP ' . $status . ' no INSERT');
        }
        $data = json_decode($res, true);
        return is_array($data) ? $data : [];
    }

    /**
     * PATCH /rest/v1/{tabela}?{filtros} — atualiza linhas e retorna o resultado.
     * $filters usa o formato PostgREST, ex.: ['id' => 'eq.1']
     * @throws SupabaseException
     */
    public function update(string $table, array $filters, array $body): array
    {
        $corpo = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($corpo === false) {
            throw new SupabaseException('Nao foi possivel serializar a atualizacao');
        }
        [$status, $res] = $this->request(
            'PATCH',
            $this->caminho($table, $filters),
            $corpo,
            ['Prefer: return=representation']
        );
        if ($status >= 300) {
            throw new SupabaseException('Supabase respondeu HTTP ' . $status . ' no UPDATE');
        }
        $data = json_decode($res, true);
        return is_array($data) ? $data : [];
    }
}
