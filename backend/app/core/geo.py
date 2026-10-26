"""
Utilitários geoespaciais da cidade de Marília/SP.

O polígono abaixo é uma simplificação da mancha urbana de Marília, inscrita na
bounding box oficial do projeto (Lat -22.25 a -22.18 | Lng -49.98 a -49.91).
Ele é usado para garantir que dados gerados/cadastrados caiam DENTRO da cidade.
"""
from geopy.distance import geodesic

MARILIA_CENTRO: tuple[float, float] = (-22.2139, -49.9458)  # Praça Saturnino de Brito

MARILIA_BBOX = {
    "lat_min": -22.25,
    "lat_max": -22.18,
    "lng_min": -49.98,
    "lng_max": -49.91,
}

# Vértices (lat, lng) em sentido horário, começando pelo norte.
MARILIA_POLIGONO: list[tuple[float, float]] = [
    (-22.1850, -49.9500),
    (-22.1880, -49.9250),
    (-22.2000, -49.9150),
    (-22.2250, -49.9130),
    (-22.2450, -49.9250),
    (-22.2470, -49.9500),
    (-22.2350, -49.9750),
    (-22.2050, -49.9770),
    (-22.1900, -49.9680),
]


def dentro_bbox(lat: float, lng: float) -> bool:
    b = MARILIA_BBOX
    return b["lat_min"] <= lat <= b["lat_max"] and b["lng_min"] <= lng <= b["lng_max"]


def dentro_poligono(lat: float, lng: float, poligono: list[tuple[float, float]] = MARILIA_POLIGONO) -> bool:
    """Ray casting (x = lng, y = lat)."""
    dentro = False
    n = len(poligono)
    j = n - 1
    for i in range(n):
        yi, xi = poligono[i]
        yj, xj = poligono[j]
        if (yi > lat) != (yj > lat):
            x_intersec = (xj - xi) * (lat - yi) / (yj - yi) + xi
            if lng < x_intersec:
                dentro = not dentro
        j = i
    return dentro


def dentro_de_marilia(lat: float, lng: float) -> bool:
    """Validação estrita: bounding box E polígono urbano."""
    return dentro_bbox(lat, lng) and dentro_poligono(lat, lng)


def distancia_km(origem: tuple[float, float], destino: tuple[float, float]) -> float:
    """Distância geodésica (WGS-84) em km."""
    return geodesic(origem, destino).km
