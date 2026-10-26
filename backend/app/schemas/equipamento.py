import uuid
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.geo import MARILIA_BBOX, dentro_bbox


class TipoEquipamento(str, Enum):
    RADAR = "RADAR"
    LOMBADA_ELETRONICA = "LOMBADA_ELETRONICA"
    SEMAFORO = "SEMAFORO"
    CAMERA_CFTV = "CAMERA_CFTV"
    LUMINARIA_LED = "LUMINARIA_LED"
    SENSOR_AMBIENTAL = "SENSOR_AMBIENTAL"
    TOTEM_WIFI = "TOTEM_WIFI"


class StatusEquipamento(str, Enum):
    OPERANTE = "OPERANTE"
    ALERTA = "ALERTA"
    EM_MANUTENCAO = "EM_MANUTENCAO"
    INOPERANTE = "INOPERANTE"


class NecessidadeManutencao(str, Enum):
    NENHUMA = "NENHUMA"
    PREVENTIVA = "PREVENTIVA"
    CORRETIVA = "CORRETIVA"
    URGENTE = "URGENTE"


class EquipamentoCreate(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    tipo: TipoEquipamento
    numero_serie: str = Field(..., min_length=3, max_length=100)
    marca: str | None = Field(None, max_length=100)
    modelo: str | None = Field(None, max_length=100)
    cep: str | None = Field(None, pattern=r"^\d{5}-?\d{3}$", examples=["17500-000"])
    bairro: str | None = Field(None, max_length=120)
    cidade_uf: str = Field("Marília/SP", max_length=60)
    logradouro: str | None = Field(None, max_length=255)
    referencia: str | None = Field(None, max_length=255)
    latitude: float = Field(..., examples=[-22.2139])
    longitude: float = Field(..., examples=[-49.9458])
    status: StatusEquipamento = StatusEquipamento.OPERANTE
    necessidade_manutencao: NecessidadeManutencao = NecessidadeManutencao.NENHUMA
    data_proxima_manutencao: datetime | None = None
    caracteristicas_extras: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validar_coordenadas_marilia(self) -> "EquipamentoCreate":
        if not dentro_bbox(self.latitude, self.longitude):
            b = MARILIA_BBOX
            raise ValueError(
                "Coordenadas fora da área de cobertura de Marília/SP "
                f"(lat {b['lat_min']}..{b['lat_max']}, lng {b['lng_min']}..{b['lng_max']})."
            )
        return self


class EquipamentoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tipo: str
    numero_serie: str
    marca: str | None
    modelo: str | None
    cep: str | None
    bairro: str | None
    cidade_uf: str
    logradouro: str | None
    referencia: str | None
    latitude: float
    longitude: float
    status: str
    necessidade_manutencao: str
    data_proxima_manutencao: datetime | None
    caracteristicas_extras: dict[str, Any]


class EquipamentoResumo(BaseModel):
    total: int
    por_status: dict[str, int]
    por_tipo: dict[str, int]
    manutencao_vencida: int
