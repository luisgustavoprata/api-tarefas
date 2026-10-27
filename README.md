# API de Tarefas

[![CI](https://github.com/luisgustavoprata/api-tarefas/actions/workflows/ci.yml/badge.svg)](https://github.com/luisgustavoprata/api-tarefas/actions/workflows/ci.yml)
![Python](https://img.shields.io/badge/Python-3.12%20%7C%203.13-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.162-009688?logo=fastapi&logoColor=white)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2-D71F00)
![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue)

API REST para organizar tarefas pessoais, feita com **FastAPI**, **SQLAlchemy 2** e
**PostgreSQL**. Cada pessoa cria a própria conta, entra com um token **JWT** e gerencia as
suas tarefas com prioridade, prazo e etiquetas. Há filtros combinados, busca, ordenação,
paginação e um resumo com as tarefas atrasadas.

> **Experimente:** a documentação interativa (Swagger) permite testar cada rota pelo
> navegador. Clique em **Authorize** e entre com `demo@tarefas.dev` / `demo12345`.

![Documentação interativa](docs/swagger.png)

## O que este projeto demonstra

| Tema | Como aparece no código |
|---|---|
| API REST bem desenhada | Recursos e verbos HTTP corretos, códigos de status (201 + `Location`, 204, 401, 404, 409, 422, 429), paginação com total |
| FastAPI | Injeção de dependências (`Depends`), validação automática, OpenAPI/Swagger gerado do código |
| Banco de dados | SQLAlchemy 2 com ORM tipado (`Mapped`), relacionamento muitos-para-muitos (tarefas ↔ etiquetas), exclusão em cascata |
| Segurança | Senhas com PBKDF2 + sal, JWT com expiração, limite de tentativas de login, resposta igual para e-mail inexistente e senha errada (não revela quem tem conta), isolamento total entre usuários |
| Qualidade | 50 testes com pytest, rodando no SQLite **e no PostgreSQL** a cada push (GitHub Actions), lint e formatação com Ruff |
| Entrega | Docker, docker-compose com PostgreSQL e deploy no Render a partir de um arquivo (`render.yaml`) |

## Rotas

| Método | Rota | O que faz |
|---|---|---|
| `POST` | `/auth/register` | Cria uma conta |
| `POST` | `/auth/token` | Entra (e-mail e senha) e recebe o token |
| `GET` | `/auth/me` | Dados da conta logada |
| `GET` | `/tasks` | Lista as tarefas, com filtros, busca, ordenação e paginação |
| `POST` | `/tasks` | Cria uma tarefa |
| `GET` | `/tasks/{id}` | Uma tarefa |
| `PATCH` | `/tasks/{id}` | Altera só os campos enviados |
| `DELETE` | `/tasks/{id}` | Exclui |
| `GET` | `/tasks/stats` | Total por situação, atrasadas, vencendo hoje e taxa de conclusão |
| `GET` | `/tags` | Etiquetas em uso, com a contagem de tarefas |
| `GET` | `/health` | Verifica se a API está no ar |

**Filtros de `GET /tasks`** (podem ser combinados):

| Parâmetro | Exemplo |
|---|---|
| `status` (um ou mais) | `?status=pendente&status=em_andamento` |
| `priority` (um ou mais) | `?priority=alta` |
| `tag` | `?tag=trabalho` |
| `q` (busca no título e na descrição) | `?q=relatório` |
| `due_from`, `due_to` | `?due_from=2030-01-01&due_to=2030-01-31` |
| `overdue` | `?overdue=true` (só atrasadas) |
| `sort` | `created_at`, `due_date`, `priority`, `title`; com `-` na frente inverte: `?sort=-priority` |
| `limit`, `offset` | `?limit=20&offset=40` |

### Exemplo com curl

```bash
# 1. Criar conta e entrar
curl -X POST localhost:8000/auth/register -H "Content-Type: application/json" \
  -d '{"name": "Ana Souza", "email": "ana@exemplo.com", "password": "senha-forte-123"}'

TOKEN=$(curl -s -X POST localhost:8000/auth/token \
  -d "username=ana@exemplo.com&password=senha-forte-123" | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# 2. Criar uma tarefa
curl -X POST localhost:8000/tasks -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Enviar relatório", "priority": "alta", "due_date": "2030-01-10", "tags": ["trabalho"]}'

# 3. Tarefas de trabalho, as mais importantes primeiro
curl "localhost:8000/tasks?tag=trabalho&sort=-priority" -H "Authorization: Bearer $TOKEN"

# 4. Concluir
curl -X PATCH localhost:8000/tasks/1 -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"status": "concluida"}'
```

Resposta de uma tarefa:

```json
{
  "id": 1,
  "title": "Enviar relatório",
  "description": null,
  "status": "concluida",
  "priority": "alta",
  "due_date": "2030-01-10",
  "tags": ["trabalho"],
  "overdue": false,
  "created_at": "2030-01-07T12:00:00Z",
  "updated_at": "2030-01-07T12:05:00Z",
  "completed_at": "2030-01-07T12:05:00Z"
}
```

Erros têm sempre o mesmo formato, com mensagens em português e o campo com problema:

```json
{
  "detail": "Dados inválidos.",
  "errors": [
    {"field": "title", "message": "Não pode ficar vazio."},
    {"field": "due_date", "message": "Data inválida. Use AAAA-MM-DD."}
  ]
}
```

## Arquitetura

```mermaid
flowchart LR
    C[Cliente / Swagger] -->|HTTP + JWT| R[Rotas<br/>app/routers]
    R -->|Depends| D[Dependências<br/>sessão, usuário, data]
    R --> S[Serviço<br/>app/services.py]
    S --> M[Modelos<br/>SQLAlchemy]
    M --> DB[(SQLite / PostgreSQL)]
    R -.valida.-> P[Schemas<br/>Pydantic]
```

```
app/
├── main.py          # monta a aplicação (create_app), CORS, rotas, tratamento de erros
├── config.py        # configuração por variáveis de ambiente
├── database.py      # conexão (SQLite no desenvolvimento, PostgreSQL em produção)
├── models.py        # tabelas: usuários, tarefas, etiquetas e a ligação entre elas
├── schemas.py       # formato e validação da entrada e da saída (Pydantic)
├── services.py      # regras de negócio: filtros, ordenação, etiquetas, estatísticas
├── deps.py          # dependências: sessão do banco, usuário logado, data de hoje
├── security.py      # senhas (PBKDF2) e tokens (JWT)
├── ratelimit.py     # limite de tentativas de login
├── errors.py        # respostas de erro padronizadas, em português
├── seed.py          # conta de demonstração com tarefas de exemplo
└── routers/         # auth.py e tasks.py
tests/               # pytest: autenticação, tarefas, filtros, isolamento, aplicação
```

**Decisões que valem comentar numa entrevista:**

- **Isolamento por usuário no serviço.** Toda consulta começa com `WHERE user_id = <logado>`.
  A tarefa de outra pessoa responde **404**, e não 403, para não revelar que ela existe.
- **Data de hoje injetável.** A rota recebe `today` por `Depends(get_today)`. Os testes
  trocam por uma data fixa, então "atrasada" e "vence hoje" são testados sem depender do relógio.
- **Uma sessão por requisição.** `get_db` confirma (commit) no fim ou desfaz tudo se algo
  falhar: não sobra gravação pela metade.
- **`PATCH` de verdade.** Só os campos enviados mudam (`model_dump(exclude_unset=True)`). Mandar
  `null` apaga o prazo, mas título e situação não aceitam `null`.
- **Etiquetas normalizadas.** `"Trabalho"` e `" trabalho "` viram a mesma etiqueta, e as que
  ficam sem tarefa são apagadas.
- **Busca segura.** `%` e `_` digitados são buscados literalmente (`autoescape`), e todo SQL é
  parametrizado pelo SQLAlchemy.

## Como rodar

### Com Python

```bash
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
SEED_DEMO=true uvicorn app.main:app --reload            # http://localhost:8000
```

### Com Docker (e PostgreSQL)

```bash
docker compose up --build                               # http://localhost:8000
```

### Testes e qualidade

```bash
pytest                                                  # SQLite
TEST_DATABASE_URL=postgresql://usuario:senha@localhost:5432/banco pytest   # PostgreSQL
ruff check . && ruff format --check .
```

## Deploy no Render (gratuito)

1. No [Render](https://render.com): **New → Blueprint** → escolha este repositório → **Apply**.
2. Em alguns minutos a API fica no ar em `https://api-tarefas-xxxx.onrender.com`, já com a
   conta de demonstração.

No plano gratuito, o servidor "dorme" depois de 15 minutos sem uso (o primeiro acesso leva
cerca de 50 segundos) e o banco SQLite volta ao estado inicial. Para dados permanentes, crie um
PostgreSQL no Render e coloque a URL dele em `DATABASE_URL`.

## Próximos passos

- Migrações de banco com Alembic
- Recuperação de senha por e-mail
- Subtarefas e projetos (agrupar tarefas)
- Lembretes de prazo

## Licença

MIT. Feito por **Luis Gustavo Prata**.
