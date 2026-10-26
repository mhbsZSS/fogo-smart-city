"""Módulo de Rotas e Webhook do Telegram - F.O.G.O.

Processa atualizações da API de Bots do Telegram, comandos remotos de campo
e encerramento ágil de ocorrências com liberação imediata do efetivo.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import or_, select

from app.core.database import DbSession
from app.core.websocket import ws_manager
from app.models.agente import Agente
from app.models.historico_evento import HistoricoEvento
from app.models.ocorrencia import Ocorrencia
from app.services.despacho_service import (
    concluir_ocorrencia_e_liberar_agentes,
    escalar_ocorrencia_critica,
)
from app.services.telegram_service import telegram_service

logger = logging.getLogger("uvicorn")

router = APIRouter(prefix="/telegram", tags=["Telegram"])


@router.get("/webhook", summary="Status do Webhook do Telegram")
async def status_webhook() -> dict[str, Any]:
    """Endpoint de checagem para verificar se o webhook do Telegram está ativo."""
    return {
        "status": "online",
        "servico": "F.O.G.O. Telegram Webhook Handler",
        "bot_configurado": telegram_service.is_configured,
        "acoes_suportadas": [
            "/alerta <descricao> (Self-Dispatch de Campo)",
            "concluir_ocorrencia_<id>",
            "solicitar_apoio_<id>",
            "concluir_<id>",
            "apoio_<id>",
        ],
    }


@router.post("/recarregar-configuracao", summary="Forçar releitura do .env e registrar webhook")
async def recarregar_configuracao() -> dict[str, Any]:
    """Força recarregamento imediato das variáveis de ambiente (.env) e registra o webhook."""
    import os
    import httpx
    from dotenv import load_dotenv

    load_dotenv(override=True)
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    public_url = os.getenv("PUBLIC_URL", "").strip()

    if not bot_token:
        raise HTTPException(status_code=400, detail="TELEGRAM_BOT_TOKEN não encontrado no .env")

    # Verifica getMe
    async with httpx.AsyncClient(timeout=10.0) as client:
        r_me = await client.get(f"https://api.telegram.org/bot{bot_token}/getMe")
        me_data = r_me.json()

    webhook_resultado = None
    if public_url:
        clean_url = public_url.rstrip("/").split("](")[0].strip("[]()")
        webhook_url = f"{clean_url}/api/v1/telegram/webhook"
        set_url = f"https://api.telegram.org/bot{bot_token}/setWebhook"
        async with httpx.AsyncClient(timeout=10.0) as client:
            r_wh = await client.post(set_url, json={"url": webhook_url})
            webhook_resultado = r_wh.json()

    return {
        "sucesso": True,
        "bot_info": me_data,
        "webhook_resultado": webhook_resultado,
    }


@router.post("/webhook", summary="Receber eventos, mensagens de texto e callback queries do Telegram")
async def telegram_webhook(
    request: Request,
    db: DbSession,
) -> dict[str, Any]:
    """Processa Webhook do Telegram:
    1. Mensagens de texto (/alerta <descricao> para criação de ocorrências via Self-Dispatch de Campo).
    2. Callback queries de Inline Keyboards (✅ Resolver Ocorrência ou 🚨 Solicitar Apoio).
    """
    try:
        body = await request.json()
    except Exception as exc:
        logger.error("❌ [TELEGRAM WEBHOOK] Falha ao decodificar JSON do payload: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payload inválido: esperado formato JSON.",
        ) from exc

    logger.info("📩 [TELEGRAM WEBHOOK] Update recebido: %s", body)

    # 1. Extração de callback_query, message ou payload direto
    callback_query = body.get("callback_query")
    message_obj = body.get("message") or body.get("edited_message")

    callback_data: str | None = None
    callback_query_id: str | None = None
    chat_id: str | int | None = None
    message_id: int | None = None
    text_message: str | None = None

    if isinstance(callback_query, dict):
        callback_data = callback_query.get("data")
        callback_query_id = callback_query.get("id")

        msg = callback_query.get("message")
        if isinstance(msg, dict):
            message_id = msg.get("message_id")
            chat = msg.get("chat")
            if isinstance(chat, dict):
                chat_id = chat.get("id")

        if not chat_id and "from" in callback_query:
            chat_id = callback_query["from"].get("id")

    elif isinstance(message_obj, dict):
        text_message = message_obj.get("text")
        message_id = message_obj.get("message_id")
        chat = message_obj.get("chat")
        if isinstance(chat, dict):
            chat_id = chat.get("id")
        if not chat_id and "from" in message_obj:
            chat_id = message_obj["from"].get("id")

    else:
        # Suporte a payloads diretos (para testes internos, terminal dev ou simulação)
        callback_data = body.get("callback_data") or body.get("data")
        callback_query_id = body.get("callback_query_id")
        chat_id = body.get("chat_id")
        message_id = body.get("message_id")
        text_message = body.get("text")

    # 2. Processamento de Mensagens de Texto (Comando /alerta - Self-Dispatch)
    if text_message:
        texto_limpo = str(text_message).strip()
        logger.info("💬 [TELEGRAM WEBHOOK] Mensagem de texto recebida no chat %s: '%s'", chat_id, texto_limpo)

        # Trata o comando /alerta
        if texto_limpo.lower().startswith("/alerta"):
            partes = texto_limpo.split(maxsplit=1)
            descricao = partes[1].strip() if len(partes) > 1 else ""

            if not descricao:
                msg_ajuda = (
                    "⚠️ *Instrução de Alerta Tático (Self-Dispatch):*\n\n"
                    "Para registrar uma nova ocorrência a partir do campo, envie `/alerta` seguido da descrição do incidente presenciado.\n\n"
                    "💡 *Exemplo:*\n"
                    "`/alerta Fio de alta tensão rompido na calçada com faíscas`"
                )
                if chat_id:
                    await telegram_service.enviar_mensagem(
                        chat_id=chat_id,
                        texto=msg_ajuda,
                        parse_mode="Markdown",
                    )
                return {
                    "ok": True,
                    "acao": "alerta_ajuda",
                    "motivo": "Comando /alerta recebido sem descrição.",
                }

            # Tenta identificar o agente pelo telegram_chat_id
            agente = None
            if chat_id:
                stmt_ag = select(Agente).where(Agente.telegram_chat_id == str(chat_id).strip())
                res_ag = await db.execute(stmt_ag)
                agente = res_ag.scalars().first()

            # Título e descrição
            titulo = descricao if len(descricao) <= 60 else f"{descricao[:57]}..."

            # Coordenadas aproximadas: se agente possuir GPS, utiliza; senão, coordenadas do CICC de Marília
            lat = agente.latitude if (agente and agente.latitude is not None) else -22.2139
            lng = agente.longitude if (agente and agente.longitude is not None) else -49.9458

            # Mapeamento estrito de Categoria:
            # Garante que NUNCA caia no limbo de manutenção genérica, entrando SEMPRE
            # na Fila Principal de "Emergências Pendentes" no Frontend CICC
            mapa_tipo_agente = {
                "DEFESA_CIVIL": "DEFESA_CIVIL",
                "GUARDA_MUNICIPAL": "SEGURANCA",
                "AGENTE_TRANSITO": "TRANSITO",
                "RESGATE_MEDICO": "ACIDENTE",
                "SAUDE": "ACIDENTE",
                "FISCAL_POSTURAS": "DEFESA_CIVIL",
                "TECNICO_MANUTENCAO": "DEFESA_CIVIL",
            }
            tipo_ocorrencia = mapa_tipo_agente.get(agente.tipo, "DEFESA_CIVIL") if agente else "DEFESA_CIVIL"

            descricao_completa = descricao
            if agente:
                descricao_completa = (
                    f"{descricao}\n\n"
                    f"[🚨 Self-Dispatch de Campo via Telegram]\n"
                    f"Agente: {agente.nome} ({agente.tipo}) | Chat ID: {chat_id}"
                )
            else:
                descricao_completa = (
                    f"{descricao}\n\n"
                    f"[🚨 Alerta de Campo via Telegram]\n"
                    f"Chat ID: {chat_id or 'Não informado'}"
                )

            # Cria novo registro de Ocorrencia via SQLAlchemy com tipo de emergência reconhecido
            nova_ocorrencia = Ocorrencia(
                titulo=titulo,
                descricao=descricao_completa,
                tipo=tipo_ocorrencia,
                gravidade="MEDIA",
                status="PENDENTE",
                latitude=lat,
                longitude=lng,
                agente_id=agente.id if agente else None,
            )
            db.add(nova_ocorrencia)
            await db.flush()

            # Trilha de auditoria no HistoricoEvento
            db.add(
                HistoricoEvento(
                    entidade_id=nova_ocorrencia.id,
                    tipo_evento="OCORRENCIA_CRIADA_TELEGRAM",
                )
            )
            if agente:
                db.add(
                    HistoricoEvento(
                        entidade_id=agente.id,
                        tipo_evento="AGENTE_ALERTA_DISPARADO",
                    )
                )

            await db.commit()
            await db.refresh(nova_ocorrencia)

            id_curto = str(nova_ocorrencia.id)[:8].upper()
            logger.info(
                "🚨 [TELEGRAM WEBHOOK] Alerta registrado: Ocorrência #%s criada por chat_id %s (Tipo: %s, Agente: %s)",
                nova_ocorrencia.id,
                chat_id,
                nova_ocorrencia.tipo,
                agente.nome if agente else "Não mapeado",
            )

            # 🚀 EMISSÃO WEBSOCKET: Notifica imediatamente o Frontend para atualizar a Fila de Despacho sem F5
            await ws_manager.broadcast({
                "action": "nova_ocorrencia",
                "ocorrencia_id": str(nova_ocorrencia.id),
                "protocolo": id_curto,
                "titulo": nova_ocorrencia.titulo,
                "tipo": nova_ocorrencia.tipo,
                "gravidade": nova_ocorrencia.gravidade,
                "status": nova_ocorrencia.status,
            })

            # Feedback ao Agente via sendMessage
            mapa_nomes_legiveis = {
                "DEFESA_CIVIL": "Defesa Civil",
                "SEGURANCA": "Segurança Pública",
                "TRANSITO": "Trânsito",
                "ACIDENTE": "Resgate / Acidente",
                "ALERTA_CAMPO": "Alerta de Campo",
            }
            tipo_legivel = mapa_nomes_legiveis.get(nova_ocorrencia.tipo, nova_ocorrencia.tipo)

            msg_feedback = (
                "🚨 *Alerta registado com sucesso! A ocorrência está agora visível no painel do CICC para despacho oficial.*\n\n"
                f"📌 *Protocolo:* `#{id_curto}`\n"
                f"📝 *Resumo:* {nova_ocorrencia.titulo}\n"
                f"⚙️ *Tipo:* {tipo_legivel} | Gravidade: Média\n"
                f"🛡️ *Fila:* Emergências Pendentes (CICC)"
            )

            if chat_id:
                await telegram_service.enviar_mensagem(
                    chat_id=chat_id,
                    texto=msg_feedback,
                    parse_mode="Markdown",
                )

            return {
                "ok": True,
                "acao": "alerta_registrado",
                "ocorrencia_id": str(nova_ocorrencia.id),
                "protocolo": id_curto,
                "titulo": nova_ocorrencia.titulo,
                "status": nova_ocorrencia.status,
                "agente_identificado": agente.nome if agente else None,
            }

        # Comandos auxiliares /start ou /ajuda
        if texto_limpo.lower() in ("/start", "/help", "/ajuda"):
            msg_ajuda = (
                "🛡️ *F.O.G.O. — Terminal Tático Telegram*\n\n"
                "Central de Comunicação Operacional do CICC de Marília/SP.\n\n"
                "🚨 *Como reportar um incidente presenciado no terreno (Self-Dispatch):*\n"
                "Envie `/alerta` seguido da descrição.\n"
                "_Exemplo:_ `/alerta Fio de alta tensão rompido na calçada com faíscas`\n\n"
                "✅ Para ocorrências despachadas, utilize os botões *Resolver* ou *Solicitar Apoio* recebidos."
            )
            if chat_id:
                await telegram_service.enviar_mensagem(
                    chat_id=chat_id,
                    texto=msg_ajuda,
                    parse_mode="Markdown",
                )
            return {
                "ok": True,
                "acao": "start_ajuda",
            }

        # Mensagens de texto livres sem comando
        msg_padrao = (
            "ℹ️ *Comando não reconhecido.*\n\n"
            "Para reportar um incidente ao CICC, utilize o comando:\n"
            "`/alerta <descrição do ocorrido>`"
        )
        if chat_id:
            await telegram_service.enviar_mensagem(
                chat_id=chat_id,
                texto=msg_padrao,
                parse_mode="Markdown",
            )
        return {
            "ok": True,
            "acao": "texto_nao_reconhecido",
            "mensagem": "Comando não reconhecido. Instruções enviadas.",
        }

    # 3. Processamento de Callback Queries (Inline Keyboards)
    if not callback_data:
        logger.info("ℹ️ [TELEGRAM WEBHOOK] Update ignorado: sem callback_data nem texto no payload.")
        return {
            "ok": True,
            "ignorado": True,
            "motivo": "Nenhuma callback_query nem mensagem de texto identificada no update.",
        }

    callback_data = str(callback_data).strip()
    logger.info("⚡ [TELEGRAM WEBHOOK] Processando callback_data: '%s'", callback_data)

    # 2. Roteamento: Encerramento de Ocorrência ('concluir_ocorrencia_<id>' ou 'concluir_<id>')
    if callback_data.startswith("concluir_ocorrencia_") or callback_data.startswith("concluir_"):
        if callback_data.startswith("concluir_ocorrencia_"):
            ocorrencia_id_raw = callback_data.replace("concluir_ocorrencia_", "", 1).strip()
        else:
            ocorrencia_id_raw = callback_data.replace("concluir_", "", 1).strip()

        # Busca a ocorrência no banco de dados (UUID completo ou início de string)
        ocorrencia = None
        try:
            oc_uuid = uuid.UUID(ocorrencia_id_raw)
            ocorrencia = await db.get(Ocorrencia, oc_uuid)
        except ValueError:
            stmt = select(Ocorrencia)
            res = await db.execute(stmt)
            for oc in res.scalars().all():
                if str(oc.id).startswith(ocorrencia_id_raw):
                    ocorrencia = oc
                    break

        if not ocorrencia:
            logger.warning("⚠️ [TELEGRAM WEBHOOK] Ocorrência '%s' não localizada no banco.", ocorrencia_id_raw)
            if callback_query_id:
                await telegram_service.responder_callback_query(
                    callback_query_id=callback_query_id,
                    texto=f"⚠️ Ocorrência #{ocorrencia_id_raw[:8]} não encontrada no sistema.",
                    show_alert=True,
                )
            return {"ok": False, "erro": "Ocorrência não encontrada"}

        agora = datetime.now(timezone.utc)
        ocorrencia.status = "RESOLVIDA"
        ocorrencia.data_conclusao = agora

        # 1. Recupera TODOS os agentes vinculados a essa ocorrência (relação 1:N)
        condicoes_agente = [Agente.ocorrencia_id == ocorrencia.id]
        if ocorrencia.agente_id:
            condicoes_agente.append(Agente.id == ocorrencia.agente_id)

        stmt_ag = select(Agente).where(or_(*condicoes_agente))
        res_ag = await db.execute(stmt_ag)
        agentes_vinculados = list(res_ag.scalars().all())

        # 2. Formata a lista dos agentes envolvidos com nome e especialidade
        # Ex: "Karina (SAMU), Nicolas (Trânsito)"
        mapa_esp = {
            "AGENTE_TRANSITO": "Trânsito",
            "GUARDA_MUNICIPAL": "Guarda Municipal",
            "TECNICO_MANUTENCAO": "Técnico",
            "FISCAL_POSTURAS": "Fiscal",
            "DEFESA_CIVIL": "Defesa Civil",
            "RESGATE_MEDICO": "SAMU",
            "SAUDE": "SAMU",
        }
        if agentes_vinculados:
            lista_de_agentes = ", ".join(
                f"{ag.nome} ({mapa_esp.get(ag.tipo, ag.tipo)})" for ag in agentes_vinculados
            )
        else:
            lista_de_agentes = "Efetivo em Campo"

        # 3. Libera os agentes vinculados de volta para DISPONIVEL
        for ag in agentes_vinculados:
            ag.status = "DISPONIVEL"
            ag.ocorrencia_id = None
            db.add(
                HistoricoEvento(
                    entidade_id=ag.id,
                    tipo_evento="AGENTE_LIBERADO_TELEGRAM",
                )
            )

        db.add(
            HistoricoEvento(
                entidade_id=ocorrencia.id,
                tipo_evento="OCORRENCIA_RESOLVIDA_TELEGRAM",
            )
        )

        await db.commit()
        await db.refresh(ocorrencia)

        id_curto = str(ocorrencia.id)[:8]
        logger.info(
            "✅ [TELEGRAM WEBHOOK] Ocorrência #%s marcada como RESOLVIDA. %d agente(s) liberado(s): %s",
            ocorrencia.id,
            len(agentes_vinculados),
            lista_de_agentes,
        )

        # 🚀 EMISSÃO WEBSOCKET: Notifica o Frontend CICC para liberar o status dos agentes e atualizar a fila
        await ws_manager.broadcast({
            "action": "ocorrencia_resolvida",
            "ocorrencia_id": str(ocorrencia.id),
            "status": "RESOLVIDA",
            "agentes_liberados": len(agentes_vinculados),
        })

        # 4. Formata a mensagem de encerramento da equipa tática
        msg_editada = (
            f"✅ Ocorrência #{id_curto} encerrada com sucesso.\n"
            f"🛡️ Registrado no CICC.\n"
            f"🤝 Equipa Tática: {lista_de_agentes}\n"
            f"Unidade liberada e disponível para novas chamadas."
        )

        # 5. Coleta todos os chat_ids dos agentes envolvidos (relação 1:N)
        chat_ids_alvo = set()
        if chat_id:
            chat_ids_alvo.add(str(chat_id).strip())

        for ag in agentes_vinculados:
            c_id = getattr(ag, "telegram_chat_id", None)
            if c_id:
                chat_ids_alvo.add(str(c_id).strip())

        chat_teste = os.getenv("TELEGRAM_CHAT_ID_TESTE", "").strip()
        if chat_teste:
            chat_ids_alvo.add(chat_teste)

        # 6. Itera sobre todos os chat_ids para que todos recebam a confirmação da ocorrência conjunta
        chat_origem_str = str(chat_id).strip() if chat_id else None
        for c_id in chat_ids_alvo:
            if c_id == chat_origem_str and message_id:
                # No chat de onde partiu o clique, edita a mensagem original removendo os botões
                await telegram_service.editar_mensagem(
                    chat_id=c_id,
                    message_id=message_id,
                    texto=msg_editada,
                    reply_markup={"inline_keyboard": []},
                )
            else:
                # Para os demais agentes da equipe tática 1:N, envia nova mensagem direta
                await telegram_service.enviar_mensagem(
                    chat_id=c_id,
                    texto=msg_editada,
                    reply_markup={"inline_keyboard": []},
                )

        if callback_query_id:
            await telegram_service.responder_callback_query(
                callback_query_id=callback_query_id,
                texto=f"✅ Ocorrência #{id_curto} encerrada com sucesso!",
                show_alert=False,
            )

        return {
            "ok": True,
            "acao": "concluir_ocorrencia",
            "ocorrencia_id": str(ocorrencia.id),
            "agentes_liberados": len(agentes_vinculados),
            "equipa_tatica": lista_de_agentes,
            "status": "RESOLVIDA",
        }

    # 3. Roteamento: Solicitação de Apoio / Escalada Tática ('solicitar_apoio_<id>', 'apoio_<id>')
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
            logger.warning("⚠️ [TELEGRAM WEBHOOK] Ocorrência '%s' não localizada para solicitação de apoio.", oc_id_raw)
            if callback_query_id:
                await telegram_service.responder_callback_query(
                    callback_query_id=callback_query_id,
                    texto=f"⚠️ Ocorrência #{oc_id_raw[:8]} não encontrada no sistema.",
                    show_alert=True,
                )
            return {"ok": False, "erro": "Ocorrência não encontrada"}

        # Atualiza a Ocorrência no banco de dados:
        # 1. Ativa a flag necessita_apoio = True
        # 2. Atualiza o status para APOIO_SOLICITADO
        # 3. Eleva a gravidade para CRITICA
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
        logger.warning(
            "🚨 [TELEGRAM WEBHOOK] Apoio solicitado para ocorrência #%s (%s). Gravidade: CRÍTICA, necessita_apoio: True",
            ocorrencia.id,
            ocorrencia.titulo,
        )

        # 🚀 EMISSÃO WEBSOCKET: Notifica o Frontend CICC para piscar alerta vermelho e subir ocorrência para o topo
        await ws_manager.broadcast({
            "action": "apoio_solicitado",
            "ocorrencia_id": str(ocorrencia.id),
            "status": "APOIO_SOLICITADO",
            "gravidade": "CRITICA",
            "necessita_apoio": True,
        })

        # Envia feedback ao Telegram do agente via editMessageText:
        # "🚨 Solicitação de apoio recebida pelo CICC. Mantenha a posição, reforços a caminho."
        msg_feedback = (
            "🚨 *Solicitação de apoio recebida pelo CICC. Mantenha a posição, reforços a caminho.*\n\n"
            f"📌 *Ocorrência #{id_curto}* — {ocorrencia.titulo}\n"
            f"🔥 Gravidade: *{ocorrencia.gravidade}* | Status: *APOIO SOLICITADO*\n"
            f"📡 *Alerta prioritário emitido no topo do CICC.*"
        )

        # Mantém o botão de Resolver para permitir fechamento posterior
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

    logger.warning("⚠️ [TELEGRAM WEBHOOK] Callback data desconhecido: '%s'", callback_data)
    return {
        "ok": True,
        "acao": "desconhecido",
        "callback_data": callback_data,
    }
