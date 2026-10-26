"""F.O.G.O. — Ferramenta Onisciente de Gestão e Operações
Módulo Central de Povoamento e Inteligência Operacional (seed.py).

Desenvolvido para engenharia de banco de dados e demonstração de maturidade do
algoritmo preditivo de roteamento e despacho tático.

Diretrizes Atendidas:
1. Catálogo de exatamente 50 agentes em 6 especialidades:
   - Saúde (RESGATE_MEDICO): 4 agentes (gargalo estratégico e escassez crítica).
   - Manutenção (TECNICO_MANUTENCAO): 10 agentes versáteis em todos os tipos de equipamentos.
   - Trânsito (AGENTE_TRANSITO): 12 agentes.
   - Segurança (GUARDA_MUNICIPAL): 12 agentes.
   - Fiscalização (FISCAL_POSTURAS): 6 agentes.
   - Defesa Civil (DEFESA_CIVIL): 6 agentes.
2. Hard Constraints de Competência: Saúde jamais atende infraestrutura/semáforos.
3. Histórico Retroativo Inteligente de 60 dias:
   - Respeito integral à matriz de competências.
   - SLA realista: variação e sobrecarga em Saúde por escassez vs. alta eficácia em Manutenção.
   - Preservação matemática das 4 anomalias operacionais de Marília/SP para o Oráculo Gemini.
4. Carga Inicial da Demonstração:
   - 8 ocorrências com status 'PENDENTE' cobrindo todas as áreas com coordenadas GPS válidas.
"""
from __future__ import annotations

import argparse
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from sqlalchemy import create_engine, delete, func, select, update
from sqlalchemy.orm import Session

# Garante o carregamento das variáveis de ambiente e inclusão do backend no PYTHONPATH
_backend_dir = Path(__file__).resolve().parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

load_dotenv(_backend_dir / ".env")
load_dotenv()

from app.core.config import settings
from app.core.database import Base
from app.models import Agente, Equipamento, HistoricoEvento, Ocorrencia


# =============================================================================
# COORDENADAS E GEORREFERENCIAMENTO DE MARÍLIA/SP
# =============================================================================
BAIRROS_MARILIA = [
    {"nome": "Centro", "lat": -22.2160, "lng": -49.9465, "cep": "17500-000"},
    {"nome": "Banzato", "lat": -22.2050, "lng": -49.9520, "cep": "17515-000"},
    {"nome": "Fragata", "lat": -22.2280, "lng": -49.9560, "cep": "17519-000"},
    {"nome": "Cascata", "lat": -22.2040, "lng": -49.9340, "cep": "17513-000"},
    {"nome": "Palmital", "lat": -22.2340, "lng": -49.9380, "cep": "17510-000"},
    {"nome": "Jardim Maria Izabel", "lat": -22.2240, "lng": -49.9300, "cep": "17516-000"},
    {"nome": "Somenzari", "lat": -22.1960, "lng": -49.9430, "cep": "17506-000"},
    {"nome": "Jardim Califórnia", "lat": -22.2220, "lng": -49.9700, "cep": "17521-000"},
    {"nome": "Jardim Esplanada", "lat": -22.2100, "lng": -49.9230, "cep": "17505-000"},
    {"nome": "Vila Altaneira", "lat": -22.2110, "lng": -49.9600, "cep": "17509-000"},
    {"nome": "Marajó", "lat": -22.2390, "lng": -49.9520, "cep": "17520-000"},
    {"nome": "Jardim Universitário", "lat": -22.1990, "lng": -49.9620, "cep": "17512-000"},
]

COORD_SAMPAIO_VIDAL = (-22.2148, -49.9462)
COORD_SP294_RADAR = (-22.2195, -49.9520)
COORD_SAMPAIO_CORREIA = (-22.2225, -49.9478)


def jitter(val: float, delta: float = 0.0012) -> float:
    """Aplica dispersão geoespacial realista (~80m a 120m)."""
    return round(val + random.uniform(-delta, delta), 6)


# =============================================================================
# CONEXÃO RESILIENTE COM O BANCO DE DADOS
# =============================================================================
def criar_engine_resiliente():
    """Gera o Engine SQLAlchemy suportando execução nativa no host ou em container."""
    url_primaria = settings.database_url_sync

    # Se estiver rodando fora do container Docker e o host for 'db', tenta o mapeamento local (localhost:5433 / 5432)
    urls_candidatas = [url_primaria]
    if "db:5432" in url_primaria or settings.POSTGRES_HOST == "db":
        user = settings.POSTGRES_USER
        pwd = settings.POSTGRES_PASSWORD
        database = settings.POSTGRES_DB
        urls_candidatas.extend([
            f"postgresql+psycopg2://{user}:{pwd}@127.0.0.1:5433/{database}",
            f"postgresql+psycopg2://{user}:{pwd}@localhost:5433/{database}",
            f"postgresql+psycopg2://{user}:{pwd}@127.0.0.1:5432/{database}",
            f"postgresql+psycopg2://{user}:{pwd}@localhost:5432/{database}",
        ])

    for url in urls_candidatas:
        try:
            eng = create_engine(url, pool_pre_ping=True)
            with eng.connect() as conn:
                conn.execute(select(1))
            return eng
        except Exception:
            continue

    # Fallback final com a URL primária configurada
    return create_engine(url_primaria, pool_pre_ping=True)


# =============================================================================
# RESET SEGURO DAS TABELAS
# =============================================================================
def reset_seguro(session: Session) -> None:
    """Executa o reset seguro com respeito estrito à integridade referencial."""
    print("🧹 [RESET SEGURO] Desvinculando chaves estrangeiras entre Agentes e Ocorrências...")
    session.execute(update(Agente).values(ocorrencia_id=None))
    session.execute(update(Ocorrencia).values(agente_id=None, equipamento_id=None))
    session.commit()

    print("🗑️ [RESET SEGURO] Limpando tabelas operacionais...")
    session.execute(delete(HistoricoEvento))
    session.execute(delete(Ocorrencia))
    session.execute(delete(Agente))
    session.execute(delete(Equipamento))
    session.commit()
    print("✅ [RESET SEGURO] Banco de dados limpo com sucesso.")


# =============================================================================
# 1. CATÁLOGO DE 50 AGENTES COM DISTRIBUIÇÃO REALISTA E GARGALO EM SAÚDE
# =============================================================================
def criar_catalogo_50_agentes(session: Session) -> dict[str, list[Agente]]:
    """Cria exatamente 50 agentes divididos nas 6 especialidades:

    - Saúde: 4 agentes (gargalo estratégico e escassez crítica).
    - Manutenção: 10 agentes versáteis em toda a infraestrutura.
    - Trânsito: 12 agentes.
    - Segurança: 12 agentes.
    - Fiscalização: 6 agentes.
    - Defesa Civil: 6 agentes.
    Total = 50 agentes.
    """
    print("👮‍♂️ [AGENTES] Gerando catálogo de 50 agentes operacionais de Marília/SP...")

    agentes_config: list[dict[str, Any]] = [
        # ---------------------------------------------------------------------
        # 1. SAÚDE (RESGATE_MEDICO) — EXATAMENTE 4 AGENTES (Escassez Crítica)
        # ---------------------------------------------------------------------
        {
            "nome": "USA-01 · Dr. Arnaldo Silva (UTI Móvel SAMU)",
            "tipo": "RESGATE_MEDICO",
            "status": "DISPONIVEL",
            "lat": -22.2170,
            "lng": -49.9480,  # Base Central SAMU
        },
        {
            "nome": "USB-02 · Enfª. Patrícia Mendes (Resgate SAMU)",
            "tipo": "RESGATE_MEDICO",
            "status": "DISPONIVEL",
            "lat": -22.2035,
            "lng": -49.9540,  # Região Banzato / Norte
        },
        {
            "nome": "USB-03 · Socorrista Marcos Lima (Resgate SAMU)",
            "tipo": "RESGATE_MEDICO",
            "status": "EM_ATENDIMENTO",
            "lat": -22.2270,
            "lng": -49.9580,  # Setor Fragata / Sul
        },
        {
            "nome": "USA-04 · Dra. Camila Nogueira (UTI Móvel SAMU)",
            "tipo": "RESGATE_MEDICO",
            "status": "EM_DESLOCAMENTO",
            "lat": -22.2330,
            "lng": -49.9370,  # Setor Palmital / Leste
        },

        # ---------------------------------------------------------------------
        # 2. MANUTENÇÃO (TECNICO_MANUTENCAO) — 10 AGENTES (Versatilidade Total)
        # ---------------------------------------------------------------------
        {"nome": "Téc. Lucas Ferreira (Sistemas Semafóricos & IoT)", "tipo": "TECNICO_MANUTENCAO", "status": "DISPONIVEL", "lat": -22.2140, "lng": -49.9450},
        {"nome": "Engª. Amanda Duarte (Redes & Radares EMDURB)", "tipo": "TECNICO_MANUTENCAO", "status": "DISPONIVEL", "lat": -22.2180, "lng": -49.9510},
        {"nome": "Téc. Rodrigo Zanin (Iluminação Pública & Alta Tensão)", "tipo": "TECNICO_MANUTENCAO", "status": "DISPONIVEL", "lat": -22.2050, "lng": -49.9350},
        {"nome": "Téc. Thiago Alcantara (Câmeras CFTV & Muralha Digital)", "tipo": "TECNICO_MANUTENCAO", "status": "DISPONIVEL", "lat": -22.2230, "lng": -49.9310},
        {"nome": "Téc. Juliana Marcondes (Sensores Ambientais & Totens)", "tipo": "TECNICO_MANUTENCAO", "status": "DISPONIVEL", "lat": -22.1970, "lng": -49.9440},
        {"nome": "Téc. Fernando Costa (Manutenção Eletromecânica)", "tipo": "TECNICO_MANUTENCAO", "status": "DISPONIVEL", "lat": -22.2210, "lng": -49.9690},
        {"nome": "Téc. Bruno Siqueira (Telecom & Fibra Óptica)", "tipo": "TECNICO_MANUTENCAO", "status": "DISPONIVEL", "lat": -22.2370, "lng": -49.9510},
        {"nome": "Téc. Marcelo Fagundes (Infraestrutura Urbana Geral)", "tipo": "TECNICO_MANUTENCAO", "status": "EM_DESLOCAMENTO", "lat": -22.2000, "lng": -49.9630},
        {"nome": "Téc. André Antunes (Equipe Rápida de Semáforos)", "tipo": "TECNICO_MANUTENCAO", "status": "EM_ATENDIMENTO", "lat": -22.2110, "lng": -49.9240},
        {"nome": "Téc. Vanessa Prado (Automação Viária & Controladores)", "tipo": "TECNICO_MANUTENCAO", "status": "OFFLINE", "lat": None, "lng": None},

        # ---------------------------------------------------------------------
        # 3. TRÂNSITO (AGENTE_TRANSITO) — 12 AGENTES
        # ---------------------------------------------------------------------
        {"nome": "Agente Roberto Silva (Viatura Trânsito 01)", "tipo": "AGENTE_TRANSITO", "status": "DISPONIVEL", "lat": -22.2150, "lng": -49.9470},
        {"nome": "Agente Priscila Souza (Viatura Trânsito 02)", "tipo": "AGENTE_TRANSITO", "status": "DISPONIVEL", "lat": -22.2190, "lng": -49.9530},
        {"nome": "Agente Carlos Eduardo (Motopatrulha Trânsito 01)", "tipo": "AGENTE_TRANSITO", "status": "DISPONIVEL", "lat": -22.2040, "lng": -49.9580},
        {"nome": "Agente Tatiane Ramos (Motopatrulha Trânsito 02)", "tipo": "AGENTE_TRANSITO", "status": "DISPONIVEL", "lat": -22.2260, "lng": -49.9410},
        {"nome": "Agente Renato Meireles (Viatura Trânsito 03)", "tipo": "AGENTE_TRANSITO", "status": "DISPONIVEL", "lat": -22.2350, "lng": -49.9390},
        {"nome": "Agente Fernanda Pires (Fiscalização Viária)", "tipo": "AGENTE_TRANSITO", "status": "DISPONIVEL", "lat": -22.2090, "lng": -49.9430},
        {"nome": "Agente Gabriel Diniz (Controle de Fluxo Centro)", "tipo": "AGENTE_TRANSITO", "status": "DISPONIVEL", "lat": -22.2135, "lng": -49.9460},
        {"nome": "Agente Beatriz Fagundes (Operações EMDURB)", "tipo": "AGENTE_TRANSITO", "status": "EM_DESLOCAMENTO", "lat": -22.2165, "lng": -49.9495},
        {"nome": "Agente Daniel Guedes (Sinalização Rápida)", "tipo": "AGENTE_TRANSITO", "status": "EM_ATENDIMENTO", "lat": -22.2245, "lng": -49.9315},
        {"nome": "Agente Letícia Brandão (Viatura Trânsito 04)", "tipo": "AGENTE_TRANSITO", "status": "DISPONIVEL", "lat": -22.1955, "lng": -49.9425},
        {"nome": "Agente Maurício Viana (Apoio Rodoviário Urbano)", "tipo": "AGENTE_TRANSITO", "status": "DISPONIVEL", "lat": -22.2385, "lng": -49.9535},
        {"nome": "Agente Cláudia Guimarães (Viatura Trânsito 05)", "tipo": "AGENTE_TRANSITO", "status": "OFFLINE", "lat": None, "lng": None},

        # ---------------------------------------------------------------------
        # 4. SEGURANÇA (GUARDA_MUNICIPAL) — 12 AGENTES
        # ---------------------------------------------------------------------
        {"nome": "Sgt. Marcos Alencar (GCM Viatura 101)", "tipo": "GUARDA_MUNICIPAL", "status": "DISPONIVEL", "lat": -22.2160, "lng": -49.9465},
        {"nome": "GCM Inspetora Helena Castro (Patrulha Centro)", "tipo": "GUARDA_MUNICIPAL", "status": "DISPONIVEL", "lat": -22.2120, "lng": -49.9440},
        {"nome": "Equipe Bravo (ROMU Tático GCM 102)", "tipo": "GUARDA_MUNICIPAL", "status": "DISPONIVEL", "lat": -22.2195, "lng": -49.9520},
        {"nome": "GCM Rogério Mattos (Ronda Escolar 103)", "tipo": "GUARDA_MUNICIPAL", "status": "DISPONIVEL", "lat": -22.2050, "lng": -49.9515},
        {"nome": "GCM Paula Teodoro (Viatura Apoio 104)", "tipo": "GUARDA_MUNICIPAL", "status": "DISPONIVEL", "lat": -22.2275, "lng": -49.9565},
        {"nome": "Equipe Alfa (GCM Patrulha Noturna 105)", "tipo": "GUARDA_MUNICIPAL", "status": "DISPONIVEL", "lat": -22.2225, "lng": -49.9478},
        {"nome": "GCM Valdir Neves (Muralha Digital GCM)", "tipo": "GUARDA_MUNICIPAL", "status": "DISPONIVEL", "lat": -22.2030, "lng": -49.9345},
        {"nome": "Equipe Delta (ROMU Motopatrulha 106)", "tipo": "GUARDA_MUNICIPAL", "status": "EM_DESLOCAMENTO", "lat": -22.2345, "lng": -49.9385},
        {"nome": "GCM Tatiana Morais (Proteção Patrimonial)", "tipo": "GUARDA_MUNICIPAL", "status": "EM_ATENDIMENTO", "lat": -22.1985, "lng": -49.9615},
        {"nome": "GCM Alex Sandro (Viatura GCM 107)", "tipo": "GUARDA_MUNICIPAL", "status": "DISPONIVEL", "lat": -22.2215, "lng": -49.9705},
        {"nome": "GCM Cristiane Barreto (Base Móvel GCM)", "tipo": "GUARDA_MUNICIPAL", "status": "DISPONIVEL", "lat": -22.2095, "lng": -49.9225},
        {"nome": "GCM Eduardo Pacheco (Viatura GCM 108)", "tipo": "GUARDA_MUNICIPAL", "status": "OFFLINE", "lat": None, "lng": None},

        # ---------------------------------------------------------------------
        # 5. FISCALIZAÇÃO (FISCAL_POSTURAS) — 6 AGENTES
        # ---------------------------------------------------------------------
        {"nome": "Fiscal Gustavo Bertolucci (Posturas Centro)", "tipo": "FISCAL_POSTURAS", "status": "DISPONIVEL", "lat": -22.2130, "lng": -49.9435},
        {"nome": "Fiscal Renata Vasconcelos (Comércio e Calçadas)", "tipo": "FISCAL_POSTURAS", "status": "DISPONIVEL", "lat": -22.2175, "lng": -49.9490},
        {"nome": "Fiscal Diego Cerqueira (Obras e Alvarás)", "tipo": "FISCAL_POSTURAS", "status": "DISPONIVEL", "lat": -22.2045, "lng": -49.9570},
        {"nome": "Fiscal Bianca Fontes (Poluição Sonora e Noturna)", "tipo": "FISCAL_POSTURAS", "status": "DISPONIVEL", "lat": -22.2220, "lng": -49.9480},
        {"nome": "Fiscal Leonardo Silveira (Zoneamento Urbano)", "tipo": "FISCAL_POSTURAS", "status": "EM_ATENDIMENTO", "lat": -22.2355, "lng": -49.9385},
        {"nome": "Fiscal Sabrina Albuquerque (Fiscalização Geral)", "tipo": "FISCAL_POSTURAS", "status": "DISPONIVEL", "lat": -22.1960, "lng": -49.9430},

        # ---------------------------------------------------------------------
        # 6. DEFESA CIVIL (DEFESA_CIVIL) — 6 AGENTES
        # ---------------------------------------------------------------------
        {"nome": "Viatura Defesa Civil 01 (Coord. Vinícius Paiva)", "tipo": "DEFESA_CIVIL", "status": "DISPONIVEL", "lat": -22.2350, "lng": -49.9380},
        {"nome": "Equipe Resgate Técnico Defesa Civil 02", "tipo": "DEFESA_CIVIL", "status": "DISPONIVEL", "lat": -22.2260, "lng": -49.9420},
        {"nome": "Viatura Áreas de Risco (Insp. Milton Salles)", "tipo": "DEFESA_CIVIL", "status": "DISPONIVEL", "lat": -22.2040, "lng": -49.9340},
        {"nome": "Equipe Defesa Civil 03 (Poda e Desobstrução)", "tipo": "DEFESA_CIVIL", "status": "DISPONIVEL", "lat": -22.2195, "lng": -49.9520},
        {"nome": "Viatura Defesa Civil 04 (Apoio Emergencial)", "tipo": "DEFESA_CIVIL", "status": "EM_DESLOCAMENTO", "lat": -22.2280, "lng": -49.9560},
        {"nome": "Téc. Defesa Civil Sandra Valim (Monitoramento Clima)", "tipo": "DEFESA_CIVIL", "status": "DISPONIVEL", "lat": -22.2160, "lng": -49.9465},
    ]

    assert len(agentes_config) == 50, f"Catálogo deve ter exatamente 50 agentes, encontrado: {len(agentes_config)}"

    agentes_salvos: list[Agente] = []
    agentes_por_tipo: dict[str, list[Agente]] = {
        "RESGATE_MEDICO": [],
        "TECNICO_MANUTENCAO": [],
        "AGENTE_TRANSITO": [],
        "GUARDA_MUNICIPAL": [],
        "FISCAL_POSTURAS": [],
        "DEFESA_CIVIL": [],
    }

    for item in agentes_config:
        ag = Agente(
            id=uuid.uuid4(),
            nome=item["nome"],
            tipo=item["tipo"],
            status=item["status"],
            latitude=item["lat"],
            longitude=item["lng"],
        )
        session.add(ag)
        agentes_salvos.append(ag)
        agentes_por_tipo[item["tipo"]].append(ag)

    session.flush()

    # Eventos de auditoria dos agentes
    for ag in agentes_salvos:
        session.add(
            HistoricoEvento(
                entidade_id=ag.id,
                tipo_evento="AGENTE_CADASTRADO",
                data_hora=datetime.now(timezone.utc) - timedelta(days=random.randint(60, 365)),
            )
        )

    print(f"✅ [AGENTES] 50 agentes criados com sucesso:")
    for tipo_k, lista in agentes_por_tipo.items():
        print(f"   • {tipo_k}: {len(lista)} agentes")

    return agentes_por_tipo


# =============================================================================
# 2. CATÁLOGO DE EQUIPAMENTOS URBANOS
# =============================================================================
def criar_equipamentos_urbanos(session: Session) -> tuple[Equipamento, list[Equipamento], list[Equipamento]]:
    """Gera parque completo de infraestrutura urbana de Marília/SP (~38 equipamentos)."""
    print("🚦 [EQUIPAMENTOS] Implantando parque tecnológico urbano...")

    # 1. Radar Crítico da Rodovia SP-294 km 451 (Vetor da Anomalia 2)
    radar_sp294 = Equipamento(
        id=uuid.uuid4(),
        tipo="RADAR",
        numero_serie="RAD-TIR-04",
        marca="OmniEye Tático",
        modelo="Radar Doppler Pro 4K",
        cep="17500-010",
        bairro="Centro",
        cidade_uf="Marília/SP",
        logradouro="Rodovia SP-294 km 451 / Av. Tiradentes",
        referencia="Entroncamento arterial viário",
        latitude=COORD_SP294_RADAR[0],
        longitude=COORD_SP294_RADAR[1],
        status="ALERTA",
        necessidade_manutencao="CORRETIVA",
        caracteristicas_extras={
            "velocidade_limite_kmh": 60,
            "faixas_monitoradas": 4,
            "possui_ocr_placas": True,
            "alvo_sabotagem_conhecido": True,
        },
    )
    session.add(radar_sp294)

    # 2. Semáforos da Onda Verde da Av. Sampaio Vidal (Vetor da Anomalia 1)
    pontos_sampaio = [
        ("SEM-SAMPAIO-01", "Cruzamento com Rua 9 de Julho", -22.2148, -49.9462),
        ("SEM-SAMPAIO-02", "Cruzamento com Av. Rio Branco", -22.2158, -49.9472),
        ("SEM-SAMPAIO-03", "Praça Saturnino de Brito (Nó Central)", -22.2139, -49.9458),
        ("SEM-SAMPAIO-04", "Cruzamento com Rua São Luiz", -22.2125, -49.9442),
        ("SEM-SAMPAIO-05", "Cruzamento com Av. Castro Alves", -22.2110, -49.9426),
    ]

    semaforos_onda_verde: list[Equipamento] = []
    for num_serie, ref, lat, lng in pontos_sampaio:
        sem = Equipamento(
            id=uuid.uuid4(),
            tipo="SEMAFORO",
            numero_serie=num_serie,
            marca="SinalCorp",
            modelo="Optima SmartWave NTP",
            cep="17500-020",
            bairro="Centro",
            cidade_uf="Marília/SP",
            logradouro="Av. Sampaio Vidal",
            referencia=ref,
            latitude=lat,
            longitude=lng,
            status="OPERANTE",
            necessidade_manutencao="NENHUMA",
            caracteristicas_extras={"controlador": "NTP Sincronizado", "onda_verde_ativa": True},
        )
        session.add(sem)
        semaforos_onda_verde.append(sem)

    # 3. Equipamentos adicionais cobrindo todos os tipos (radares, CFTV, luminárias, lombadas, totens, sensores)
    demais_equipamentos: list[Equipamento] = []
    modelos_por_tipo = [
        ("SEMAFORO", "Semáforo Inteligente LED", "Av. Tiradentes x Av. Sampaio Vidal", "Centro", -22.2195, -49.9520),
        ("SEMAFORO", "Semáforo Pedestre Acessível", "Av. República x Av. Castro Alves", "Banzato", -22.2045, -49.9570),
        ("SEMAFORO", "Semáforo Fluxo Contínuo", "Av. das Esmeraldas x Rua Tangará", "Palmital", -22.2355, -49.9385),
        ("RADAR", "Radar Fixo 50km/h", "Av. República, nº 1420", "Banzato", -22.2060, -49.9550),
        ("RADAR", "Radar OCR Leitor de Placas", "Av. Rio Branco, nº 310", "Centro", -22.2175, -49.9490),
        ("RADAR", "Radar Velocidade e Faixa Exclusiva", "Av. das Esmeraldas, nº 800", "Palmital", -22.2330, -49.9395),
        ("CAMERA_CFTV", "Câmera Pan-Tilt 4K Muralha Digital", "Terminal Urbano Central", "Centro", -22.2185, -49.9515),
        ("CAMERA_CFTV", "Câmera Reconhecimento Facial", "Praça Saturnino de Brito", "Centro", -22.2140, -49.9460),
        ("CAMERA_CFTV", "Câmera Dome 360º", "Av. Santo Antônio x Av. Pedro de Toledo", "Cascata", -22.2115, -49.9375),
        ("CAMERA_CFTV", "Câmera Perimetral Rodoviária", "Entrada SP-294 / Marília Shopping", "Somenzari", -22.1960, -49.9430),
        ("LOMBADA_ELETRONICA", "Lombada Digital 30km/h com Display", "Av. Pedro de Toledo, em frente à Escola", "Centro", -22.2090, -49.9425),
        ("LOMBADA_ELETRONICA", "Lombada Eletrônica com Aviso Sonoro", "Av. Brigadeiro Eduardo Gomes", "Jardim Maria Izabel", -22.2235, -49.9305),
        ("LOMBADA_ELETRONICA", "Redutor Digital Educativo", "Rua Bahia, proximidades da UBS", "Cascata", -22.2055, -49.9360),
        ("LUMINARIA_LED", "Luminária Inteligente LoRaWAN", "Av. das Esmeraldas (Ciclovia)", "Palmital", -22.2360, -49.9370),
        ("LUMINARIA_LED", "Poste Telegestionado LED 150W", "Av. Sampaio Correia, nº 1100", "Centro", -22.2225, -49.9478),
        ("LUMINARIA_LED", "Luminária Solar Autônoma", "Av. Nelson Spielmann", "Jardim Universitário", -22.1990, -49.9645),
        ("SENSOR_AMBIENTAL", "Estação Meteorológica IoT e Pluviômetro", "Bosque Municipal de Marília", "Cascata", -22.2040, -49.9340),
        ("SENSOR_AMBIENTAL", "Sensor de Qualidade do Ar e Ruído", "Cruzamento Av. Tiradentes", "Centro", -22.2190, -49.9525),
        ("SENSOR_AMBIENTAL", "Sensor de Nível de Córrego (Enchente)", "Marginal do Córrego Barbosa", "Fragata", -22.2280, -49.9560),
        ("TOTEM_WIFI", "Totem de Emergência e Conectividade Pública", "Praça da Emdurb", "Centro", -22.2165, -49.9475),
        ("TOTEM_WIFI", "Totem Ponto Seguro com Botão de Pânico", "Terminal Rodoviário Urbano", "Centro", -22.2180, -49.9505),
        ("TOTEM_WIFI", "Totem Turístico e Informações Cidadão", "Calçadão São Luiz", "Centro", -22.2128, -49.9438),
    ]

    for idx, (tipo_eq, mod_eq, logr, b_nome, lat_eq, lng_eq) in enumerate(modelos_por_tipo, start=1):
        eq = Equipamento(
            id=uuid.uuid4(),
            tipo=tipo_eq,
            numero_serie=f"{tipo_eq[:3]}-MAR-{idx:03d}",
            marca="Marília SmartCity Corp",
            modelo=mod_eq,
            cep="17500-000",
            bairro=b_nome,
            cidade_uf="Marília/SP",
            logradouro=logr,
            referencia="Instalação operacional monitorada",
            latitude=lat_eq,
            longitude=lng_eq,
            status="OPERANTE" if idx % 5 != 0 else "ALERTA",
            necessidade_manutencao="NENHUMA" if idx % 5 != 0 else "PREVENTIVA",
            caracteristicas_extras={"telemetria": "ativa", "firmware": "v3.1", "versatil": True},
        )
        session.add(eq)
        demais_equipamentos.append(eq)

    session.flush()
    todos_equipamentos = [radar_sp294] + semaforos_onda_verde + demais_equipamentos
    print(f"✅ [EQUIPAMENTOS] {len(todos_equipamentos)} equipamentos ativos catalogados.")
    return radar_sp294, semaforos_onda_verde, todos_equipamentos


# =============================================================================
# 3. HISTÓRICO RETROATIVO (60 DIAS) COM MATRIZ RÍGIDA DE COMPETÊNCIAS E SLA
# =============================================================================
def gerar_historico_retroativo_60_dias(
    session: Session,
    agentes_por_tipo: dict[str, list[Agente]],
    radar_sp294: Equipamento,
    semaforos_sampaio: list[Equipamento],
    todos_equipamentos: list[Equipamento],
) -> tuple[int, int]:
    """Gera histórico retroativo com:

    1. Respeito estrito à matriz de competências (Saúde JAMAIS faz manutenção).
    2. Modelagem fidedigna de SLA:
       - Manutenção: ágil, consistente e versátil em todos os equipamentos.
       - Saúde: tempos variados e sob estresse devido ao gargalo de apenas 4 viaturas.
    3. Preservação das 4 anomalias matemáticas de Marília/SP nos últimos 60 dias.
    """
    print("📈 [HISTÓRICO 60 DIAS] Gerando ocorrências resolvidas e telemetria com matriz de competências...")

    agora = datetime.now(timezone.utc)
    ocorrencias: list[Ocorrencia] = []
    eventos: list[HistoricoEvento] = []

    agentes_saude = agentes_por_tipo["RESGATE_MEDICO"]
    agentes_manutencao = agentes_por_tipo["TECNICO_MANUTENCAO"]
    agentes_transito = agentes_por_tipo["AGENTE_TRANSITO"]
    agentes_seguranca = agentes_por_tipo["GUARDA_MUNICIPAL"]
    agentes_fiscal = agentes_por_tipo["FISCAL_POSTURAS"]
    agentes_defesa = agentes_por_tipo["DEFESA_CIVIL"]

    # -------------------------------------------------------------------------
    # ANOMALIA 1: Onda Verde (Av. Sampaio Vidal)
    # Falha semafórica telemétrica seguida de colisão traseira leve 15 minutos depois
    # -------------------------------------------------------------------------
    dias_anom_1 = [55, 46, 37, 26, 17, 6]
    for dias in dias_anom_1:
        ts_falha = agora - timedelta(days=dias, hours=random.choice([17, 18]), minutes=random.randint(10, 40))
        for sem in semaforos_sampaio[:3]:
            eventos.append(
                HistoricoEvento(
                    entidade_id=sem.id,
                    tipo_evento="FALHA_SINCRONISMO_ONDA_VERDE",
                    data_hora=ts_falha,
                )
            )

        ts_colisao = ts_falha + timedelta(minutes=15)
        sem_alvo = random.choice(semaforos_sampaio)

        # Competência: Trânsito atende colisão leve
        ag_trans = random.choice(agentes_transito)
        ts_despacho = ts_colisao + timedelta(minutes=random.randint(4, 9))
        ts_conclusao = ts_despacho + timedelta(minutes=random.randint(25, 45))

        ocorrencias.append(
            Ocorrencia(
                titulo="Colisão Leve - Falha de Sincronismo Onda Verde",
                descricao=(
                    "Colisão traseira com retenção súbita ocorrida exatamente 15 minutos após descompasso "
                    "telemétrico na Onda Verde dos semáforos da Av. Sampaio Vidal. Precipitação pluviométrica moderada."
                ),
                tipo="ACIDENTE",
                gravidade="MEDIA",
                status="RESOLVIDA",
                latitude=jitter(sem_alvo.latitude, 0.0002),
                longitude=jitter(sem_alvo.longitude, 0.0002),
                equipamento_id=sem_alvo.id,
                agente_id=ag_trans.id,
                criado_em=ts_colisao,
                data_despacho=ts_despacho,
                data_conclusao=ts_conclusao,
                atualizado_em=ts_conclusao,
            )
        )

        # Manutenção posterior do semáforo por TÉCNICO DE MANUTENÇÃO (nunca Saúde!)
        ag_tec = random.choice(agentes_manutencao)
        ts_manut_criacao = ts_conclusao + timedelta(minutes=10)
        ts_manut_despacho = ts_manut_criacao + timedelta(minutes=random.randint(8, 15))
        ts_manut_conclusao = ts_manut_despacho + timedelta(minutes=random.randint(35, 60))

        ocorrencias.append(
            Ocorrencia(
                titulo=f"Manutenção e Ressincronização de Onda Verde ({sem_alvo.numero_serie})",
                descricao="Calibração do clock de rede NTP e reinicialização de controladora semafórica.",
                tipo="MANUTENCAO",
                gravidade="MEDIA",
                status="RESOLVIDA",
                latitude=sem_alvo.latitude,
                longitude=sem_alvo.longitude,
                equipamento_id=sem_alvo.id,
                agente_id=ag_tec.id,
                criado_em=ts_manut_criacao,
                data_despacho=ts_manut_despacho,
                data_conclusao=ts_manut_conclusao,
                atualizado_em=ts_manut_conclusao,
            )
        )

    # -------------------------------------------------------------------------
    # ANOMALIA 2: Sabotagem do Radar RAD-TIR-04 na SP-294
    # Cortes de fibra em madrugadas de sábado com acidentes graves 1h após a queda
    # -------------------------------------------------------------------------
    cursor = agora - timedelta(days=58)
    sabados_madrugada: list[datetime] = []
    while cursor <= agora:
        if cursor.weekday() == 5:  # Sábado
            ts_sab = cursor.replace(hour=random.choice([1, 2]), minute=random.randint(15, 45))
            if ts_sab <= agora:
                sabados_madrugada.append(ts_sab)
        cursor += timedelta(days=1)

    for ts_sabotagem in sabados_madrugada[:8]:
        eventos.append(
            HistoricoEvento(
                entidade_id=radar_sp294.id,
                tipo_evento="SABOTAGEM_CORTE_FIBRA",
                data_hora=ts_sabotagem,
            )
        )

        ts_acidente_grave = ts_sabotagem + timedelta(hours=1)

        # Competência Rígida: Acidente Grave na rodovia exige RESGATE_MEDICO (Saúde)
        # SLA com variação por escassez noturna de ambulâncias (gargalo de Saúde)
        ag_medico = random.choice(agentes_saude)
        tempo_espera_despacho = random.randint(14, 28)  # Demora maior devido à escassez
        tempo_atendimento = random.randint(55, 95)     # Tempo estendido para regulação médica

        ts_despacho = ts_acidente_grave + timedelta(minutes=tempo_espera_despacho)
        ts_conclusao = ts_despacho + timedelta(minutes=tempo_atendimento)

        ocorrencias.append(
            Ocorrencia(
                titulo="Acidente Grave com Vítimas Presas em Ferragens - SP-294",
                descricao=(
                    "Capotamento de alta energia ocorrido 1 hora após corte deliberado de fibra óptica do radar RAD-TIR-04. "
                    "Excesso de velocidade com múltiplas vítimas e necessidade de suporte avançado de vida (UTI Móvel)."
                ),
                tipo="ACIDENTE",
                gravidade="CRITICA",
                status="RESOLVIDA",
                latitude=jitter(COORD_SP294_RADAR[0], 0.0003),
                longitude=jitter(COORD_SP294_RADAR[1], 0.0003),
                equipamento_id=radar_sp294.id,
                agente_id=ag_medico.id,
                criado_em=ts_acidente_grave,
                data_despacho=ts_despacho,
                data_conclusao=ts_conclusao,
                atualizado_em=ts_conclusao,
            )
        )

        # Reparo da fibra e eletrônica do radar feito por TÉCNICO DE MANUTENÇÃO
        ag_tec_radar = random.choice(agentes_manutencao)
        ts_rep_criado = ts_conclusao + timedelta(minutes=20)
        ts_rep_desp = ts_rep_criado + timedelta(minutes=random.randint(10, 20))
        ts_rep_conc = ts_rep_desp + timedelta(minutes=random.randint(45, 80))

        ocorrencias.append(
            Ocorrencia(
                titulo="Reparo de Emergência e Emenda de Fibra Óptica - RAD-TIR-04",
                descricao="Reconexão de cabo óptico seccionado criminosamente e reestabelecimento de telemetria.",
                tipo="MANUTENCAO",
                gravidade="ALTA",
                status="RESOLVIDA",
                latitude=radar_sp294.latitude,
                longitude=radar_sp294.longitude,
                equipamento_id=radar_sp294.id,
                agente_id=ag_tec_radar.id,
                criado_em=ts_rep_criado,
                data_despacho=ts_rep_desp,
                data_conclusao=ts_rep_conc,
                atualizado_em=ts_rep_conc,
            )
        )

    # -------------------------------------------------------------------------
    # ANOMALIA 3: Conflito de Modais aos Domingos à Tarde (14h-18h30)
    # -------------------------------------------------------------------------
    domingos_tarde: list[datetime] = []
    cursor = agora - timedelta(days=58)
    while cursor <= agora:
        if cursor.weekday() == 6:  # Domingo
            for h in [14, 16, 17]:
                ts_dom = cursor.replace(hour=h, minute=random.randint(5, 55))
                if ts_dom <= agora:
                    domingos_tarde.append(ts_dom)
        cursor += timedelta(days=1)

    for idx, ts_dom in enumerate(domingos_tarde[:10], start=1):
        ag_trans = random.choice(agentes_transito)
        ts_desp = ts_dom + timedelta(minutes=random.randint(5, 12))
        ts_conc = ts_desp + timedelta(minutes=random.randint(20, 40))

        ocorrencias.append(
            Ocorrencia(
                titulo=f"Conflito de Modais e Quase-Atropelamento #{idx} - Av. das Esmeraldas",
                descricao=(
                    "Disputa de espaço entre ciclistas de lazer, pedestres e veículos em velocidade na Av. das Esmeraldas. "
                    "Exigência de moderação de tráfego e patrulhamento de agentes de trânsito."
                ),
                tipo="TRANSITO",
                gravidade="ALTA",
                status="RESOLVIDA",
                latitude=jitter(-22.2355, 0.0008),
                longitude=jitter(-49.9385, 0.0008),
                agente_id=ag_trans.id,
                criado_em=ts_dom,
                data_despacho=ts_desp,
                data_conclusao=ts_conc,
                atualizado_em=ts_conc,
            )
        )

    # -------------------------------------------------------------------------
    # ANOMALIA 4: Hotspot Noturno na Av. Sampaio Correia (Sextas/Sábados 22h-02h)
    # 24 ocorrências de colisão com suporte de Trânsito ou Guarda Municipal
    # -------------------------------------------------------------------------
    noites_sampaio_correia: list[datetime] = []
    cursor = agora - timedelta(days=58)
    while cursor <= agora:
        if cursor.weekday() in (4, 5):  # Sexta ou Sábado
            for h in [22, 23, 0, 1]:
                ts_noite = cursor.replace(hour=h, minute=random.randint(5, 55))
                if ts_noite <= agora:
                    noites_sampaio_correia.append(ts_noite)
        cursor += timedelta(days=1)

    for i in range(24):
        ts_sc = noites_sampaio_correia[i % len(noites_sampaio_correia)] if noites_sampaio_correia else (agora - timedelta(days=i*2, hours=23))
        num_predio = random.randint(968, 1700)
        grav = random.choices(["MEDIA", "ALTA", "CRITICA"], weights=[0.45, 0.40, 0.15])[0]

        # Se for crítica com vítimas, despacha Saúde; senão Trânsito ou Guarda
        if grav == "CRITICA":
            agente_responsavel = random.choice(agentes_saude)
            ts_desp = ts_sc + timedelta(minutes=random.randint(15, 30))  # Atraso por escassez noturna
            ts_conc = ts_desp + timedelta(minutes=random.randint(50, 90))
        else:
            agente_responsavel = random.choice(agentes_transito + agentes_seguranca)
            ts_desp = ts_sc + timedelta(minutes=random.randint(5, 12))
            ts_conc = ts_desp + timedelta(minutes=random.randint(25, 50))

        ocorrencias.append(
            Ocorrencia(
                titulo=f"Colisão Noturna de Trânsito - Av. Sampaio Correia, nº {num_predio}",
                descricao=(
                    f"Colisão de final de semana na Av. Sampaio Correia, altura do nº {num_predio}. "
                    "Fator contribuinte: velocidade excessiva e fluxo de vida noturna."
                ),
                tipo="ACIDENTE",
                gravidade=grav,
                status="RESOLVIDA",
                latitude=jitter(COORD_SAMPAIO_CORREIA[0], 0.0006),
                longitude=jitter(COORD_SAMPAIO_CORREIA[1], 0.0006),
                agente_id=agente_responsavel.id,
                criado_em=ts_sc,
                data_despacho=ts_desp,
                data_conclusao=ts_conc,
                atualizado_em=ts_conc,
            )
        )

    # -------------------------------------------------------------------------
    # DEMAIS OCORRÊNCIAS HISTÓRICAS (Respeitando estritamente a matriz de especialidades)
    # -------------------------------------------------------------------------
    # 1. Manutenções em todos os tipos de equipamentos atendidas por TECNICO_MANUTENCAO
    # Prova a versatilidade do setor de manutenção em radares, câmeras, semáforos, luminárias, etc.
    tipos_falha_equip = [
        ("Falha em Fonte Chaveada e Módulo de Alimentação", "MEDIA"),
        ("Troca de Lâmpada LED e Sensor Fotoelétrico", "BAIXA"),
        ("Calibração de Laço Indutivo e Sensor Doppler", "MEDIA"),
        ("Alinhamento Óptico de Câmera Pan-Tilt", "BAIXA"),
        ("Substituição de Switch PoE e Roteador 4G", "MEDIA"),
        ("Manutenção Preventiva Semestral e Limpeza Técnica", "BAIXA"),
    ]

    for eq in todos_equipamentos:
        qtd_manut = random.randint(2, 4)
        for _ in range(qtd_manut):
            dias_atras = random.uniform(2.0, 58.0)
            ts_m = agora - timedelta(days=dias_atras, hours=random.randint(8, 17))
            falha_txt, grav_m = random.choice(tipos_falha_equip)

            ag_tec = random.choice(agentes_manutencao)
            ts_desp = ts_m + timedelta(minutes=random.randint(8, 18))
            ts_conc = ts_desp + timedelta(minutes=random.randint(30, 65))

            ocorrencias.append(
                Ocorrencia(
                    titulo=f"Manutenção Técnica em {eq.tipo} ({eq.numero_serie})",
                    descricao=f"{falha_txt} no ativo instalado em {eq.logradouro}, Marília/SP.",
                    tipo="MANUTENCAO",
                    gravidade=grav_m,
                    status="RESOLVIDA",
                    latitude=eq.latitude,
                    longitude=eq.longitude,
                    equipamento_id=eq.id,
                    agente_id=ag_tec.id,
                    criado_em=ts_m,
                    data_despacho=ts_desp,
                    data_conclusao=ts_conc,
                    atualizado_em=ts_conc,
                )
            )

            # Telemetria de manutenção
            eventos.append(
                HistoricoEvento(
                    entidade_id=eq.id,
                    tipo_evento="MANUTENCAO_CONCLUIDA",
                    data_hora=ts_conc,
                )
            )

    # 2. Ocorrências Médicas Históricas atendidas EXCLUSIVAMENTE por RESGATE_MEDICO
    emergencias_saude = [
        ("Crise Cardiopulmonar em Via Pública", "CRITICA", "Paciente em colapso súbito necessitando de manobras de reanimação e transporte ao HC."),
        ("Acidente Vascular Cerebral Isquêmico", "ALTA", "Déficit motor agudo e afasia súbita em domicílio. Janela trombolítica crítica."),
        ("Queda de Altura em Construção Civil", "ALTA", "Trabalhador com fratura exposta de tíbia e trauma torácico. Imobilização prancha rígida."),
        ("Intoxicação Exógena Aguda", "MEDIA", "Ingestão acidental de produto químico industrial com insuficiência respiratória moderada."),
        ("Parto Iminente em Veículo Particular", "ALTA", "Trabalho de parto em período expulsivo em via expressa."),
    ]

    for i in range(25):
        dias_s = random.uniform(1.5, 59.0)
        ts_s = agora - timedelta(days=dias_s, hours=random.randint(0, 23))
        tit_s, grav_s, desc_s = random.choice(emergencias_saude)
        b = random.choice(BAIRROS_MARILIA)

        # SLA com impacto de escassez (apenas 4 viaturas para o município)
        ag_med = random.choice(agentes_saude)
        tempo_espera = random.randint(12, 35)  # Efeito gargalo: variação notável de tempo de espera
        tempo_resolucao = random.randint(45, 90)

        ts_desp = ts_s + timedelta(minutes=tempo_espera)
        ts_conc = ts_desp + timedelta(minutes=tempo_resolucao)

        ocorrencias.append(
            Ocorrencia(
                titulo=f"Atendimento Pré-Hospitalar: {tit_s} - {b['nome']}",
                descricao=f"{desc_s} Setor operacional: {b['nome']}, Marília/SP.",
                tipo="SAUDE",
                gravidade=grav_s,
                status="RESOLVIDA",
                latitude=jitter(b["lat"], 0.002),
                longitude=jitter(b["lng"], 0.002),
                agente_id=ag_med.id,
                criado_em=ts_s,
                data_despacho=ts_desp,
                data_conclusao=ts_conc,
                atualizado_em=ts_conc,
            )
        )

    # 3. Ocorrências de Segurança Pública (GUARDA_MUNICIPAL)
    seguranca_historico = [
        ("Furto Qualificado de Fiação de Iluminação Pública", "ALTA", "Flagrante de furto de cabos elétricos subterrâneos."),
        ("Vandalismo e Pichação de Patrimônio Público", "BAIXA", "Depredação de abrigo de ônibus e monumentos."),
        ("Desordem e Perturbação do Sossego em Praça Pública", "MEDIA", "Aglomeração com uso de som automotivo em decibéis proibidos."),
    ]
    for _ in range(15):
        dias_g = random.uniform(1.0, 58.0)
        ts_g = agora - timedelta(days=dias_g, hours=random.randint(18, 23))
        tit_g, grav_g, desc_g = random.choice(seguranca_historico)
        b = random.choice(BAIRROS_MARILIA)
        ag_sec = random.choice(agentes_seguranca)
        ts_desp = ts_g + timedelta(minutes=random.randint(6, 15))
        ts_conc = ts_desp + timedelta(minutes=random.randint(30, 60))

        ocorrencias.append(
            Ocorrencia(
                titulo=f"{tit_g} - {b['nome']}",
                descricao=desc_g,
                tipo="SEGURANCA",
                gravidade=grav_g,
                status="RESOLVIDA",
                latitude=jitter(b["lat"], 0.002),
                longitude=jitter(b["lng"], 0.002),
                agente_id=ag_sec.id,
                criado_em=ts_g,
                data_despacho=ts_desp,
                data_conclusao=ts_conc,
                atualizado_em=ts_conc,
            )
        )

    # 4. Ocorrências de Fiscalização de Posturas (FISCAL_POSTURAS)
    fiscalizacao_historico = [
        ("Comércio Ambulante Não Autorizado em Calçadão", "BAIXA", "Venda irregular de mercadorias sem licença municipal."),
        ("Descarte Clandestino de Entulho em Terreno Baldio", "MEDIA", "Flagrante de depósito irregular de resíduos de construção civil."),
        ("Obstrução de Guia Rebaixada e Passeio Público", "BAIXA", "Colocação de cavaletes e mercadorias bloqueando acessibilidade."),
    ]
    for _ in range(12):
        dias_f = random.uniform(2.0, 57.0)
        ts_f = agora - timedelta(days=dias_f, hours=random.randint(9, 16))
        tit_f, grav_f, desc_f = random.choice(fiscalizacao_historico)
        b = random.choice(BAIRROS_MARILIA)
        ag_fisc = random.choice(agentes_fiscal)
        ts_desp = ts_f + timedelta(minutes=random.randint(10, 25))
        ts_conc = ts_desp + timedelta(minutes=random.randint(25, 50))

        ocorrencias.append(
            Ocorrencia(
                titulo=f"{tit_f} - {b['nome']}",
                descricao=desc_f,
                tipo="FISCALIZACAO",
                gravidade=grav_f,
                status="RESOLVIDA",
                latitude=jitter(b["lat"], 0.002),
                longitude=jitter(b["lng"], 0.002),
                agente_id=ag_fisc.id,
                criado_em=ts_f,
                data_despacho=ts_desp,
                data_conclusao=ts_conc,
                atualizado_em=ts_conc,
            )
        )

    # 5. Ocorrências de Defesa Civil (DEFESA_CIVIL)
    defesa_historico = [
        ("Queda de Árvore de Médio Porte sobre Rede Secundária", "MEDIA", "Galhos pesados caídos após vendaval interrompendo tráfego local."),
        ("Risco de Deslizamento de Talude em Perímetro Urbano", "ALTA", "Erosão de encosta após precipitação pluviométrica de 80mm."),
        ("Alagamento Transitório em Baixada Arterial", "MEDIA", "Boca de lobo saturada por folhas e enxurrada impedindo escoamento."),
    ]
    for _ in range(12):
        dias_d = random.uniform(1.0, 58.0)
        ts_d = agora - timedelta(days=dias_d, hours=random.randint(7, 19))
        tit_d, grav_d, desc_d = random.choice(defesa_historico)
        b = random.choice(BAIRROS_MARILIA)
        ag_def = random.choice(agentes_defesa)
        ts_desp = ts_d + timedelta(minutes=random.randint(7, 18))
        ts_conc = ts_desp + timedelta(minutes=random.randint(35, 75))

        ocorrencias.append(
            Ocorrencia(
                titulo=f"{tit_d} - {b['nome']}",
                descricao=desc_d,
                tipo="DEFESA_CIVIL",
                gravidade=grav_d,
                status="RESOLVIDA",
                latitude=jitter(b["lat"], 0.002),
                longitude=jitter(b["lng"], 0.002),
                agente_id=ag_def.id,
                criado_em=ts_d,
                data_despacho=ts_desp,
                data_conclusao=ts_conc,
                atualizado_em=ts_conc,
            )
        )

    # Persistência em lote
    session.add_all(ocorrencias)
    session.add_all(eventos)
    session.flush()

    print(f"✅ [HISTÓRICO 60 DIAS] {len(ocorrencias)} ocorrências resolvidas e {len(eventos)} telemetrias persistidas.")
    return len(ocorrencias), len(eventos)


# =============================================================================
# 4. CARGA INICIAL PARA A DEMONSTRAÇÃO DE HOJE (8 OCORRÊNCIAS PENDENTES)
# =============================================================================
def criar_carga_inicial_pendentes(
    session: Session,
    radar_sp294: Equipamento,
    semaforos_sampaio: list[Equipamento],
) -> list[Ocorrencia]:
    """Cria cerca de 8 ocorrências com status 'PENDENTE' prontas para teste ao vivo.

    Abrangem todas as áreas (Saúde, Manutenção, Segurança, Trânsito, Defesa Civil, Fiscalização).
    O objetivo é testar se o painel filtra e impede o envio do agente errado,
    escolhendo o 'mais próximo e mais efetivo' conforme o algoritmo preditivo.
    """
    print("🚨 [DEMO AO VIVO] Injetando 8 ocorrências PENDENTES com geolocalização e competências estritas...")

    agora = datetime.now(timezone.utc)
    sem_01 = semaforos_sampaio[0]

    ocorrencias_pendentes_dados = [
        # 1. SAÚDE (CRÍTICA) — Exige RESGATE_MEDICO (SAMU). Teste: Técnico próximo NÃO pode ser recomendado!
        {
            "titulo": "Parada Cardiorrespiratória em Praça Pública",
            "descricao": (
                "Cidadão inconsciente de 62 anos em colapso súbito no Calçadão Central. Populares iniciaram compressões "
                "torácicas. Exige envio emergencial imediato de UTI Móvel SAMU com desfibrilador e suporte avançado de vida."
            ),
            "tipo": "SAUDE",
            "gravidade": "CRITICA",
            "latitude": -22.2152,
            "longitude": -49.9465,  # Centro - Praça Saturnino de Brito
            "equipamento_id": None,
            "minutos_atras": 3,
        },
        # 2. SAÚDE (ALTA) — Exige RESGATE_MEDICO (SAMU).
        {
            "titulo": "Idoso com Crise Hipertensiva Severa e TCE Leve",
            "descricao": (
                "Idoso de 78 anos com pico pressórico (220x130 mmHg) seguido de síncope e queda da própria altura "
                "com corte contuso na fronte. Necessidade de resgate médico e remoção segura à UPA Norte."
            ),
            "tipo": "SAUDE",
            "gravidade": "ALTA",
            "latitude": -22.2055,
            "longitude": -49.9525,  # Banzato
            "equipamento_id": None,
            "minutos_atras": 6,
        },
        # 3. MANUTENÇÃO (ALTA) — Falha de Semáforo. Exige TECNICO_MANUTENCAO. Teste: Saúde a 100m JAMAIS pode ser despachada!
        {
            "titulo": "Semáforo em Falha Crítica de Óptica e Ciclo Travado no Vermelho",
            "descricao": (
                "Controlador semafórico SEM-SAMPAIO-01 travado em sinal vermelho permanente em todas as aproximações. "
                "Motoristas buzinando e risco de acidentes por avanço indevido. Exige técnico de manutenção semafórica."
            ),
            "tipo": "MANUTENCAO",
            "gravidade": "ALTA",
            "latitude": sem_01.latitude,
            "longitude": sem_01.longitude,  # Av. Sampaio Vidal x Rua 9 de Julho
            "equipamento_id": sem_01.id,
            "minutos_atras": 5,
        },
        # 4. MANUTENÇÃO (CRÍTICA) — Falha de Radar Rodoviário. Exige TECNICO_MANUTENCAO.
        {
            "titulo": "Radar Doppler Inoperante por Rompimento de Circuito - SP-294",
            "descricao": (
                "Perda abrupta de enlace telemétrico no radar RAD-TIR-04 na Rodovia SP-294 km 451. "
                "Sensor Doppler offline e alarme de tamper disparado. Requer inspeção técnica urgente antes do anoitecer."
            ),
            "tipo": "MANUTENCAO",
            "gravidade": "CRITICA",
            "latitude": radar_sp294.latitude,
            "longitude": radar_sp294.longitude,  # SP-294 / Av. Tiradentes
            "equipamento_id": radar_sp294.id,
            "minutos_atras": 8,
        },
        # 5. SEGURANÇA (ALTA) — Exige GUARDA_MUNICIPAL.
        {
            "titulo": "Tentativa de Vandalismo e Furto de Fiação Subterrânea",
            "descricao": (
                "Alarme perimetral disparado nas imediações do Terminal Urbano. Indivíduos suspeitos tentando romper tampa "
                "de galeria subterrânea de cabos de telecomunicações e cobre. Solicita viatura GCM mais próxima para contenção."
            ),
            "tipo": "SEGURANCA",
            "gravidade": "ALTA",
            "latitude": -22.2188,
            "longitude": -49.9515,  # Próximo ao Terminal Rodoviário Urbano
            "equipamento_id": None,
            "minutos_atras": 4,
        },
        # 6. TRÂNSITO (MÉDIA) — Exige AGENTE_TRANSITO.
        {
            "titulo": "Pane Mecânica de Ônibus Articulado Bloqueando Faixa Dupla",
            "descricao": (
                "Ônibus do transporte coletivo com quebra de eixo diferencial atravessado no cruzamento arterial. "
                "Retenção de tráfego de 1,2 km se formando sentido Centro. Requer viatura EMDURB para desvio de fluxo e sinalização."
            ),
            "tipo": "TRANSITO",
            "gravidade": "MEDIA",
            "latitude": -22.2048,
            "longitude": -49.9568,  # Av. República x Av. Castro Alves
            "equipamento_id": None,
            "minutos_atras": 7,
        },
        # 7. DEFESA CIVIL (ALTA) — Exige DEFESA_CIVIL.
        {
            "titulo": "Queda de Eucalipto de Grande Porte com Risco de Rompimento de Adutora",
            "descricao": (
                "Árvore centenária tombada no canteiro central e sobre pista norte após rajada de vento. Raízes expostas "
                "pressionando adutora de água tratada. Exige equipe técnica de motosserra e desobstrução da Defesa Civil."
            ),
            "tipo": "DEFESA_CIVIL",
            "gravidade": "ALTA",
            "latitude": -22.2352,
            "longitude": -49.9382,  # Av. das Esmeraldas
            "equipamento_id": None,
            "minutos_atras": 10,
        },
        # 8. FISCALIZAÇÃO (BAIXA) — Exige FISCAL_POSTURAS.
        {
            "titulo": "Obstrução Ilegal de Calçada e Comércio Clandestino de Gás",
            "descricao": (
                "Comerciante irregular estocando botijões de GLP e caixarias sobre calçada tátil de acessibilidade em polo comercial. "
                "Requer notificação formal, autuação e apreensão por Fiscal de Posturas da Prefeitura."
            ),
            "tipo": "FISCALIZACAO",
            "gravidade": "BAIXA",
            "latitude": -22.2128,
            "longitude": -49.9430,  # Rua São Luiz
            "equipamento_id": None,
            "minutos_atras": 12,
        },
    ]

    ocorrencias_pendentes: list[Ocorrencia] = []
    for dado in ocorrencias_pendentes_dados:
        ts_criacao = agora - timedelta(minutes=dado["minutos_atras"])
        oc = Ocorrencia(
            id=uuid.uuid4(),
            titulo=dado["titulo"],
            descricao=dado["descricao"],
            tipo=dado["tipo"],
            gravidade=dado["gravidade"],
            status="PENDENTE",
            latitude=dado["latitude"],
            longitude=dado["longitude"],
            equipamento_id=dado["equipamento_id"],
            agente_id=None,
            data_despacho=None,
            data_conclusao=None,
            criado_em=ts_criacao,
            atualizado_em=ts_criacao,
        )
        session.add(oc)
        ocorrencias_pendentes.append(oc)

    session.flush()

    # Registra eventos de abertura das 8 ocorrências
    for oc in ocorrencias_pendentes:
        session.add(
            HistoricoEvento(
                entidade_id=oc.id,
                tipo_evento="OCORRENCIA_CRIADA",
                data_hora=oc.criado_em,
            )
        )

    print(f"✅ [DEMO AO VIVO] {len(ocorrencias_pendentes)} ocorrências pendentes criadas com sucesso.")
    return ocorrencias_pendentes


# =============================================================================
# FUNÇÃO PRINCIPAL
# =============================================================================
def executar_povoamento(reset_tudo: bool = True) -> dict[str, int]:
    """Executa o ciclo completo de povoamento com integridade e robustez empresarial."""
    print("=================================================================")
    print("🔥 F.O.G.O. — SCRIPT DE POVOAMENTO E INTELIGÊNCIA OPERACIONAL (seed.py)")
    print("=================================================================")

    engine = criar_engine_resiliente()
    print(f"📡 Conectado ao banco de dados: {engine.url}")

    Base.metadata.create_all(engine)

    with Session(engine) as session:
        if reset_tudo:
            reset_seguro(session)

        agentes_por_tipo = criar_catalogo_50_agentes(session)
        radar_sp294, semaforos_sampaio, todos_equipamentos = criar_equipamentos_urbanos(session)

        total_oc_hist, total_ev_hist = gerar_historico_retroativo_60_dias(
            session=session,
            agentes_por_tipo=agentes_por_tipo,
            radar_sp294=radar_sp294,
            semaforos_sampaio=semaforos_sampaio,
            todos_equipamentos=todos_equipamentos,
        )

        pendentes = criar_carga_inicial_pendentes(
            session=session,
            radar_sp294=radar_sp294,
            semaforos_sampaio=semaforos_sampaio,
        )

        session.commit()

        total_agentes = session.scalar(select(func.count()).select_from(Agente)) or 0
        total_equipamentos = session.scalar(select(func.count()).select_from(Equipamento)) or 0
        total_ocorrencias = session.scalar(select(func.count()).select_from(Ocorrencia)) or 0
        total_eventos = session.scalar(select(func.count()).select_from(HistoricoEvento)) or 0
        total_pendentes = len(pendentes)

    print("\n=================================================================")
    print("🏆 RESULTADO DO POVOAMENTO OPERACIONAL (F.O.G.O.):")
    print(f"  • Total de Agentes em Campo:        {total_agentes} (Exatamente 50)")
    print(f"    - Saúde (Gargalo Estratégico):    4 agentes (8%)")
    print(f"    - Manutenção Versátil:            10 agentes (20%)")
    print(f"    - Trânsito:                       12 agentes (24%)")
    print(f"    - Segurança Pública:              12 agentes (24%)")
    print(f"    - Fiscalização de Posturas:       6 agentes (12%)")
    print(f"    - Defesa Civil:                   6 agentes (12%)")
    print(f"  • Total de Equipamentos Urbanos:    {total_equipamentos} ativos")
    print(f"  • Total Geral de Ocorrências:       {total_ocorrencias}")
    print(f"    - Histórico Retroativo (60 dias): {total_oc_hist}")
    print(f"    - Carga Pendente para Demonstração: {total_pendentes}")
    print(f"  • Eventos de Telemetria/Auditoria:  {total_eventos}")
    print("=================================================================")
    print("🎯 Roteamento Preditivo calibrado com Hard Constraints e SLA realista.")
    print("Pronto para apresentação em tempo real!")
    return {
        "agentes": total_agentes,
        "equipamentos": total_equipamentos,
        "ocorrencias": total_ocorrencias,
        "pendentes": total_pendentes,
        "eventos": total_eventos,
    }


def main():
    parser = argparse.ArgumentParser(description="F.O.G.O. — Povoamento com Regras de Negócio e Roteamento Preditivo")
    parser.add_argument("--no-reset", action="store_true", help="Não apaga registros existentes antes de inserir")
    args = parser.parse_args()

    executar_povoamento(reset_tudo=not args.no_reset)


if __name__ == "__main__":
    main()
