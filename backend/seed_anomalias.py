"""F.O.G.O. — Seed de Injeção de Dados: Janela de 60 Dias com Reforço Matemático de Anomalias.

Gera um volume denso (~170 a 200 ocorrências e histórico de manutenção)
modelando estatisticamente as 4 anomalias operacionais em Marília/SP:
1. Falha da Onda Verde (Av. Sampaio Vidal) -> Colisão Leve 15 min depois (5+ vezes)
2. Sabotagem do Radar RAD-TIR-04 na SP-294 -> Acidentes Graves 1h após a queda em madrugadas de sábado (7-8 vezes)
3. Conflito de Modais -> 10 riscos de atropelamento aos domingos à tarde em vias arteriais
4. Hotspot Noturno -> 20+ acidentes na Av. Sampaio Correia (nº 968 a 1700) em sextas e sábados (22h-02h)

Execução:
    python seed_anomalias.py
    ou via Docker:
    docker compose exec backend python seed_anomalias.py
"""
from __future__ import annotations

import argparse
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import create_engine, delete, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import Base
from app.models import Agente, Equipamento, HistoricoEvento, Ocorrencia


# Coordenadas de referência em Marília/SP
COORD_SAMPAIO_VIDAL = (-22.2148, -49.9462)
COORD_SP294_RADAR = (-22.2195, -49.9520)
COORD_SAMPAIO_CORREIA = (-22.2225, -49.9478)

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
]

VIAS_RAPIDAS_MODAIS = [
    {"via": "Av. das Esmeraldas", "lat": -22.2355, "lng": -49.9385, "bairro": "Palmital"},
    {"via": "Av. Castro Alves", "lat": -22.2260, "lng": -49.9420, "bairro": "Centro"},
    {"via": "Av. Tiradentes", "lat": -22.2195, "lng": -49.9520, "bairro": "Centro"},
    {"via": "Av. República", "lat": -22.2045, "lng": -49.9570, "bairro": "Banzato"},
]


def jitter(val: float, delta: float = 0.0015) -> float:
    """Aplica pequena variação aleatória (~100m a 150m) para dispersão geoespacial realista."""
    return round(val + random.uniform(-delta, delta), 6)


def garantir_equipamentos_chave(session: Session) -> tuple[Equipamento, list[Equipamento], list[Equipamento], list[Agente]]:
    """Garante que o radar RAD-TIR-04, os semáforos da Onda Verde e demais equipamentos/agentes existam."""
    # 1. Radar Crítico da SP-294
    radar = session.scalar(select(Equipamento).where(Equipamento.numero_serie == "RAD-TIR-04"))
    if not radar:
        radar = Equipamento(
            id=uuid.uuid4(),
            tipo="RADAR",
            numero_serie="RAD-TIR-04",
            marca="OmniEye Tático",
            modelo="Radar Doppler Pro 4K",
            cep="17500-010",
            bairro="Centro",
            cidade_uf="Marília/SP",
            logradouro="Rodovia SP-294 km 451 / Av. Tiradentes",
            referencia="Próximo ao viaduto de entroncamento tático",
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
        session.add(radar)

    # 2. Semáforos da Av. Sampaio Vidal (Onda Verde)
    semaforos_sampaio: list[Equipamento] = []
    pontos_sampaio = [
        ("SEM-SAMPAIO-01", "Cruzamento com Rua 9 de Julho", -22.2148, -49.9462),
        ("SEM-SAMPAIO-02", "Cruzamento com Av. Rio Branco", -22.2158, -49.9472),
        ("SEM-SAMPAIO-03", "Praça Saturnino de Brito (Nó Central)", -22.2139, -49.9458),
        ("SEM-SAMPAIO-04", "Cruzamento com Rua São Luiz", -22.2125, -49.9442),
        ("SEM-SAMPAIO-05", "Cruzamento com Av. Castro Alves", -22.2110, -49.9426),
    ]

    for num_serie, ref, lat, lng in pontos_sampaio:
        sem = session.scalar(select(Equipamento).where(Equipamento.numero_serie == num_serie))
        if not sem:
            sem = Equipamento(
                id=uuid.uuid4(),
                tipo="SEMAFORO",
                numero_serie=num_serie,
                marca="SinalCorp",
                modelo="Optima SmartWave",
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
        semaforos_sampaio.append(sem)

    # 3. Equipamentos adicionais para compor parque urbano de Marília
    total_equip = session.scalar(select(func.count()).select_from(Equipamento)) or 0
    outros_equipamentos: list[Equipamento] = []
    if total_equip < 30:
        tipos_disponiveis = [
            ("CAMERA_CFTV", "Câmera Pan-Tilt 4K"),
            ("LOMBADA_ELETRONICA", "Lombada Digital 30km/h"),
            ("LUMINARIA_LED", "Luminária Inteligente LoRaWAN"),
            ("SENSOR_AMBIENTAL", "Estação Meteorológica IoT"),
            ("TOTEM_WIFI", "Totem de Emergência e Conectividade"),
            ("RADAR", "Radar Fixo 50km/h"),
        ]
        for i in range(1, 35):
            bairro = random.choice(BAIRROS_MARILIA)
            tipo_e, mod_e = random.choice(tipos_disponiveis)
            eq = Equipamento(
                id=uuid.uuid4(),
                tipo=tipo_e,
                numero_serie=f"{tipo_e[:3]}-MAR-{i:03d}",
                marca="SmartCity Ind",
                modelo=mod_e,
                cep=bairro["cep"],
                bairro=bairro["nome"],
                cidade_uf="Marília/SP",
                logradouro=f"Rua das Operações {i}",
                referencia=f"Setor {bairro['nome']}",
                latitude=jitter(bairro["lat"], 0.003),
                longitude=jitter(bairro["lng"], 0.003),
                status=random.choices(["OPERANTE", "ALERTA", "EM_MANUTENCAO", "INOPERANTE"], weights=[0.75, 0.12, 0.08, 0.05])[0],
                necessidade_manutencao=random.choices(["NENHUMA", "PREVENTIVA", "CORRETIVA", "URGENTE"], weights=[0.70, 0.15, 0.10, 0.05])[0],
                caracteristicas_extras={"telemetria": "ativa", "firmware": "v2.4"},
            )
            session.add(eq)
            outros_equipamentos.append(eq)

    # 4. Agentes operacionais
    total_agentes = session.scalar(select(func.count()).select_from(Agente)) or 0
    agentes: list[Agente] = []
    if total_agentes < 10:
        agentes_dados = [
            ("Inspetor Roberto Silva", "AGENTE_TRANSITO", "EM_DESLOCAMENTO"),
            ("Agente Priscila Souza", "AGENTE_TRANSITO", "EM_ATENDIMENTO"),
            ("Sgt. Marcos Alencar", "GUARDA_MUNICIPAL", "DISPONIVEL"),
            ("Equipe Bravo GCM", "GUARDA_MUNICIPAL", "EM_DESLOCAMENTO"),
            ("Técnico Lucas Ferreira", "TECNICO_MANUTENCAO", "EM_ATENDIMENTO"),
            ("Eng. Amanda Duarte", "TECNICO_MANUTENCAO", "DISPONIVEL"),
            ("Unidade Resgate SAMU 03", "RESGATE_MEDICO", "DISPONIVEL"),
            ("Viatura Defesa Civil 01", "DEFESA_CIVIL", "DISPONIVEL"),
        ]
        for nome, tipo_a, st_a in agentes_dados:
            b = random.choice(BAIRROS_MARILIA)
            ag = Agente(
                id=uuid.uuid4(),
                nome=nome,
                tipo=tipo_a,
                status=st_a,
                latitude=jitter(b["lat"], 0.002),
                longitude=jitter(b["lng"], 0.002),
            )
            session.add(ag)
            agentes.append(ag)
    else:
        agentes = list(session.scalars(select(Agente)).all())

    session.flush()
    todos_equipamentos = list(session.scalars(select(Equipamento)).all())
    return radar, semaforos_sampaio, todos_equipamentos, agentes


def limpar_dados_seguro(session: Session, reset_tudo: bool = False) -> None:
    """Limpa as tabelas com integridade referencial respeitando Foreign Keys."""
    print("[F.O.G.O. Seed] Limpando dados com segurança (Ocorrências e Histórico de Eventos)...")
    session.execute(delete(Ocorrencia))
    session.execute(delete(HistoricoEvento))
    if reset_tudo:
        print("[F.O.G.O. Seed] Modo --reset ativado: limpando equipamentos e agentes...")
        session.execute(delete(Equipamento))
        session.execute(delete(Agente))
    session.commit()
    print("[F.O.G.O. Seed] Limpeza concluída com integridade garantida.")


def gerar_carga_60_dias(session: Session) -> dict[str, int]:
    """Injeta as 4 anomalias matemáticas + ocorrências randômicas + histórico denso de 60 dias."""
    agora = datetime.now(timezone.utc)
    inicio_janela = agora - timedelta(days=60)

    radar, semaforos_sampaio, todos_equipamentos, agentes = garantir_equipamentos_chave(session)

    ocorrencias_geradas: list[Ocorrencia] = []
    eventos_gerados: list[HistoricoEvento] = []

    # -------------------------------------------------------------------------
    # ANOMALIA 1: Falha da Onda Verde na Av. Sampaio Vidal
    # 6 falhas semafóricas seguidas de "Colisão Leve" 15 minutos depois
    # -------------------------------------------------------------------------
    dias_falha_onda = [54, 43, 35, 24, 15, 4]  # dias atrás
    for dias_atras in dias_falha_onda:
        ts_falha = agora - timedelta(days=dias_atras, hours=random.choice([17, 18]), minutes=random.randint(10, 40))
        # Registra evento de falha nos semáforos
        for sem in semaforos_sampaio[:3]:
            eventos_gerados.append(
                HistoricoEvento(
                    entidade_id=sem.id,
                    tipo_evento="FALHA_SINCRONISMO_ONDA_VERDE",
                    data_hora=ts_falha,
                )
            )

        # 15 minutos depois: ocorrência de colisão leve
        ts_acidente = ts_falha + timedelta(minutes=15)
        sem_alvo = random.choice(semaforos_sampaio)
        ocorrencias_geradas.append(
            Ocorrencia(
                titulo="Colisão Leve - Falha de Sincronismo Onda Verde",
                descricao=(
                    "Colisão traseira com retenção súbita ocorrida 15 minutos após descompasso telemétrico "
                    "na Onda Verde dos semáforos da Av. Sampaio Vidal. Precipitação pluviométrica moderada."
                ),
                tipo="ACIDENTE",
                gravidade="MEDIA",
                status="RESOLVIDA" if dias_atras > 2 else "EM_ATENDIMENTO",
                latitude=jitter(sem_alvo.latitude, 0.0003),
                longitude=jitter(sem_alvo.longitude, 0.0003),
                equipamento_id=sem_alvo.id,
                agente_id=random.choice(agentes).id if agentes else None,
                criado_em=ts_acidente,
                atualizado_em=ts_acidente + timedelta(hours=1),
            )
        )

    # -------------------------------------------------------------------------
    # ANOMALIA 2: Sabotagem do Radar RAD-TIR-04 na SP-294
    # Fazer cair em 8 madrugadas de sábado com "Acidentes Graves" 1h após a queda
    # -------------------------------------------------------------------------
    # Procura todos os sábados nos últimos 60 dias
    sabados: list[datetime] = []
    cursor = inicio_janela
    while cursor <= agora:
        # weekday 5 = Sábado
        if cursor.weekday() == 5:
            # Madrugada de sábado entre 01h30 e 03h00
            ts_sab = cursor.replace(hour=random.choice([1, 2]), minute=random.randint(15, 50), second=0)
            if ts_sab <= agora:
                sabados.append(ts_sab)
        cursor += timedelta(days=1)

    # Aplica nas madrugadas de sábado (7 a 8 ocorrências)
    for ts_sabotagem in sabados[-8:]:
        # Evento de sabotagem telemétrica no radar
        eventos_gerados.append(
            HistoricoEvento(
                entidade_id=radar.id,
                tipo_evento="SABOTAGEM_CORTE_FIBRA",
                data_hora=ts_sabotagem,
            )
        )
        # 1 hora após a queda: Acidente Grave
        ts_grave = ts_sabotagem + timedelta(hours=1)
        ocorrencias_geradas.append(
            Ocorrencia(
                titulo="Acidente Grave - Trecho sem Radar (RAD-TIR-04)",
                descricao=(
                    "Grave colisão por excesso de velocidade extrema e capotamento registrado exatamente "
                    "1 hora após interrupção telemétrica premeditada por vandalismo no radar RAD-TIR-04 na SP-294."
                ),
                tipo="ACIDENTE",
                gravidade="CRITICA",
                status="RESOLVIDA" if (agora - ts_grave).days > 3 else "PENDENTE",
                latitude=jitter(radar.latitude, 0.0004),
                longitude=jitter(radar.longitude, 0.0004),
                equipamento_id=radar.id,
                agente_id=random.choice(agentes).id if agentes else None,
                criado_em=ts_grave,
                atualizado_em=ts_grave + timedelta(hours=2),
            )
        )

    # -------------------------------------------------------------------------
    # ANOMALIA 3: Conflito de Modais
    # 10 ocorrências de "Risco de Atropelamento" aos domingos à tarde em vias rápidas
    # -------------------------------------------------------------------------
    domingos: list[datetime] = []
    cursor = inicio_janela
    while cursor <= agora:
        if cursor.weekday() == 6:  # Domingo
            domingos.append(cursor)
        cursor += timedelta(days=1)

    for i in range(10):
        domingo = domingos[i % len(domingos)]
        ts_domingo = domingo.replace(hour=random.randint(14, 18), minute=random.randint(10, 55))
        if ts_domingo > agora:
            ts_domingo = agora - timedelta(hours=random.randint(4, 24))

        via_alvo = VIAS_RAPIDAS_MODAIS[i % len(VIAS_RAPIDAS_MODAIS)]
        ocorrencias_geradas.append(
            Ocorrencia(
                titulo="Risco de Atropelamento - Conflito Modal em Via Rápida",
                descricao=(
                    f"Conflito crítico entre fluxo veicular em alta velocidade e ciclistas/pedestres na {via_alvo['via']}. "
                    "Near-miss registrado por telemetria e denúncia de cidadãos no período de lazer de domingo à tarde."
                ),
                tipo="TRANSITO",
                gravidade="ALTA",
                status="RESOLVIDA" if (agora - ts_domingo).days > 2 else "EM_ATENDIMENTO",
                latitude=jitter(via_alvo["lat"], 0.0006),
                longitude=jitter(via_alvo["lng"], 0.0006),
                agente_id=random.choice(agentes).id if agentes else None,
                criado_em=ts_domingo,
                atualizado_em=ts_domingo + timedelta(minutes=45),
            )
        )

    # -------------------------------------------------------------------------
    # ANOMALIA 4: Hotspot Noturno na Av. Sampaio Correia (nº 968 a 1700)
    # 24 acidentes estritamente nas sextas e sábados, entre 22h e 02h
    # -------------------------------------------------------------------------
    noites_fds: list[datetime] = []
    cursor = inicio_janela
    while cursor <= agora:
        # Sexta (4) ou Sábado (5)
        if cursor.weekday() in (4, 5):
            # Horário entre 22h e 02h
            h = random.choice([22, 23, 0, 1])
            ts_noite = cursor.replace(hour=h, minute=random.randint(5, 55))
            if ts_noite <= agora:
                noites_fds.append(ts_noite)
        cursor += timedelta(days=1)

    for i in range(24):
        ts_acidente_noturno = noites_fds[i % len(noites_fds)] if noites_fds else (agora - timedelta(days=i*2, hours=23))
        numero_predio = random.randint(968, 1700)
        grav = random.choices(["MEDIA", "ALTA", "CRITICA"], weights=[0.45, 0.40, 0.15])[0]
        ocorrencias_geradas.append(
            Ocorrencia(
                titulo="Colisão Noturna de Alta Energia - Av. Sampaio Correia",
                descricao=(
                    f"Acidente de trânsito registrado na Av. Sampaio Correia, nº {numero_predio}. Fator determinante: "
                    "concentração de tráfego de final de semana noturno (22h-02h), desrespeito à sinalização e velocidade."
                ),
                tipo="ACIDENTE",
                gravidade=grav,
                status="RESOLVIDA" if (agora - ts_acidente_noturno).days > 3 else "PENDENTE",
                latitude=jitter(COORD_SAMPAIO_CORREIA[0], 0.0005),
                longitude=jitter(COORD_SAMPAIO_CORREIA[1], 0.0005),
                agente_id=random.choice(agentes).id if agentes else None,
                criado_em=ts_acidente_noturno,
                atualizado_em=ts_acidente_noturno + timedelta(hours=1),
            )
        )

    # -------------------------------------------------------------------------
    # Ocorrências Randômicas para Volume Estatístico Realista (~130 a 140 ocorrencias)
    # Meta total: ~175 a 190 ocorrências no banco de dados
    # -------------------------------------------------------------------------
    tipos_gerais = [
        ("MANUTENCAO", "Falha de Alimentação em Luminária LED", "Lâmpada piscando intermitente e perda de fotocélula.", "BAIXA"),
        ("TRANSITO", "Veículo Avariado Bloqueando Faixa", "Pane mecânica em automóvel particular obstruindo faixa da esquerda.", "MEDIA"),
        ("ILUMINACAO", "Queda de Braço de Iluminação Pública", "Braço de iluminação danificado após forte ventania.", "MEDIA"),
        ("SEGURANCA", "Furto de Fiação Elétrica Subterrânea", "Subtração de cabos de cobre de rede subterrânea municipal.", "ALTA"),
        ("ACIDENTE", "Colisão Traseira em Cruzamento Arterial", "Frenagem brusca gerando abalroamento sem vítimas graves.", "BAIXA"),
        ("AMBIENTAL", "Queda de Galho em Rede Viária", "Galho de grande porte sobre o asfalto necessitando poda emergencial.", "MEDIA"),
        ("TRANSITO", "Estacionamento Irregular em Ponto de Ônibus", "Veículo bloqueando baia de embarque de passageiros.", "BAIXA"),
    ]

    for _ in range(130):
        dias_aleatorios = random.uniform(0.1, 59.5)
        ts_geral = agora - timedelta(days=dias_aleatorios, hours=random.randint(0, 23), minutes=random.randint(0, 59))
        bairro = random.choice(BAIRROS_MARILIA)
        tipo_o, tit_o, desc_o, grav_o = random.choice(tipos_gerais)
        st_o = random.choices(["RESOLVIDA", "PENDENTE", "EM_ATENDIMENTO", "DESPACHADA"], weights=[0.70, 0.12, 0.10, 0.08])[0]
        eq_relacionado = random.choice(todos_equipamentos) if random.random() < 0.4 else None

        ocorrencias_geradas.append(
            Ocorrencia(
                titulo=f"{tit_o} - {bairro['nome']}",
                descricao=f"{desc_o} Localizado no bairro {bairro['nome']} em Marília/SP.",
                tipo=tipo_o,
                gravidade=grav_o,
                status=st_o,
                latitude=jitter(bairro["lat"], 0.0025),
                longitude=jitter(bairro["lng"], 0.0025),
                equipamento_id=eq_relacionado.id if eq_relacionado else None,
                agente_id=random.choice(agentes).id if agentes and random.random() < 0.6 else None,
                criado_em=ts_geral,
                atualizado_em=ts_geral + timedelta(hours=random.randint(1, 4)),
            )
        )

    # -------------------------------------------------------------------------
    # Histórico Denso de Eventos e Manutenções dos Equipamentos (200+ eventos)
    # -------------------------------------------------------------------------
    tipos_evento_historico = [
        "MANUTENCAO_PREVENTIVA",
        "MANUTENCAO_CORRETIVA",
        "CALIBRACAO_SENSOR",
        "REINICIALIZACAO_SISTEMA",
        "SUBSTITUICAO_MODULO_COMUNICACAO",
        "VISTORIA_TECNICA_EMDURB",
        "ALERTA_TEMPERATURA_ALTA",
    ]

    for eq in todos_equipamentos:
        qtd_eventos = random.randint(3, 7)
        for _ in range(qtd_eventos):
            dias_ev = random.uniform(0.5, 59.0)
            ts_ev = agora - timedelta(days=dias_ev, hours=random.randint(8, 18), minutes=random.randint(0, 59))
            eventos_gerados.append(
                HistoricoEvento(
                    entidade_id=eq.id,
                    tipo_evento=random.choice(tipos_evento_historico),
                    data_hora=ts_ev,
                )
            )

    # Injeção em lote no banco
    print(f"[F.O.G.O. Seed] Persistindo {len(ocorrencias_geradas)} ocorrências táticas no banco...")
    session.add_all(ocorrencias_geradas)

    print(f"[F.O.G.O. Seed] Persistindo {len(eventos_gerados)} eventos de telemetria e manutenção...")
    session.add_all(eventos_gerados)

    session.commit()

    return {
        "ocorrencias_total": len(ocorrencias_geradas),
        "eventos_total": len(eventos_gerados),
        "equipamentos_total": len(todos_equipamentos),
        "agentes_total": len(agentes),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="F.O.G.O. — Injeção de Anomalias e Carga de 60 Dias")
    parser.add_argument("--reset", action="store_true", help="Limpa todas as tabelas antes da injeção")
    args = parser.parse_args()

    print("=================================================================")
    print("🔥 F.O.G.O. — SEED DE INTELIGÊNCIA PREDITIVA E ANOMALIAS (60 DIAS)")
    print("=================================================================")
    print(f"Banco Alvo (Sync): {settings.database_url_sync}")

    engine = create_engine(settings.database_url_sync, pool_pre_ping=True)
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        limpar_dados_seguro(session, reset_tudo=args.reset)
        res = gerar_carga_60_dias(session)

    print("\n✅ INJEÇÃO CONCLUÍDA COM SUCESSO!")
    print(f"  • Total de Ocorrências (60 dias): {res['ocorrencias_total']}")
    print(f"  • Total de Eventos de Manutenção: {res['eventos_total']}")
    print(f"  • Total de Equipamentos Ativos:   {res['equipamentos_total']}")
    print(f"  • Total de Agentes Monitorados:   {res['agentes_total']}")
    print("\nAs 4 Anomalias Táticas foram matematicamente fixadas e dispersas nos 60 dias.")
    print("O Módulo Preditivo agora possui base estatística inquestionável.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
