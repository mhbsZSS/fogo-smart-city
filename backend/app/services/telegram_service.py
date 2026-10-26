"""Serviço de Mensageria e Automação de Campo via Telegram - F.O.G.O.

Permite envio assíncrono de notificações com botões interativos (inline keyboards)
para smartphones de equipes e agentes em campo (Geofencing, Check-in de Segurança e Despacho).
"""
from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger("uvicorn")


class TelegramService:
    """Cliente assíncrono de mensageria para a API de Bots do Telegram."""

    def __init__(self, token: str | None = None) -> None:
        self._custom_token = token

    @property
    def token(self) -> str:
        try:
            from dotenv import load_dotenv
            load_dotenv(override=True)
        except Exception:
            pass
        return (
            self._custom_token
            or os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
            or getattr(settings, "TELEGRAM_BOT_TOKEN", "")
        )

    @property
    def base_url(self) -> str:
        tok = self.token
        return f"https://api.telegram.org/bot{tok}" if tok else ""

    @property
    def is_configured(self) -> bool:
        """Indica se o bot token foi configurado no ambiente."""
        return bool(self.token)

    async def enviar_mensagem(
        self,
        chat_id: str | int,
        texto: str,
        reply_markup: dict[str, Any] | None = None,
        parse_mode: str = "Markdown",
    ) -> dict[str, Any]:
        """Dispara mensagem para um chat_id do Telegram.

        Se o token não estiver presente, registra no log em modo simulação sem lançar exceção.
        """
        payload: dict[str, Any] = {
            "chat_id": str(chat_id),
            "text": texto,
            "parse_mode": parse_mode,
        }
        if reply_markup:
            payload["reply_markup"] = reply_markup

        if not self.is_configured:
            logger.info(
                "📱 [TELEGRAM SIMULADO] Destino: %s | Mensagem:\n%s\nBotões: %s",
                chat_id,
                texto,
                reply_markup,
            )
            return {
                "ok": True,
                "simulado": True,
                "mensagem": "Token do Telegram ausente; envio simulado no log.",
                "payload": payload,
            }

        url = f"{self.base_url}/sendMessage"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, json=payload)
                data = response.json()
                if not response.is_success:
                    logger.error(
                        "⚠️ [TELEGRAM ERROR] Falha no envio para %s: HTTP %d - %s",
                        chat_id,
                        response.status_code,
                        data,
                    )
                else:
                    logger.info("✅ [TELEGRAM] Mensagem enviada com sucesso para %s", chat_id)
                return data

        except Exception as exc:
            logger.error("❌ [TELEGRAM ERROR] Exceção ao contatar API do Telegram: %s", exc)
            return {"ok": False, "erro": str(exc)}

    async def responder_callback_query(
        self,
        callback_query_id: str,
        texto: str | None = None,
        show_alert: bool = False,
    ) -> dict[str, Any]:
        """Responde a uma callback_query para remover o loading do botão na interface do Telegram."""
        if not self.is_configured:
            logger.info(
                "📱 [TELEGRAM SIMULADO] Resposta de Callback %s: texto='%s' alert=%s",
                callback_query_id,
                texto,
                show_alert,
            )
            return {"ok": True, "simulado": True}

        url = f"{self.base_url}/answerCallbackQuery"
        payload: dict[str, Any] = {"callback_query_id": callback_query_id}
        if texto:
            payload["text"] = texto
        if show_alert:
            payload["show_alert"] = True

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, json=payload)
                return response.json()
        except Exception as exc:
            logger.error("❌ [TELEGRAM ERROR] Exceção ao responder callback_query: %s", exc)
            return {"ok": False, "erro": str(exc)}

    async def editar_mensagem(
        self,
        chat_id: str | int,
        message_id: int,
        texto: str,
        reply_markup: dict[str, Any] | None = None,
        parse_mode: str = "Markdown",
    ) -> dict[str, Any]:
        """Edita uma mensagem no Telegram (removendo botões ou atualizando o texto)."""
        if not self.is_configured:
            logger.info("📱 [TELEGRAM SIMULADO] Edição de Mensagem %s no chat %s: %s", message_id, chat_id, texto)
            return {"ok": True, "simulado": True}

        url = f"{self.base_url}/editMessageText"
        payload: dict[str, Any] = {
            "chat_id": str(chat_id),
            "message_id": message_id,
            "text": texto,
            "parse_mode": parse_mode,
        }
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, json=payload)
                data = response.json()
                if not response.is_success:
                    logger.error("⚠️ [TELEGRAM ERROR] Falha ao editar mensagem %s: %s", message_id, data)
                else:
                    logger.info("✅ [TELEGRAM] Mensagem %s editada com sucesso no chat %s", message_id, chat_id)
                return data
        except Exception as exc:
            logger.error("❌ [TELEGRAM ERROR] Exceção ao editar mensagem: %s", exc)
            return {"ok": False, "erro": str(exc)}

    async def enviar_alerta_afastamento(
        self,
        chat_id: str | int,
        ocorrencia_id: Any,
        titulo: str,
    ) -> dict[str, Any]:
        """Alerta de Geofencing: Notifica o agente quando ele se afasta > 300m da ocorrência.

        Envia inline keyboard interativo com botões de conclusão ou retorno ao local.
        """
        texto = (
            "⚠️ *ALERTA DE GEOFENCING* ⚠️\n"
            f"Detectamos o seu afastamento do local da ocorrência #{ocorrencia_id} ({titulo}). "
            "O atendimento já foi concluído?"
        )

        reply_markup = {
            "inline_keyboard": [
                [
                    {
                        "text": "✅ Sim, Concluir",
                        "callback_data": f"concluir_{ocorrencia_id}",
                    },
                    {
                        "text": "🔄 Não, Retornando",
                        "callback_data": f"retornando_{ocorrencia_id}",
                    },
                ]
            ]
        }

        return await self.enviar_mensagem(
            chat_id=chat_id,
            texto=texto,
            reply_markup=reply_markup,
            parse_mode="Markdown",
        )

    async def enviar_checkin_seguranca(
        self,
        chat_id: str | int,
        ocorrencia_id: Any,
        titulo: str,
    ) -> dict[str, Any]:
        """Check-in de Segurança: Alerta operacional disparado após 45 minutos em atendimento.

        Pergunta: "Status Check: Tudo sob controle?" com botões interativos de confirmação ou socorro.
        """
        texto = (
            "🛡️ *STATUS CHECK DE SEGURANÇA* 🛡️\n"
            f"A equipe está em atendimento na ocorrência #{ocorrencia_id} ({titulo}) há mais de 45 minutos.\n"
            "*Status Check:* Tudo sob controle?"
        )

        reply_markup = {
            "inline_keyboard": [
                [
                    {
                        "text": "🛡️ Tudo sob controle",
                        "callback_data": f"checkin_ok_{ocorrencia_id}",
                    },
                    {
                        "text": "🆘 Preciso de Apoio",
                        "callback_data": f"apoio_{ocorrencia_id}",
                    },
                ]
            ]
        }

        return await self.enviar_mensagem(
            chat_id=chat_id,
            texto=texto,
            reply_markup=reply_markup,
            parse_mode="Markdown",
        )


# Instância singleton padrão para uso nos serviços e endpoints da API
telegram_service = TelegramService()
