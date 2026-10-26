"""Roteador de Relatórios e Auditorias Operacionais (Telemetria Tradicional & IA) - F.O.G.O.

Fornece endpoints para extração de DADOS FRIOS puros (SLA matemático, timestamps e agentes)
e análises cognitivas complementares com o modelo Google Gemini (Oráculo Preditivo).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import or_, select

from app.core.database import DbSession
from app.models.agente import Agente
from app.models.equipamento import Equipamento
from app.models.ocorrencia import Ocorrencia
from app.services.oraculo_service import (
    gerar_auditoria_ocorrencia,
    gerar_parecer_agente,
    gerar_parecer_equipamento,
)

logger = logging.getLogger("uvicorn")

router = APIRouter(prefix="/relatorios", tags=["Relatórios & Auditoria IA"])


# ============================================================================
# Schemas dos Relatórios Tradicionais (Dados Frios)
# ============================================================================
class AgenteResumo(BaseModel):
    id: str
    nome: str
    tipo: str
    status: str
    titular: bool = False


class OcorrenciaDetalhesResponse(BaseModel):
    id: str
    titulo: str
    descricao: str
    tipo: str
    gravidade: str
    status: str
    data_criacao: str
    data_despacho: str | None = None
    data_conclusao: str | None = None
    tempo_resposta_minutos: float | None = None
    tempo_total_minutos: float | None = None
    situacao_sla: str
    agentes_envolvidos: list[AgenteResumo]
    latitude: float | None = None
    longitude: float | None = None
    equipamento_id: str | None = None


class ManutencaoResumo(BaseModel):
    id: str
    titulo: str
    status: str
    criado_em: str | None = None


class EquipamentoDetalhesResponse(BaseModel):
    id: str
    numero_serie: str
    tipo: str
    marca: str | None = None
    modelo: str | None = None
    logradouro: str | None = None
    bairro: str | None = None
    cidade_uf: str | None = None
    status: str
    necessidade_manutencao: str | None = None
    qtd_falhas: int
    historico_manutencoes: list[ManutencaoResumo]


class AtendimentoHistoricoResumo(BaseModel):
    ocorrencia_id: str
    titulo: str
    tipo: str
    status: str
    gravidade: str
    data_despacho: str | None = None
    data_conclusao: str | None = None
    tempo_duracao_minutos: float | None = None
    situacao: str


class AgenteDetalhesResponse(BaseModel):
    id: str
    nome: str
    tipo: str
    status: str
    total_despachos: int
    concluidas: int
    em_atendimento: int
    tempo_medio_minutos: float | None = None
    historico_atendimentos: list[AtendimentoHistoricoResumo]


# ============================================================================
# Schemas do Oráculo de IA
# ============================================================================
class RelatorioIaResponse(BaseModel):
    id: str
    tipo: str
    relatorio_markdown: str
    parecer: str
    timestamp: str
    sucesso: bool = True


# ============================================================================
# Endpoints de Auditoria Tradicional (DADOS FRIOS - SEM IA)
# ============================================================================
@router.get(
    "/ocorrencias/{id}/detalhes",
    response_model=OcorrenciaDetalhesResponse,
    summary="Auditoria Tradicional de Ocorrência (Dados Frios)",
)
async def obter_detalhes_ocorrencia(id: str, db: DbSession):
    """Retorna os dados frios da ocorrência: timestamps reais, cálculo exato do SLA em minutos e agentes."""
    parsed_id = None
    try:
        parsed_id = uuid.UUID(id)
    except ValueError:
        pass

    ocorrencia = await db.get(Ocorrencia, parsed_id) if parsed_id else None
    if not ocorrencia:
        stmt = select(Ocorrencia)
        res = await db.execute(stmt)
        todas = list(res.scalars().all())
        for oc in todas:
            if str(oc.id).startswith(id):
                ocorrencia = oc
                break

    if not ocorrencia:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ocorrência {id} não encontrada para auditoria.",
        )

    # Busca os agentes envolvidos
    stmt_ag = select(Agente).where(
        or_(
            Agente.id == ocorrencia.agente_id,
            Agente.ocorrencia_id == ocorrencia.id,
        )
    )
    res_ag = await db.execute(stmt_ag)
    agentes = list(res_ag.scalars().all())

    agentes_serializados = [
        AgenteResumo(
            id=str(ag.id),
            nome=ag.nome,
            tipo=ag.tipo,
            status=ag.status,
            titular=(ag.id == ocorrencia.agente_id),
        )
        for ag in agentes
    ]

    # Cálculo matemático estrito do SLA em minutos
    agora = datetime.now(timezone.utc)
    tempo_resposta_minutos = None
    if ocorrencia.data_despacho and ocorrencia.data_conclusao:
        delta = ocorrencia.data_conclusao - ocorrencia.data_despacho
        tempo_resposta_minutos = round(max(0.0, delta.total_seconds() / 60.0), 1)
        situacao_sla = "Atendimento Concluído"
    elif ocorrencia.data_despacho:
        delta = agora - ocorrencia.data_despacho
        tempo_resposta_minutos = round(max(0.0, delta.total_seconds() / 60.0), 1)
        situacao_sla = "Em Andamento (tempo decorrido)"
    else:
        situacao_sla = "Aguardando Despacho (Pendente)"

    tempo_total_minutos = None
    if ocorrencia.data_conclusao and ocorrencia.criado_em:
        delta_tot = ocorrencia.data_conclusao - ocorrencia.criado_em
        tempo_total_minutos = round(max(0.0, delta_tot.total_seconds() / 60.0), 1)
    elif ocorrencia.criado_em:
        delta_tot = agora - ocorrencia.criado_em
        tempo_total_minutos = round(max(0.0, delta_tot.total_seconds() / 60.0), 1)

    return OcorrenciaDetalhesResponse(
        id=str(ocorrencia.id),
        titulo=ocorrencia.titulo,
        descricao=ocorrencia.descricao,
        tipo=ocorrencia.tipo,
        gravidade=ocorrencia.gravidade,
        status=ocorrencia.status,
        data_criacao=ocorrencia.criado_em.isoformat() if ocorrencia.criado_em else "",
        data_despacho=ocorrencia.data_despacho.isoformat() if ocorrencia.data_despacho else None,
        data_conclusao=ocorrencia.data_conclusao.isoformat() if ocorrencia.data_conclusao else None,
        tempo_resposta_minutos=tempo_resposta_minutos,
        tempo_total_minutos=tempo_total_minutos,
        situacao_sla=situacao_sla,
        agentes_envolvidos=agentes_serializados,
        latitude=ocorrencia.latitude,
        longitude=ocorrencia.longitude,
        equipamento_id=str(ocorrencia.equipamento_id) if ocorrencia.equipamento_id else None,
    )


@router.get(
    "/equipamentos/{id}/detalhes",
    response_model=EquipamentoDetalhesResponse,
    summary="Auditoria Tradicional de Equipamento (Dados Frios)",
)
async def obter_detalhes_equipamento(id: str, db: DbSession):
    """Retorna os dados frios do equipamento: dados cadastrais, histórico de ordens de serviço e contagem de falhas."""
    parsed_id = None
    try:
        parsed_id = uuid.UUID(id)
    except ValueError:
        pass

    equipamento = await db.get(Equipamento, parsed_id) if parsed_id else None
    if not equipamento:
        stmt = select(Equipamento)
        res = await db.execute(stmt)
        todos = list(res.scalars().all())
        for eq in todos:
            if str(eq.id).startswith(id):
                equipamento = eq
                break

    if not equipamento:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Equipamento {id} não encontrado para auditoria.",
        )

    stmt_oc = (
        select(Ocorrencia)
        .where(Ocorrencia.equipamento_id == equipamento.id)
        .order_by(Ocorrencia.criado_em.desc())
    )
    res_oc = await db.execute(stmt_oc)
    ocorrencias = list(res_oc.scalars().all())

    manutencoes = [
        ManutencaoResumo(
            id=str(oc.id),
            titulo=oc.titulo,
            status=oc.status,
            criado_em=oc.criado_em.isoformat() if oc.criado_em else None,
        )
        for oc in ocorrencias
    ]

    return EquipamentoDetalhesResponse(
        id=str(equipamento.id),
        numero_serie=equipamento.numero_serie,
        tipo=equipamento.tipo,
        marca=equipamento.marca,
        modelo=equipamento.modelo,
        logradouro=equipamento.logradouro,
        bairro=equipamento.bairro,
        cidade_uf=equipamento.cidade_uf,
        status=equipamento.status,
        necessidade_manutencao=equipamento.necessidade_manutencao,
        qtd_falhas=len(ocorrencias),
        historico_manutencoes=manutencoes,
    )


@router.get(
    "/agentes/{id}/detalhes",
    response_model=AgenteDetalhesResponse,
    summary="Auditoria Tradicional de Agente (Dados Frios)",
)
async def obter_detalhes_agente(id: str, db: DbSession):
    """Retorna os dados frios do agente: métricas de produtividade e histórico detalhado de ocorrências."""
    parsed_id = None
    try:
        parsed_id = uuid.UUID(id)
    except ValueError:
        pass

    agente = await db.get(Agente, parsed_id) if parsed_id else None
    if not agente:
        stmt = select(Agente)
        res = await db.execute(stmt)
        todos = list(res.scalars().all())
        for ag in todos:
            if str(ag.id).startswith(id):
                agente = ag
                break

    if not agente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agente {id} não encontrado para auditoria.",
        )

    # Busca ocorrências estritamente ligadas a este agente (evita produto cartesiano)
    condicoes = [Ocorrencia.agente_id == agente.id]
    if agente.ocorrencia_id:
        condicoes.append(Ocorrencia.id == agente.ocorrencia_id)

    stmt_oc = (
        select(Ocorrencia)
        .where(or_(*condicoes))
        .order_by(Ocorrencia.criado_em.desc())
    )
    res_oc = await db.execute(stmt_oc)
    raw_ocorrencias = list(res_oc.scalars().all())

    # Desduplica por ID preservando a ordem cronológica
    vistos = set()
    ocorrencias: list[Ocorrencia] = []
    for oc in raw_ocorrencias:
        if oc.id not in vistos:
            vistos.add(oc.id)
            ocorrencias.append(oc)

    agora = datetime.now(timezone.utc)
    historico: list[AtendimentoHistoricoResumo] = []
    duracoes: list[float] = []

    for oc in ocorrencias:
        duracao = None
        if oc.data_despacho and oc.data_conclusao:
            delta = oc.data_conclusao - oc.data_despacho
            duracao = round(max(0.0, delta.total_seconds() / 60.0), 1)
            duracoes.append(duracao)
            situacao = "Concluído"
        elif oc.data_despacho:
            delta = agora - oc.data_despacho
            duracao = round(max(0.0, delta.total_seconds() / 60.0), 1)
            situacao = "Em andamento"
        elif oc.criado_em and oc.data_conclusao:
            delta = oc.data_conclusao - oc.criado_em
            duracao = round(max(0.0, delta.total_seconds() / 60.0), 1)
            duracoes.append(duracao)
            situacao = "Concluído sem Despacho"
        else:
            situacao = "Pendente"

        historico.append(
            AtendimentoHistoricoResumo(
                ocorrencia_id=str(oc.id),
                titulo=oc.titulo,
                tipo=oc.tipo,
                status=oc.status,
                gravidade=oc.gravidade,
                data_despacho=oc.data_despacho.isoformat() if oc.data_despacho else None,
                data_conclusao=oc.data_conclusao.isoformat() if oc.data_conclusao else None,
                tempo_duracao_minutos=duracao,
                situacao=situacao,
            )
        )

    concluidas = sum(1 for oc in ocorrencias if oc.status == "RESOLVIDA")
    em_atendimento = sum(1 for oc in ocorrencias if oc.status in ("DESPACHADA", "EM_ATENDIMENTO"))
    tempo_medio = round(sum(duracoes) / len(duracoes), 1) if duracoes else None

    return AgenteDetalhesResponse(
        id=str(agente.id),
        nome=agente.nome,
        tipo=agente.tipo,
        status=agente.status,
        total_despachos=len(ocorrencias),
        concluidas=concluidas,
        em_atendimento=em_atendimento,
        tempo_medio_minutos=tempo_medio,
        historico_atendimentos=historico,
    )


# ============================================================================
# Endpoints de Insights Preditivos (IA - Google Gemini)
# ============================================================================
@router.get("/equipamentos/{id}/ia", response_model=RelatorioIaResponse, summary="Parecer de IA sobre Equipamento")
async def obter_parecer_equipamento_ia(id: str, db: DbSession):
    """Gera diagnóstico prescritivo sobre saúde do ativo, histórico de quebras e viabilidade financeira."""
    markdown = await gerar_parecer_equipamento(db=db, equipamento_id=id)
    return RelatorioIaResponse(
        id=id,
        tipo="equipamento",
        relatorio_markdown=markdown,
        parecer=markdown,
        timestamp=datetime.now(timezone.utc).isoformat(),
        sucesso=True,
    )


@router.get("/ocorrencias/{id}/ia", response_model=RelatorioIaResponse, summary="Auditoria de SLA de Ocorrência com IA")
async def obter_auditoria_ocorrencia_ia(id: str, db: DbSession):
    """Gera auditoria operacional do tempo de atendimento (SLA) e eficiência das equipes despachadas."""
    markdown = await gerar_auditoria_ocorrencia(db=db, ocorrencia_id=id)
    return RelatorioIaResponse(
        id=id,
        tipo="ocorrencia",
        relatorio_markdown=markdown,
        parecer=markdown,
        timestamp=datetime.now(timezone.utc).isoformat(),
        sucesso=True,
    )


@router.get("/agentes/{id}/ia", response_model=RelatorioIaResponse, summary="Parecer de IA sobre Desempenho do Agente (RH)")
async def obter_parecer_agente_ia(id: str, db: DbSession):
    """Gera diagnóstico de RH com IA sobre eficiência operacional, carga de trabalho e fadiga do agente."""
    markdown = await gerar_parecer_agente(db=db, agente_id=id)
    return RelatorioIaResponse(
        id=id,
        tipo="agente",
        relatorio_markdown=markdown,
        parecer=markdown,
        timestamp=datetime.now(timezone.utc).isoformat(),
        sucesso=True,
    )
