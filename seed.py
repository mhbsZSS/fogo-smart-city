"""F.O.G.O. — Atalho Raiz para o Script de Povoamento (seed.py).

Permite executar diretamente da raiz do projeto:
    python seed.py
Ou via Docker:
    docker compose exec backend python seed.py
"""
import sys
from pathlib import Path

# Adiciona o diretório backend ao PYTHONPATH
backend_path = Path(__file__).resolve().parent / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

# Executa o módulo principal de seed
if __name__ == "__main__":
    from seed import main
    main()
