import asyncio
from app.services.geofencing import calcular_distancia_metros, verificar_afastamento_agente
from app.services.telegram_service import TelegramService

class DummyAgent:
    def __init__(self, nome, lat, lon):
        self.nome = nome
        self.latitude = lat
        self.longitude = lon

class DummyOcorrencia:
    def __init__(self, id, titulo, lat, lon):
        self.id = id
        self.titulo = titulo
        self.latitude = lat
        self.longitude = lon

async def test_all():
    print("--- TESTE 1: Haversine ---")
    d0 = calcular_distancia_metros(-22.2148, -49.9462, -22.2148, -49.9462)
    assert d0 == 0.0, f"Distancia esperada 0.0, obtido {d0}"
    print(f"Distancia mesmo ponto: {d0}m [OK]")

    d = calcular_distancia_metros(-22.2139, -49.9458, -22.2170, -49.9475)
    print(f"Distância Praça -> Terminal: {d}m [OK]")
    assert 350 < d < 450, f"Distância fora do esperado: {d}"

    print("\n--- TESTE 2: Geofencing (300 metros) ---")
    oc = DummyOcorrencia("123", "Colisão Leve", -22.2139, -49.9458)

    agente_perto = DummyAgent("Agente Perto", -22.2145, -49.9458)
    d_perto = calcular_distancia_metros(agente_perto.latitude, agente_perto.longitude, oc.latitude, oc.longitude)
    afastou_perto = verificar_afastamento_agente(agente_perto, oc)
    print(f"Agente a {d_perto}m -> Afastado: {afastou_perto} (esperado: False)")
    assert afastou_perto is False

    agente_longe = DummyAgent("Agente Longe", -22.2175, -49.9458)
    d_longe = calcular_distancia_metros(agente_longe.latitude, agente_longe.longitude, oc.latitude, oc.longitude)
    afastou_longe = verificar_afastamento_agente(agente_longe, oc)
    print(f"Agente a {d_longe}m -> Afastado: {afastou_longe} (esperado: True)")
    assert afastou_longe is True

    print("\n--- TESTE 3: Telegram Service ---")
    ts = TelegramService(token="") # modo simulado seguro
    res_afastamento = await ts.enviar_alerta_afastamento(
        chat_id="999888777",
        ocorrencia_id="42",
        titulo="Colisão na Sampaio Vidal"
    )
    print("Alerta Afastamento:", res_afastamento["ok"], res_afastamento.get("simulado"))
    assert res_afastamento["ok"] is True
    assert "concluir_42" in str(res_afastamento["payload"])
    assert "retornando_42" in str(res_afastamento["payload"])

    res_checkin = await ts.enviar_checkin_seguranca(
        chat_id="999888777",
        ocorrencia_id="42",
        titulo="Colisão na Sampaio Vidal"
    )
    print("Check-in Segurança:", res_checkin["ok"], res_checkin.get("simulado"))
    assert res_checkin["ok"] is True
    assert "checkin_ok_42" in str(res_checkin["payload"])
    assert "apoio_42" in str(res_checkin["payload"])

    print("\n✅ TODOS OS TESTES PASSARAM COM SUCESSO!")

if __name__ == "__main__":
    asyncio.run(test_all())
