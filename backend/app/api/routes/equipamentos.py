import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.core.database import DbSession
from app.models import Equipamento, HistoricoEvento, Ocorrencia
from app.schemas import EquipamentoCreate, EquipamentoRead, EquipamentoResumo

router = APIRouter(prefix="/equipamentos", tags=["Equipamentos"])


@router.get("", response_model=list[EquipamentoRead], summary="Listar equipamentos")
async def listar_equipamentos(
    db: DbSession,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    tipo: str | None = Query(None, description="Ex.: RADAR, SEMAFORO"),
    status_: str | None = Query(None, alias="status", description="Ex.: OPERANTE, INOPERANTE"),
    bairro: str | None = Query(None, description="Busca parcial, case-insensitive"),
):
    stmt = select(Equipamento)
    if tipo:
        stmt = stmt.where(Equipamento.tipo == tipo.upper())
    if status_:
        stmt = stmt.where(Equipamento.status == status_.upper())
    if bairro:
        stmt = stmt.where(Equipamento.bairro.ilike(f"%{bairro}%"))

    stmt = stmt.order_by(Equipamento.bairro, Equipamento.tipo, Equipamento.numero_serie).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/resumo", response_model=EquipamentoResumo, summary="Indicadores agregados")
async def resumo_equipamentos(db: DbSession):
    total = await db.scalar(select(func.count()).select_from(Equipamento)) or 0

    por_status = dict(
        (await db.execute(select(Equipamento.status, func.count()).group_by(Equipamento.status))).all()
    )
    por_tipo = dict((await db.execute(select(Equipamento.tipo, func.count()).group_by(Equipamento.tipo))).all())
    vencida = (
        await db.scalar(
            select(func.count())
            .select_from(Equipamento)
            .where(Equipamento.data_proxima_manutencao < datetime.now(timezone.utc))
        )
        or 0
    )
    return EquipamentoResumo(total=total, por_status=por_status, por_tipo=por_tipo, manutencao_vencida=vencida)


@router.get("/{equipamento_id}", response_model=EquipamentoRead, summary="Detalhar equipamento")
async def obter_equipamento(equipamento_id: uuid.UUID, db: DbSession):
    equipamento = await db.get(Equipamento, equipamento_id)
    if not equipamento:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipamento não encontrado.")
    return equipamento


@router.post(
    "",
    response_model=EquipamentoRead,
    status_code=status.HTTP_201_CREATED,
    summary="Cadastrar equipamento",
)
async def cadastrar_equipamento(payload: EquipamentoCreate, db: DbSession):
    equipamento = Equipamento(**payload.model_dump())
    db.add(equipamento)
    try:
        await db.flush()  # gera o id para o histórico
        db.add(HistoricoEvento(entidade_id=equipamento.id, tipo_evento="EQUIPAMENTO_CADASTRADO"))
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Já existe um equipamento com número de série '{payload.numero_serie}'."
        )
    await db.refresh(equipamento)
    return equipamento


@router.put(
    "/{equipamento_id}/restaurar",
    response_model=EquipamentoRead,
    summary="Restaurar equipamento para status OPERANTE",
)
async def restaurar_equipamento(equipamento_id: uuid.UUID, db: DbSession):
    """
    Restaura o equipamento inoperante ou em manutenção para o status 'OPERANTE'
    e registra a ação no log histórico de eventos.
    """
    equipamento = await db.get(Equipamento, equipamento_id)
    if not equipamento:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipamento não encontrado.")

    equipamento.status = "OPERANTE"
    equipamento.necessidade_manutencao = "NENHUMA"

    db.add(HistoricoEvento(entidade_id=equipamento.id, tipo_evento="EQUIPAMENTO_RESTAURADO"))
    await db.commit()
    await db.refresh(equipamento)
    return equipamento


@router.post(
    "/{equipamento_id}/gerar-reparo",
    summary="Gerar chamado de reparo operacional e colocar equipamento em manutenção",
)
async def gerar_reparo_equipamento(equipamento_id: uuid.UUID, db: DbSession):
    """
    Cria automaticamente uma nova Ocorrência técnica vinculada a este equipamento:
    - Título: 'Manutenção Técnica: [Nome do Equipamento]'
    - Tipo: 'MANUTENCAO'
    - Gravidade: 'MEDIA' (se Manutenção/Alerta) ou 'ALTA' (se Inoperante)
    - Status: 'PENDENTE'
    - Coordenadas: lat/lng do equipamento
    - Atualiza status do equipamento para 'EM_MANUTENCAO'
    """
    equipamento = await db.get(Equipamento, equipamento_id)
    if not equipamento:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipamento não encontrado.")

    # Gravidade: 'MEDIA' (se estava em Manutenção/Alerta) ou 'ALTA' (se estava Inoperante)
    gravidade = "ALTA" if equipamento.status == "INOPERANTE" else "MEDIA"

    # Atualiza status do equipamento para manutenção
    equipamento.status = "EM_MANUTENCAO"
    equipamento.necessidade_manutencao = "CORRETIVA" if gravidade == "ALTA" else "PREVENTIVA"

    tipo_formatado = equipamento.tipo.replace("_", " ").title()
    identificacao = equipamento.logradouro or equipamento.numero_serie
    titulo = f"Manutenção Técnica: {tipo_formatado} ({identificacao})"
    descricao = (
        f"Ordem de serviço gerada para reparo de {tipo_formatado} "
        f"[Nº Série: {equipamento.numero_serie}]. "
        f"Local: {equipamento.logradouro or 'Marília/SP'}, Bairro: {equipamento.bairro or 'Região Central'}."
    )

    nova_ocorrencia = Ocorrencia(
        titulo=titulo,
        descricao=descricao,
        tipo="MANUTENCAO",
        gravidade=gravidade,
        status="PENDENTE",
        latitude=equipamento.latitude,
        longitude=equipamento.longitude,
        equipamento_id=equipamento.id,
    )
    db.add(nova_ocorrencia)
    await db.flush()

    db.add(HistoricoEvento(entidade_id=equipamento.id, tipo_evento="CHAMADO_MANUTENCAO_GERADO"))
    db.add(HistoricoEvento(entidade_id=nova_ocorrencia.id, tipo_evento="OCORRENCIA_GERADA"))

    await db.commit()
    await db.refresh(equipamento)
    await db.refresh(nova_ocorrencia)

    return {
        "status": "success",
        "mensagem": "Chamado de reparo gerado com sucesso.",
        "equipamento": EquipamentoRead.model_validate(equipamento).model_dump(),
        "ocorrencia_id": str(nova_ocorrencia.id),
    }

