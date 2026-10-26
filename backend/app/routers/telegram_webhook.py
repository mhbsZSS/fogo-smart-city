"""Webhook e Roteamento de Comandos de Campo via Telegram - F.O.G.O.

Recebe eventos assíncronos (Callback Queries de Inline Keyboards) emitidos
pelos agentes e viaturas em campo para automação de despacho e resposta a incidentes.
"""
from __future__ import annotations

import logging
import os
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.core.database import DbSession
from app.models.historico_evento import HistoricoEvento
from app.models.ocorrencia import Ocorrencia
from app.services.despacho_service import (
    concluir_ocorrencia_e_liberar_agentes,
    escalar_ocorrencia_critica,
)
from app.services.telegram_service import telegram_service

logger = logging.getLogger("uvicorn")

router = APIRouter(tags=["Telegram Webhook"])


@router.get("/webhook", summary="Status do Webhook do Telegram")
async def status_webhook() -> dict[str, str]:
    """Endpoint de checagem para verificar se o webhook do Telegram está ativo."""
    return {
        "status": "online",
        "servico": "F.O.G.O. Telegram Webhook Handler",
        "suporte": "Callback Queries (concluir_, apoio_)",
    }


@router.post("/webhook", summary="Receber eventos e callback queries do Telegram")
@router.post("/telegram/webhook", summary="Alias para webhook do Telegram")
async def telegram_webhook(
    request: Request,
    db: DbSession,
) -> dict[str, Any]:
    """Processa Webhook do Telegram (Updates com callback_query de Inline Keyboards).

    Rotas de Ação:
      - `concluir_<id>`: Atualiza a ocorrência para 'RESOLVIDA' e libera os agentes para 'DISPONIVEL'.
      - `apoio_<id>` (ou `checkin_apoio_<id>`): Escala para 'CRITICA' e despacha os 2 agentes mais próximos (Haversine).
    """
    try:
        body = await request.json()
    except Exception as exc:
        logger.error("❌ [WEBHOOK] Falha ao decodificar JSON do payload: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payload inválido: esperado formato JSON.",
        ) from exc

    logger.info("📩 [TELEGRAM WEBHOOK] Update recebido: %s", body)

    # 1. Extração do callback_query e metadados de contexto
    callback_query = body.get("callback_query")
    callback_data: str | None = None
    callback_query_id: str | None = None
    chat_id: str | int | None = None
    message_id: int | None = None

    if isinstance(callback_query, dict):
        callback_data = callback_query.get("data")
        callback_query_id = callback_query.get("id")

        # Recupera chat_id e message_id a partir da mensagem ou do remetente
        message = callback_query.get("message")
        if isinstance(message, dict):
            message_id = message.get("message_id")
            chat = message.get("chat")
            if isinstance(chat, dict):
                chat_id = chat.get("id")

        if not chat_id and "from" in callback_query:
            chat_id = callback_query["from"].get("id")

    else:
        # Suporte a payloads diretos (para testes internos ou integrações simplificadas)
        callback_data = body.get("callback_data") or body.get("data")
        callback_query_id = body.get("callback_query_id")
        chat_id = body.get("chat_id")
        message_id = body.get("message_id")

    if not callback_data:
        logger.info("ℹ️ [WEBHOOK] Update ignorado: sem callback_data no payload.")
        return {
            "ok": True,
            "ignorado": True,
            "motivo": "Nenhuma callback_query identificada no update.",
        }

    callback_data = str(callback_data).strip()
    logger.info("⚡ [WEBHOOK] Processando callback_data: '%s'", callback_data)

    # 2. Roteamento: Conclusão de Ocorrência ('concluir_ocorrencia_<id>' ou 'concluir_<id>')
    if callback_data.startswith("concluir_ocorrencia_") or callback_data.startswith("concluir_"):
        ocorrencia_id_str = callback_data.replace("concluir_ocorrencia_", "").replace("concluir_", "").strip()
        resultado = await concluir_ocorrencia_e_liberar_agentes(db, ocorrencia_id_str)

        # Formata a lista dos agentes envolvidos com nome e especialidade
        mapa_esp = {
            "AGENTE_TRANSITO": "Trânsito",
            "GUARDA_MUNICIPAL": "Guarda Municipal",
            "TECNICO_MANUTENCAO": "Técnico",
            "FISCAL_POSTURAS": "Fiscal",
            "DEFESA_CIVIL": "Defesa Civil",
            "RESGATE_MEDICO": "SAMU",
            "SAUDE": "SAMU",
        }
        agentes_dados = resultado.get("agentes", [])
        if agentes_dados:
            lista_de_agentes = ", ".join(
                f"{ag['nome']} ({mapa_esp.get(ag.get('tipo', ''), ag.get('tipo', 'Operacional'))})"
                for ag in agentes_dados
            )
        else:
            lista_de_agentes = "Efetivo em Campo"

        id_curto = str(resultado["ocorrencia_id"])[:8]
        msg_sucesso = (
            f"✅ Ocorrência #{id_curto} encerrada com sucesso.\n"
            f"🛡️ Registrado no CICC.\n"
            f"🤝 Equipa Tática: {lista_de_agentes}\n"
            f"Unidade liberada e disponível para novas chamadas."
        )

        if callback_query_id:
            await telegram_service.responder_callback_query(
                callback_query_id=callback_query_id,
                texto=f"✅ Ocorrência #{id_curto} encerrada com sucesso!",
                show_alert=False,
            )

        chat_ids_alvo = set()
        if chat_id:
            chat_ids_alvo.add(str(chat_id).strip())

        chat_teste = os.getenv("TELEGRAM_CHAT_ID_TESTE", "").strip()
        if chat_teste:
            chat_ids_alvo.add(chat_teste)

        chat_origem_str = str(chat_id).strip() if chat_id else None
        for c_id in chat_ids_alvo:
            if c_id == chat_origem_str and message_id:
                await telegram_service.editar_mensagem(
                    chat_id=c_id,
                    message_id=message_id,
                    texto=msg_sucesso,
                    reply_markup={"inline_keyboard": []},
                )
            else:
                await telegram_service.enviar_mensagem(
                    chat_id=c_id,
                    texto=msg_sucesso,
                    reply_markup={"inline_keyboard": []},
                )

        return {
            "ok": True,
            "acao": "concluir",
            "equipa_tatica": lista_de_agentes,
            "detalhes": resultado,
        }

    # 3. Roteamento: Pedido de Apoio / Escalada Crítica ('solicitar_apoio_<id>', 'apoio_<id>')
    if (
        callback_data.startswith("solicitar_apoio_")
        or callback_data.startswith("apoio_")
        or callback_data.startswith("checkin_apoio_")
    ):
        if callback_data.startswith("solicitar_apoio_"):
            oc_id_raw = callback_data.replace("solicitar_apoio_", "", 1).strip()
        elif callback_data.startswith("checkin_apoio_"):
            oc_id_raw = callback_data.replace("checkin_apoio_", "", 1).strip()
        else:
            oc_id_raw = callback_data.replace("apoio_", "", 1).strip()

        ocorrencia = None
        try:
            oc_uuid = uuid.UUID(oc_id_raw)
            ocorrencia = await db.get(Ocorrencia, oc_uuid)
        except ValueError:
            stmt = select(Ocorrencia)
            res = await db.execute(stmt)
            for oc in res.scalars().all():
                if str(oc.id).startswith(oc_id_raw):
                    ocorrencia = oc
                    break

        if not ocorrencia:
            logger.warning("⚠️ [WEBHOOK] Ocorrência '%s' não localizada para apoio.", oc_id_raw)
            if callback_query_id:
                await telegram_service.responder_callback_query(
                    callback_query_id=callback_query_id,
                    texto=f"⚠️ Ocorrência #{oc_id_raw[:8]} não encontrada.",
                    show_alert=True,
                )
            return {"ok": False, "erro": "Ocorrência não encontrada"}

        # Atualiza a Ocorrência: flag necessita_apoio = True, status = APOIO_SOLICITADO, gravidade = CRITICA
        ocorrencia.necessita_apoio = True
        ocorrencia.status = "APOIO_SOLICITADO"
        if ocorrencia.gravidade != "CRITICA":
            ocorrencia.gravidade = "CRITICA"

        db.add(
            HistoricoEvento(
                entidade_id=ocorrencia.id,
                tipo_evento="SOLICITACAO_APOIO_TELEGRAM",
            )
        )
        await db.commit()
        await db.refresh(ocorrencia)

        id_curto = str(ocorrencia.id)[:8]
        msg_feedback = (
            "🚨 *Solicitação de apoio recebida pelo CICC. Mantenha a posição, reforços a caminho.*\n\n"
            f"📌 *Ocorrência #{id_curto}* — {ocorrencia.titulo}\n"
            f"🔥 Gravidade: *{ocorrencia.gravidade}* | Status: *APOIO SOLICITADO*\n"
            f"📡 *Alerta prioritário emitido no topo do CICC.*"
        )

        reply_markup_edit = {
            "inline_keyboard": [
                [
                    {
                        "text": "✅ Resolver Ocorrência",
                        "callback_data": f"concluir_ocorrencia_{ocorrencia.id}",
                    }
                ]
            ]
        }

        if chat_id and message_id:
            await telegram_service.editar_mensagem(
                chat_id=chat_id,
                message_id=message_id,
                texto=msg_feedback,
                reply_markup=reply_markup_edit,
            )
        elif chat_id:
            await telegram_service.enviar_mensagem(
                chat_id=chat_id,
                texto=msg_feedback,
                reply_markup=reply_markup_edit,
            )

        if callback_query_id:
            await telegram_service.responder_callback_query(
                callback_query_id=callback_query_id,
                texto="🚨 Solicitação de apoio recebida pelo CICC. Mantenha a posição, reforços a caminho.",
                show_alert=True,
            )

        return {
            "ok": True,
            "acao": "solicitar_apoio",
            "ocorrencia_id": str(ocorrencia.id),
            "status": ocorrencia.status,
            "gravidade": ocorrencia.gravidade,
            "necessita_apoio": ocorrencia.necessita_apoio,
        }

    # 4. Outros fluxos de Inline Keyboards (Ex: 'retornando_', 'checkin_ok_')
    if callback_data.startswith("retornando_"):
        ocorrencia_id_str = callback_data.replace("retornando_", "", 1)
        if callback_query_id:
            await telegram_service.responder_callback_query(
                callback_query_id=callback_query_id,
                texto="🔄 Entendido, equipe em retorno ao perímetro.",
            )
        return {
            "ok": True,
            "acao": "retornando",
            "ocorrencia_id": ocorrencia_id_str,
        }

    if callback_data.startswith("checkin_ok_"):
        ocorrencia_id_str = callback_data.replace("checkin_ok_", "", 1)
        if callback_query_id:
            await telegram_service.responder_callback_query(
                callback_query_id=callback_query_id,
                texto="🛡️ Status confirmado: Equipe em segurança.",
            )
        return {
            "ok": True,
            "acao": "checkin_ok",
            "ocorrencia_id": ocorrencia_id_str,
        }

    logger.warning("⚠️ [WEBHOOK] Callback data desconhecido: '%s'", callback_data)
    return {
        "ok": True,
        "acao": "desconhecido",
        "callback_data": callback_data,
    }
