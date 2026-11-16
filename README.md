# ♻️ Trashbelt

Painel web de monitoramento para uma esteira separadora de recicláveis —
**papel, plástico e vidro** — com gráficos por dia/semana/mês, histórico
filtrável, meta mensal e notificações de coletas novas. Inclui o firmware do
separador físico: **ESP32 + sensor de cores TCS34725 + 3 servos**.

Os dados ficam no [Supabase](https://supabase.com) (PostgreSQL). O navegador
**nunca** tem contato com chaves: ele fala apenas com `api/dashboard.php`, e o
backend PHP consulta o Supabase com a chave secreta guardada no servidor.

## Estrutura

```
Trashbelt/
├── index.html                  # Painel (interface única, responsiva)
├── css/style.css               # Estilos (tema claro/escuro)
├── js/app.js                   # Gráficos, tooltips, toasts, atalhos
├── api/
│   ├── dashboard.php           # Endpoint público (JSON, cache de 5s)
│   ├── supabase.php            # Cliente REST do Supabase (cURL)
│   ├── config.php              # Configuração — SEM credenciais
│   ├── credenciais.exemplo.php # Modelo para copiar e preencher
│   ├── credenciais.php         # Suas chaves — FORA do Git (.gitignore)
│   ├── inserir-demo.php        # Simulador de coletas (só linha de comando)
│   └── .htaccess               # Bloqueia acesso direto ao backend
├── arduino/trashbelt/
│   └── trashbelt.ino           # Firmware do separador (ESP32)
├── docs/
│   └── tabelas.sql             # Esquema do banco + travas de segurança
├── .htaccess                   # Bloqueia .git e arquivos ocultos
└── .gitignore                  # credenciais.php, storage/, etc.
```

## Requisitos

- **XAMPP** (Apache + PHP 8+ com a extensão cURL habilitada — o padrão do XAMPP já vem assim)
- Uma conta/projeto no **Supabase**
- Para o hardware: Arduino IDE com a **placa ESP32** instalada

## Configurando o painel (site)

1. **Banco:** no SQL Editor do Supabase, rode o script `docs/tabelas.sql`.
   Ele cria as tabelas `trash_belt_status` (estado atual, linha única) e
   `trash_belt_historico` (um registro por separação) e aplica o
   fechamento de segurança (RLS + revokes).
2. **Credenciais:** copie `api/credenciais.exemplo.php` para
   `api/credenciais.php` e preencha as três constantes
   (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_ANON_KEY`).
   As chaves ficam em *Project Settings → API Keys* no painel do Supabase.
   `credenciais.php` está no `.gitignore` e bloqueado pelo `.htaccess`.
3. **Servidor:** coloque a pasta dentro de `htdocs` (ex.: `C:\xampp\htdocs\Trashbelt`)
   e abra `http://localhost/Trashbelt/`.

O painel atualiza sozinho a cada **10 segundos** e mostra toasts quando
chegam coletas novas.

### Demonstração sem hardware

Para popular o banco manualmente (simula o ESP32 registrando coletas):

```
C:\xampp\php\php.exe api\inserir-demo.php          # +1 un aleatória
C:\xampp\php\php.exe api\inserir-demo.php 5        # +5 un
C:\xampp\php\php.exe api\inserir-demo.php --loop   # 1 un a cada 15s
```

## Configurando o Arduino (ESP32)

1. No Arduino IDE, instale pelo **Boards Manager**: `esp32 by Espressif Systems`.
2. Instale pelo **Library Manager**: `Adafruit TCS34725` (aceite as
   dependências) e `ESP32Servo`. `Wire` e `Preferences` já vêm no núcleo.
3. Abra `arduino/trashbelt/trashbelt.ino`, selecione a placa
   **ESP32 Dev Module**, conecte e faça o upload.
4. Abra o **Monitor Serial em 115200 baud**. Comandos:

| Comando | Ação |
|---------|------|
| `STATUS` | Mostra os contadores (total, papel, plástico, vidro) |
| `ZERAR`  | Zera todos os contadores |
| `AJUDA`  | Lista os comandos |

**Ligação:** TCS34725 em SDA=23 / SCL=22 (I²C); servos nos pinos 18 (papel),
19 (plástico) e 21 (vidro); sensores de obstáculo nos pinos 27, 26 e 25.
O objeto só é contabilizado quando o sensor do destino o detecta chegando —
se demorar mais de 10s, o servo fecha sem contar.

## Segurança

O que já está fechado neste repositório:

- **Nenhuma chave no código versionado** — `api/config.php` lê as
  credenciais de `api/credenciais.php` (fora do Git) ou de variáveis de
  ambiente, e falha com mensagem clara se estiverem ausentes.
- **Banco fechado para chaves públicas** — RLS habilitada sem políticas e
  todos os privilégios de `anon`/`authenticated` revogados; o anon recebe
  HTTP 401 em qualquer acesso. Só a chave secreta (service_role) acessa.
- **`.htaccess`** bloqueia acesso direto a `config.php`, `supabase.php`,
  `inserir-demo.php`, `credenciais*.php`, `.git` e arquivos ocultos.
- **`.gitignore`** impede o envio de `credenciais.php`, `.env` e da pasta
  `api/storage/` (cache/dados locais).

**Se você expôs alguma chave em algum momento (chat, screenshot, commit
antigo), considere-a comprometida** e troque:

1. **Secret key:** Supabase → *Project Settings → API Keys* → crie uma nova
   secret key → atualize o `api/credenciais.php` → apague a antiga.
2. **Access token (PAT):** supabase.com/dashboard/account/tokens → revoke
   dos tokens que não estiver em uso.

E nunca comite `credenciais.php` — se acontecer, trate a chave como
vazada e troque imediatamente.

## Endpoint público

`GET api/dashboard.php` → JSON com totais, variação, detalhamento por
material, séries dia/semana/mês, monitoramento da esteira e os últimos
registros para o histórico. Sem parâmetros, sem chaves, cache de 5s.
