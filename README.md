# Trashbelt

> Esteira automatizada que separa recicláveis (papel, plástico e vidro) por cor e um painel web que monitora tudo em tempo real.

---

## 📌 Informações Gerais

- **Nome do Projeto:** Trashbelt
- **Equipe:**
- **Curso:** Técnico em Informática
- **Instituição:**
- **Ano/Semestre:**
- **Professor Orientador:**
- **Cliente/Setor Solicitante:**

---

## 🎯 Objetivo do Projeto

Desenvolver uma esteira automatizada que classifica objetos recicláveis — papel, plástico e vidro — por meio de leitura de cores e direciona cada material à sua trilha de destino, acompanhada de um painel web que registra e exibe cada coleta em tempo real, com gráficos por período, histórico, meta mensal e notificações.

---

## 👥 Público-Alvo

- Coordenadores de coleta seletiva e pontos de reciclagem
- Escolas e instituições que usam o sistema em projetos de sustentabilidade
- Equipes de manutenção da esteira
- Professores e avaliadores do projeto

---

## 🧩 Problema a Ser Resolvido

A separação de recicláveis geralmente é feita manualmente: é lenta, sujeita a erro e não gera nenhum registro. Sem dados, é impossível acompanhar o volume separado, verificar metas ou analisar o desempenho ao longo do tempo.

---

## 💡 Solução Proposta

Uma esteira equipada com ESP32, sensor de cores TCS34725, três servomotores e sensores de obstáculo. O sensor identifica a cor do objeto, a trilha correspondente abre e a chegada do objeto é confirmada por sensor antes de contabilizar. Cada separação alimentar um painel web (PHP + Supabase/PostgreSQL) que se atualiza sozinho a cada 10 segundos.

---

## ⚙️ Funcionalidades do Sistema

### Funcionalidades Principais

- [x] Painel web com atualização automática a cada 10 s (polling)
- [x] Totais em tempo real: geral + papel, plástico e vidro (em "un")
- [x] Gráficos de coleta por dia, semana e mês (barras empilhadas por material)
- [x] Histórico de coletas com filtro por material e ordenação por qualquer coluna
- [x] Notificações de coletas novas (badge no sino + toasts)
- [x] Meta mensal com barra de progresso e variação percentual
- [x] Tema claro/escuro persistente e atalhos de teclado (1–4, T)
- [x] Firmware: classificação por cor, abertura do servo e confirmação por sensor
- [x] Contadores do firmware salvos na memória permanente (NVS) — sobrevivem a reinícios
- [x] Comandos via Monitor Serial: STATUS, ZERAR, AJUDA
- [x] Segurança: segredos fora do Git, banco fechado para chaves públicas (RLS + revokes)
- [ ] Login/controle de acesso por perfil (o painel é de consulta pública, sem autenticação)

---

## 🛠️ Tecnologias Utilizadas

- **Front-end:** HTML, CSS e JavaScript (sem frameworks)
- **Back-end:** PHP 8 (XAMPP/Apache)
- **Banco de Dados:** Supabase (PostgreSQL) via REST
- **Hardware:** ESP32, TCS34725 (sensor de cores), 3 servomotores, 3 sensores de obstáculo
- **Firmware:** C++ (Arduino IDE) — bibliotecas Adafruit TCS34725 e ESP32Servo
- **Versionamento:** Git e GitHub

---

## 🗂️ Estrutura do Projeto

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

---

## 🧪 Requisitos Funcionais

- RF01 – O painel deve exibir em tempo real o total coletado e o detalhamento por material (papel, plástico, vidro)
- RF02 – O painel deve apresentar gráficos de coleta por dia, semana e mês
- RF03 – O histórico deve permitir filtro por material e ordenação por qualquer coluna
- RF04 – Cada separação concluída deve ser registrada no banco (estado atual + histórico)
- RF05 – O firmware deve classificar o objeto pela cor e abrir a trilha do destino correspondente
- RF06 – O objeto só deve ser contabilizado após a confirmação do sensor de destino
- RF07 – O painel deve notificar o usuário quando chegarem coletas novas
- RF08 – O painel deve permitir alternar entre tema claro e escuro

---

## 🚫 Requisitos Não Funcionais

- O sistema deve ser acessível via navegador e responsivo (desktop e celular)
- Atualização automática dos dados a cada 10 s, com fallback em caso de falha de conexão
- O sistema deve garantir segurança: nenhuma chave versionada no Git, RLS ativa no banco e revogação total das chaves públicas (acesso anônimo ao banco retorna HTTP 401)
- Os contadores do firmware devem persistir em memória permanente (NVS)
- Interface simples, intuitiva e em português

---

## 📅 Cronograma do Projeto

| Etapa | Descrição | Responsável | Data |
|------|-----------|-------------|------|
| 1 | Levantamento de requisitos | Equipe | |
| 2 | Desenvolvimento do firmware (classificação e servos) | Equipe | |
| 3 | Criação do banco e backend (Supabase + PHP) | Equipe | |
| 4 | Desenvolvimento do painel web | Equipe | |
| 5 | Segurança, testes e publicação | Equipe | |

---

## 🧑‍💻 Integrantes da Equipe

| Nome | Função | Responsabilidade |
|------|-------|-----------------|
| | Desenvolvedor | |
| | Designer | |
| | Testador | |
| | Documentação | |

---

## 🔐 Controle de Acesso (se aplicável)

O painel é público para consulta via navegador e **não há login de usuários**. A segurança está concentrada no banco e no backend:

- As chaves públicas (anon) do Supabase têm **todos os privilégios revogados** e a RLS está ativa sem políticas: qualquer acesso direto às tabelas pela internet é recusado (HTTP 401)
- Somente o backend PHP acessa o banco, com a chave secreta guardada no servidor (fora do Git e fora do alcance do navegador)
- `api/credenciais.php` é bloqueado pelo `.htaccess` e listado no `.gitignore`

---

## 📷 Protótipos / Telas

O painel em funcionamento roda localmente: `http://localhost/Trashbelt/`
*(adicionar aqui capturas de tela do painel, gráficos e da esteira física)*

---

## 📦 Como Executar o Projeto

### Painel web (site)

1. Instale o **XAMPP** (Apache + PHP 8)
2. No SQL Editor do Supabase, execute o script `docs/tabelas.sql`
3. Copie `api/credenciais.exemplo.php` para `api/credenciais.php` e preencha as chaves (Supabase → *Project Settings → API Keys*)
4. Coloque a pasta em `htdocs` (ex.: `C:\xampp\htdocs\Trashbelt`) e abra `http://localhost/Trashbelt/`

Simulador de coletas (sem hardware):

```
C:\xampp\php\php.exe api\inserir-demo.php          # +1 un aleatória
C:\xampp\php\php.exe api\inserir-demo.php 5        # +5 un
C:\xampp\php\php.exe api\inserir-demo.php --loop   # 1 un a cada 15s
```

### Firmware (ESP32)

1. No Arduino IDE, instale a placa `esp32 by Espressif Systems` (Boards Manager) e as bibliotecas `Adafruit TCS34725` e `ESP32Servo` (Library Manager)
2. Abra `arduino/trashbelt/trashbelt.ino`, selecione **ESP32 Dev Module** e faça o upload
3. Monitor Serial em **115200 baud** — comandos: `STATUS`, `ZERAR`, `AJUDA`

**Ligação:** TCS34725 em SDA=23 / SCL=22 · servos nos pinos 18 (papel), 19 (plástico), 21 (vidro) · sensores de obstáculo nos pinos 27, 26 e 25.
