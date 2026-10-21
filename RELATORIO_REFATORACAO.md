# Relatório da refatoração: EPO sobre SQLite + Drizzle + Docker/Coolify

## 1. Resumo executivo

O EPO não depende mais do Supabase. A aplicação roda com SQLite (WAL, foreign keys), Drizzle ORM, autenticação própria com Argon2id, e uma imagem Docker de um único container com migrations automáticas e volume persistente.

Validado nesta sessão:

- Build de produção, type-check e 36 testes automatizados passam.
- A imagem Docker foi construída. Com `docker compose up`, o container ficou `healthy`, aplicou migrations, respondeu `/api/health`, roda como usuário não-root `nextjs` e persiste dados após restart.
- No navegador: login, redirecionamento de rotas protegidas, logout disponível e criação de pasta.
- Backup dentro do container, sqlite-web acessível só em `127.0.0.1`.
- Migração do Supabase em dry-run e em execução real **num diretório de dados separado**, com contagens batendo, zero violações de FK e idempotência verificada.

**Não foi feito:** a migração real para o volume de produção, o deploy no Coolify, e o teste de importação de fluxo Bizagi, desenho e exclusão de fluxos pela interface. Detalhes na seção 13.

Nada foi commitado.

## 2. Arquitetura anterior

- Next.js 16 com `@supabase/supabase-js` chamado diretamente do navegador (`lib/supabase.ts`, `lib/queries.ts`, `lib/mutations.ts`, `lib/auth.tsx`, login).
- Supabase Auth para sessão (`signInWithPassword`).
- Supabase Storage (bucket `flow-assets`) para SVGs, referenciados por URL pública em `flows.svg_url`.
- Tabelas `folders` e `flows`. O schema não estava no repositório; foi inferido do código.
- Escritas protegidas só por checagem de sessão no cliente. A segurança real dependia das políticas RLS do Supabase, que não estavam versionadas.

## 3. Arquitetura implementada

| Camada | Implementação |
|---|---|
| Banco | SQLite em `DATA_DIR/epo.sqlite`, WAL, `foreign_keys=ON`, `busy_timeout`, `synchronous=NORMAL` (`lib/db/index.ts`) |
| Schema | `lib/db/schema.ts`: `folders`, `flows`, `users`, `sessions`. FKs com cascade, índices, slug único |
| Migrations | `drizzle/0000_init.sql` gerada pelo drizzle-kit. Aplicadas por `scripts/migrate.mjs`, idempotente |
| Leituras | `lib/queries.ts` (`"use server"`), públicas como antes |
| Escritas | `lib/mutations.ts` (`"use server"`): `requireUser()` em cada função, validação, transações |
| Regras de banco | `lib/server/repo.ts`: árvore recursiva, bloqueio de ciclos, cascade, slug único |
| Sessão | `lib/server/session.ts`: token de 32 bytes aleatórios, no banco só o SHA-256; cookie `HttpOnly`, `SameSite=Lax`, `Secure` em produção; expiração de 12 h; sessão anterior descartada no login |
| Senha | `lib/server/password.ts`: Argon2id (m=19 MiB, t=2, p=1, padrão OWASP) |
| Login | `lib/actions/auth.ts`: Server Action, resposta genérica, hash de referência para não revelar contas existentes, rate limit |
| Uploads | `lib/server/uploads.ts`: nome gerado pelo servidor (UUID), escrita atômica, verificação de caminho, remoção após commit |
| SVG | `lib/server/svg.ts`: rejeita script, iframe, object, handlers `on*`, `javascript:`, entidades externas; tamanho máximo 10 MB |
| Servir SVG | `app/api/uploads/[name]/route.ts`: `CSP: default-src 'none'; sandbox`, `nosniff`, cache imutável |
| Descrição Bizagi | `lib/sanitize-html.ts`: sanitização no cliente (DOMParser) antes do `dangerouslySetInnerHTML` |
| Portal | `app/(portal)/page.tsx` verifica sessão no servidor; UI em `components/portal/PortalHome.tsx` |
| Layout | `app/layout.tsx` resolve a sessão no servidor e passa `initialUser` ao `AuthProvider` |
| Healthcheck | `app/api/health/route.ts`: `SELECT 1` no SQLite, 503 se falhar |
| Container | `Dockerfile` multi-stage (node:22-bookworm-slim), `output: "standalone"`, usuário 1001, `docker-entrypoint.sh` aplica migrations antes do `server.js` |
| Compose | `docker-compose.yml` (produção/Coolify, sem porta no host, volume `epo-data`, serviço `sqlite-web` em profile `admin`), `docker-compose.local.yml` (publica 3000) |

## 4. Arquivos alterados e criados

**Alterados:** `app/(portal)/page.tsx`, `app/layout.tsx`, `app/login/page.tsx`, `components/FlowViewer.tsx` (sanitização), `components/ImportFlowDialog.tsx` (envia SVG como texto), `lib/auth.tsx`, `lib/mutations.ts`, `lib/queries.ts`, `next.config.ts`, `package.json`, `package-lock.json`, `tsconfig.json` (exclui `tests` e o script temporário), `README.md`.

**Removidos:** `lib/supabase.ts`.

**Criados:** `Dockerfile`, `docker-entrypoint.sh`, `docker-compose.yml`, `docker-compose.local.yml`, `.dockerignore`, `.gitattributes` (LF para `*.sh`), `.env.example`, `drizzle.config.ts`, `drizzle/`, `lib/db/`, `lib/server/` (config, password, session, rate-limit, svg, uploads, repo), `lib/actions/auth.ts`, `lib/sanitize-html.ts`, `components/portal/PortalHome.tsx`, `app/api/uploads/[name]/route.ts`, `app/api/health/route.ts`, `scripts/` (migrate, users, backup, restore, `lib/paths.mjs`, `lib/cli.mjs`, e a migração temporária), `tests/` (7 arquivos), `RELATORIO_REFATORACAO.md`.

## 5. Dependências

- **Adicionadas:** `better-sqlite3`, `drizzle-orm`, `@node-rs/argon2`.
- **Adicionadas em dev:** `drizzle-kit`, `@types/better-sqlite3`.
- **Removida:** `@supabase/supabase-js`.
- `engines.node` definido como `>=22`.

Escolhas: `better-sqlite3` instalou sem problemas no host (Node 26) e precisou de toolchain (`python3 make g++`) no build Docker, que ficou só no estágio de build. `@node-rs/argon2` tem binário pré-compilado.

## 6. Autenticação

- Login por e-mail e senha, validado no servidor. Sem cadastro público, sem tela administrativa de contas.
- Criação de usuários: `npm run user:create` (senha sem eco, duas confirmações, ou `--password-stdin`). Senha mínima de 12 caracteres.
- Redefinição: `npm run user:reset-password`, que encerra todas as sessões do usuário.
- Sessões: token aleatório, hash no banco, cookie `HttpOnly` e `Secure` em produção, expiração absoluta de 12 h, novo token a cada login (proteção contra session fixation), logout apaga a sessão no banco.
- Rate limit: 5 falhas por IP ou por e-mail em 15 min bloqueiam novas tentativas.
- Autorização: toda Server Action de escrita chama `requireUser()`. Chamada direta à action sem cookie é recusada.
- Testado: hash, verificação, rate limit, usuário criado no container, duplicado recusado, senha curta recusada, redirecionamento sem sessão (307 para `/login`), login real no navegador.

## 7. Estratégia de migração de dados

**Script:** `scripts/migrate-from-supabase.mts`. Lê `folders` e `flows` pela API REST com `fetch` (sem o SDK), paginando. Não registra credenciais.

Características:

- Preserva UUIDs, slugs, hierarquia de pastas (inserção pais primeiro), `created_at` e o JSON do Bizagi.
- Baixa os SVGs remotos, valida com a mesma regra da aplicação e grava em `uploads/`. SVG inválido ou ausente vira `svg_url = NULL` e entra no relatório.
- Idempotente: registros existentes são ignorados e SVGs de fluxos existentes não são baixados de novo.
- `--dry-run`: executa tudo dentro de uma transação e faz rollback.
- Valida antes do commit: contagens de origem e destino, `PRAGMA foreign_key_check`, fluxos sem pasta. Se algo falhar, nada é gravado e os arquivos já escritos são removidos.
- Relatório JSON em `DATA_DIR/migration-report-<timestamp>.json`, com contagens, falhas de SVG, problemas e validação.

**Usuários não são migrados.** Senhas do Supabase Auth não podem ser transferidas. Os acessos precisam ser recriados com `npm run user:create`.

**Execução e resultados:**

| Execução | Destino | Resultado |
|---|---|---|
| Dry-run contra o Supabase real | diretório temporário do scratchpad | origem: 8 pastas e 5 fluxos; 5 SVGs baixados e validados; 0 falhas; contagens batem; 0 violações FK; 0 linhas gravadas após rollback |
| Execução real, 1ª vez | diretório temporário separado | 8 pastas e 5 fluxos gravados; 5 SVGs locais; `integrity_check` ok; FK ok |
| Execução real, 2ª vez | mesmo diretório | 0 inseridos, 8 pastas e 5 fluxos ignorados, 0 SVGs baixados |

Na primeira versão, a segunda execução baixava e gravava os SVGs de novo, deixando 5 arquivos órfãos. Corrigido e coberto por teste.

**Não executado:** a migração no volume de produção. Ela deve rodar contra o volume do Coolify, o que exige decisão sua (ver seção 13).

## 8. Estado da migração

- **Dados:** validados em execução com dados reais, em diretório separado. **Pendente** no ambiente de produção.
- **Usuários:** não migrados por design. Pendente recriar acessos.
- **Código temporário:** ainda presente, por decisão (não remover antes da validação em produção).

## 9. Estratégia de persistência

- Volume nomeado `epo-data` montado em `/app/data`. Contém `epo.sqlite` (com `-wal` e `-shm`), `uploads/` e `backups/`.
- Sobrevive a rebuild e a restart. Testado: após `docker compose restart`, a pasta e o usuário continuaram lá e o banco segue em WAL.
- O container não contém dados. O diretório `/app/data` pertence a `nextjs` (UID 1001).
- Migrations rodam antes de o servidor abrir a porta. Não recriam o banco. Teste de idempotência: rodar de novo não apaga nem duplica.
- Backups: `VACUUM INTO` (consistente com WAL, pode rodar com a app ativa), cópia dos SVGs, `manifest.json` com checksum, contagens e retenção configurável.
- Restore: verifica checksum e `integrity_check`, guarda o estado atual em `pre-restore-*`, substitui o banco e os uploads.

## 10. Configuração Docker e Coolify

- Imagem multi-stage: estágio `build` com `npm ci`, `npm run build` e `npm prune --omit=dev`; estágio `runner` com `.next/standalone`, `public`, dependências de produção, `drizzle/`, `scripts/` e o entrypoint.
- Usuário `nextjs` (1001), sem `root` em execução.
- Healthcheck: `GET /api/health`, intervalo de 30 s.
- `VOLUME ["/app/data"]` declarado.
- Compose de produção sem porta publicada (`expose: 3000`), pensado para o proxy do Coolify.
- Variáveis: nenhuma obrigatória. `DATA_DIR` já vem definido.
- sqlite-web: `coleifer/sqlite-web`, profile `admin`, `user: 1001:1001` (para não criar WAL com dono root), publicado em `127.0.0.1:8080`.

**Testado:** `docker compose config`, `docker build`, `docker compose up` (healthy), healthcheck, usuário não-root, restart com persistência, sqlite-web respondendo em 127.0.0.1, backup dentro do container.

**Não testado:** deploy real no Coolify (depende do servidor e do domínio).

## 11. Testes executados e resultados

| Comando | Resultado |
|---|---|
| `npm test` | **36/36 passam** |
| `npx tsc --noEmit` | sem erros |
| `npm run build` | sucesso. Aviso do Turbopack: "Encountered unexpected file in NFT list" referente a `next.config.ts` (não resolvido, sem efeito funcional observado) |
| `npm run lint` | **falha**: 2 erros e 1 aviso, todos em código que já existia (ver seção 13) |
| `docker build` | sucesso |
| `docker compose up` + health | `healthy`, `{"status":"ok"}` |
| Migration no container | aplicada na inicialização |
| CLI de usuário no container | criação, duplicado recusado, senha curta recusada |
| Navegador: login | sucesso, redirecionado ao portal, usuário exibido |
| Navegador: criar pasta | sucesso, persistiu após restart |
| Sem sessão em `/` | 307 para `/login` |
| `/api/uploads/..%2F..%2F...` | 404 |
| Headers | `X-Content-Type-Options: nosniff`, `Referrer-Policy` presentes |
| Backup no container | gerado, manifest com contagens |

Cobertura dos testes automatizados (`tests/`):

- **db.test.mts:** tabelas, idempotência de migrations com dados preservados, WAL, FK bloqueia fluxo sem pasta, cascade, slug único.
- **repo.test.mts:** bloqueio de mover pasta para si mesma e para subpasta (ciclo), mover entre árvores e para raiz, destino inexistente, SVGs retornados na exclusão em cascata, slug com sufixo, JSON com acentos, UUIDs.
- **security.test.mts:** SVG limpo aceito; script, handlers, iframe, `javascript:`, entidade externa e arquivo não-SVG rejeitados; path traversal bloqueado; upload gravado e removível; Argon2id; rate limit.
- **users.test.mts:** e-mail normalizado, hash Argon2id, duplicado recusado, reset encerra sessões, usuário inexistente.
- **backup.test.mts:** backup com manifest e uploads, restore recupera e guarda o estado anterior, checksum adulterado recusado, retenção.
- **migrate-supabase.test.mts:** dry-run sem gravar, hierarquia e JSON preservados, SVG válido baixado, SVG perigoso e ausente registrados no relatório, re-execução idempotente sem órfãos. Usa servidor HTTP falso.

## 12. Problemas corrigidos

Durante a implementação:

- `moveFolder` permitia mover uma pasta para dentro de uma subpasta sua, o que orfanaria a subárvore. Agora bloqueado no servidor.
- Breadcrumb podia entrar em loop com dados corrompidos. Agora há guarda de visitados.
- Descrições do Bizagi eram renderizadas com `dangerouslySetInnerHTML` sem sanitização. Agora sanitizadas no cliente.
- SVG remoto: a aplicação aceitava qualquer conteúdo. Agora validado no upload e na migração.
- Escrita de SVG: agora atômica, e removida se o INSERT falhar.
- Exclusão de pasta/fluxo: arquivos removidos depois do commit.
- Login por Supabase no cliente (credenciais de sessão no navegador) substituído por cookie HttpOnly.
- Migração: segunda execução gerava SVGs órfãos. Corrigido.
- Migração: bug de interop ESM/CJS em `scripts/` que fazia a validação de SVG falhar silenciosamente (aparecia só como "SVG inválido" no relatório). Corrigido com import padrão e coberto por teste.
- Migração: a checagem de `process.argv` no import impedia testar o modo dry-run. Agora é opção da função.
- `scripts/lib/paths.mjs`: raiz do projeto apontava para `scripts/`, quebrando o caminho das migrations. Corrigido e coberto por teste.

## 13. Problemas ainda existentes

- **`npm run lint` não passa.** 2 erros em `components/portal/PortalHome.tsx` (`react-hooks/set-state-in-effect`) e 1 aviso `@next/next/no-img-element` em `app/login/page.tsx`. Os erros vêm do `page.tsx` original, copiado sem mudança de lógica. Restam ainda avisos de `any` e variáveis não usadas em componentes que não foram tocados.
- `components/portal/FolderList.tsx` não é importado em lugar nenhum (código morto anterior, não removido).
- Fallback de imagem `/${nome}` em `FlowViewer` aponta para `public/`, onde não há SVGs. Comportamento anterior mantido.
- Leituras públicas (portal, `/fluxo`, `/embed`, `/api/uploads`) foram mantidas como no original. Quem tiver a URL lê os fluxos.
- Pendências de teste manual, não executadas: importação de um fluxo Bizagi pela interface, renderização de diagrama e de embed no navegador, movimentação e exclusão pela interface, logout pela interface, limite de tentativas pela interface.
- Sanitização de descrição HTML é uma lista de bloqueio no cliente, sem teste de unidade (o DOMParser não existe no runner Node). Coberta só por build.
- `output: "standalone"` gera aviso NFT (ver seção 11).

## 14. Riscos e limitações

- **Instância única.** SQLite tem um escritor por vez. O rate limit fica em memória, então reinicia com o processo. Não escala horizontalmente sem mudanças.
- **Sessão sem renovação.** Expira em 12 h a partir do login, sem sliding expiration.
- **Proteção CSRF** depende das verificações de origem embutidas nas Server Actions do Next. Não há token próprio.
- **IP para rate limit** vem de `X-Forwarded-For`. Atrás de proxy confiável é adequado. Sem proxy, o cliente pode forjar o cabeçalho e contornar o limite por IP (o limite por e-mail continua valendo).
- **Migrações concorrentes:** a imagem as roda a cada start. Com uma instância, não há corrida. Com mais de uma réplica, seria preciso um passo separado.
- **Backups** no mesmo volume não são backup. Use `BACKUP_DIR` para outro disco e copie para fora do servidor.
- **sqlite-web** não tem autenticação própria (a opção `-P` pede senha interativa, incompatível com compose). A proteção é o binding em `127.0.0.1` e o túnel SSH.
- **Credenciais do Supabase** estão em `.env.supabase-migration` (gitignored, permissões 600). Remova após a migração de produção. A chave é a `anon`, mas convém rotacionar se houver dúvida.

## 15. Passos manuais restantes

1. **Decidir sobre a migração de produção.** Ela pode ser feita a partir do servidor/Coolify com o `.env.supabase-migration` ou as variáveis `SUPABASE_URL` e `SUPABASE_ANON_KEY`. Sugestão: rodar `--dry-run` primeiro, depois a execução real, e guardar o relatório.
2. **Criar os usuários** no servidor: `node scripts/users.mjs create <email>` pelo terminal do container no Coolify.
3. **Deploy no Coolify:** recurso Docker Compose, domínio no serviço `app` porta 3000, sem variáveis obrigatórias. Depois, backup e teste de login.
4. **Remover o código temporário** após validar a migração em produção:
   - `scripts/migrate-from-supabase.mts`
   - `tests/migrate-supabase.test.mts`
   - `.env.supabase-migration`
   - a exclusão `scripts/migrate-from-supabase.mts` em `tsconfig.json`
   - a seção de migração no README
5. **Limpar dados de teste** no ambiente local: o volume `epo_epo-data` contém um usuário `admin@teste.gov.br` e a pasta "Pasta de Teste". `docker compose down -v` remove o volume inteiro. Faça isso antes de usar o volume em produção.
6. **Diretório indevido em `C:\c\`:** um erro meu de caminho criou `C:\c\Users\...` contendo apenas diretórios vazios e um relatório de dry-run. Não consegui remover pela checagem de segurança do ambiente. Apague manualmente a pasta `C:\c`.
7. **Commit:** nada foi commitado. Revise as alterações e faça o commit quando quiser.
8. **Testes manuais** da seção 13.
9. **Lint:** corrigir os erros de `PortalHome` (ex.: mover a carga inicial para um Server Component ou usar `useEffect` sem setState síncrono) quando for o momento.
