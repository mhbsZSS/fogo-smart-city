from app.schemas.agente import AgenteCreate, AgenteProximo, AgenteRead, AgenteStatusUpdate
from app.schemas.equipamento import EquipamentoCreate, EquipamentoRead, EquipamentoResumo
from app.schemas.ocorrencia import (
    DespachoInput,
    OcorrenciaCreate,
    OcorrenciaResponse,
    OcorrenciaUpdate,
)

__all__ = [
    "AgenteCreate",
    "AgenteProximo",
    "AgenteRead",
    "AgenteStatusUpdate",
    "EquipamentoCreate",
    "EquipamentoRead",
    "EquipamentoResumo",
    "DespachoInput",
    "OcorrenciaCreate",
    "OcorrenciaResponse",
    "OcorrenciaUpdate",
]
