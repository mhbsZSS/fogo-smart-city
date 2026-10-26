import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class HistoricoEvento(Base):
    """
    Log de eventos (append-only) de qualquer entidade do sistema.

    `entidade_id` é propositalmente polimórfico (sem FK): pode referenciar um
    equipamento, um agente ou entidades futuras (ocorrências, chamados...).
    """

    __tablename__ = "historico_eventos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entidade_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    tipo_evento: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    data_hora: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )

    def __repr__(self) -> str:
        return f"<HistoricoEvento {self.tipo_evento} {self.entidade_id} @ {self.data_hora}>"
