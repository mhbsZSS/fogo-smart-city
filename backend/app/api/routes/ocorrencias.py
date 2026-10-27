import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, status
from sqlalchemy import select

from app.core.database import DbSession
from app.core.websocket import ws_manager
from app.models import Agente, Equipamento, HistoricoEvento, Ocorrencia
from app.schemas import DespachoInput, OcorrenciaCreate, OcorrenciaResponse, OcorrenciaUpdate
from app.services.despacho_service import concluir_ocorrencia_e_liberar_agentes
from app.services.telegram_service import telegram_service

logger = logging.getLogger("uvicorn")

router = APIRouter(prefix="/ocorrencias", tags=["Ocorrencias"])


@router.get("", response_model=list[OcorrenciaResponse], summary="Listar ocorrências")
async def listar_ocorrencias(
    db: DbSession,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    status_: str | None = Query(None, alias="status"),
    tipo: str | None = None,
    gravidade: str | None = None,
):
    """Retorna as ocorrências cadastradas, ordenadas das mais recentes para as mais antigas."""
    stmt = select(Ocorrencia)
    if status_:
        stmt = stmt.where(Ocorrencia.status == status_.upper())
    if tipo:
        stmt = stmt.where(Ocorrencia.tipo == tipo.upper())
    if gravidade:
        stmt = stmt.where(Ocorrencia.gravidade == gravidade.upper())

    stmt = stmt.order_by(Ocorrencia.criado_em.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{id}", response_model=OcorrenciaResponse, summary="Obter ocorrência por ID")
async def obter_ocorrencia(id: uuid.UUID, db: DbSession):
    ocorrencia = await db.get(Ocorrencia, id)
    if not ocorrencia:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ocorrência {id} não encontrada.",
        )
    return ocorrencia


@router.post(
    "",
    response_model=OcorrenciaResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar nova ocorrência",
)
async def criar_ocorrencia(payload: OcorrenciaCreate, db: DbSession):
    """Registra uma nova ocorrência com status inicial PENDENTE."""
    dados = payload.model_dump()

    # Valida equipamento caso informado
    if payload.equipamento_id:
        equipamento = await db.get(Equipamento, payload.equipamento_id)
        if not equipamento:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Equipamento {payload.equipamento_id} não encontrado.",
            )

    ocorrencia = Ocorrencia(
        titulo=dados["titulo"],
        descricao=dados["descricao"],
        tipo=dados["tipo"],
        gravidade=dados["gravidade"],
        status="PENDENTE",
        latitude=dados["latitude"],
        longitude=dados["longitude"],
        equipamento_id=dados.get("equipamento_id"),
    )

    db.add(ocorrencia)
    await db.flush()

    db.add(
        HistoricoEvento(
            entidade_id=ocorrencia.id,
            tipo_evento="OCORRENCIA_CRIADA",
        )
    )
    await db.commit()
    await db.refresh(ocorrencia)

    await ws_manager.broadcast({
        "action": "nova_ocorrencia",
        "ocorrencia_id": str(ocorrencia.id),
        "protocolo": str(ocorrencia.id)[:8].upper(),
        "titulo": ocorrencia.titulo,
        "tipo": ocorrencia.tipo,
        "gravidade": ocorrencia.gravidade,
        "status": ocorrencia.status,
    })
    return ocorrencia


async def notificar_despacho_telegram(
    ocorrencia_id: uuid.UUID | str,
    titulo: str,
    tipo: str,
    gravidade: str,
    latitude: float,
    longitude: float,
    agente_nome: str,
) -> None:
    """Dispara alerta assíncrono com Inline Keyboard para o chat de teste do Telegram."""
    chat_id = os.getenv("TELEGRAM_CHAT_ID_TESTE", "").strip()
    if not chat_id:
        logger.info("ℹ️ [TELEGRAM] TELEGRAM_CHAT_ID_TESTE não configurado no .env; notificação cancelada.")
        return

    texto = (
        "🚨 *NOVA OCORRÊNCIA DESPACHADA* 🚨\n\n"
        f"📌 *ID:* `#{str(ocorrencia_id)[:8]}`\n"
        f"📋 *Título:* {titulo}\n"
        f"🏷️ *Tipo:* {tipo} | *Gravidade:* {gravidade}\n"
        f"📍 *Localização:* Lat `{latitude:.5f}`, Lng `{longitude:.5f}`\n"
        f"👮‍♂️ *Agente Designado:* {agente_nome}\n\n"
        "Comandos táticos operacionais em campo:"
    )

    reply_markup = {
        "inline_keyboard": [
            [
                {
                    "text": "✅ Resolver",
                    "callback_data": f"concluir_ocorrencia_{ocorrencia_id}",
                }
            ],
            [
                {
                    "text": "🚨 Solicitar Apoio",
                    "callback_data": f"solicitar_apoio_{ocorrencia_id}",
                }
            ],
        ]
    }

    try:
        await telegram_service.enviar_mensagem(
            chat_id=chat_id,
            texto=texto,
            reply_markup=reply_markup,
            parse_mode="Markdown",
        )
        logger.info("📱 [TELEGRAM] Notificação de despacho enviada ao chat %s para ocorrência #%s", chat_id, ocorrencia_id)
    except Exception as exc:
        logger.error("❌ [TELEGRAM] Falha ao enviar notificação de despacho para %s: %s", chat_id, exc)


@router.put(
    "/{id}/despachar",
    response_model=OcorrenciaResponse,
    summary="Despachar agente para a ocorrência",
)
async def despachar_agente(
    id: uuid.UUID,
    payload: DespachoInput,
    db: DbSession,
    background_tasks: BackgroundTasks,
):
    """
    Despacha um agente operacional para o local da ocorrência.
    Atualiza a ocorrência para o status DESPACHADA, registra data_despacho e vincula o agente_id.
    Dispara em background a notificação tática via Telegram com botão interativo 'Resolver'.
    """
    ocorrencia = await db.get(Ocorrencia, id)
    if not ocorrencia:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ocorrência {id} não encontrada.",
        )

    agente = await db.get(Agente, payload.agente_id)
    if not agente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agente {payload.agente_id} não encontrado.",
        )

    # Validação de Restrições Rígidas de Competência (Hard Constraints)
    tipo_oc = (ocorrencia.tipo or "").upper()
    gravidade_oc = (ocorrencia.gravidade or "").upper()
    tipo_ag = (agente.tipo or "").upper()

    # 1. Hard Constraint Saúde: Agente de Saúde atende exclusivamente emergências médicas e acidentes graves
    if tipo_ag in ("RESGATE_MEDICO", "SAUDE"):
        eh_emergencia_medica = tipo_oc in ("SAUDE", "EMERGENCIA_MEDICA") or (
            tipo_oc == "ACIDENTE" and gravidade_oc in ("ALTA", "CRITICA")
        )
        if not eh_emergencia_medica:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Restrição Rígida de Competência: Unidades de Saúde ({agente.nome}) atendem exclusivamente emergências médicas e acidentes graves.",
            )

    # 2. Hard Constraint Médica: Ocorrências de Saúde não podem receber agentes não médicos
    if tipo_oc in ("SAUDE", "EMERGENCIA_MEDICA") and tipo_ag not in ("RESGATE_MEDICO", "SAUDE"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Restrição Rígida de Competência: Ocorrência médica requer unidade de Saúde (RESGATE_MEDICO/SAUDE). Agente {agente.nome} ({tipo_ag}) não está habilitado.",
        )

    # 3. Hard Constraint Manutenção: Manutenção de infraestrutura urbana requer técnico especializado
    if (tipo_oc == "MANUTENCAO" or ocorrencia.equipamento_id is not None) and tipo_ag != "TECNICO_MANUTENCAO":
        if tipo_oc == "MANUTENCAO":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Restrição Rígida de Competência: Manutenção técnica requer técnico habilitado (TECNICO_MANUTENCAO). Agente {agente.nome} ({tipo_ag}) não é técnico de manutenção.",
            )

    agora = datetime.now(timezone.utc)
    if not ocorrencia.agente_id:
        ocorrencia.agente_id = payload.agente_id
    ocorrencia.status = "DESPACHADA"
    ocorrencia.necessita_apoio = False
    if not ocorrencia.data_despacho:
        ocorrencia.data_despacho = agora

    # Atualiza o status e vínculo do agente para a ocorrência
    agente.status = "EM_DESLOCAMENTO"
    agente.ocorrencia_id = ocorrencia.id

    db.add(
        HistoricoEvento(
            entidade_id=ocorrencia.id,
            tipo_evento="OCORRENCIA_DESPACHADA",
        )
    )
    db.add(
        HistoricoEvento(
            entidade_id=agente.id,
            tipo_evento="AGENTE_DESPACHADO",
        )
    )

    await db.commit()
    await db.refresh(ocorrencia)

    await ws_manager.broadcast({
        "action": "ocorrencia_despachada",
        "ocorrencia_id": str(ocorrencia.id),
        "agente_id": str(agente.id),
        "status": ocorrencia.status,
    })

    # Dispara mensagem via Telegram em segundo plano para o chat de teste
    background_tasks.add_task(
        notificar_despacho_telegram,
        ocorrencia_id=ocorrencia.id,
        titulo=ocorrencia.titulo,
        tipo=ocorrencia.tipo,
        gravidade=ocorrencia.gravidade,
        latitude=ocorrencia.latitude,
        longitude=ocorrencia.longitude,
        agente_nome=agente.nome,
    )

    return ocorrencia


@router.put(
    "/{ocorrencia_id}/concluir",
    summary="Concluir ocorrência e liberar agentes (Override Manual)",
)
async def concluir_ocorrencia(
    ocorrencia_id: str,
    db: DbSession,
):
    """
    Conclui manualmente a ocorrência e libera todos os agentes vinculados para prontidão.
    Serve como redundância (override) do operador do CICC à automação do Telegram.
    """
    resultado = await concluir_ocorrencia_e_liberar_agentes(
        db=db,
        ocorrencia_id=ocorrencia_id,
    )
    await ws_manager.broadcast({
        "action": "ocorrencia_resolvida",
        "ocorrencia_id": str(ocorrencia_id),
        "status": "RESOLVIDA",
    })
    return {
        "mensagem": "Ocorrência encerrada e agentes liberados com sucesso.",
        **resultado,
    }


@router.put(
    "/{id}",
    response_model=OcorrenciaResponse,
    summary="Atualizar ocorrência",
)
async def atualizar_ocorrencia(
    id: uuid.UUID,
    payload: OcorrenciaUpdate,
    db: DbSession,
):
    """Atualiza dados cadastrais ou status da ocorrência registrando telemetria de SLA."""
    ocorrencia = await db.get(Ocorrencia, id)
    if not ocorrencia:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ocorrência {id} não encontrada.",
        )

    dados = payload.model_dump(exclude_unset=True)
    agora = datetime.now(timezone.utc)

    if "status" in dados and dados["status"]:
        novo_status = str(dados["status"]).upper()
        if novo_status == "DESPACHADA" and ocorrencia.status != "DESPACHADA" and not ocorrencia.data_despacho:
            ocorrencia.data_despacho = agora
        elif novo_status == "RESOLVIDA" and ocorrencia.status != "RESOLVIDA" and not ocorrencia.data_conclusao:
            ocorrencia.data_conclusao = agora
        ocorrencia.status = novo_status

    for campo, valor in dados.items():
        if campo != "status" and hasattr(ocorrencia, campo):
            setattr(ocorrencia, campo, valor)

    await db.commit()
    await db.refresh(ocorrencia)

    await ws_manager.broadcast({
        "action": "ocorrencia_atualizada",
        "ocorrencia_id": str(ocorrencia.id),
        "titulo": ocorrencia.titulo,
        "tipo": ocorrencia.tipo,
        "gravidade": ocorrencia.gravidade,
        "status": ocorrencia.status,
    })

    return ocorrencia
