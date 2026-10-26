import uuid
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select, text, update

from app.core.database import DbSession
from app.core.geo import distancia_km
from app.models import Agente, HistoricoEvento
from app.models.ocorrencia import Ocorrencia
from app.schemas import AgenteCreate, AgenteProximo, AgenteRead, AgenteStatusUpdate

router = APIRouter(prefix="/agentes", tags=["Agentes"])

KM_POR_GRAU_LAT = 111.0


@router.get("", response_model=list[AgenteRead], summary="Listar agentes")
async def listar_agentes(
    db: DbSession,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    tipo: str | None = None,
    status_: str | None = Query(None, alias="status"),
):
    stmt = select(Agente)
    if tipo:
        stmt = stmt.where(Agente.tipo == tipo.upper())
    if status_:
        stmt = stmt.where(Agente.status == status_.upper())
    else:
        stmt = stmt.where(Agente.status.notin_(["INATIVO", "DESLIGADO"]))
    result = await db.execute(stmt.order_by(Agente.nome).offset(skip).limit(limit))
    return result.scalars().all()


@router.get(
    "/proximos",
    response_model=list[AgenteProximo],
    summary="Agentes disponíveis mais próximos de um ponto",
)
async def agentes_proximos(
    db: DbSession,
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    raio_km: float = Query(2.0, gt=0, le=50),
    limite: int = Query(10, ge=1, le=100),
    incluir_ocupados: bool = False,
):
    # 1) Pré-filtro barato por caixa no banco; 2) distância geodésica exata com geopy.
    delta = raio_km / KM_POR_GRAU_LAT * 1.5
    stmt = select(Agente).where(
        Agente.latitude.between(lat - delta, lat + delta),
        Agente.longitude.between(lng - delta, lng + delta),
        Agente.status != "OFFLINE",
    )
    if not incluir_ocupados:
        stmt = stmt.where(Agente.status == "DISPONIVEL")

    candidatos = (await db.execute(stmt)).scalars().all()
    resultado = []
    for a in candidatos:
        d = distancia_km((lat, lng), (a.latitude, a.longitude))
        if d <= raio_km:
            base = AgenteRead.model_validate(a).model_dump()
            resultado.append(AgenteProximo(**base, distancia_km=round(d, 3)))
    resultado.sort(key=lambda x: x.distancia_km)
    return resultado[:limite]


@router.post("", response_model=AgenteRead, status_code=status.HTTP_201_CREATED, summary="Cadastrar agente")
async def cadastrar_agente(payload: AgenteCreate, db: DbSession):
    agente = Agente(**payload.model_dump())
    db.add(agente)
    await db.flush()
    db.add(HistoricoEvento(entidade_id=agente.id, tipo_evento="AGENTE_CADASTRADO"))
    await db.commit()
    await db.refresh(agente)
    return agente


@router.post("/sync", summary="Sincronizar e higienizar inconsistências de agentes no banco")
async def sincronizar_agentes(db: DbSession):
    """
    Higienização e Auditoria de Efetivo:
    Atualiza para status = 'DISPONIVEL' e ocorrencia_id = NULL todos os agentes que obedeçam à regra:
    status = 'EM_DESLOCAMENTO' AND (ocorrencia_id IS NULL OR ocorrencia_id IN (SELECT id FROM ocorrencias WHERE status = 'RESOLVIDA'))
    """
    stmt = text(
        """
        UPDATE agentes
        SET status = 'DISPONIVEL', ocorrencia_id = NULL
        WHERE status = 'EM_DESLOCAMENTO'
          AND (ocorrencia_id IS NULL OR ocorrencia_id IN (SELECT id FROM ocorrencias WHERE status = 'RESOLVIDA'))
        """
    )
    result = await db.execute(stmt)
    await db.commit()
    registros_corrigidos = result.rowcount or 0

    return {
        "status": "success",
        "mensagem": f"Higienização concluída com sucesso: {registros_corrigidos} agente(s) corrigido(s).",
        "registros_corrigidos": registros_corrigidos,
    }


@router.delete("/{id}", summary="Remover ou desligar agente (Off-boarding)")
async def remover_agente(id: uuid.UUID, db: DbSession):
    """
    Off-boarding seguro de agentes:
    1. Desvincula ocorrências ativas ou em histórico para prevenir falhas de integridade referencial.
    2. Aplica Soft Delete marcando status='DESLIGADO' e limpando coordenadas de GPS.
    3. Registra evento de auditoria imutável no HistoricoEvento.
    O agente é automaticamente excluído da listagem operacional.
    """
    agente = await db.get(Agente, id)
    if not agente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agente {id} não encontrado para off-boarding.",
        )

    # 1. Desvincula ocorrência ativa vinculada ao agente
    if agente.ocorrencia_id:
        agente.ocorrencia_id = None

    # 2. Desvincula ocorrências em que este agente figurava como titular
    await db.execute(
        update(Ocorrencia).where(Ocorrencia.agente_id == agente.id).values(agente_id=None)
    )

    # 3. Soft Delete: altera status para DESLIGADO e limpa coordenadas de telemetria
    agente.status = "DESLIGADO"
    agente.latitude = None
    agente.longitude = None

    # 4. Trilha de auditoria
    db.add(
        HistoricoEvento(
            entidade_id=agente.id,
            tipo_evento="AGENTE_DESLIGADO",
        )
    )

    await db.commit()

    return {
        "status": "success",
        "mensagem": f"Agente '{agente.nome}' desligado do efetivo operacional com sucesso.",
        "id": str(agente.id),
    }


@router.patch("/{id}/status", response_model=AgenteRead, summary="Override tático de status do agente")
async def atualizar_status_agente(
    id: uuid.UUID,
    payload: AgenteStatusUpdate,
    db: DbSession,
):
    """
    Override Tático de Status do Agente:
    Permite ao operador CICC forçar a mudança de status operacional de qualquer agente.

    Regra de Auto-Cura:
    Se o status for alterado para 'DISPONIVEL' ou 'OFFLINE', o vínculo operacional
    (ocorrencia_id) é automaticamente limpo (None) para evitar inconsistências no despacho
    e desimpedir o agente de ocorrências anteriores.
    """
    agente = await db.get(Agente, id)
    if not agente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agente {id} não encontrado.",
        )

    novo_status = payload.status
    if hasattr(novo_status, "value"):
        novo_status = str(novo_status.value)
    else:
        novo_status = str(novo_status)

    agente.status = novo_status

    # Auto-cura operacional: limpar ocorrência se DISPONIVEL ou OFFLINE
    if novo_status in ("DISPONIVEL", "OFFLINE"):
        agente.ocorrencia_id = None

    # Registrar evento de auditoria imutável
    db.add(
        HistoricoEvento(
            entidade_id=agente.id,
            tipo_evento="AGENTE_STATUS_OVERRIDE",
        )
    )

    await db.commit()
    await db.refresh(agente)
    return agente



