"""Módulo de Rotas de Equipamentos - F.O.G.O.

Fornece endpoints para inventário de ativos urbanos, ciclo de vida e manutenção.
"""
from app.api.routes.equipamentos import (
    router,
    listar_equipamentos,
    resumo_equipamentos,
    obter_equipamento,
    cadastrar_equipamento,
    restaurar_equipamento,
    gerar_reparo_equipamento,
)

__all__ = [
    "router",
    "listar_equipamentos",
    "resumo_equipamentos",
    "obter_equipamento",
    "cadastrar_equipamento",
    "restaurar_equipamento",
    "gerar_reparo_equipamento",
]
