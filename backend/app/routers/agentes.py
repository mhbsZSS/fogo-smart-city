"""Módulo de Rotas de Agentes - F.O.G.O.

Fornece endpoints para gestão operacional de efetivo em campo e sincronização de contingência.
"""
from app.api.routes.agentes import (
    router,
    listar_agentes,
    agentes_proximos,
    cadastrar_agente,
    sincronizar_agentes,
    remover_agente,
    atualizar_status_agente,
)

__all__ = [
    "router",
    "listar_agentes",
    "agentes_proximos",
    "cadastrar_agente",
    "sincronizar_agentes",
    "remover_agente",
    "atualizar_status_agente",
]

