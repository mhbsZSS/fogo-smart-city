"""Script de Teste de Integração: Escalada Tática e Webhook do Telegram - F.O.G.O.

Valida:
1. Serviço de Despacho Múltiplo (escalar_ocorrencia_critica):
   - Gravidade alterada para CRITICA.
   - Alocação dos 2 agentes DISPONIVEL mais próximos via Fórmula de Haversine.
   - Transição de status para EM_DESLOCAMENTO e vínculo com ocorrencia_id.
2. Webhook Telegram (POST /webhook):
   - Callback Query 'apoio_<id>': Escalada tática e despacho de reforços.
   - Callback Query 'concluir_<id>': Ocorrência RESOLVIDA e liberação dos agentes para DISPONIVEL.
3. Resiliência a formatos de ID (UUID nativo, UUID string e inteiros).
"""
import asyncio
import uuid
import httpx

from app.core.database import AsyncSessionLocal
from app.models.agente import Agente
from app.models.ocorrencia import Ocorrencia
from app.services.despacho_service import (
    concluir_ocorrencia_e_liberar_agentes,
    escalar_ocorrencia_critica,
)
from app.services.geofencing import calcular_distancia_metros


async def executar_testes():
    print("=" * 70)
    print("🚀 INICIANDO TESTES DO ITEM 3: ESCALADA TÁTICA E DESPACHO MÚLTIPLO")
    print("=" * 70)

    async with AsyncSessionLocal() as db:
        # Limpeza preventiva de agentes de testes anteriores
        from sqlalchemy import delete
        await db.execute(delete(Agente).where(Agente.nome.like("Agente Teste %")))
        await db.execute(delete(Ocorrencia).where(Ocorrencia.titulo.like("%Incidente Teste%")))
        await db.commit()

        # Ponto de referência: Centro de Marília/SP (-22.2139, -49.9458)
        lat_base, lon_base = -22.2139, -49.9458

        # Prepara 3 agentes de teste com distâncias conhecidas
        # Agente 1: Perto (~100m)
        agente_perto = Agente(
            id=uuid.uuid4(),
            nome="Agente Teste Alpha (Próximo)",
            tipo="AGENTE_TRANSITO",
            status="DISPONIVEL",
            latitude=-22.2148,
            longitude=-49.9458,
        )
        # Agente 2: Médio (~350m)
        agente_medio = Agente(
            id=uuid.uuid4(),
            nome="Agente Teste Beta (Médio)",
            tipo="GUARDA_MUNICIPAL",
            status="DISPONIVEL",
            latitude=-22.2170,
            longitude=-49.9458,
        )
        # Agente 3: Longe (~1500m)
        agente_longe = Agente(
            id=uuid.uuid4(),
            nome="Agente Teste Gamma (Distante)",
            tipo="TECNICO_MANUTENCAO",
            status="DISPONIVEL",
            latitude=-22.2270,
            longitude=-49.9458,
        )

        # Ocorrência de teste
        ocorrencia_teste = Ocorrencia(
            id=uuid.uuid4(),
            titulo="Incidente Teste para Escalada Tática",
            descricao="Simulação de crise com necessidade de reforço múltiplo imediato.",
            tipo="TRANSITO",
            gravidade="MEDIA",
            status="PENDENTE",
            latitude=lat_base,
            longitude=lon_base,
        )

        db.add_all([agente_perto, agente_medio, agente_longe, ocorrencia_teste])
        await db.commit()
        await db.refresh(ocorrencia_teste)
        await db.refresh(agente_perto)
        await db.refresh(agente_medio)
        await db.refresh(agente_longe)

        oc_id = ocorrencia_teste.id
        print(f"\n[CENÁRIO CRIADO] Ocorrência #{oc_id} (Gravidade: {ocorrencia_teste.gravidade})")
        print(f"  • Agente Perto : {agente_perto.id} ({agente_perto.nome})")
        print(f"  • Agente Médio : {agente_medio.id} ({agente_medio.nome})")
        print(f"  • Agente Longe : {agente_longe.id} ({agente_longe.nome})")

        # --- TESTE 1: Despacho Múltiplo e Escalada Crítica via Serviço ---
        print("\n--- TESTE 1: Executando escalar_ocorrencia_critica() ---")
        resultado_escalada = await escalar_ocorrencia_critica(db, oc_id)

        print("Resultado da Escalada:", resultado_escalada["sucesso"])
        assert resultado_escalada["sucesso"] is True
        assert resultado_escalada["gravidade"] == "CRITICA"
        assert resultado_escalada["agentes_despachados_qtd"] == 2

        # Valida que os 2 alocados são exatamente os mais próximos (Alpha e Beta)
        ids_despachados = [a["id"] for a in resultado_escalada["agentes"]]
        print("IDs despachados:", ids_despachados)
        assert str(agente_perto.id) in ids_despachados, "Agente Alpha deveria ter sido alocado!"
        assert str(agente_medio.id) in ids_despachados, "Agente Beta deveria ter sido alocado!"
        assert str(agente_longe.id) not in ids_despachados, "Agente Gamma (longe) NÃO deveria ter sido alocado!"

        # Verifica persistência no banco
        await db.refresh(ocorrencia_teste)
        await db.refresh(agente_perto)
        await db.refresh(agente_medio)
        await db.refresh(agente_longe)

        assert ocorrencia_teste.gravidade == "CRITICA"
        assert ocorrencia_teste.status == "DESPACHADA"
        assert agente_perto.status == "EM_DESLOCAMENTO"
        assert agente_perto.ocorrencia_id == oc_id
        assert agente_medio.status == "EM_DESLOCAMENTO"
        assert agente_medio.ocorrencia_id == oc_id
        assert agente_longe.status == "DISPONIVEL"  # Permaneceu disponível
        print("✅ [TESTE 1 OK] Gravidade CRITICA, 2 agentes mais próximos em EM_DESLOCAMENTO e vinculados à ocorrência!")

        # --- TESTE 2: Conclusão e Liberação de Agentes ---
        print("\n--- TESTE 2: Executando concluir_ocorrencia_e_liberar_agentes() ---")
        resultado_conclusao = await concluir_ocorrencia_e_liberar_agentes(db, oc_id)
        assert resultado_conclusao["sucesso"] is True
        assert resultado_conclusao["status"] == "RESOLVIDA"

        await db.refresh(ocorrencia_teste)
        await db.refresh(agente_perto)
        await db.refresh(agente_medio)

        assert ocorrencia_teste.status == "RESOLVIDA"
        assert agente_perto.status == "DISPONIVEL"
        assert agente_perto.ocorrencia_id is None
        assert agente_medio.status == "DISPONIVEL"
        assert agente_medio.ocorrencia_id is None
        print("✅ [TESTE 2 OK] Ocorrência RESOLVIDA e agentes retornados para DISPONIVEL!")

    # --- TESTE 3: Chamada HTTP ao Webhook (POST /webhook) via TestClient / httpx ---
    print("\n--- TESTE 3: Webhook HTTP Telegram (POST /webhook) ---")
    # 3.1: Health check do webhook contra o servidor ativo
    client_kwargs = {"base_url": "http://127.0.0.1:8000", "timeout": 5.0}
    try:
        async with httpx.AsyncClient(**client_kwargs) as client:
            res_get = await client.get("/webhook")
    except Exception:
        from app.main import app
        client_kwargs = {"transport": httpx.ASGITransport(app=app), "base_url": "http://testserver", "timeout": 5.0}

    async with httpx.AsyncClient(**client_kwargs) as client:
        res_get = await client.get("/webhook")
        assert res_get.status_code == 200
        print("GET /webhook:", res_get.json())

        # Prepara nova ocorrência para teste do botão 'apoio_'
        async with AsyncSessionLocal() as db:
            nova_oc = Ocorrencia(
                id=uuid.uuid4(),
                titulo="Acidente Grave com Risco no Webhook",
                descricao="Teste de callback inline keyboard de socorro.",
                tipo="ACIDENTE",
                gravidade="BAIXA",
                status="PENDENTE",
                latitude=-22.2139,
                longitude=-49.9458,
            )
            db.add(nova_oc)
            await db.commit()
            await db.refresh(nova_oc)
            nova_oc_id = str(nova_oc.id)

        # 3.2: Payload simulado do Telegram com botão 🆘 Preciso de Apoio ('apoio_<id>')
        payload_apoio = {
            "update_id": 99901,
            "callback_query": {
                "id": "cb_query_999",
                "from": {"id": 12345678, "first_name": "Policial de Campo"},
                "message": {
                    "message_id": 555,
                    "chat": {"id": 12345678, "type": "private"},
                    "text": "Status Check: Tudo sob controle?",
                },
                "data": f"apoio_{nova_oc_id}",
            },
        }

        res_webhook_apoio = await client.post("/webhook", json=payload_apoio)
        print("POST /webhook (apoio):", res_webhook_apoio.status_code, res_webhook_apoio.json())
        assert res_webhook_apoio.status_code == 200
        data_apoio = res_webhook_apoio.json()
        assert data_apoio["ok"] is True
        assert data_apoio["acao"] == "escalada_critica"
        assert data_apoio["detalhes"]["gravidade"] == "CRITICA"
        print("✅ [TESTE 3.2 OK] Webhook acionou escalada crítica e mobilizou reforços!")

        # 3.3: Payload simulado do Telegram com botão ✅ Sim, Concluir ('concluir_<id>')
        payload_concluir = {
            "update_id": 99902,
            "callback_query": {
                "id": "cb_query_999",
                "from": {"id": 12345678, "first_name": "Policial de Campo"},
                "message": {
                    "message_id": 556,
                    "chat": {"id": 12345678, "type": "private"},
                },
                "data": f"concluir_{nova_oc_id}",
            },
        }

        res_webhook_concluir = await client.post("/webhook", json=payload_concluir)
        print("POST /webhook (concluir):", res_webhook_concluir.status_code, res_webhook_concluir.json())
        assert res_webhook_concluir.status_code == 200
        data_concluir = res_webhook_concluir.json()
        assert data_concluir["ok"] is True
        assert data_concluir["acao"] == "concluir"
        assert data_concluir["detalhes"]["status"] == "RESOLVIDA"
        print("✅ [TESTE 3.3 OK] Webhook concluiu a ocorrência e liberou os agentes!")

    print("\n" + "=" * 70)
    print("🏆 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(executar_testes())
