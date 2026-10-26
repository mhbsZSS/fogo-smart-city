"""Serviço de Inteligência Preditiva e Auditoria Cognitiva (Oráculo Preditivo) - F.O.G.O.

Integração com Google Gemini para avaliação analítica de integridade de hardware
e auditoria operacional de SLA em ocorrências despachadas.
Possui proteção estrita de timeout (fail-fast) e validação de chaves.
"""
from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agente import Agente
from app.models.equipamento import Equipamento
from app.models.ocorrencia import Ocorrencia

# Carrega variáveis do arquivo .env com busca resiliente
_base_dir = Path(__file__).resolve().parent.parent.parent
load_dotenv(_base_dir / ".env")
load_dotenv()

logger = logging.getLogger("uvicorn")


def obter_gemini_api_key() -> str:
    """Verifica e retorna a GEMINI_API_KEY com fail-fast estrito."""
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not gemini_key or len(gemini_key) < 8 or "sua-chave" in gemini_key.lower():
        logger.error("❌ [ORÁCULO] GEMINI_API_KEY não configurada no ambiente (.env).")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GEMINI_API_KEY não configurada no backend. Configure uma chave válida da Google AI Studio no arquivo .env para utilizar a Inteligência Preditiva.",
        )
    return gemini_key


async def _chamar_gemini(prompt: str, system_instruction: str) -> str:
    """Invoca o modelo Google Gemini com timeout estrito de 12 segundos (fail-fast)."""
    gemini_key = obter_gemini_api_key()

    def _sync_generate():
        import google.generativeai as genai

        genai.configure(api_key=gemini_key, transport="rest")
        model_name = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
        model = genai.GenerativeModel(
            model_name=model_name,
            system_instruction=system_instruction,
        )
        generation_config = genai.types.GenerationConfig(
            temperature=0.3,
            top_p=0.9,
            max_output_tokens=2048,
        )
        # Timeout a nível de requisição HTTP da biblioteca Google
        res = model.generate_content(
            prompt,
            generation_config=generation_config,
            request_options={"timeout": 10.0},
        )
        if res and res.text:
            return res.text.strip()
        raise ValueError("Resposta vazia retornada pelo modelo Gemini.")

    try:
        # Executa em thread assíncrona limitando o tempo total a 12s para nunca pendurar o frontend
        return await asyncio.wait_for(asyncio.to_thread(_sync_generate), timeout=12.0)
    except asyncio.TimeoutError:
        logger.error("⏱️ [ORÁCULO] Timeout de 12s excedido na chamada ao Google Gemini.")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Tempo limite de resposta do Google Gemini excedido (timeout de 12s). O serviço do Gemini não respondeu a tempo.",
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("❌ [ORÁCULO] Falha na comunicação com a API do Google Gemini: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha na API Google Gemini: {str(exc)}",
        )


async def gerar_parecer_equipamento(
    db: AsyncSession,
    equipamento_id: uuid.UUID | str,
) -> str:
    """Busca o equipamento e suas ordens de manutenção, montando parecer prescritivo de hardware."""
    if isinstance(equipamento_id, str):
        try:
            parsed_id = uuid.UUID(equipamento_id)
        except ValueError:
            parsed_id = None
    else:
        parsed_id = equipamento_id

    equipamento = await db.get(Equipamento, parsed_id) if parsed_id else None
    if not equipamento:
        stmt = select(Equipamento)
        res = await db.execute(stmt)
        todos = list(res.scalars().all())
        for eq in todos:
            if str(eq.id).startswith(str(equipamento_id)):
                equipamento = eq
                break

    if not equipamento:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Equipamento {equipamento_id} não localizado no inventário urbano.",
        )

    # Busca ocorrências ligadas ao equipamento
    stmt_oc = (
        select(Ocorrencia)
        .where(Ocorrencia.equipamento_id == equipamento.id)
        .order_by(Ocorrencia.criado_em.desc())
    )
    res_oc = await db.execute(stmt_oc)
    ocorrencias = list(res_oc.scalars().all())

    qtd_falhas = len(ocorrencias)
    nome_ativo = (
        f"{equipamento.tipo} [{equipamento.numero_serie}] "
        f"({equipamento.marca or 'Genérico'} {equipamento.modelo or ''}) em '{equipamento.logradouro or 'Perímetro Urbano'}'"
    )

    system_instruction = (
        "Você é o ORÁCULO PREDITIVO do Sistema F.O.G.O., atuando como Auditor Sênior de Hardware e "
        "Infraestrutura de Smart Cities para a Prefeitura Municipal de Marília/SP. "
        "Seu tom é técnico, executivo, prescritivo e orientado a ROI/Eficiência Financeira. "
        "Formate em Markdown profissional sem ASCII art."
    )

    prompt = (
        f"Atue como Auditor de Hardware de Smart City. Analise o seguinte ativo: {nome_ativo}, "
        f"Status atual: {equipamento.status}. Histórico de falhas: {qtd_falhas}. "
        "Com base na frequência de quebras, sugira se o equipamento deve ser mantido ou substituído por ser um ralo financeiro. "
        "Seja direto e prescritivo."
    )

    return await _chamar_gemini(prompt, system_instruction)


async def gerar_auditoria_ocorrencia(
    db: AsyncSession,
    ocorrencia_id: uuid.UUID | str,
) -> str:
    """Busca a ocorrência, calcula o SLA e gera parecer operacional da equipe de campo com IA."""
    if isinstance(ocorrencia_id, str):
        try:
            parsed_id = uuid.UUID(ocorrencia_id)
        except ValueError:
            parsed_id = None
    else:
        parsed_id = ocorrencia_id

    ocorrencia = await db.get(Ocorrencia, parsed_id) if parsed_id else None
    if not ocorrencia:
        stmt = select(Ocorrencia)
        res = await db.execute(stmt)
        todas = list(res.scalars().all())
        for oc in todas:
            if str(oc.id).startswith(str(ocorrencia_id)):
                ocorrencia = oc
                break

    if not ocorrencia:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ocorrência {ocorrencia_id} não localizada no sistema operacional.",
        )

    # Busca agentes vinculados
    stmt_ag = select(Agente).where(
        or_(
            Agente.id == ocorrencia.agente_id,
            Agente.ocorrencia_id == ocorrencia.id,
        )
    )
    res_ag = await db.execute(stmt_ag)
    agentes = list(res_ag.scalars().all())
    nomes_agentes = ", ".join(f"{a.nome} ({a.tipo})" for a in agentes) if agentes else "Nenhum agente registrado"

    # Cálculo do SLA
    agora = datetime.now(timezone.utc)
    if ocorrencia.data_despacho and ocorrencia.data_conclusao:
        delta = ocorrencia.data_conclusao - ocorrencia.data_despacho
        minutos = round(max(0.0, delta.total_seconds() / 60.0), 1)
        situacao_sla = "Atendimento Concluído"
    elif ocorrencia.data_despacho:
        delta = agora - ocorrencia.data_despacho
        minutos = round(max(0.0, delta.total_seconds() / 60.0), 1)
        situacao_sla = "Em Andamento (tempo decorrido)"
    elif ocorrencia.criado_em and ocorrencia.data_conclusao:
        delta = ocorrencia.data_conclusao - ocorrencia.criado_em
        minutos = round(max(0.0, delta.total_seconds() / 60.0), 1)
        situacao_sla = "Concluído sem Despacho Formal"
    else:
        delta = agora - ocorrencia.criado_em
        minutos = round(max(0.0, delta.total_seconds() / 60.0), 1)
        situacao_sla = "Pendente (aguardando despacho)"

    system_instruction = (
        "Você é o COMANDANTE DE OPERAÇÕES do Centro Integrado de Comando e Controle (CICC) de Marília/SP. "
        "Sua função é avaliar o tempo de resposta (SLA) e a performance das forças de campo em ocorrências municipais. "
        "Seja analítico, objetivo e indique eficiências ou gargalos com clareza operacional."
    )

    prompt = (
        f"Atue como Comandante de Operações. Avalie o atendimento da ocorrência '{ocorrencia.titulo}'. "
        f"Agentes: {nomes_agentes}. Tempo de resposta (SLA): {minutos} minutos ({situacao_sla}). "
        "Gere um breve parágrafo de relatório operacional destacando a eficiência ou gargalos da equipe."
    )

    return await _chamar_gemini(prompt, system_instruction)


async def gerar_parecer_agente(
    db: AsyncSession,
    agente_id: uuid.UUID | str,
) -> str:
    """Busca o agente e suas ocorrências despachadas, avaliando produtividade, SLA e carga horária (IA de RH)."""
    if isinstance(agente_id, str):
        try:
            parsed_id = uuid.UUID(agente_id)
        except ValueError:
            parsed_id = None
    else:
        parsed_id = agente_id

    agente = await db.get(Agente, parsed_id) if parsed_id else None
    if not agente:
        stmt = select(Agente)
        res = await db.execute(stmt)
        todos = list(res.scalars().all())
        for ag in todos:
            if str(ag.id).startswith(str(agente_id)):
                agente = ag
                break

    if not agente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agente {agente_id} não localizado no efetivo municipal.",
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

    vistos = set()
    ocorrencias: list[Ocorrencia] = []
    for oc in raw_ocorrencias:
        if oc.id not in vistos:
            vistos.add(oc.id)
            ocorrencias.append(oc)

    total = len(ocorrencias)
    resolvidas = [oc for oc in ocorrencias if oc.status == "RESOLVIDA"]
    em_andamento = [oc for oc in ocorrencias if oc.status in ("DESPACHADA", "EM_ATENDIMENTO")]

    duracoes = []
    for oc in ocorrencias:
        if oc.data_despacho and oc.data_conclusao:
            delta = oc.data_conclusao - oc.data_despacho
            duracoes.append(max(0.0, delta.total_seconds() / 60.0))

    tempo_medio = round(sum(duracoes) / len(duracoes), 1) if duracoes else None

    # Resumo das últimas operações
    chamados_resumo = []
    for oc in ocorrencias[:6]:
        status_txt = "Resolvido" if oc.status == "RESOLVIDA" else "Em Atendimento"
        chamados_resumo.append(f"- '{oc.titulo}' ({oc.tipo}): {status_txt}")
    lista_chamados_txt = "\n".join(chamados_resumo) if chamados_resumo else "Nenhum chamado anterior registrado."

    system_instruction = (
        "Você é o AUDITOR DE RECURSOS HUMANOS E OPERAÇÕES DO CICC de Marília/SP no Sistema F.O.G.O. "
        "Sua missão é emitir diagnósticos comportamentais, de carga de trabalho e eficiência para o efetivo de segurança e serviços municipais. "
        "Seu tom é técnico, executivo, humanizado e focado em bem-estar e produtividade da tropa. Formate em Markdown profissional."
    )

    prompt = (
        f"Atue como Auditor de Recursos Humanos e Operações. Analise o perfil do profissional: {agente.nome}, "
        f"Força/Categoria: {agente.tipo}, Status Atual: {agente.status}. "
        f"Telemetria acumulada: {total} chamados vinculados ({len(resolvidas)} resolvidos, {len(em_andamento)} em atendimento). "
        f"Tempo médio de resposta em campo: {f'{tempo_medio} minutos' if tempo_medio is not None else 'Sem medições concluídas'}. "
        f"Histórico recente de operações:\n{lista_chamados_txt}\n\n"
        "Com base nesses dados, avalie a eficiência do profissional, verifique se há indícios de sobrecarga operacional/fadiga de turno, "
        "e sugira otimizações de escala, elogio funcional ou necessidade de apoio em rota. Seja conciso e prescritivo."
    )

    return await _chamar_gemini(prompt, system_instruction)
