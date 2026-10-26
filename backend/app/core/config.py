"""Configuração centralizada, carregada de variáveis de ambiente."""
from functools import cached_property
from urllib.parse import quote_plus

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    PROJECT_NAME: str = "F.O.G.O. - Ferramenta Onisciente de Gestão e Operações"
    API_V1_PREFIX: str = "/api/v1"

    POSTGRES_USER: str = "fogo"
    POSTGRES_PASSWORD: str = "fogo_dev_change_me"
    POSTGRES_DB: str = "fogo"
    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = 5432

    # Lista separada por vírgula
    CORS_ORIGINS: str = "http://localhost:5173"

    # Automação de Campo & Geofencing (Telegram)
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID_TESTE: str = ""

    @property
    def _dsn_body(self) -> str:
        user = quote_plus(self.POSTGRES_USER)
        pwd = quote_plus(self.POSTGRES_PASSWORD)
        return f"{user}:{pwd}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    @property
    def database_url_async(self) -> str:
        """Usado pela API (asyncpg)."""
        return f"postgresql+asyncpg://{self._dsn_body}"

    @property
    def database_url_sync(self) -> str:
        """Usado por scripts/batch (psycopg2)."""
        return f"postgresql+psycopg2://{self._dsn_body}"

    @cached_property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
