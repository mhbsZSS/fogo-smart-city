import uuid

from sqlalchemy import Float, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Agente(Base):
    """Agente de campo (trânsito, guarda municipal, técnico de manutenção...)."""

    __tablename__ = "agentes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nome: Mapped[str] = mapped_column(String(150), nullable=False)
    tipo: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="DISPONIVEL", server_default=text("'DISPONIVEL'"), index=True
    )
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    ocorrencia_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ocorrencias.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    telegram_chat_id: Mapped[str | None] = mapped_column(String(50), nullable=True)

    def __repr__(self) -> str:
        return f"<Agente {self.nome} ({self.tipo}) [{self.status}]>"

