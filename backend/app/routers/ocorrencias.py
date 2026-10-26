"""Módulo de Rotas de Ocorrências - F.O.G.O.

Fornece endpoints para gestão operacional, despacho de viaturas e
conclusão manual com override pelo Centro de Inteligência e Comando (CICC).
"""
from app.api.routes.ocorrencias import (
    router,
    listar_ocorrencias,
    obter_ocorrencia,
    criar_ocorrencia,
    despachar_agente,
    concluir_ocorrencia,
)
from app.services.despacho_service import concluir_ocorrencia_e_liberar_agentes

__all__ = [
    "router",
    "listar_ocorrencias",
    "obter_ocorrencia",
    "criar_ocorrencia",
    "despachar_agente",
    "concluir_ocorrencia",
    "concluir_ocorrencia_e_liberar_agentes",
]
