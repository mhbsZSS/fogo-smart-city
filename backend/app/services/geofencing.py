"""Serviço de Geofencing e Matemática Espacial - F.O.G.O.

Cálculos geodésicos esféricos (Fórmula de Haversine) e monitoramento perimetral de agentes
em relação a zonas operacionais e locais de ocorrência ativa.
"""
from __future__ import annotations

import logging
import math
from typing import Any

logger = logging.getLogger("uvicorn")

# Raio médio da Terra em metros (WGS-84 esférico)
RAIO_TERRA_METROS = 6_371_000.0


def calcular_distancia_metros(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calcula a distância geodésica em metros entre dois pontos geográficos

    utilizando a fórmula de Haversine na esfera terrestre.
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2)
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    distancia = RAIO_TERRA_METROS * c

    return round(distancia, 2)


def verificar_afastamento_agente(
    agente: Any,
    ocorrencia: Any,
    raio_limite_metros: float = 300.0,
) -> bool:
    """Verifica se o agente de campo se afastou do perímetro da ocorrência.

    Retorna True se a distância geodésica entre o agente e a ocorrência for
    estritamente superior ao raio limite (padrão: 300 metros).
    Retorna False caso coordenadas estejam ausentes ou incompletas.
    """
    lat_agente = getattr(agente, "latitude", None)
    lon_agente = getattr(agente, "longitude", None)
    lat_oc = getattr(ocorrencia, "latitude", None)
    lon_oc = getattr(ocorrencia, "longitude", None)

    # Suporte flexível para dicionários caso necessário
    if lat_agente is None and isinstance(agente, dict):
        lat_agente = agente.get("latitude")
        lon_agente = agente.get("longitude")

    if lat_oc is None and isinstance(ocorrencia, dict):
        lat_oc = ocorrencia.get("latitude")
        lon_oc = ocorrencia.get("longitude")

    if (
        lat_agente is None
        or lon_agente is None
        or lat_oc is None
        or lon_oc is None
    ):
        return False

    distancia = calcular_distancia_metros(lat_agente, lon_agente, lat_oc, lon_oc)
    afastou = distancia > raio_limite_metros

    if afastou:
        agente_nome = getattr(agente, "nome", "Agente") if not isinstance(agente, dict) else agente.get("nome", "Agente")
        oc_id = getattr(ocorrencia, "id", "Ocorrência") if not isinstance(ocorrencia, dict) else ocorrencia.get("id", "Ocorrência")
        logger.warning(
            "📡 [GEOFENCING] Afastamento detectado: Agente '%s' está a %.1fm da Ocorrência #%s (limite: %.0fm)",
            agente_nome,
            distancia,
            oc_id,
            raio_limite_metros,
        )

    return afastou
