import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Float, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Equipamento(Base):
    """Ativo físico de infraestrutura urbana (radar, semáforo, câmera, etc.)."""

    __tablename__ = "equipamentos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tipo: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    numero_serie: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    marca: Mapped[str | None] = mapped_column(String(100))
    modelo: Mapped[str | None] = mapped_column(String(100))

    # Endereço
    cep: Mapped[str | None] = mapped_column(String(9))
    bairro: Mapped[str | None] = mapped_column(String(120), index=True)
    cidade_uf: Mapped[str] = mapped_column(
        String(60), nullable=False, default="Marília/SP", server_default=text("'Marília/SP'")
    )
    logradouro: Mapped[str | None] = mapped_column(String(255))
    referencia: Mapped[str | None] = mapped_column(String(255))
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)

    # Operação
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="OPERANTE", server_default=text("'OPERANTE'"), index=True
    )
    necessidade_manutencao: Mapped[str] = mapped_column(
        String(30), nullable=False, default="NENHUMA", server_default=text("'NENHUMA'")
    )
    data_proxima_manutencao: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    caracteristicas_extras: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )

    __table_args__ = (Index("ix_equipamentos_lat_lng", "latitude", "longitude"),)

    def __repr__(self) -> str:
        return f"<Equipamento {self.tipo} {self.numero_serie} [{self.status}]>"
