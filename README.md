# Capital

Aplicativo web mobile-first de orçamento doméstico por envelopes (categorias com
percentuais definidos pelo usuário), substituindo uma planilha. Renda, gastos, custos
fixos e imprevistos são lançados manualmente; o app calcula quanto ainda pode
ser gasto em cada categoria, descontando o rateio dos custos fixos/imprevistos e
carregando a sobra de um mês para o outro (rollover). Gastos marcados como "feitos no
cartão" entram na fatura do cartão (`cardTotal`), além de contarem no orçamento normal
da categoria em que foram lançados.

PWA instalável, com **login por e-mail e senha**. Os dados ficam num **PostgreSQL próprio no
Orange Pi**, sem serviço de banco na nuvem: o navegador só fala com a API do próprio app, que
grava no banco sempre em nome do usuário logado. Cada conta só enxerga os próprios dados. Sem
conexão o app abre, mas as telas ficam carregando até a rede voltar.

### Módulos (recursos opcionais)

Além do orçamento, o Capital tem recursos extras que **começam desligados** e cada usuário liga
em Configurações → Módulos (`lib/budget/modules.ts`). Quem não liga nada continua vendo o app
de sempre: nada de módulo desligado aparece em tela nenhuma.

- **Categoria "A receber"** — uma compra no cartão feita para outra pessoa, que vai devolver o
  valor. Entra na fatura (`cardTotal` e `reimbursableTotal`) e **não** entra em nenhuma
  categoria, no rateio dos custos fixos nem no gasto do mês.
- **Carteira** (aba própria, `/carteira`):
  - **Gastos recorrentes** — modelos dos gastos de todo mês; "Lançar" abre o formulário de gasto
    já preenchido, com a data de hoje, na competência que você estava vendo.
  - **Parcelados** — vencimentos, parcela, restantes e fim são sempre calculados
    (`lib/budget/installments.ts`). "Parcelada": a parcela vira gasto no cartão quando o mês é
    criado (e já aparece na prévia); "À vista": opcionalmente lança o total de uma vez. Os
    encerrados vão para uma seção recolhida em vez de serem apagados.
  - **Reserva investida** — cotas de um ativo (AUPO11 por padrão) divididas em baldes ligados a
    categorias. Remanejar compra cotas para o balde e lança o gasto na categoria, na mesma
    transação. A cotação vem da brapi.dev (`BRAPI_TOKEN`) e fica em cache.
  - **Caixa** — reserva em conta + reserva investida livre, dívida do cartão do mês aberto e dos
    parcelados (sem contar duas vezes a parcela que já virou gasto), reserva prevista e gap.
- Em construção, já listados na tela: lembretes com notificação, lançar por voz/texto e monitor
  de Gmail. Os dois últimos são só do dono do app (`OWNER_EMAIL`), porque usam o meu hardware e
  as minhas contas.

Conforme os módulos ligam, a barra inferior muda (`lib/nav/items.ts`): entram as abas Lembretes
e Carteira, e Histórico e Configurações passam a morar em **Mais**. A barra nunca passa de cinco
abas.

## Como rodar (desenvolvimento)

Requer Node.js 22+ e acesso a um Postgres: o de desenvolvimento no Orange Pi, pela Tailscale
(veja [deploy/postgres/README.md](deploy/postgres/README.md)).

```bash
npm install

cp .env.example .env.local   # DATABASE_URL (banco capital_dev), BETTER_AUTH_SECRET e BETTER_AUTH_URL

npm run dev      # servidor de desenvolvimento em http://localhost:3000 (aplica as migrações ao subir)
npm run build    # build de produção
npm start        # serve o build de produção

npm test         # testes (Vitest); o repositório roda contra um Postgres em memória (PGlite)
npm run lint     # ESLint
npm run format   # Prettier

npm run db:generate   # gera uma migração SQL em /drizzle a partir de lib/server/db/schema.ts
npm run db:migrate    # aplica as migrações pendentes na DATABASE_URL (o servidor já faz isso ao subir)
```

Sem `SMTP_HOST` no `.env.local`, os e-mails de confirmação de conta e de redefinição de senha não
são enviados: o conteúdo, com o link, aparece no terminal do `npm run dev`.

Ao entrar pela primeira vez, uma conta nova recebe as 4 categorias padrão e as categorias
especiais, sem mês de exemplo. Se o dispositivo tiver dados da versão local anterior, o app
oferece importá-los para a conta.

## Publicar no Orange Pi

No Pi, tudo do Capital fica em `~/capitalapp`:

```text
~/capitalapp/
├── Capital/   este repositório; o app roda em Docker a partir daqui (./update.sh)
├── db/        o banco: cópia de deploy/postgres (docker-compose.yml, .env com as senhas, scripts)
└── data/      arquivos do Postgres e backups
```

1. **Banco** (uma vez): siga [deploy/postgres/README.md](deploy/postgres/README.md). Ele sobe o
   Postgres 17 e o backup diário, e cria a rede Docker `capital-db`.
2. **App:**

   ```bash
   cd ~/capitalapp/Capital
   cp .env.example .env.local
   # DATABASE_URL=postgres://capital:<CAPITAL_DB_PASSWORD de ~/capitalapp/db/.env>@capital-postgres:5432/capital
   # BETTER_AUTH_SECRET=<openssl rand -base64 32>
   # BETTER_AUTH_URL=https://capital.rincon.dev.br
   # APP_ALLOWED_ORIGINS=capital.rincon.dev.br
   # SMTP_* (Gmail com senha de app)
   docker compose --env-file .env.local up -d --build
   ```

   O container `capital` entra na rede `capital-db` e fala com o banco pelo nome
   `capital-postgres`. Ao subir, ele aplica as migrações pendentes (`instrumentation.ts`). A
   imagem é construída na arquitetura da placa (arm64). `APP_ALLOWED_ORIGINS` entra também como
   build arg: **reconstrua** (`up -d --build`) sempre que mudar.

Atualizar depois: `./update.sh` (faz `git pull` + rebuild + restart + limpa imagens órfãs; recusa
rodar se o banco não estiver no ar).

Placas com 1–2 GB de RAM: crie swap antes do primeiro build —
`sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`.

**HTTPS:** o app só funciona por HTTPS de ponta a ponta, por causa do cookie de sessão `Secure` e
da instalação do PWA. Ele é publicado em `https://capital.rincon.dev.br` por um túnel Cloudflare
(container `cloudflared` no Pi) apontando para a porta 3000; `tailscale funnel`/`serve` também
serve. Mantenha a mesma URL: trocar de domínio perde a instalação do PWA no celular.

### Instalar no Android

Abra a URL HTTPS no **Chrome do Android** → menu ⋮ → **Instalar app**. Vira um app standalone
(ícone na gaveta, tela cheia, atualiza sozinho). É o caminho recomendado para beta testers —
sem APK, sem loja.

**APK / Play Store (opcional):** com o PWA no ar, use [PWABuilder](https://www.pwabuilder.com)
ou o Bubblewrap CLI para gerar um TWA (`.apk` para sideload, `.aab` para a Play Store). Para
tirar a barra de endereço, publique `/.well-known/assetlinks.json` com o fingerprint de
assinatura que a ferramenta fornece.

Os ícones em `/public/icon-*.png` são placeholders — troque por arte real antes de publicar
na loja (`node scripts/generate-icons.mjs` regenera os placeholders a partir de um SVG).

## Arquitetura

```
/app                    Rotas (Next.js App Router) e composição de telas
  /api/v1                API do app (Route Handlers): o único caminho até o banco
  /api/auth              Endpoints do Better Auth (destino dos links dos e-mails)
/components
  /screens               Uma tela por arquivo (Dashboard, Categoria, Lançamentos, Histórico, Configurações, Login)
  /month                  Componentes e contexto compartilhados pelas rotas /mes/[month]/*
  /history                Gráficos (Recharts) e o indicador de aderência à meta
  /layout, /ui, /providers, /pwa
/lib
  /budget                 Regras de negócio — funções puras, sem React nem storage
  /nav                    Quais abas a barra inferior mostra, conforme os módulos ligados
  /storage                Contrato BudgetRepository e o repositório do navegador (HTTP)
  /server                 Só no servidor: banco (Drizzle), repositório Postgres, auth, e-mail, API
  /auth                   Server Actions de autenticação (entrar, criar conta, sair, redefinir senha)
  /hooks                  Hooks React que ligam a UI ao repositório (useMonthData, useAllMonths)
/drizzle                  Migrações SQL (geradas por `npm run db:generate`)
/deploy/postgres          Stack Docker do banco no Orange Pi (Postgres + backup)
/scripts                  Migrações manuais e a geração dos ícones do PWA
/proxy.ts                 Portão das rotas: sem cookie de sessão → /login (páginas) ou 401 (API)
/instrumentation.ts       Aplica as migrações quando o servidor sobe
```

### Lógica de negócio pura (`/lib/budget`)

Todas as fórmulas da seção 6 do briefing (proportionalFixed, available, remaining,
usedPct, rollover, validação de percentuais) estão implementadas em módulos puros —
`calculations.ts`, `rollover.ts`, `validation.ts` — que não importam React nem a camada
de storage. Isso os torna triviais de testar (`lib/budget/__tests__`, ver seção
"Testes") e reutilizáveis por qualquer UI ou backend.

`money.ts` cuida de arredondamento (evitando erros de ponto flutuante) e formatação em
`R$ 1.234,56`. `date.ts` cuida da aritmética de meses (`YYYY-MM`), da data de hoje no fuso
local e dos rótulos em português.

### Camada de dados

Toda a UI e toda a lógica de negócio falam **apenas** com a interface `BudgetRepository`
(`lib/storage/repository.ts`):

```ts
interface BudgetRepository {
  getSettings(): Promise<BudgetSettings>;
  saveSettings(settings: BudgetSettings): Promise<void>;
  listMonths(): Promise<Month[]>;
  getMonth(month: Month): Promise<MonthData | undefined>;
  ensureMonth(month: Month): Promise<MonthData>;
  saveIncome(month, income): Promise<void>;
  deleteIncome(month, incomeId): Promise<void>;
  saveExpense(month, expense): Promise<void>;
  deleteExpense(month, expenseId): Promise<void>;
  closeMonth(month, openNext?): Promise<void>;
  reopenMonth(month): Promise<void>;
  exportData(): Promise<BackupPayload>;
  importData(payload): Promise<void>;
  clearAll(): Promise<void>;
}
```

- **No navegador**, a implementação é o **`HttpBudgetRepository`**
  (`lib/storage/httpRepository.ts`). Cada método é uma chamada à API do próprio app
  (`/api/v1/...`, mesma origem, cookie de sessão).
- **No servidor**, os Route Handlers validam a entrada (Zod), exigem sessão e usam o
  **`PostgresBudgetRepository`** (`lib/server/budgetRepository.ts`), sempre com o id do usuário
  logado. É aí que se garante o isolamento entre contas.
- **No banco**, cada mês é uma linha em `months` mais os lançamentos em `incomes` e `expenses`.
  O repositório remonta o mesmo `MonthData` de sempre, então `computeMonthSummary`,
  `createMonthData` e `cascadeCarryIn` são reaproveitados sem alteração.
- **Nas escritas**, cada gravação num mês roda numa transação com trava por usuário
  (`pg_advisory_xact_lock`) e recalcula em cascata o `carryIn` dos meses seguintes; o mesmo vale
  ao reabrir ou apagar um mês.
- **Fechar o mês** (`closeMonth(month, true)`) congela a competência e abre a seguinte na mesma
  transação, já com a sobra de cada categoria como `carryIn`. A tela mostra essa prévia antes de
  confirmar e leva você para o mês novo.

**`IndexedDbBudgetRepository`** (Dexie.js) continua no código, mas só para a importação única
dos dados locais da versão v1 (`lib/storage/localMigration.ts`), oferecida por um banner e na
tela de Configurações.

### Autenticação

- **Login:** e-mail e senha com **Better Auth** (`lib/server/auth.ts`). As sessões ficam no
  próprio Postgres, com confirmação de e-mail e redefinição de senha; os e-mails saem pelo SMTP do
  Gmail (`lib/server/mailer.ts`).
- **Rotas:** as telas ficam no route group `app/(app)/`, que é protegido. `/login`, `/auth/*` e
  `/redefinir-senha` ficam fora.
- **Checagem da sessão:** `proxy.ts` (o antigo `middleware.ts`, renomeado no Next.js 16) só
  confere se existe cookie de sessão. O layout autenticado e cada rota da API validam a sessão
  de fato.
- **Operações de login:** são Server Actions (`lib/auth/actions.ts`), com limite de tentativas.

### Preferências leves (`lib/storage/preferences.ts`)

Apenas tema (claro/escuro/sistema) e o último mês visualizado usam `localStorage`,
conforme pedido — nunca dados financeiros.

## PWA e offline

- `public/manifest.json` — instalável, ícones 192/512 (`any` e `maskable`).
- `public/sw.js` — service worker escrito à mão, registrado por
  `components/pwa/RegisterServiceWorker.tsx` apenas em produção.
  - Estratégias de cache: cache-first para os assets do Next com hash no nome, network-first com
    fallback para navegação e stale-while-revalidate para o restante.
  - Mantém o _app shell_ disponível offline.
  - As chamadas à API (`/api/*`) vão sempre direto à rede e nunca passam pelo cache, então nenhum
    dado velho é servido.
  - Sem rede, o app abre mas fica em "Carregando…". Um cache write-through no IndexedDB com
    sincronização é o próximo passo natural, ainda não implementado.
- `public/offline.html` — página de fallback quando uma rota nunca visitada é aberta
  sem rede.

> Nota: os ícones em `/public/icon-*.png` foram gerados por
> `scripts/generate-icons.mjs` como placeholder de marca (`node scripts/generate-icons.mjs`
> para regenerar). Troque por assets de marca reais antes de publicar.

## Testes

`npm test` roda os cenários de aceitação da seção 9 do briefing como testes unitários de
`/lib/budget` (Vitest): mês isolado sem rollover, rollover positivo/negativo, fechamento e
carga do mês seguinte, gasto no cartão (`cardTotal`), validação de soma de percentuais e o
estado `available <= 0`.

Os demais testes:
- **`lib/budget/__tests__/wallet-fixtures.test.ts`:** as fixtures de parcelados, reserva e caixa
  da mesma planilha (dívida dos parcelados −3.093,20, gap da reserva 3.195,80).
- **`lib/server/__tests__/walletRepository.test.ts`:** a Carteira contra o banco (PGlite):
  parcelas nos meses abertos e na prévia, nunca em mês fechado nem duplicadas, exclusão de
  plano, remanejar, caixa.
- **`lib/budget/__tests__/fixtures.test.ts`:** as fixtures reais da planilha em 15/09/2026
  (§9 da spec do assistente), com tolerância de R$ 0,01 — a planilha não arredonda entre as
  etapas e o Capital arredonda cada uma. Inclui as regras da categoria "A receber".
- **`lib/server/__tests__/budgetRepository.test.ts`:** cobre o repositório Postgres contra o
  schema e as migrações reais, num Postgres em memória (PGlite). Casos: seed, cascata de
  rollover, mês fechado/inexistente, fechar abrindo o mês seguinte, apagar mês, export→import,
  módulos por usuário, isolamento entre contas e escritas simultâneas.
- **Componentes** (`components/**/__tests__`, Testing Library): o formulário de gasto com a
  categoria "A receber" e a prévia do "Fechar mês".
- **Repositório HTTP** (`lib/storage/__tests__`) e a **barra de navegação** por módulos
  (`lib/nav/__tests__`).
- O **limitador de tentativas** de login.

## Checklist de aderência

### Fórmulas (seção 6)

- [x] `proportionalFixed(t) = (fixedTotal + unforeseenTotal) * pct(t)`
- [x] `available(t) = incomeTotal * pct(t) - proportionalFixed(t) + carryIn(t)`
- [x] `remaining(t) = available(t) - spent(t)`
- [x] `usedPct(t) = spent(t) / available(t)`, mostrando "—" e estado de alerta quando `available(t) <= 0`
- [x] Rollover: `carryIn` do mês N = `remaining` do mês N-1 (inclusive negativo)
- [x] Fechar mês congela os números; reabrir recalcula em cascata os meses seguintes
- [x] `topicsSnapshot` guarda o `pct` vigente em cada mês (config posterior não altera meses passados)
- [x] Validação: soma dos `targetPct` ativos deve ser 100%, com indicação do quanto falta/sobra

### Telas (seção 7)

- [x] **Dashboard do mês** — seletor de mês, cabeçalho com renda/gasto/posso-gastar/saldo, card por categoria com barra de progresso (verde/amarelo/vermelho), card de custos fixos/imprevistos com rateio por categoria, FAB "+ Lançar gasto" e botão "+ Renda"
- [x] **Detalhe da categoria** — lista de gastos editável/excluível e a conta completa (`renda × pct − rateio + mês passado = posso gastar`)
- [x] **Lançamentos do mês** — abas Gastos / Renda / Custos Fixos / Imprevistos, busca e edição/exclusão inline
- [x] **Histórico & Gráficos** — tabela mês a mês, evolução do gasto por categoria (linhas), composição do gasto por mês (barras empilhadas), sobra acumulada/rollover (linhas) e indicador de aderência à meta
- [x] **Configurações** — editor de categorias (nome/%/ordem/arquivar) com validador de 100%, categorias especiais renomeáveis, exportar/importar JSON, apagar tudo, tema claro/escuro, conta (e-mail + sair), importar dados locais
- [x] **Login** — entrar / criar conta / esqueci a senha, com confirmação de e-mail

### Requisitos não-funcionais (seção 8)

- [x] Alvos de toque ≥ 44px; campo de valor com teclado numérico (`inputMode="decimal"`)
- [~] Dados no Postgres próprio do Orange Pi, isolados por usuário na API; o app precisa de conexão para ler/gravar (cache offline é trabalho futuro)
- [x] Lançar um gasto em ≤ 3 toques (categoria → descrição opcional → salvar) além do valor
- [x] Labels em todos os inputs, navegação por teclado, contraste AA nas cores de status

### Fora do escopo v1, preparado no schema (seção 11)

- [x] `Expense.installmentPlan?: InstallmentPlan` reservado para cartão parcelado — não usado por nenhum cálculo nem tela da v1
- [x] `BudgetRepository` não assume um único usuário nem armazenamento local — a troca do Supabase pelo Postgres próprio mudou só a instância em `lib/storage/index.ts`
