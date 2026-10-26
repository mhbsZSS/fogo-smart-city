import json
import logging
from typing import Any
from fastapi import WebSocket

logger = logging.getLogger("uvicorn")


class ConnectionManager:
    """
    Gerenciador central de conexões WebSocket para o CICC do F.O.G.O.
    Permite broadcast em tempo real para sincronização instantânea de filas,
    mapas táticos e painéis operacionais sem necessidade de F5 manual.
    """

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(
            "🔌 [WEBSOCKET] Cliente CICC conectado com sucesso. Total ativos: %d",
            len(self.active_connections),
        )

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(
                "🔌 [WEBSOCKET] Cliente CICC desconectado. Conexões restantes: %d",
                len(self.active_connections),
            )

    async def broadcast(self, message: dict[str, Any]) -> None:
        """Envia mensagem JSON para todos os clientes conectados ao painel."""
        if not self.active_connections:
            logger.info("ℹ️ [WEBSOCKET] Nenhum cliente conectado para broadcast.")
            return

        action = message.get("action", "atualizacao")
        logger.info(
            "📡 [WEBSOCKET] Realizando broadcast de '%s' para %d cliente(s) ativo(s)",
            action,
            len(self.active_connections),
        )

        conexoes_mortas: list[WebSocket] = []
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception as exc:
                logger.warning("⚠️ [WEBSOCKET] Falha ao enviar para cliente: %s", exc)
                conexoes_mortas.append(connection)

        for conn in conexoes_mortas:
            self.disconnect(conn)


ws_manager = ConnectionManager()
