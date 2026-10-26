"""Importar todos os modelos aqui garante que o metadata do Base os conheça."""
from app.models.agente import Agente
from app.models.equipamento import Equipamento
from app.models.historico_evento import HistoricoEvento
from app.models.ocorrencia import Ocorrencia

__all__ = ["Agente", "Equipamento", "HistoricoEvento", "Ocorrencia"]
