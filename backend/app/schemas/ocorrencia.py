import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class TipoOcorrencia(str, Enum):
    MANUTENCAO = "MANUTENCAO"
    ACIDENTE = "ACIDENTE"
    SEGURANCA = "SEGURANCA"
    ILUMINACAO = "ILUMINACAO"
    TRANSITO = "TRANSITO"
    AMBIENTAL = "AMBIENTAL"
    DEFESA_CIVIL = "DEFESA_CIVIL"
    ALERTA_CAMPO = "ALERTA_CAMPO"
    OUTRO = "OUTRO"


class GravidadeOcorrencia(str, Enum):
    BAIXA = "BAIXA"
    MEDIA = "MEDIA"
    ALTA = "ALTA"
    CRITICA = "CRITICA"


class StatusOcorrencia(str, Enum):
    PENDENTE = "PENDENTE"
    DESPACHADA = "DESPACHADA"
    EM_ATENDIMENTO = "EM_ATENDIMENTO"
    APOIO_SOLICITADO = "APOIO_SOLICITADO"
    RESOLVIDA = "RESOLVIDA"


class OcorrenciaBase(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    titulo: str = Field(..., min_length=3, max_length=150)
    descricao: str = Field(..., min_length=3)
    tipo: TipoOcorrencia | str = TipoOcorrencia.MANUTENCAO
    gravidade: GravidadeOcorrencia | str = GravidadeOcorrencia.MEDIA
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    equipamento_id: uuid.UUID | None = None
    data_despacho: datetime | None = None
    data_conclusao: datetime | None = None
    necessita_apoio: bool = False


class OcorrenciaCreate(OcorrenciaBase):
    pass


class OcorrenciaUpdate(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    status: StatusOcorrencia | str | None = None
    agente_id: uuid.UUID | None = None
    descricao: str | None = None
    gravidade: GravidadeOcorrencia | str | None = None
    data_despacho: datetime | None = None
    data_conclusao: datetime | None = None
    necessita_apoio: bool | None = None


class DespachoInput(BaseModel):
    agente_id: uuid.UUID = Field(..., description="UUID do Agente despachado para a ocorrência")


class OcorrenciaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    id: uuid.UUID
    titulo: str
    descricao: str
    tipo: str
    gravidade: str
    status: str
    latitude: float
    longitude: float
    equipamento_id: uuid.UUID | None = None
    agente_id: uuid.UUID | None = None
    data_despacho: datetime | None = None
    data_conclusao: datetime | None = None
    necessita_apoio: bool = False
    criado_em: datetime
    atualizado_em: datetime
