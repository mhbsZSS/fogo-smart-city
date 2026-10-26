"""
F.O.G.O. — Gerador de dados mock para Marília/SP.

Popula o banco com equipamentos urbanos, agentes de campo e histórico de eventos.
TODAS as coordenadas são validadas para ficarem estritamente dentro da bounding
box (Lat -22.25..-22.18 | Lng -49.98..-49.91) E do polígono urbano de Marília
definido em `app/core/geo.py`.

Uso (com os containers rodando):
    docker compose exec backend python -m scripts.mock_generator
    docker compose exec backend python -m scripts.mock_generator --reset
    docker compose exec backend python -m scripts.mock_generator --equipamentos 1000 --agentes 60 --seed 7
"""
from __future__ import annotations

import argparse
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from sqlalchemy import create_engine, delete, func, select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import Base
from app.core.geo import MARILIA_BBOX, MARILIA_CENTRO, dentro_de_marilia, distancia_km
from app.models import Agente, Equipamento, HistoricoEvento, Ocorrencia

# -----------------------------------------------------------------------------
# Dados de referência de Marília/SP
# -----------------------------------------------------------------------------

# Bairros reais de Marília com centróides APROXIMADOS (usados para atribuir o
# bairro mais próximo a cada ponto gerado) e faixa de CEP plausível.
BAIRROS: list[dict[str, Any]] = [
    {"nome": "Centro", "lat": -22.2160, "lng": -49.9465, "cep": "17500"},
    {"nome": "Banzato", "lat": -22.2050, "lng": -49.9520, "cep": "17515"},
    {"nome": "Fragata", "lat": -22.2280, "lng": -49.9560, "cep": "17519"},
    {"nome": "Cascata", "lat": -22.2040, "lng": -49.9340, "cep": "17513"},
    {"nome": "Palmital", "lat": -22.2340, "lng": -49.9380, "cep": "17510"},
    {"nome": "Jardim Maria Izabel", "lat": -22.2240, "lng": -49.9300, "cep": "17516"},
    {"nome": "Somenzari", "lat": -22.1960, "lng": -49.9430, "cep": "17506"},
    {"nome": "Jardim Califórnia", "lat": -22.2220, "lng": -49.9700, "cep": "17521"},
    {"nome": "Marajó", "lat": -22.2390, "lng": -49.9520, "cep": "17520"},
    {"nome": "Jardim Universitário", "lat": -22.1990, "lng": -49.9620, "cep": "17512"},
    {"nome": "Nova Marília", "lat": -22.1920, "lng": -49.9260, "cep": "17536"},
    {"nome": "Jardim Esplanada", "lat": -22.2100, "lng": -49.9230, "cep": "17505"},
    {"nome": "Vila Altaneira", "lat": -22.2110, "lng": -49.9600, "cep": "17509"},
    {"nome": "Jardim Santa Antonieta", "lat": -22.2300, "lng": -49.9440, "cep": "17507"},
    {"nome": "Parque das Nações", "lat": -22.2160, "lng": -49.9720, "cep": "17523"},
    {"nome": "Jardim Cavallari", "lat": -22.2380, "lng": -49.9290, "cep": "17526"},
]

LOGRADOUROS = [
    "Av. Sampaio Vidal", "Av. Rio Branco", "Av. República", "Av. das Esmeraldas",
    "Av. Tiradentes", "Av. Brigadeiro Eduardo Gomes", "Av. Pedro de Toledo",
    "Av. Santo Antônio", "Av. Vicente Ferreira", "Av. Castro Alves",
    "Av. Nelson Spielmann", "Av. João Ramalho", "Av. Carlos Gomes",
    "Rua São Luiz", "Rua Nove de Julho", "Rua Bahia", "Rua Paraíba",
    "Rua Coronel José Brás", "Rua Maranhão", "Rua Prudente de Moraes",
    "Rua Dom Pedro II", "Rua XV de Novembro", "Rua Goiás", "Rua Pernambuco",
]

REFERENCIAS = [
    "Próximo à praça", "Em frente à escola municipal", "Esquina com semáforo",
    "Ao lado da UBS", "Próximo ao ponto de ônibus", "Em frente ao supermercado",
    "Canteiro central", "Próximo à rotatória", "Em frente à igreja", None,
]

# Radares/fiscalização eletrônica em vias REAIS de Marília. Coordenadas e
# referências são aproximadas — validar com dados oficiais da EMDURB.
RADARES_REAIS: list[dict[str, Any]] = [
    {"logradouro": "Av. Sampaio Vidal", "referencia": "Altura da Praça Saturnino de Brito", "bairro": "Centro", "lat": -22.2148, "lng": -49.9462, "sentido": "Centro/Bairro"},
    {"logradouro": "Av. Rio Branco", "referencia": "Próximo ao cruzamento com a Av. Sampaio Vidal", "bairro": "Centro", "lat": -22.2175, "lng": -49.9490, "sentido": "Bairro/Centro"},
    {"logradouro": "Av. República", "referencia": "Próximo à Av. Vicente Ferreira", "bairro": "Banzato", "lat": -22.2045, "lng": -49.9570, "sentido": "Ambos"},
    {"logradouro": "Av. das Esmeraldas", "referencia": "Trecho do Jardim Tangará", "bairro": "Palmital", "lat": -22.2355, "lng": -49.9385, "sentido": "Ambos"},
    {"logradouro": "Av. Tiradentes", "referencia": "Próximo ao Terminal Urbano", "bairro": "Centro", "lat": -22.2195, "lng": -49.9520, "sentido": "Centro/Bairro"},
    {"logradouro": "Av. Brigadeiro Eduardo Gomes", "referencia": "Trecho do Jardim Maria Izabel", "bairro": "Jardim Maria Izabel", "lat": -22.2235, "lng": -49.9305, "sentido": "Ambos"},
    {"logradouro": "Av. Pedro de Toledo", "referencia": "Próximo à Rua São Luiz", "bairro": "Centro", "lat": -22.2090, "lng": -49.9425, "sentido": "Bairro/Centro"},
    {"logradouro": "Av. Santo Antônio", "referencia": "Trecho próximo à Av. Pedro de Toledo", "bairro": "Cascata", "lat": -22.2115, "lng": -49.9375, "sentido": "Ambos"},
    {"logradouro": "Av. Vicente Ferreira", "referencia": "Próximo à Av. República", "bairro": "Vila Altaneira", "lat": -22.2120, "lng": -49.9555, "sentido": "Ambos"},
    {"logradouro": "Av. Castro Alves", "referencia": "Trecho do Jardim Santa Antonieta", "bairro": "Jardim Santa Antonieta", "lat": -22.2260, "lng": -49.9420, "sentido": "Centro/Bairro"},
    {"logradouro": "Av. Nelson Spielmann", "referencia": "Próximo à zona universitária", "bairro": "Jardim Universitário", "lat": -22.1990, "lng": -49.9645, "sentido": "Ambos"},
    {"logradouro": "Av. João Ramalho", "referencia": "Trecho da zona leste", "bairro": "Jardim Esplanada", "lat": -22.2060, "lng": -49.9290, "sentido": "Ambos"},
]

STATUS_PESOS = {"OPERANTE": 0.78, "ALERTA": 0.08, "EM_MANUTENCAO": 0.08, "INOPERANTE": 0.06}

NECESSIDADE_POR_STATUS = {
    "OPERANTE": (["NENHUMA", "PREVENTIVA"], [0.85, 0.15]),
    "ALERTA": (["PREVENTIVA", "CORRETIVA"], [0.6, 0.4]),
    "EM_MANUTENCAO": (["CORRETIVA", "PREVENTIVA"], [0.7, 0.3]),
    "INOPERANTE": (["URGENTE", "CORRETIVA"], [0.65, 0.35]),
}

EVENTO_POR_STATUS = {
    "ALERTA": "ALERTA_DISPARADO",
    "EM_MANUTENCAO": "MANUTENCAO_INICIADA",
    "INOPERANTE": "FALHA_DETECTADA",
}


# -----------------------------------------------------------------------------
# Características extras por tipo (JSONB)
# -----------------------------------------------------------------------------
def _extras_radar() -> dict[str, Any]:
    return {
        "velocidade_limite_kmh": random.choice([40, 50, 60]),
        "faixas_monitoradas": random.randint(1, 4),
        "tecnologia": random.choice(["Laço indutivo", "Radar Doppler", "Laser/LIDAR"]),
        "possui_ocr_placas": random.random() < 0.8,
        "sentido": random.choice(["Centro/Bairro", "Bairro/Centro", "Ambos"]),
    }


def _extras_semaforo() -> dict[str, Any]:
    return {
        "fases": random.choice([2, 3, 4]),
        "ciclo_segundos": random.choice([60, 90, 120]),
        "botoeira_pedestre": random.random() < 0.6,
        "sonoro_acessibilidade": random.random() < 0.3,
        "controlador_central": random.random() < 0.5,
    }


def _extras_camera() -> dict[str, Any]:
    return {
        "resolucao": random.choice(["1080p", "4MP", "4K"]),
        "ptz": random.random() < 0.4,
        "visao_noturna": True,
        "analitico": random.sample(["LPR", "Contagem veicular", "Detecção de aglomeração", "Cerca virtual"], k=2),
        "retencao_dias": random.choice([15, 30, 60]),
    }


def _extras_luminaria() -> dict[str, Any]:
    return {
        "potencia_w": random.choice([60, 100, 150, 200]),
        "temperatura_cor_k": random.choice([3000, 4000, 5000]),
        "telegestao": random.random() < 0.5,
        "altura_poste_m": random.choice([7, 9, 12]),
    }


def _extras_sensor() -> dict[str, Any]:
    return {
        "metricas": random.sample(["PM2.5", "PM10", "CO2", "Temperatura", "Umidade", "Ruído (dB)"], k=3),
        "intervalo_leitura_s": random.choice([60, 300, 600]),
        "conectividade": random.choice(["LoRaWAN", "NB-IoT", "4G"]),
    }


def _extras_wifi() -> dict[str, Any]:
    return {
        "banda": random.choice(["2.4GHz", "5GHz", "Dual-band"]),
        "usuarios_simultaneos_max": random.choice([50, 100, 200]),
        "backhaul": random.choice(["Fibra", "Rádio"]),
    }


def _extras_lombada() -> dict[str, Any]:
    return {
        "velocidade_limite_kmh": random.choice([30, 40]),
        "display_velocidade": True,
        "faixas_monitoradas": random.randint(1, 2),
    }


TIPOS: dict[str, dict[str, Any]] = {
    "RADAR": {"peso": 0.08, "prefixo": "RAD", "marcas": {"Perkons": ["PL-01", "Lince"], "Velsis": ["VSF-30"], "Splice": ["SPL-R4"], "Fiscaltech": ["FT-Vision"]}, "extras": _extras_radar},
    "LOMBADA_ELETRONICA": {"peso": 0.04, "prefixo": "LMB", "marcas": {"Perkons": ["LE-200"], "Splice": ["SPL-LE"]}, "extras": _extras_lombada},
    "SEMAFORO": {"peso": 0.20, "prefixo": "SMF", "marcas": {"Digicon": ["DGT-4F"], "Tesc": ["Smart-T"], "Dataprom": ["DP-Semaf"]}, "extras": _extras_semaforo},
    "CAMERA_CFTV": {"peso": 0.18, "prefixo": "CAM", "marcas": {"Hikvision": ["DS-2DE4425", "DS-2CD2T47"], "Intelbras": ["VIP 7250", "VIP 5450"], "Axis": ["Q6075-E"], "Dahua": ["SD5A425"]}, "extras": _extras_camera},
    "LUMINARIA_LED": {"peso": 0.36, "prefixo": "LUM", "marcas": {"Signify": ["RoadFlair", "Luma Gen2"], "Schréder": ["Teceo", "Ampera"], "Tecnowatt": ["Bellagio"]}, "extras": _extras_luminaria},
    "SENSOR_AMBIENTAL": {"peso": 0.08, "prefixo": "SNS", "marcas": {"Libelium": ["Smart Env PRO"], "Vaisala": ["AQT530"]}, "extras": _extras_sensor},
    "TOTEM_WIFI": {"peso": 0.06, "prefixo": "WFI", "marcas": {"Ubiquiti": ["UAP-AC-M"], "Cisco Meraki": ["MR86"]}, "extras": _extras_wifi},
}


# -----------------------------------------------------------------------------
# Geradores
# -----------------------------------------------------------------------------
def gerar_coordenada(max_tentativas: int = 10_000) -> tuple[float, float]:
    """Amostragem por rejeição: sorteia na bbox e aceita apenas se estiver no polígono urbano."""
    b = MARILIA_BBOX
    for _ in range(max_tentativas):
        lat = round(random.uniform(b["lat_min"], b["lat_max"]), 6)
        lng = round(random.uniform(b["lng_min"], b["lng_max"]), 6)
        if dentro_de_marilia(lat, lng):
            return lat, lng
    raise RuntimeError("Não foi possível gerar coordenada dentro de Marília.")


def bairro_mais_proximo(lat: float, lng: float) -> dict[str, Any]:
    return min(BAIRROS, key=lambda b: distancia_km((lat, lng), (b["lat"], b["lng"])))


def gerar_cep(prefixo: str) -> str:
    return f"{prefixo}-{random.randint(0, 999):03d}"


def gerar_numero_serie(prefixo: str) -> str:
    return f"{prefixo}-MAR-{random.randint(2018, 2026)}-{uuid.uuid4().hex[:8].upper()}"


def gerar_status_e_manutencao() -> tuple[str, str, datetime]:
    status = random.choices(list(STATUS_PESOS), weights=list(STATUS_PESOS.values()))[0]
    opcoes, pesos = NECESSIDADE_POR_STATUS[status]
    necessidade = random.choices(opcoes, weights=pesos)[0]

    agora = datetime.now(timezone.utc)
    if necessidade == "URGENTE":
        delta = timedelta(days=random.randint(-10, 2))
    elif necessidade == "CORRETIVA":
        delta = timedelta(days=random.randint(-5, 15))
    elif necessidade == "PREVENTIVA":
        delta = timedelta(days=random.randint(5, 60))
    else:
        delta = timedelta(days=random.randint(30, 240))
    return status, necessidade, agora + delta


def montar_equipamento(tipo: str, lat: float, lng: float, **override: Any) -> Equipamento:
    cfg = TIPOS[tipo]
    marca = random.choice(list(cfg["marcas"]))
    modelo = random.choice(cfg["marcas"][marca])
    bairro = override.pop("bairro", None) or bairro_mais_proximo(lat, lng)["nome"]
    cep_prefixo = next((b["cep"] for b in BAIRROS if b["nome"] == bairro), "17500")
    status, necessidade, proxima = gerar_status_e_manutencao()
    extras: dict[str, Any] = cfg["extras"]()
    extras.update(override.pop("extras", {}))

    dados = dict(
        tipo=tipo,
        numero_serie=gerar_numero_serie(cfg["prefixo"]),
        marca=marca,
        modelo=modelo,
        cep=gerar_cep(cep_prefixo),
        bairro=bairro,
        cidade_uf="Marília/SP",
        logradouro=f"{random.choice(LOGRADOUROS)}, {random.randint(10, 3500)}",
        referencia=random.choice(REFERENCIAS),
        latitude=lat,
        longitude=lng,
        status=status,
        necessidade_manutencao=necessidade,
        data_proxima_manutencao=proxima,
        caracteristicas_extras=extras,
    )
    dados.update(override)
    return Equipamento(**dados)


def gerar_equipamentos(total: int) -> list[Equipamento]:
    equipamentos: list[Equipamento] = []

    # 1) Radares em endereços reais
    for r in RADARES_REAIS[:total]:
        assert dentro_de_marilia(r["lat"], r["lng"]), f"Radar fora do polígono: {r['logradouro']}"
        equipamentos.append(
            montar_equipamento(
                "RADAR", r["lat"], r["lng"],
                bairro=r["bairro"],
                logradouro=r["logradouro"],
                referencia=r["referencia"],
                extras={"sentido": r["sentido"], "endereco_real": True},
            )
        )

    # 2) Restante aleatório, distribuído por peso de tipo
    tipos = list(TIPOS)
    pesos = [TIPOS[t]["peso"] for t in tipos]
    while len(equipamentos) < total:
        tipo = random.choices(tipos, weights=pesos)[0]
        lat, lng = gerar_coordenada()
        equipamentos.append(montar_equipamento(tipo, lat, lng))

    return equipamentos


NOMES = ["Ana", "Bruno", "Carla", "Diego", "Eduarda", "Felipe", "Gabriela", "Henrique", "Isabela", "João",
         "Karina", "Lucas", "Mariana", "Nicolas", "Olívia", "Paulo", "Rafaela", "Samuel", "Tatiane", "Vinícius"]
SOBRENOMES = ["Silva", "Santos", "Oliveira", "Souza", "Lima", "Pereira", "Ferreira", "Almeida", "Costa",
              "Rodrigues", "Gomes", "Martins", "Araújo", "Barbosa", "Ribeiro", "Carvalho"]

AGENTE_TIPOS = {
    "AGENTE_TRANSITO": 0.32,
    "GUARDA_MUNICIPAL": 0.25,
    "TECNICO_MANUTENCAO": 0.25,
    "FISCAL_POSTURAS": 0.07,
    "DEFESA_CIVIL": 0.06,
    "SAUDE": 0.05,
}
AGENTE_STATUS = {"DISPONIVEL": 0.50, "EM_DESLOCAMENTO": 0.20, "EM_ATENDIMENTO": 0.20, "OFFLINE": 0.10}


def gerar_agentes(total: int) -> list[Agente]:
    agentes = []
    tipos_lista = list(AGENTE_TIPOS.keys())
    pesos_lista = list(AGENTE_TIPOS.values())

    for _ in range(total):
        status = random.choices(list(AGENTE_STATUS), weights=list(AGENTE_STATUS.values()))[0]
        lat, lng = gerar_coordenada()
        agentes.append(
            Agente(
                nome=f"{random.choice(NOMES)} {random.choice(SOBRENOMES)} {random.choice(SOBRENOMES)}",
                tipo=random.choices(tipos_lista, weights=pesos_lista)[0],
                status=status,
                latitude=None if status == "OFFLINE" else lat,
                longitude=None if status == "OFFLINE" else lng,
            )
        )

    # Garantia de escassez estratégica: se total >= 20, assegura que Saúde tenha entre 2 e 4 agentes (gargalo crítico)
    if total >= 20:
        qtd_saude = sum(1 for a in agentes if a.tipo == "SAUDE")
        if qtd_saude < 2:
            candidatos_substituicao = [i for i, a in enumerate(agentes) if a.tipo in ("AGENTE_TRANSITO", "GUARDA_MUNICIPAL")]
            for idx in random.sample(candidatos_substituicao, k=min(2 - qtd_saude, len(candidatos_substituicao))):
                agentes[idx].tipo = "SAUDE"
        elif qtd_saude > 4:
            saude_idxs = [i for i, a in enumerate(agentes) if a.tipo == "SAUDE"]
            for idx in saude_idxs[4:]:
                agentes[idx].tipo = "AGENTE_TRANSITO"

    return agentes


def gerar_historico(equipamentos: list[Equipamento], agentes: list[Agente]) -> list[HistoricoEvento]:
    agora = datetime.now(timezone.utc)
    eventos: list[HistoricoEvento] = []
    for e in equipamentos:
        instalado = agora - timedelta(days=random.randint(30, 900))
        eventos.append(HistoricoEvento(entidade_id=e.id, tipo_evento="EQUIPAMENTO_CADASTRADO", data_hora=instalado))
        if random.random() < 0.3:
            eventos.append(HistoricoEvento(
                entidade_id=e.id, tipo_evento="MANUTENCAO_CONCLUIDA",
                data_hora=instalado + timedelta(days=random.randint(10, 25)),
            ))
        if e.status in EVENTO_POR_STATUS:
            eventos.append(HistoricoEvento(
                entidade_id=e.id, tipo_evento=EVENTO_POR_STATUS[e.status],
                data_hora=agora - timedelta(hours=random.randint(1, 72)),
            ))
    for a in agentes:
        eventos.append(HistoricoEvento(
            entidade_id=a.id, tipo_evento="AGENTE_CADASTRADO",
            data_hora=agora - timedelta(days=random.randint(1, 365)),
        ))
    return eventos


OCORRENCIA_TITULOS_MANUTENCAO = [
    ("Semáforo Apagado em Cruzamento Arterial", "Foco semafórico apagado após descarga atmosférica. Risco de abalroamento.", "ALTA"),
    ("Radar com Perda de Comunicação e Telemetria", "Sensor Doppler sem transmissão de pacotes via fibra óptica.", "MEDIA"),
    ("Câmera Pan-Tilt sem Sinal de Vídeo", "Interrupção do feed RTSP na Muralha Digital de Segurança.", "MEDIA"),
    ("Lâmpada LED Piscando Intermitente", "Falha de reator eletrônico e perda de fotocélula gerando trecho escuro.", "BAIXA"),
    ("Lombada Eletrônica com Display Travado", "Display digital exibindo caracteres corrompidos sem aferição de velocidade.", "BAIXA"),
    ("Sensor de Qualidade do Ar Fora de Escala", "Saturação de sensor óptico de particulados PM2.5 necessitando calibração.", "BAIXA"),
    ("Totem Wi-Fi sem Conectividade de Rede", "Rompimento de drop de fibra óptica e perda de rota com o roteador central.", "MEDIA"),
    ("Controlador Semafórico no Amarelo Piscante", "Falha de placa CPU de sincronismo, operando em modo de segurança.", "ALTA"),
    ("Radar Fixo com Sensor Doppler Danificado", "Colisão em poste suporte avariou sensor Doppler e leitor OCR.", "CRITICA"),
]

OCORRENCIA_TITULOS_SAUDE = [
    ("Parada Cardiorrespiratória em Logradouro Público", "Colapso súbito de pedestre com necessidade de suporte avançado de vida e desfibrilador.", "CRITICA"),
    ("Crise Convulsiva Prolongada em Estabelecimento", "Paciente em crise tônico-clônica com rebaixamento do nível de consciência.", "ALTA"),
    ("Queda de Idoso com Suspeita de Fratura de Quadril", "Idoso caído em via com dor aguda e escoriações necessitando imobilização.", "MEDIA"),
    ("Acidente com Vítima Presa em Ferragens", "Colisão lateral com necessidade de extração rápida com prancha e colar cervical.", "CRITICA"),
    ("Insuficiência Respiratória Aguda em Domicílio", "Paciente com broncoespasmo grave necessitando oxigenoterapia e suporte pré-hospitalar.", "ALTA"),
]

OCORRENCIA_TITULOS_TRANSITO = [
    ("Veículo com Pane Mecânica Bloqueando Faixa", "Automóvel particular com quebra de suspensão travando faixa de rolamento.", "MEDIA"),
    ("Colisão Traseira Leve sem Vítimas", "Abalroamento de baixa velocidade com retenção momentânea de fluxo.", "BAIXA"),
    ("Óleo na Pista Gerando Risco de Derrapagem", "Derramamento de óleo lubrificante de caminhão em curva de grande fluxo.", "ALTA"),
]

OCORRENCIA_TITULOS_SEGURANCA = [
    ("Tentativa de Furto de Fiação Subterrânea", "Indivíduos suspeitos tentando violar tampa de galeria elétrica municipal.", "ALTA"),
    ("Vandalismo em Patrimônio Público", "Depredação de abrigo de passageiros e quebra de vidro protetor.", "BAIXA"),
]

OCORRENCIA_TITULOS_DEFESA = [
    ("Queda de Galho de Grande Porte sobre Calçada", "Galho de árvore de grande porte bloqueando passagem de pedestres e rede secundária.", "MEDIA"),
    ("Risco de Deslizamento em Talude Urbano", "Erosão de encosta após precipitação intensa com risco de soterramento de pista.", "ALTA"),
]

OCORRENCIA_TITULOS_FISCAL = [
    ("Obstrução Indevida de Passeio Público", "Comércio informal de mercadorias ocupando piso tátil de acessibilidade.", "BAIXA"),
    ("Descarte Irregular de Entulho em Via Pública", "Depósito clandestino de restos de obra em leito carroçável.", "BAIXA"),
]


def gerar_ocorrencias(equipamentos: list[Equipamento], agentes: list[Agente]) -> list[Ocorrencia]:
    """Gera cerca de 200 ocorrências resolvidas nos últimos 60 dias e 8 a 12 ocorrências PENDENTES para demo ao vivo.

    Hard Constraint estrita: Ocorrências de 'MANUTENCAO' NUNCA são resolvidas por agentes de 'SAUDE'.
    São vinculadas exclusivamente a 'TECNICO_MANUTENCAO'.
    """
    agora = datetime.now(timezone.utc)
    ocorrencias: list[Ocorrencia] = []

    # Separa agentes por competência operacional
    agentes_manutencao = [a for a in agentes if a.tipo == "TECNICO_MANUTENCAO"]
    agentes_saude = [a for a in agentes if a.tipo in ("SAUDE", "RESGATE_MEDICO")]
    agentes_transito = [a for a in agentes if a.tipo == "AGENTE_TRANSITO"]
    agentes_guarda = [a for a in agentes if a.tipo == "GUARDA_MUNICIPAL"]
    agentes_fiscal = [a for a in agentes if a.tipo == "FISCAL_POSTURAS"]
    agentes_defesa = [a for a in agentes if a.tipo == "DEFESA_CIVIL"]

    # Fallbacks de segurança se o sorteio não tiver algum tipo
    if not agentes_manutencao:
        agentes_manutencao = agentes
    if not agentes_saude:
        agentes_saude = agentes
    if not agentes_transito:
        agentes_transito = agentes

    # -------------------------------------------------------------------------
    # 1. Ocorrências Resolvidas Retroativas (60 dias) - Total ~200
    # -------------------------------------------------------------------------

    # 1.1 Manutenções em Equipamentos (a maioria: ~135 ocorrências)
    # REGRA DE OURO: vinculadas a TECNICO_MANUTENCAO, JAMAIS a SAUDE.
    for _ in range(135):
        eq = random.choice(equipamentos)
        tit, desc, grav = random.choice(OCORRENCIA_TITULOS_MANUTENCAO)
        dias = random.uniform(1.0, 59.5)
        ts_criado = agora - timedelta(days=dias, hours=random.randint(7, 19), minutes=random.randint(0, 59))
        ts_despacho = ts_criado + timedelta(minutes=random.randint(6, 20))
        ts_conclusao = ts_despacho + timedelta(minutes=random.randint(30, 75))

        ag_tec = random.choice(agentes_manutencao)
        assert ag_tec.tipo != "SAUDE", "Violação de Hard Constraint: SAUDE atendendo Manutenção!"

        ocorrencias.append(
            Ocorrencia(
                id=uuid.uuid4(),
                titulo=f"{tit} ({eq.numero_serie})",
                descricao=f"{desc} Local: {eq.logradouro}, {eq.bairro}, Marília/SP.",
                tipo="MANUTENCAO",
                gravidade=grav,
                status="RESOLVIDA",
                latitude=eq.latitude,
                longitude=eq.longitude,
                equipamento_id=eq.id,
                agente_id=ag_tec.id,
                criado_em=ts_criado,
                data_despacho=ts_despacho,
                data_conclusao=ts_conclusao,
                atualizado_em=ts_conclusao,
            )
        )

    # 1.2 Ocorrências de Saúde / Emergência Médica (~25 ocorrências)
    # Vinculadas exclusivamente a agentes de SAUDE
    for _ in range(25):
        tit_s, desc_s, grav_s = random.choice(OCORRENCIA_TITULOS_SAUDE)
        lat, lng = gerar_coordenada()
        dias_s = random.uniform(1.0, 59.5)
        ts_criado = agora - timedelta(days=dias_s, hours=random.randint(0, 23), minutes=random.randint(0, 59))
        ts_despacho = ts_criado + timedelta(minutes=random.randint(12, 35))
        ts_conclusao = ts_despacho + timedelta(minutes=random.randint(45, 90))

        ag_med = random.choice(agentes_saude)

        ocorrencias.append(
            Ocorrencia(
                id=uuid.uuid4(),
                titulo=f"Atendimento Pré-Hospitalar: {tit_s}",
                descricao=f"{desc_s} Setor operacional de Marília/SP.",
                tipo="SAUDE",
                gravidade=grav_s,
                status="RESOLVIDA",
                latitude=lat,
                longitude=lng,
                equipamento_id=None,
                agente_id=ag_med.id,
                criado_em=ts_criado,
                data_despacho=ts_despacho,
                data_conclusao=ts_conclusao,
                atualizado_em=ts_conclusao,
            )
        )

    # 1.3 Ocorrências de Trânsito (~20 ocorrências)
    for _ in range(20):
        tit_t, desc_t, grav_t = random.choice(OCORRENCIA_TITULOS_TRANSITO)
        lat, lng = gerar_coordenada()
        dias_t = random.uniform(1.0, 59.0)
        ts_criado = agora - timedelta(days=dias_t, hours=random.randint(6, 22), minutes=random.randint(0, 59))
        ts_despacho = ts_criado + timedelta(minutes=random.randint(5, 15))
        ts_conclusao = ts_despacho + timedelta(minutes=random.randint(20, 50))

        ag_tr = random.choice(agentes_transito)

        ocorrencias.append(
            Ocorrencia(
                id=uuid.uuid4(),
                titulo=f"Incidente de Trânsito: {tit_t}",
                descricao=desc_t,
                tipo="TRANSITO",
                gravidade=grav_t,
                status="RESOLVIDA",
                latitude=lat,
                longitude=lng,
                equipamento_id=None,
                agente_id=ag_tr.id,
                criado_em=ts_criado,
                data_despacho=ts_despacho,
                data_conclusao=ts_conclusao,
                atualizado_em=ts_conclusao,
            )
        )

    # 1.4 Ocorrências de Segurança Pública (~10 ocorrências)
    for _ in range(10):
        tit_g, desc_g, grav_g = random.choice(OCORRENCIA_TITULOS_SEGURANCA)
        lat, lng = gerar_coordenada()
        dias_g = random.uniform(1.0, 59.0)
        ts_criado = agora - timedelta(days=dias_g, hours=random.randint(18, 23), minutes=random.randint(0, 59))
        ts_despacho = ts_criado + timedelta(minutes=random.randint(6, 18))
        ts_conclusao = ts_despacho + timedelta(minutes=random.randint(30, 60))

        ag_gm = random.choice(agentes_guarda if agentes_guarda else agentes)

        ocorrencias.append(
            Ocorrencia(
                id=uuid.uuid4(),
                titulo=f"Operação de Segurança: {tit_g}",
                descricao=desc_g,
                tipo="SEGURANCA",
                gravidade=grav_g,
                status="RESOLVIDA",
                latitude=lat,
                longitude=lng,
                equipamento_id=None,
                agente_id=ag_gm.id,
                criado_em=ts_criado,
                data_despacho=ts_despacho,
                data_conclusao=ts_conclusao,
                atualizado_em=ts_conclusao,
            )
        )

    # 1.5 Ocorrências de Defesa Civil (~5 ocorrências)
    for _ in range(5):
        tit_d, desc_d, grav_d = random.choice(OCORRENCIA_TITULOS_DEFESA)
        lat, lng = gerar_coordenada()
        dias_d = random.uniform(1.0, 59.0)
        ts_criado = agora - timedelta(days=dias_d, hours=random.randint(7, 18), minutes=random.randint(0, 59))
        ts_despacho = ts_criado + timedelta(minutes=random.randint(8, 20))
        ts_conclusao = ts_despacho + timedelta(minutes=random.randint(35, 70))

        ag_dc = random.choice(agentes_defesa if agentes_defesa else agentes)

        ocorrencias.append(
            Ocorrencia(
                id=uuid.uuid4(),
                titulo=f"Defesa Civil: {tit_d}",
                descricao=desc_d,
                tipo="DEFESA_CIVIL",
                gravidade=grav_d,
                status="RESOLVIDA",
                latitude=lat,
                longitude=lng,
                equipamento_id=None,
                agente_id=ag_dc.id,
                criado_em=ts_criado,
                data_despacho=ts_despacho,
                data_conclusao=ts_conclusao,
                atualizado_em=ts_conclusao,
            )
        )

    # 1.6 Ocorrências de Fiscalização (~5 ocorrências)
    for _ in range(5):
        tit_f, desc_f, grav_f = random.choice(OCORRENCIA_TITULOS_FISCAL)
        lat, lng = gerar_coordenada()
        dias_f = random.uniform(1.0, 59.0)
        ts_criado = agora - timedelta(days=dias_f, hours=random.randint(9, 16), minutes=random.randint(0, 59))
        ts_despacho = ts_criado + timedelta(minutes=random.randint(10, 25))
        ts_conclusao = ts_despacho + timedelta(minutes=random.randint(25, 50))

        ag_fp = random.choice(agentes_fiscal if agentes_fiscal else agentes)

        ocorrencias.append(
            Ocorrencia(
                id=uuid.uuid4(),
                titulo=f"Fiscalização de Posturas: {tit_f}",
                descricao=desc_f,
                tipo="FISCALIZACAO",
                gravidade=grav_f,
                status="RESOLVIDA",
                latitude=lat,
                longitude=lng,
                equipamento_id=None,
                agente_id=ag_fp.id,
                criado_em=ts_criado,
                data_despacho=ts_despacho,
                data_conclusao=ts_conclusao,
                atualizado_em=ts_conclusao,
            )
        )

    # -------------------------------------------------------------------------
    # 2. Carga Viva para Demonstração (11 ocorrências PENDENTES)
    # -------------------------------------------------------------------------
    pendentes_dados = [
        # Saúde (exige SAUDE / RESGATE_MEDICO)
        ("Parada Cardiorrespiratória em Praça Pública", "SAUDE", "CRITICA", "Cidadão inconsciente no calçadão central. Exige suporte avançado de vida e desfibrilador imediato.", None),
        ("Idoso com Crise Hipertensiva e Queda da Própria Altura", "SAUDE", "ALTA", "Idoso de 78 anos com pico hipertensivo e síncope. Exige resgate pré-hospitalar.", None),
        # Manutenção de Equipamentos (exige TECNICO_MANUTENCAO)
        ("Semáforo em Falha Crítica de Óptica e Ciclo Travado", "MANUTENCAO", "ALTA", "Controlador semafórico travado no vermelho permanente em todas as aproximações.", random.choice(equipamentos)),
        ("Radar Doppler Inoperante por Rompimento de Circuito", "MANUTENCAO", "CRITICA", "Perda abrupta de enlace telemétrico no radar rodoviário. Requer inspeção técnica urgente.", random.choice(equipamentos)),
        ("Câmera Pan-Tilt com Falha de Alimentação PoE", "MANUTENCAO", "MEDIA", "Câmera perimetral sem transmissão na central de videomonitoramento.", random.choice(equipamentos)),
        ("Luminária LED com Curto-Circuito em Fiação Aérea", "MANUTENCAO", "MEDIA", "Poste com faíscas e circuito desligado em avenida movimentada.", random.choice(equipamentos)),
        # Trânsito
        ("Pane Mecânica de Ônibus Articulado Bloqueando Faixa Dupla", "TRANSITO", "MEDIA", "Ônibus com quebra de eixo atravessado no cruzamento gerando retenção de fluxo.", None),
        ("Colisão Traseira com Obstrução de Faixa Expressa", "TRANSITO", "BAIXA", "Veículos imobilizados aguardando desobstrução e perícia viária.", None),
        # Segurança
        ("Tentativa de Vandalismo e Furto de Fiação Subterrânea", "SEGURANCA", "ALTA", "Alarme perimetral disparado próximo a terminal de transporte coletivo.", None),
        # Defesa Civil
        ("Queda de Eucalipto de Grande Porte Bloqueando Pista", "DEFESA_CIVIL", "ALTA", "Árvore de grande porte tombada sobre faixa de rolamento após rajada de vento.", None),
        # Fiscalização
        ("Obstrução Ilegal de Calçada e Comércio Clandestino", "FISCALIZACAO", "BAIXA", "Comércio clandestino de botijões e caixarias ocupando rota acessível.", None),
    ]

    for tit_p, tipo_p, grav_p, desc_p, eq_p in pendentes_dados:
        ts_p = agora - timedelta(minutes=random.randint(2, 25))
        if eq_p:
            lat_p, lng_p = eq_p.latitude, eq_p.longitude
            eq_id_p = eq_p.id
        else:
            lat_p, lng_p = gerar_coordenada()
            eq_id_p = None

        ocorrencias.append(
            Ocorrencia(
                id=uuid.uuid4(),
                titulo=tit_p,
                descricao=desc_p,
                tipo=tipo_p,
                gravidade=grav_p,
                status="PENDENTE",
                latitude=lat_p,
                longitude=lng_p,
                equipamento_id=eq_id_p,
                agente_id=None,
                data_despacho=None,
                data_conclusao=None,
                criado_em=ts_p,
                atualizado_em=ts_p,
            )
        )

    return ocorrencias


# -----------------------------------------------------------------------------
# CLI
# -----------------------------------------------------------------------------
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Popula o banco do F.O.G.O. com dados mock de Marília/SP.")
    parser.add_argument("--equipamentos", type=int, default=500, help="Qtd. de equipamentos (default: 500)")
    parser.add_argument("--agentes", type=int, default=50, help="Qtd. de agentes (default: 50)")
    parser.add_argument("--reset", action="store_true", help="Apaga os dados existentes antes de inserir")
    parser.add_argument("--append", action="store_true", help="Insere mesmo que já existam dados")
    parser.add_argument("--seed", type=int, default=None, help="Seed para resultados reprodutíveis")
    args = parser.parse_args(argv)

    if args.seed is not None:
        random.seed(args.seed)

    engine = create_engine(settings.database_url_sync, pool_pre_ping=True)
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        existentes = session.scalar(select(func.count()).select_from(Equipamento)) or 0

        if args.reset:
            print("[F.O.G.O.] --reset: desvinculando chaves estrangeiras e limpando tabelas...")
            session.execute(update(Agente).values(ocorrencia_id=None))
            session.execute(update(Ocorrencia).values(agente_id=None, equipamento_id=None))
            session.commit()
            session.execute(delete(HistoricoEvento))
            session.execute(delete(Ocorrencia))
            session.execute(delete(Agente))
            session.execute(delete(Equipamento))
            session.commit()
        elif existentes and not args.append:
            print(f"[F.O.G.O.] O banco já possui {existentes} equipamentos. "
                  "Use --reset para recriar ou --append para adicionar mais.")
            return 0

        print(f"[F.O.G.O.] Gerando {args.equipamentos} equipamentos e {args.agentes} agentes em Marília/SP...")
        equipamentos = gerar_equipamentos(args.equipamentos)
        agentes = gerar_agentes(args.agentes)

        # Gera ids no Python para relacionar o histórico sem round-trip ao banco
        for obj in (*equipamentos, *agentes):
            obj.id = uuid.uuid4()

        historico = gerar_historico(equipamentos, agentes)
        ocorrencias = gerar_ocorrencias(equipamentos, agentes)

        # Verificação final de sanidade geográfica
        fora = [e for e in equipamentos if not dentro_de_marilia(e.latitude, e.longitude)]
        if fora:
            print(f"[ERRO] {len(fora)} equipamentos fora do polígono de Marília. Abortando.")
            return 1

        session.add_all(equipamentos)
        session.add_all(agentes)
        session.add_all(ocorrencias)
        session.add_all(historico)
        session.commit()

        raio_max = max(distancia_km(MARILIA_CENTRO, (e.latitude, e.longitude)) for e in equipamentos)
        por_tipo: dict[str, int] = {}
        for e in equipamentos:
            por_tipo[e.tipo] = por_tipo.get(e.tipo, 0) + 1

        por_tipo_ag: dict[str, int] = {}
        for a in agentes:
            por_tipo_ag[a.tipo] = por_tipo_ag.get(a.tipo, 0) + 1

        total_resolvidas = sum(1 for o in ocorrencias if o.status == "RESOLVIDA")
        total_pendentes = sum(1 for o in ocorrencias if o.status == "PENDENTE")

        print("[F.O.G.O.] Concluído com sucesso!")
        print(f"  • Equipamentos: {len(equipamentos)} ({len(RADARES_REAIS)} radares em vias reais)")
        for tipo, qtd in sorted(por_tipo.items(), key=lambda x: -x[1]):
            print(f"      - {tipo:<20} {qtd}")
        print(f"  • Agentes:      {len(agentes)}")
        for tipo_a, qtd_a in sorted(por_tipo_ag.items(), key=lambda x: -x[1]):
            print(f"      - {tipo_a:<20} {qtd_a}")
        print(f"  • Ocorrências:  {len(ocorrencias)} ({total_resolvidas} resolvidas [60d], {total_pendentes} pendentes para demo)")
        print(f"  • Eventos:      {len(historico)}")
        print(f"  • Maior distância do centro: {raio_max:.2f} km")
    return 0


if __name__ == "__main__":
    sys.exit(main())
