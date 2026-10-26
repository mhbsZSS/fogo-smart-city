import asyncio
import logging
import os
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

import app.models  # noqa: F401  (registra os modelos no metadata, incluindo Ocorrencia)
from app.api.router import api_router
from app.api.routes import agentes, equipamentos, ocorrencias
from app.core.config import settings
from app.core.database import Base, engine
from app.core.websocket import ws_manager
from app.routers import preditivo, relatorios, telegram, telegram_webhook
from app.services.simulador_vivo import iniciar_simulador_vivo

logger = logging.getLogger("uvicorn")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # MVP: cria as tabelas automaticamente. Em produção, substituir por Alembic.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Compatibilidade e migração transparente: garante colunas e índices no banco de dados existente
        try:
            await conn.execute(text(
                "ALTER TABLE agentes ADD COLUMN IF NOT EXISTS ocorrencia_id UUID REFERENCES ocorrencias(id) ON DELETE SET NULL;"
            ))
            await conn.execute(text(
                "ALTER TABLE agentes ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(50);"
            ))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_agentes_ocorrencia_id ON agentes(ocorrencia_id);"
            ))
            await conn.execute(text(
                "ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS data_despacho TIMESTAMPTZ;"
            ))
            await conn.execute(text(
                "ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS data_conclusao TIMESTAMPTZ;"
            ))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_ocorrencias_data_despacho ON ocorrencias(data_despacho);"
            ))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_ocorrencias_data_conclusao ON ocorrencias(data_conclusao);"
            ))
            await conn.execute(text(
                "ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS necessita_apoio BOOLEAN NOT NULL DEFAULT false;"
            ))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_ocorrencias_necessita_apoio ON ocorrencias(necessita_apoio);"
            ))
        except Exception:
            pass

    # Auto-registro do Webhook do Telegram
    bot_token = (os.getenv("TELEGRAM_BOT_TOKEN") or getattr(settings, "TELEGRAM_BOT_TOKEN", "") or "").strip()
    public_url = (os.getenv("PUBLIC_URL") or "").strip()
    if bot_token and public_url:
        clean_url = public_url.rstrip("/").split("](")[0].strip("[]()")
        webhook_url = f"{clean_url}/api/v1/telegram/webhook"
        set_webhook_api = f"https://api.telegram.org/bot{bot_token}/setWebhook"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(set_webhook_api, json={"url": webhook_url})
                data = res.json()
                if data.get("ok"):
                    logger.info("🚀 Webhook do Telegram ativado com sucesso! URL: %s", webhook_url)
                else:
                    logger.warning("⚠️ [TELEGRAM] Resposta ao registrar webhook: %s", data)
        except Exception as exc:
            logger.error("❌ [TELEGRAM] Falha ao registrar webhook no Telegram: %s", exc)
    else:
        logger.info("ℹ️ [TELEGRAM] TELEGRAM_BOT_TOKEN ou PUBLIC_URL não definidos; registro de webhook ignorado.")

    # Inicia o Motor de Simulação Contínua (Live Data Generator) como tarefa paralela em background
    tarefa_simulador = asyncio.create_task(iniciar_simulador_vivo())

    yield

    # Encerra o simulador graciosamente no shutdown do servidor
    tarefa_simulador.cancel()
    try:
        await tarefa_simulador
    except asyncio.CancelledError:
        pass

    await engine.dispose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="API de gestão de cidades inteligentes — piloto Marília/SP.",
    version="0.1.0",
    lifespan=lifespan,
)

# Origens permitidas para CORS (inclui origens do .env, portas de dev do frontend e regex dinâmico)
origens_cors = list(
    set(
        settings.cors_origins_list
        + [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
        ]
    )
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origens_cors,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API v1 central
app.include_router(api_router, prefix=settings.API_V1_PREFIX)

# Roteador de ocorrências, agentes e equipamentos registrados
app.include_router(ocorrencias.router)
app.include_router(agentes.router)
app.include_router(equipamentos.router)

# Roteador de Inteligência Preditiva (Fase 6 - Cidade Preditiva)
app.include_router(preditivo.router)

# Roteador de Relatórios e Auditorias de IA (Fase 3 - Oráculo Preditivo)
app.include_router(relatorios.router)
app.include_router(relatorios.router, prefix=settings.API_V1_PREFIX)

# Roteador do Webhook do Telegram (Item 3 & 4: Escalada Tática, Comandos de Campo e Painel Dev)
app.include_router(telegram.router)
app.include_router(telegram.router, prefix=settings.API_V1_PREFIX)
app.include_router(telegram_webhook.router)
app.include_router(telegram_webhook.router, prefix=settings.API_V1_PREFIX)


@app.get("/health", tags=["Infra"])
async def health():
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok", "cidade": "Marília/SP"}


@app.websocket("/ws")
@app.websocket("/api/v1/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Endpoint WebSocket para sincronização reativa e instantânea do Frontend CICC."""
    await ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)

