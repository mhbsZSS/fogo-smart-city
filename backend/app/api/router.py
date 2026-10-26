from fastapi import APIRouter

from app.api.routes import agentes, equipamentos, ocorrencias

api_router = APIRouter()
api_router.include_router(equipamentos.router)
api_router.include_router(agentes.router)
api_router.include_router(ocorrencias.router)
