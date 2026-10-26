"""Motor de Simulação Contínua (Live Data Generator) - F.O.G.O.

Serviço em background que injeta dinamismo operacional autônomo na cidade de Marília/SP.
Executa pulsos contínuos entre 30 e 60 segundos com 3 tipos de ações:
  - Ação A (Mobilidade): Atualiza coordenadas de agentes com jitter realista.
  - Ação B (Anomalia): Induz falhas em equipamentos operantes e registra histórico.
  - Ação C (Incidente): Cria novas ocorrências pendentes em logradouros reais de Marília.
"""
from __future__ import annotations

import asyncio
import logging
import random
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.geo import dentro_de_marilia
from app.models import Agente, Equipamento, HistoricoEvento, Ocorrencia

logger = logging.getLogger("uvicorn")

# Catálogo tático de incidentes plausíveis em Marília/SP
CATALOGO_INCIDENTES: list[dict[str, Any]] = [
    {
        "titulo": "Colisão Leve sem Vítimas",
        "descricao": "Colisão traseira lateral entre dois veículos leves, retendo faixa da direita.",
        "tipo": "ACIDENTE",
        "gravidade": "MEDIA",
        "logradouro": "Av. Sampaio Vidal",
        "lat": -22.2148,
        "lng": -49.9462,
    },
    {
        "titulo": "Fio de Média Tensão Partido",
        "descricao": "Fiação de poste de iluminação rompida pendurada sobre o leito carroçável com faíscas.",
        "tipo": "ILUMINACAO",
        "gravidade": "ALTA",
        "logradouro": "Av. República",
        "lat": -22.2045,
        "lng": -49.9570,
    },
    {
        "titulo": "Semáforo em Pane Elétrica",
        "descricao": "Controlador semafórico em curto com foco apagado e retenção súbita de tráfego.",
        "tipo": "TRANSITO",
        "gravidade": "ALTA",
        "logradouro": "Av. Rio Branco",
        "lat": -22.2175,
        "lng": -49.9490,
    },
    {
        "titulo": "Galho de Grande Porte na Pista",
        "descricao": "Queda parcial de copa de árvore após rajada de vento, bloqueando modal ativo/ciclofaixa.",
        "tipo": "AMBIENTAL",
        "gravidade": "MEDIA",
        "logradouro": "Av. das Esmeraldas",
        "lat": -22.2355,
        "lng": -49.9385,
    },
    {
        "titulo": "Vazamento de Água em Adutora",
        "descricao": "Ruptura de rede subterrânea com refluxo de água sobre a pista e erosão de bordo.",
        "tipo": "MANUTENCAO",
        "gravidade": "BAIXA",
        "logradouro": "Av. Santo Antônio",
        "lat": -22.2115,
        "lng": -49.9375,
    },
    {
        "titulo": "Caminhão com Pane Mecânica em Cruzamento",
        "descricao": "Veículo de carga com pane no eixo traseiro imobilizado obstruindo o fluxo da via.",
        "tipo": "TRANSITO",
        "gravidade": "MEDIA",
        "logradouro": "Av. Tiradentes",
        "lat": -22.2195,
        "lng": -49.9520,
    },
    {
        "titulo": "Mancha de Óleo com Risco de Derrapagem",
        "descricao": "Derramamento de fluido de freio/óleo combustível gerando risco iminente de colisão.",
        "tipo": "ACIDENTE",
        "gravidade": "ALTA",
        "logradouro": "Av. Brigadeiro Eduardo Gomes",
        "lat": -22.2235,
        "lng": -49.9305,
    },
    {
        "titulo": "Violação de Cabeamento de Telemetria",
        "descricao": "Alerta telemétrico de perda súbita de link com suspeita de sabotagem física.",
        "tipo": "SEGURANCA",
        "gravidade": "CRITICA",
        "logradouro": "Rodovia SP-294 (Km 451)",
        "lat": -22.2050,
        "lng": -49.9770,
    },
]


async def _executar_acao_mobilidade(db: AsyncSessionLocal) -> bool:
    """Ação A: Simula deslocamento de agente ativo com jitter geodésico suave."""
    stmt = (
        select(Agente)
        .where(Agente.status.in_(["DISPONIVEL", "EM_DESLOCAMENTO"]))
        .where(Agente.latitude.isnot(None))
        .where(Agente.longitude.isnot(None))
    )
    result = await db.execute(stmt)
    agentes = list(result.scalars().all())
    if not agentes:
        return False

    agente = random.choice(agentes)

    # Jitter fino (~40 a 70 metros por pulso)
    delta_lat = random.uniform(-0.0006, 0.0006)
    delta_lng = random.uniform(-0.0006, 0.0006)
    nova_lat = round(agente.latitude + delta_lat, 6)
    nova_lng = round(agente.longitude + delta_lng, 6)

    # Garante que permaneça na mancha urbana de Marília
    if dentro_de_marilia(nova_lat, nova_lng):
        agente.latitude = nova_lat
        agente.longitude = nova_lng
    else:
        # Puxa suavemente em direção ao centro de Marília (-22.2139, -49.9458)
        agente.latitude = round(agente.latitude + (-0.0003 if agente.latitude > -22.2139 else 0.0003), 6)
        agente.longitude = round(agente.longitude + (-0.0003 if agente.longitude > -49.9458 else 0.0003), 6)

    # Alterna status dinamicamente de forma natural
    if random.random() < 0.35:
        agente.status = "EM_DESLOCAMENTO" if agente.status == "DISPONIVEL" else "DISPONIVEL"

    logger.info(
        "📍 [PULSO VIVO - MOBILIDADE] Agente '%s' (%s) movimentou-se para (%.5f, %.5f) - Status: %s",
        agente.nome,
        agente.tipo,
        agente.latitude,
        agente.longitude,
        agente.status,
    )
    await db.commit()
    return True


async def _executar_acao_anomalia(db: AsyncSessionLocal) -> bool:
    """Ação B: Induz anomalia em equipamento operante e registra histórico operacional."""
    stmt = select(Equipamento).where(Equipamento.status == "OPERANTE")
    result = await db.execute(stmt)
    equipamentos = list(result.scalars().all())
    if not equipamentos:
        return False

    equipamento = random.choice(equipamentos)
    novo_status = random.choice(["ALERTA", "INOPERANTE"])
    equipamento.status = novo_status

    if novo_status == "INOPERANTE":
        equipamento.necessidade_manutencao = "URGENTE"
        tipo_evento = "FALHA_CRITICA_OPERACIONAL"
    else:
        equipamento.necessidade_manutencao = "CORRETIVA"
        tipo_evento = "ALERTA_TELEMETRIA_ANOMALIA"

    # Registra no log append-only de auditoria
    evento = HistoricoEvento(
        entidade_id=equipamento.id,
        tipo_evento=tipo_evento,
        data_hora=datetime.now(timezone.utc),
    )
    db.add(evento)

    logger.warning(
        "🚨 [PULSO VIVO - ANOMALIA] Equipamento %s (Série: %s | ID: %s) mudou para '%s' em '%s'",
        equipamento.tipo,
        equipamento.numero_serie,
        equipamento.id,
        novo_status,
        equipamento.logradouro or "Marília/SP",
    )
    await db.commit()
    return True


async def _executar_acao_incidente(db: AsyncSessionLocal) -> bool:
    """Ação C: Registra novo incidente operacional pendente com geolocalização real de Marília."""
    template = random.choice(CATALOGO_INCIDENTES)

    # Aplica pequeno offset para variar o ponto exato da rua
    jitter_lat = random.uniform(-0.0003, 0.0003)
    jitter_lng = random.uniform(-0.0003, 0.0003)
    lat_final = round(template["lat"] + jitter_lat, 6)
    lng_final = round(template["lng"] + jitter_lng, 6)

    nova_ocorrencia = Ocorrencia(
        titulo=template["titulo"],
        descricao=f"{template['descricao']} [Detectado automaticamente pelo Motor de Telemetria Contínua]",
        tipo=template["tipo"],
        gravidade=template["gravidade"],
        status="PENDENTE",
        latitude=lat_final,
        longitude=lng_final,
    )
    db.add(nova_ocorrencia)

    logger.info(
        "🔥 [PULSO VIVO - INCIDENTE] Nova ocorrência aberta: [%s - %s] '%s' em '%s' (Coord: %.5f, %.5f)",
        template["tipo"],
        template["gravidade"],
        template["titulo"],
        template["logradouro"],
        lat_final,
        lng_final,
    )
    await db.commit()
    return True


async def iniciar_simulador_vivo(intervalo_min: int = 30, intervalo_max: int = 60) -> None:
    """Rotina assíncrona infinita de simulação contínua (Live Data Generator).

    Executa em background integrada ao lifespan do FastAPI sem bloquear o event loop.
    """
    logger.info("⚡ [MOTOR VIVO] Motor de Simulação Contínua F.O.G.O. inicializado com sucesso.")
    logger.info("🏙️ [MOTOR VIVO] O coração da cidade de Marília/SP está pulsando (intervalo: %ds-%ds).", intervalo_min, intervalo_max)

    # Breve respiro inicial na inicialização para consolidação do pool de conexões
    await asyncio.sleep(5)

    ciclo = 1
    while True:
        try:
            # Sessão autônoma e segura por pulso
            async with AsyncSessionLocal() as db:
                acao = random.choice(["MOBILIDADE", "ANOMALIA", "INCIDENTE"])
                logger.debug("💓 [MOTOR VIVO] Pulso #%d disparando ação: %s", ciclo, acao)

                if acao == "MOBILIDADE":
                    executou = await _executar_acao_mobilidade(db)
                elif acao == "ANOMALIA":
                    executou = await _executar_acao_anomalia(db)
                else:
                    executou = await _executar_acao_incidente(db)

                if not executou:
                    # Fallback suave caso os filtros da ação escolhida não encontrem registros elegíveis
                    await _executar_acao_incidente(db)

            ciclo += 1

        except asyncio.CancelledError:
            logger.info("🛑 [MOTOR VIVO] Recebido sinal de encerramento do motor de simulação contínua.")
            break
        except Exception as exc:
            logger.error("⚠️ [MOTOR VIVO] Erro durante o pulso de simulação (#%d): %s", ciclo, exc, exc_info=True)

        # Intervalo randômico entre 30 e 60 segundos
        tempo_espera = random.randint(intervalo_min, intervalo_max)
        logger.debug("⏳ [MOTOR VIVO] Próximo pulso em %d segundos...", tempo_espera)
        await asyncio.sleep(tempo_espera)
