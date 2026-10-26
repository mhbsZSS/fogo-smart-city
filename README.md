# 🔥 F.O.G.O. — Ferramenta Onisciente de Gestão e Operações

> **Guia Técnico de Engenharia e Execução**  
> Plataforma unificada de Comando, Controle e Consciência Situacional para **Smart Cities**. Piloto de Operações: **Marília/SP**.

---

## 📋 Sumário

- [Visão Geral](#-visão-geral)
- [Stack Tecnológica](#-stack-tecnológica)
- [Pré-requisitos](#-pré-requisitos)
- [Como Executar o Sistema](#-como-executar-o-sistema)
  - [Opção 1: Via Docker Compose (Recomendado)](#opção-1-via-docker-compose-recomendado)
  - [Opção 2: Execução Bare-Metal / Desenvolvimento Local](#opção-2-execução-bare-metal--desenvolvimento-local)
- [Geração de Dados Sintéticos (Mock Generator)](#-geração-de-dados-sintéticos-mock-generator)
- [URLs de Acesso e Endpoints](#-urls-de-acesso-e-endpoints)
- [Variáveis de Ambiente](#-variáveis-de-ambiente)
- [Estrutura do Repositório](#-estrutura-do-repositório)

---

## 🌐 Visão Geral

O **F.O.G.O.** (**F**erramenta **O**nisciente de **G**estão e **O**perações) centraliza a telemetria, integridade e despacho operacional de ativos críticos de mobilidade urbana (semáforos inteligentes, radares de velocidade, câmeras OCR/CFTV, iluminação pública e sensores ambientais) e equipes em campo (trânsito, guarda municipal, manutenção, defesa civil e resgate médico) em uma única interface tática de alta performance.

---

## 💻 Stack Tecnológica

| Camada | Tecnologia | Versão | Descrição / Papel na Arquitetura |
|---|---|---|---|
| **Backend** | **Python** | 3.11+ | Linguagem base moderna com tipagem estática e suporte assíncrono nativo. |
| **API Framework** | **FastAPI** | 0.115+ | Framework assíncrono de altíssimo throughput, injeção de dependências e documentação OpenAPI automática. |
| **Validação** | **Pydantic v2** | 2.10+ | Validação rigorosa em runtime, coerção segura e serialização ultra-rápida. |
| **ORM / DB Access** | **SQLAlchemy** | 2.0+ | ORM com mapeamento declarativo assíncrono via driver `asyncpg`. |
| **Banco de Dados** | **PostgreSQL** | 16 | Banco relacional robusto com suporte a tipos complexos (`JSONB`, `UUID`). |
| **Mensageria & Campo** | **Telegram Bot API** | v7+ | Automação operacional de despacho e encerramento de ocorrências com botões Inline. |
| **Tunelamento Seguro**| **Ngrok** | v3+ | Exposição HTTPS reversa para entrega de webhooks em ambientes locais de desenvolvimento. |
| **IA Preditiva & RH** | **Google Gemini** | 3.5-flash | Diagnóstico preditivo de SLA de ocorrências, integridade de ativos e auditoria cognitiva de RH. |
| **Frontend** | **React** | 18.3+ | Biblioteca de renderização reativa baseada em componentes funcionais e hooks. |
| **Build Tool** | **Vite** | 5.4+ | Bundler ESM de última geração com Hot Module Replacement (HMR) sub-milisegundo. |
| **Estilização** | **Tailwind CSS** | 3.4+ | Utility-first CSS com paleta tática customizada, Glassmorphism e tokens cyberpunk. |
| **Cartografia** | **Leaflet + React-Leaflet** | 1.9+ / 4.2+ | Motor de renderização geoespacial vetorial/raster com tiles escuros CartoDB/Stadia. |
| **Geodésia** | **Geopy** | 2.4+ | Cálculos geodésicos precisos e delimitadores espaciais poligonais (*ray casting*). |
| **Containerização** | **Docker & Compose** | v2+ | Isolamento de microserviços em redes internas seguras com volumes persistentes. |

---

## ⚙️ Pré-requisitos

Antes de iniciar, certifique-se de ter instalado no seu ambiente:

1. **Docker & Docker Compose** (v2.0+) — *Recomendado para subir toda a stack em segundos.*  
   Ou para execução bare-metal:
2. **Python** 3.11 ou superior ([python.org](https://www.python.org/downloads/))
3. **Node.js** 18.x ou 20.x LTS e **npm** ([nodejs.org](https://nodejs.org/))
4. **PostgreSQL** 16 instalado e rodando localmente (caso não use o container do banco)

---

## 🚀 Como Executar o Sistema

### Opção 1: Via Docker Compose (Recomendado)

Esta opção inicializa o **PostgreSQL 16**, o **Backend FastAPI** e o **Frontend React** em uma rede isolada sem necessidade de configurar dependências locais:

```bash
# 1. Clone o repositório e navegue até a raiz
cd fogo-project

# 2. Suba todos os containers em segundo plano (com build)
docker compose up -d --build

# 3. Popule a base com dados realistas de Marília/SP (500 equipamentos + 40 agentes)
docker compose exec backend python -m scripts.mock_generator

# 4. Acompanhe os logs da aplicação se desejar
docker compose logs -f
```

---

### Opção 2: Execução Bare-Metal / Desenvolvimento Local

Se você preferir rodar o backend e o frontend diretamente na sua máquina hospedeira:

#### 1. Banco de Dados PostgreSQL

Inicie uma instância PostgreSQL (você pode subir apenas o container do banco via Compose):
```bash
docker compose up -d db
```
*O banco estará acessível em `localhost:5433` (ou `5432` conforme seu `.env`).*

#### 2. Como Executar o Backend

```bash
# Navegue para o diretório backend
cd backend

# Crie o ambiente virtual Python
# No Windows:
python -m venv venv
venv\Scripts\activate

# No Linux/macOS:
python3 -m venv venv
source venv/bin/activate

# Instale as dependências
pip install --upgrade pip
pip install -r requirements.txt

# Configure as variáveis de ambiente (se necessário, ajuste o .env na raiz ou variáveis locais)
# O backend cria todas as tabelas automaticamente na inicialização via lifespan.

# Inicie o servidor ASGI com recarregamento automático (Hot-Reload)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Para popular a base com ativos de teste:
```bash
python -m scripts.mock_generator
```

#### 3. Como Executar o Frontend

Abra um novo terminal e navegue para o diretório do frontend:

```bash
# Navegue para a pasta frontend
cd frontend

# Instale os pacotes npm
npm install

# Inicie o servidor de desenvolvimento Vite
npm run dev
```

O terminal exibirá a URL local: `http://localhost:5173`.

---

## 🧪 Geração de Dados Sintéticos (Mock Generator)

O script [`backend/scripts/mock_generator.py`](backend/scripts/mock_generator.py) gera dados geoespacialmente restritos à mancha urbana de **Marília/SP** utilizando cálculo de ponto em polígono (*ray casting* em [`app/core/geo.py`](backend/app/core/geo.py)).

```bash
# Execução padrão (500 equipamentos, 40 agentes - preserva se já existirem)
docker compose exec backend python -m scripts.mock_generator

# Reset total (limpa tabelas e repopula)
docker compose exec backend python -m scripts.mock_generator --reset

# Customização de volume com semente determinística
docker compose exec backend python -m scripts.mock_generator --reset --equipamentos 1000 --agentes 60 --seed 42
```

| Flag | Tipo | Padrão | Descrição |
|---|---|---|---|
| `--equipamentos` | `int` | `500` | Quantidade de equipamentos urbanos |
| `--agentes` | `int` | `40` | Quantidade de unidades operacionais |
| `--reset` | `flag` | `False` | Executa truncate nas tabelas antes da carga |
| `--append` | `flag` | `False` | Força inserção incremental |
| `--seed` | `int` | `None` | Semente pseudo-aleatória para testes reprodutíveis |

---

## 📍 URLs de Acesso e Endpoints

Após inicializar a stack, acesse os serviços nas URLs padrão:

| Serviço | URL | Credenciais / Notas |
|---|---|---|
| **Dashboard Operacional** | [http://localhost:5173](http://localhost:5173) | Interface gráfica com mapa tático e telemetria |
| **API Swagger UI** | [http://localhost:8000/docs](http://localhost:8000/docs) | Documentação interativa OpenAPI dos endpoints |
| **API ReDoc** | [http://localhost:8000/redoc](http://localhost:8000/redoc) | Documentação técnica estruturada |
| **API Health Check** | [http://localhost:8000/health](http://localhost:8000/health) | Diagnóstico da API e conexão do banco PostgreSQL |

### Principais Rotas da API RESTful (`/api/v1`)

```http
# Ativos Urbanos (Equipamentos)
GET    /api/v1/equipamentos                          # Listagem com filtros por status, tipo e bairro
GET    /api/v1/equipamentos/resumo                   # Métricas e KPIs agregados para o dashboard
GET    /api/v1/equipamentos/{id}                     # Detalhes completos do equipamento
POST   /api/v1/equipamentos                          # Cadastro com validação geográfica e unicidade
PUT    /api/v1/equipamentos/{id}                     # Edição de dados do ativo
DELETE /api/v1/equipamentos/{id}                     # Exclusão permanente do ativo

# Agentes, Unidades de Resposta e Auto-Cura
GET    /api/v1/agentes                               # Listagem de agentes e status de telemetria
GET    /api/v1/agentes/proximos                      # Busca radial geodésica (?lat=...&lng=...&raio_km=...)
POST   /api/v1/agentes                               # Cadastro de unidade com ID de terminal corporativo
POST   /api/v1/agentes/sincronizar-estado            # Rotina de Auto-Cura: resgata agentes órfãos presos em deslocamento

# Ocorrências e Despacho Tático
GET    /api/v1/ocorrencias                           # Listagem de ocorrências por severidade/status
POST   /api/v1/ocorrencias                           # Registro de nova ocorrência urbana
PUT    /api/v1/ocorrencias/{id}/despachar            # Despacho operacional + Alerta assíncrono via Telegram
PUT    /api/v1/ocorrencias/{id}/concluir             # Conclusão manual e liberação de efetivo pelo CICC

# Automação de Campo & Telegram Webhook
GET    /api/v1/telegram/webhook                      # Checagem de status e ações suportadas pelo bot
POST   /api/v1/telegram/webhook                      # Processamento de callback queries ("✅ Resolver", "🆘 Apoio")
POST   /api/v1/telegram/recarregar-configuracao      # Força recarga do .env e validação do webhook em runtime

# Relatórios Preditivos e Inteligência de RH (Gemini)
GET    /api/v1/relatorios/agentes/{id}/detalhes      # Dossiê operacional do agente com histórico e tempos de duração
GET    /api/v1/relatorios/agentes/{id}/ia            # Parecer executivo de RH e auditoria preditiva via IA
GET    /api/v1/relatorios/ocorrencias/{id}/ia        # Auditoria analítica de cumprimento de SLA
GET    /api/v1/relatorios/equipamentos/{id}/ia       # Análise de TCO e saúde de hardware
```

---

## 🔐 Variáveis de Ambiente

O arquivo `.env.example` na raiz do projeto reúne todas as configurações do sistema:

```bash
# Copie o template para criar o arquivo ativo
cp .env.example .env
```

| Variável | Valor Padrão (Dev) | Função |
|---|---|---|
| `POSTGRES_USER` | `fogo` | Usuário do banco PostgreSQL |
| `POSTGRES_PASSWORD` | `fogo_dev_change_me` | Senha do banco PostgreSQL |
| `POSTGRES_DB` | `fogo` | Nome da base de dados principal |
| `POSTGRES_EXPOSED_PORT` | `5433` | Porta publicada no host para ferramentas externas (DBeaver/pgAdmin) |
| `BACKEND_PORT` | `8000` | Porta HTTP da API FastAPI |
| `FRONTEND_PORT` | `5173` | Porta HTTP do servidor web Vite/React |
| `CORS_ORIGINS` | `http://localhost:5173,...` | Lista de origens autorizadas pelo middleware CORS |
| `VITE_API_URL` | `http://localhost:8000/api/v1` | URL base consumida pelo cliente Axios no navegador |
| `TELEGRAM_BOT_TOKEN` | *(obter via @BotFather)* | Token de autenticação da API de Bots do Telegram |
| `TELEGRAM_CHAT_ID_TESTE` | *(ID numérico do chat)* | Chat ID corporativo/agente para recebimento de alertas de despacho |
| `PUBLIC_URL` | *(URL do túnel Ngrok)* | URL HTTPS pública para registro automático do Webhook no startup |
| `GEMINI_API_KEY` | *(Google AI Studio)* | Chave de API para o Oráculo Preditivo e Auditoria de RH |

---

## ⚡ Novas Capacidades Operacionais da Versão Atual

### 1. 📱 Automação de Campo em Tempo Real via Telegram
- **Despacho Imediato:** Ao despachar uma equipe no cockpit web, o backend dispara uma `BackgroundTask` assíncrona enviando os detalhes da ocorrência (título, tipo, criticidade, geolocalização e agente designado) diretamente para o terminal Telegram da viatura.
- **Encerramento Remoto em 1 Clique:** A mensagem contém um botão inline `[ ✅ Resolver ]`. Ao ser tocado pelo policial ou técnico em campo, o webhook (`/api/v1/telegram/webhook`) atualiza imediatamente a ocorrência para `RESOLVIDA`, preenche a `data_conclusao` para métricas de SLA, libera os agentes de volta para `DISPONIVEL` e edita a mensagem no chat com `editMessageText` confirmando o encerramento no CICC.
- **Auto-Registro de Webhook:** No evento de `lifespan` do FastAPI, se `TELEGRAM_BOT_TOKEN` e `PUBLIC_URL` estiverem presentes, o backend registra automaticamente o webhook junto ao Telegram sem intervenção manual.

### 2. 🛡️ Rotina de Auto-Cura de Efetivo (Self-Healing)
- **Mitigação de Agentes Fantasmas:** Falhas de conectividade ou testes de encerramento manual podiam deixar agentes presos no status `EM_DESLOCAMENTO` sem nenhuma ocorrência aberta associada.
- **Endpoint e Botão de Ação Rápida:** A rota `POST /api/v1/agentes/sincronizar-estado` e o botão `[ 🔄 Sincronizar Frota ]` no cabeçalho do Quadro de Agentes varrem a base, identificam inconsistências de estado e restauram imediatamente o efetivo para prontidão operacional.

### 3. 🎯 Segregação Arquitetural de UX (Operação vs Inteligência)
- **Fila de Despacho Blindada:** A tela de gestão tática de ocorrências foi rigorosamente limpa de botões analíticos ou modais de IA pesados. A coluna de ações foca 100% na resposta rápida: `[ ⚡ Despachar Unidade ]` e `[ ✓ Encerrar e Liberar ]`.
- **Cockpit Analítico Centralizado:** Todas as ferramentas de auditoria cognitiva, dossiês frios com tempos de resposta milimétricos e diagnósticos preditivos do Gemini foram concentradas na rota de Inteligência Gerencial (`/relatorios`).

---

## 📁 Estrutura do Repositório

```text
fogo-project/
├── docker-compose.yml              # Orquestração de containers (db, backend, frontend)
├── .env.example                    # Template de variáveis de ambiente
├── README.md                       # Guia técnico e instruções de execução (este arquivo)
├── DOCUMENTACAO_ARQUITETURA.md     # Relatório executivo de arquitetura e inovações
│
├── backend/                        # API Assíncrona FastAPI
│   ├── Dockerfile                  # Container multi-stage Python 3.11
│   ├── requirements.txt            # Dependências Python travadas
│   ├── app/
│   │   ├── main.py                 # Ponto de entrada, CORS, lifespan e health check
│   │   ├── core/                   # Configurações, conexão com banco e polígono de Marília
│   │   ├── models/                 # Modelos SQLAlchemy (Equipamento, Agente, Ocorrencia, ...)
│   │   ├── schemas/                # Schemas Pydantic de entrada, saída e validação
│   │   └── api/routes/             # Rotas modulares: equipamentos, agentes, ocorrencias
│   └── scripts/
│       └── mock_generator.py       # Gerador determinístico de dados sintéticos georreferenciados
│
└── frontend/                       # Aplicação SPA React + Vite
    ├── Dockerfile                  # Container Node.js para desenvolvimento e preview
    ├── package.json                # Dependências npm
    ├── tailwind.config.js          # Configuração de temas, cores neon e gradientes
    └── src/
        ├── pages/                  # Dashboard, Equipamentos, Agentes, Ocorrencias, Relatorios
        ├── components/             # TacticalMap, EquipmentTable, StatCard, Modais, Sidebar
        ├── services/api.js         # Cliente Axios e rotinas de comunicação
        └── utils/geo.js            # Fórmula de Haversine e utilitários espaciais
```

---

## 🛑 Parar a Execução

```bash
# Parar os containers mantendo os dados preservados no volume Docker
docker compose down

# Parar os containers e APAGAR o volume do banco (reset completo)
docker compose down -v
```
