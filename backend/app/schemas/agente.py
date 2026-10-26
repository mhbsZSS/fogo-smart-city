import uuid
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class TipoAgente(str, Enum):
    AGENTE_TRANSITO = "AGENTE_TRANSITO"
    GUARDA_MUNICIPAL = "GUARDA_MUNICIPAL"
    TECNICO_MANUTENCAO = "TECNICO_MANUTENCAO"
    FISCAL_POSTURAS = "FISCAL_POSTURAS"
    DEFESA_CIVIL = "DEFESA_CIVIL"
    RESGATE_MEDICO = "RESGATE_MEDICO"
    SAUDE = "SAUDE"


class StatusAgente(str, Enum):
    DISPONIVEL = "DISPONIVEL"
    EM_DESLOCAMENTO = "EM_DESLOCAMENTO"
    EM_ATENDIMENTO = "EM_ATENDIMENTO"
    OFFLINE = "OFFLINE"
    INATIVO = "INATIVO"
    DESLIGADO = "DESLIGADO"


class AgenteCreate(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    nome: str = Field(..., min_length=2, max_length=150)
    tipo: TipoAgente
    status: StatusAgente = StatusAgente.DISPONIVEL
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)


class AgenteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome: str
    tipo: str
    status: str
    latitude: float | None
    longitude: float | None
    ocorrencia_id: uuid.UUID | None = None


class AgenteProximo(AgenteRead):
    distancia_km: float


class AgenteStatusUpdate(BaseModel):
    model_config = ConfigDict(use_enum_values=True)
    status: StatusAgente
