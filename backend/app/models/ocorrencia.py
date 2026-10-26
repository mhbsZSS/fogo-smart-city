import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Ocorrencia(Base):
    """
    Ocorrência operacional ou incidente urbano (falha técnica, acidente, segurança pública).
    Ponto central de despacho para as equipes e agentes em campo.
    """

    __tablename__ = "ocorrencias"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    titulo: Mapped[str] = mapped_column(String(150), nullable=False)
    descricao: Mapped[str] = mapped_column(Text, nullable=False)
    tipo: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    gravidade: Mapped[str] = mapped_column(
        String(20), nullable=False, default="MEDIA", server_default=text("'MEDIA'"), index=True
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="PENDENTE", server_default=text("'PENDENTE'"), index=True
    )
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    necessita_apoio: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false"), index=True
    )

    # Chaves estrangeiras opcionais
    equipamento_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("equipamentos.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    agente_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agentes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Telemetria & Rastreio de SLA
    data_despacho: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    data_conclusao: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    # Relacionamentos
    equipamento = relationship("Equipamento", lazy="selectin")
    agente = relationship("Agente", foreign_keys=[agente_id], lazy="selectin")

    # Timestamps
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    def __repr__(self) -> str:
        return f"<Ocorrencia {self.id} [{self.tipo}] {self.titulo} - Status: {self.status}>"
