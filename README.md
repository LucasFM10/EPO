# EPO — Escritório de Processos (TJPB)

Aplicação web para organizar, importar, visualizar e incorporar fluxos de processos BPMN exportados do **Bizagi**. Roda de forma independente, com banco SQLite em um volume persistente, sem serviços externos obrigatórios.

## Stack

- **Next.js 16** (App Router) com React 19 e TypeScript
- **SQLite** (`better-sqlite3`, modo WAL, foreign keys ativas) com **Drizzle ORM** e migrations versionadas
- **Autenticação própria**: e-mail e senha, hash **Argon2id**, sessão em cookie `HttpOnly`/`Secure`
- **React Flow** (`@xyflow/react`) para os diagramas, Tailwind CSS 4, Radix UI, lucide-react
- **Docker** (imagem multi-stage, usuário não-root) e **Coolify** para deploy
- **sqlite-web** (opcional) para administração do banco

## Arquitetura

```
Navegador ──► Next.js (Server Components + Server Actions + Route Handlers)
                 │
                 ├── lib/queries.ts, lib/mutations.ts   "use server": leituras e escritas
                 │       └── autorização (requireUser) e validação em cada função
                 ├── lib/server/repo.ts                 operações de banco (SQLite)
                 ├── lib/server/uploads.ts              SVGs em disco, sem path traversal
                 └── lib/actions/auth.ts                login, logout, rate limit
                 │
                 ▼
          /app/data  (volume persistente)
             ├── epo.sqlite   (banco, WAL)
             ├── uploads/     (SVGs enviados)
             └── backups/     (backups gerados por npm run backup)
```

- O navegador **nunca** acessa o arquivo do banco nem recebe credenciais de banco. Não há cliente de banco no front-end.
- Leituras (pastas, fluxos, `/fluxo/[slug]`, `/embed/[slug]`) são públicas, como no projeto original. Escritas exigem sessão válida, verificada no servidor.
- Não existe cadastro público. Usuários são criados por comando administrativo.

## Estrutura

```
app/
  page.tsx             landing pública (/), sem autenticação
  (portal)/portal/     portal (/portal), protegido por verificação de sessão no servidor
  login/               tela de login
  embed/[slug]/        fluxo incorporável
  fluxo/[slug]/        visualização do fluxo
  api/health/          healthcheck
  api/uploads/[name]/  SVGs enviados (leitura pública, CSP restritiva)
components/            visualizador, sidebar, diálogos de pasta e importação
lib/
  db/                  conexão SQLite e schema Drizzle
  server/              configuração, sessão, senha, rate limit, SVG, uploads, repo
  actions/auth.ts      Server Actions de autenticação
  queries.ts           leituras
  mutations.ts         escritas
drizzle/               migrations SQL versionadas (geradas pelo drizzle-kit)
scripts/               migrate, users, backup, restore (+ migração temporária do Supabase)
tests/                 testes automatizados (node:test)
```

## Variáveis de ambiente

Nenhuma é obrigatória. Padrões funcionam para Docker e desenvolvimento local.

| Variável | Padrão | Uso |
|---|---|---|
| `DATA_DIR` | `./data` (Docker: `/app/data`) | Diretório com `epo.sqlite`, `uploads/` e `backups/` |
| `COOKIE_SECURE` | ligado em produção | Defina `0` somente para testar em HTTP sem HTTPS |
| `BACKUP_DIR` | `<DATA_DIR>/backups` | Destino dos backups. Recomendado: outro disco |
| `BACKUP_KEEP` | `14` | Quantidade de backups mantidos |

Modelo em `.env.example`. O arquivo `.env` não vai para o repositório.

## Executar localmente

Requisitos: Node.js 22 ou superior.

```bash
npm ci
npm run db:migrate                       # cria/atualiza o banco em ./data
npm run user:create -- admin@exemplo.gov.br   # cria o primeiro usuário (pede a senha sem eco)
npm run dev                              # http://localhost:3000
```

## Executar com Docker

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
docker compose exec app node scripts/users.mjs create admin@exemplo.gov.br
```

Acesse `http://localhost:3000`. O `docker-compose.local.yml` publica a porta 3000 no host.

## Deploy no Coolify

1. Crie um recurso do tipo **Docker Compose** apontando para este repositório, ou **Dockerfile** (build pack).
2. Em **Domains**, associe o domínio ao serviço `app`, porta **3000**. O Coolify cuida do HTTPS.
3. **Nenhuma variável é obrigatória.** O volume `epo-data` é criado automaticamente e monta `/app/data`.
4. Faça o deploy. A imagem aplica as migrations antes de iniciar o servidor (`docker-entrypoint.sh`).
5. Crie o primeiro usuário pelo terminal do container no Coolify:
   ```bash
   node scripts/users.mjs create admin@exemplo.gov.br
   ```
6. Acesse o domínio e entre com esse usuário.

O cookie de sessão é `Secure` em produção, então o acesso precisa ser por HTTPS (o Coolify já fornece).

## Migrations

- As migrations ficam em `drizzle/`. No Docker, elas são aplicadas **automaticamente antes de o servidor iniciar**. Em desenvolvimento local, rode `npm run db:migrate` antes de `npm run dev`.
- Aplicação é idempotente: rodar de novo não apaga nem duplica dados.
- Para criar uma nova migration após alterar `lib/db/schema.ts`: `npm run db:generate -- --name descricao`. Revise o SQL gerado antes de commitar.

## Usuários

Não há cadastro público nem tela administrativa de contas, por decisão de escopo.

```bash
npm run user:create -- email@exemplo.gov.br              # pede a senha duas vezes, sem eco
npm run user:reset-password -- email@exemplo.gov.br      # redefine a senha e encerra as sessões
printf '%s' "$SENHA" | npm run user:create -- email@exemplo.gov.br --password-stdin   # automação
```

Regras: senha com pelo menos 12 caracteres; e-mail em minúsculas; a senha nunca é gravada em arquivo nem em log. Em Docker, prefixe com `docker compose exec app`.

Tentativas de login são limitadas: 5 falhas por IP ou por e-mail em 15 minutos bloqueiam novas tentativas. O contador fica em memória, então reinicia junto com o processo.

## Backup e restauração

O backup usa `VACUUM INTO`, que é consistente com WAL e pode rodar com a aplicação em uso. Ele copia o banco, os SVGs e um `manifest.json` com checksum e contagens.

```bash
npm run backup                                    # cria <DATA_DIR>/backups/<timestamp>/
docker compose exec app node scripts/backup.mjs   # no Docker
```

Não trate o volume Docker como backup. Para cópia fora do servidor, copie a pasta `backups/` (ou defina `BACKUP_DIR` para outro disco) e envie para outro local.

**Restaurar em uma instalação nova ou corrompida:**

```bash
docker compose stop app
docker compose exec app node scripts/restore.mjs /app/data/backups/<timestamp>   # ou o caminho do backup copiado
docker compose start app
```

O restore confere o checksum e o `integrity_check` antes de substituir. O estado anterior vai para `<DATA_DIR>/pre-restore-<timestamp>/`.

## Administrar o banco com sqlite-web (opcional)

O serviço `sqlite-web` só sobe sob demanda e fica publicado apenas em `127.0.0.1` do servidor. Não há exposição pública.

```bash
docker compose --profile admin up -d sqlite-web       # inicia
# No seu computador, abra o túnel SSH:
ssh -L 8080:127.0.0.1:8080 usuario@servidor
# Acesse http://localhost:8080
docker compose --profile admin stop sqlite-web        # encerra
```

Ele permite consultar tabelas, executar SQL e editar registros. Evite alterações estruturais enquanto a aplicação estiver em uso. Não use o Drizzle Studio.

## Exportar e importar dados (menu Dados)

O botão discreto **Dados** no cabeçalho (visível só para logados) abre um menu:

- **Exportar .zip:** baixa todas as pastas, fluxos, bizagi_data e SVGs no formato `epo-export` v1. É o mesmo formato gerado pelo botão Exportar da versão Supabase, então esses arquivos também são aceitos.
- **Importar .zip:** **substitui todos os dados.** Antes de gravar, mostra quantas pastas e fluxos o arquivo tem e exige digitar `SUBSTITUIR`. Depois valida o arquivo inteiro (JSON, ids, SVGs), grava em uma transação e só então remove os SVGs antigos. Se algo falhar, nada muda.
- Usuários e sessões **não** são alterados pela importação.
- A rota `POST /api/import` exige sessão, origem igual ao host, o cabeçalho `X-Epo-Confirm: substituir` e no máximo 200 MB.
- SVGs que não passam na validação de upload são ignorados e listados no resumo; o fluxo é criado sem diagrama.

Para guardar a situação atual antes de importar, use **Dados → Exportar .zip**.

## Arquivos persistentes

- SVGs são gravados em `<DATA_DIR>/uploads/<uuid>.svg`, com nome gerado pelo servidor. O nome do arquivo enviado pelo usuário nunca é usado.
- Validação: máximo de 10 MB, deve ser um SVG, e são rejeitados `<script>`, `<iframe>`, `<object>`, handlers `on*`, `javascript:` e entidades externas.
- Os SVGs são servidos com `Content-Security-Policy: default-src 'none'; sandbox` e `nosniff`.
- O JSON do Bizagi fica integralmente na coluna `flows.bizagi_data`, com limite de 20 MB.
- Exclusão de pasta ou fluxo remove os SVGs correspondentes depois do commit no banco.

## Atualizar a aplicação sem perder dados

```bash
git pull
docker compose up -d --build
```

O volume `epo-data` não é removido pelo rebuild. Na inicialização, a imagem roda `scripts/migrate.mjs`, que só aplica migrations pendentes. Antes de atualizar uma versão com migration nova, faça um backup (`npm run backup`).

## Testes

```bash
npm test          # 36 testes: banco, integridade, árvore de pastas, segurança, usuários, backup, migração
npm run lint
npx tsc --noEmit
npm run build
```

Os testes usam diretórios temporários e um servidor HTTP falso para a migração do Supabase. Não acessam nenhum serviço externo.

## Migração do Supabase (temporária)

`scripts/migrate-from-supabase.mts` lê as tabelas `folders` e `flows` pela API REST, baixa e valida os SVGs, e grava no SQLite. Ele é idempotente, tem `--dry-run` com rollback, valida contagens e chaves estrangeiras, e gera um relatório JSON em `<DATA_DIR>/`.

```bash
node --env-file=.env.supabase-migration --import tsx scripts/migrate-from-supabase.mts --dry-run
node --env-file=.env.supabase-migration --import tsx scripts/migrate-from-supabase.mts
```

Usuários não são migrados, porque as senhas do Supabase Auth não podem ser transferidas. Recrie os acessos com `npm run user:create`.

Depois de validada a migração em produção, remova `scripts/migrate-from-supabase.mts`, `tests/migrate-supabase.test.mts`, o `.env.supabase-migration` e a exclusão correspondente em `tsconfig.json`. Veja `RELATORIO_REFATORACAO.md`.

## Solução de problemas

- **Login não funciona em HTTP:** o cookie é `Secure` em produção. Use HTTPS ou defina `COOKIE_SECURE=0` apenas em teste local.
- **`SQLITE_READONLY` ou erro de escrita no volume:** o diretório `/app/data` precisa pertencer ao UID 1001. Em bind mount, rode `chown -R 1001:1001 <pasta>`.
- **Healthcheck falhando:** veja `docker compose logs app`. `GET /api/health` retorna 503 quando o banco não abre.
