# Capital

Aplicativo web mobile-first de orçamento doméstico por envelopes (categorias com
percentuais definidos pelo usuário), substituindo uma planilha. Renda, gastos, custos
fixos, imprevistos e ressarcidos são lançados manualmente; o app calcula quanto ainda pode
ser gasto em cada categoria, descontando o rateio dos custos fixos/imprevistos e
carregando a sobra de um mês para o outro (rollover). Gastos "Ressarcido" (feitos no
cartão para alguém te devolver depois) entram na fatura do cartão, mas não afetam o
orçamento de nenhuma categoria.

PWA instalável, com **login por e-mail e senha**. Os dados ficam em um projeto
**Supabase** (Postgres na nuvem), isolados por usuário via Row Level Security — cada conta só
enxerga os próprios dados, acessíveis de qualquer dispositivo. Sem conexão o app abre, mas as
telas ficam carregando até a rede voltar.

## Como rodar

Requer Node.js 22+ e um projeto Supabase.

```bash
npm install

cp .env.example .env.local   # preencha com Project URL + publishable key (Supabase -> Project Settings -> API)

npm run dev      # servidor de desenvolvimento em http://localhost:3000
npm run build    # build de produção (gera o service worker em public/sw.js)
npm start        # serve o build de produção

npm test         # testes de /lib/budget e /lib/storage (Vitest)
npm run lint     # ESLint
npm run format   # Prettier
```

### Configuração do Supabase (uma vez)

1. Aplique `supabase/migrations/20260910120000_capital_cloud.sql` (SQL Editor ou `supabase db push`).
2. **Authentication → Providers → Email**: mantenha "Confirm email" ligado.
3. **Authentication → URL Configuration**: defina a Site URL e as Redirect URLs
   (`http://localhost:3000/**` em dev; a URL de produção depois).
4. **Authentication → Email Templates** ("Confirm signup" e "Reset password"): aponte o link para
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}&next=/`.

Ao abrir o app pela primeira vez, uma conta nova recebe as 4 categorias padrão e as categorias
especiais — sem mês de exemplo. Se o dispositivo tiver dados da versão local anterior, o app
oferece importá-los para a conta.

## Publicar (e instalar no Android)

O app é um servidor Next.js (proxy, Route Handlers, Server Actions) — precisa de um host Node,
não dá para exportar como site estático.

1. **Deploy** (ex.: Vercel — detecta Next.js sozinho, plano free serve): conecte o repositório e
   defina as env vars `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   (o `.env.local` não é versionado). `npm run build` é o comando padrão.
2. **Supabase → Authentication → URL Configuration**: adicione a URL de produção em Site URL e
   em Redirect URLs (`https://SEU-APP.vercel.app/**`), mantendo a de dev.
3. **Instalar como PWA**: abra a URL no Chrome do Android → menu → **Instalar app**. Vira um app
   standalone (ícone na gaveta, tela cheia, atualiza sozinho a cada deploy). É o caminho
   recomendado para beta testers — sem APK, sem loja.
4. **APK / Play Store (opcional)**: com o PWA no ar, use [PWABuilder](https://www.pwabuilder.com)
   ou o Bubblewrap CLI para gerar um TWA (`.apk` para sideload, `.aab` para a Play Store).
   Para remover a barra de endereço do navegador, publique
   `/.well-known/assetlinks.json` com o fingerprint de assinatura que a ferramenta fornece.

Os ícones em `/public/icon-*.png` são placeholders — troque por arte real antes de publicar
na loja (`node scripts/generate-icons.mjs` regenera os placeholders a partir de um SVG).

## Arquitetura

```
/app                    Rotas (Next.js App Router) e composição de telas
/components
  /screens               Uma tela por arquivo (Dashboard, Categoria, Lançamentos, Histórico, Configurações)
  /month                  Componentes e contexto compartilhados pelas rotas /mes/[month]/*
  /history                Gráficos (Recharts) e o indicador de aderência à meta
  /layout, /ui, /providers, /pwa
/lib
  /budget                 Regras de negócio — funções puras, sem React nem storage
  /storage                Camada de persistência, isolada atrás de uma interface
  /supabase               Clients Supabase (browser / server / proxy) e tipos do schema
  /auth                   Server Actions de autenticação (entrar, criar conta, sair, reset)
  /hooks                  Hooks React que ligam a UI ao repositório (useMonthData, useAllMonths)
/proxy.ts                 Refresh de sessão + redirecionamento de rotas (o antigo middleware)
/supabase/migrations      Schema SQL (tabelas, RLS, triggers)
```

### Lógica de negócio pura (`/lib/budget`)

Todas as fórmulas da seção 6 do briefing (proportionalFixed, available, remaining,
usedPct, rollover, validação de percentuais) estão implementadas em módulos puros —
`calculations.ts`, `rollover.ts`, `validation.ts` — que não importam React nem a camada
de storage. Isso os torna triviais de testar (`lib/budget/__tests__`, ver seção
"Testes") e reutilizáveis por qualquer UI ou backend futuro.

`money.ts` cuida de arredondamento (evitando erros de ponto flutuante) e formatação em
`R$ 1.234,56`. `date.ts` cuida da aritmética de meses (`YYYY-MM`) e rótulos em
português.

### Camada de dados isolada (`/lib/storage`)

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
  closeMonth(month): Promise<void>;
  reopenMonth(month): Promise<void>;
  exportData(): Promise<BackupPayload>;
  importData(payload): Promise<void>;
  clearAll(): Promise<void>;
}
```

A implementação ativa é **`SupabaseBudgetRepository`** (`lib/storage/supabaseRepository.ts`),
que fala com o Postgres do Supabase direto do navegador — o acesso às linhas é garantido
por RLS (`auth.uid() = user_id`), não por uma camada de API. Cada mês vira uma linha na
tabela `months` com o `MonthData` gravado como está (colunas `jsonb`), então
`computeMonthSummary`, `createMonthData` e `cascadeCarryIn` são reaproveitados sem
alteração. Toda escrita em um mês recalcula em cascata o `carryIn` dos meses seguintes
(`recascade`, usado também ao reabrir um mês fechado). As categorias padrão são semeadas
na primeira leitura de `getSettings()`.

**`IndexedDbBudgetRepository`** (Dexie.js) continua no código, mas só para a migração única
dos dados locais da versão anterior: `lib/storage/localMigration.ts` faz
`exportData()` local → `importData()` na nuvem (via `BackupPayload`, mesmo formato do
backup manual), oferecida por um banner e na tela de Configurações.

A troca de implementação é o único ponto de acoplamento: `lib/storage/index.ts` exporta
`export const budgetRepository: BudgetRepository = new SupabaseBudgetRepository()`. Nenhuma
tela nem regra de negócio conhece o Supabase.

### Autenticação

Login por e-mail e senha via Supabase Auth (`@supabase/ssr`), com confirmação de e-mail.
As telas ficam no route group `app/(app)/` (protegido); `/login` e `/auth/*` ficam fora.
`proxy.ts` (o antigo `middleware.ts`, renomeado no Next.js 16) atualiza o cookie de sessão
a cada request e redireciona quem não está logado para `/login`. As operações de auth são
Server Actions (`lib/auth/actions.ts`); os dados do orçamento passam pelo repositório no
cliente + RLS.

### Preferências leves (`lib/storage/preferences.ts`)

Apenas tema (claro/escuro/sistema) e o último mês visualizado usam `localStorage`,
conforme pedido — nunca dados financeiros.

## PWA e offline

- `public/manifest.json` — instalável, ícones 192/512 (`any` e `maskable`).
- `public/sw.js` — service worker escrito à mão (cache-first para assets do Next
  content-hashed, network-first com fallback para navegação, stale-while-revalidate
  para o restante), registrado por `components/pwa/RegisterServiceWorker.tsx` apenas em
  produção. Mantém o _app shell_ disponível offline; as chamadas ao Supabase são
  cross-origin e passam direto, então nenhum dado velho é servido. Sem rede o app abre mas
  fica em "Carregando…" — um cache write-through no IndexedDB com sincronização é o próximo
  passo natural, ainda não implementado.
- `public/offline.html` — página de fallback quando uma rota nunca visitada é aberta
  sem rede.

> Nota: os ícones em `/public/icon-*.png` foram gerados por
> `scripts/generate-icons.mjs` como placeholder de marca (`node scripts/generate-icons.mjs`
> para regenerar). Troque por assets de marca reais antes de publicar.

## Testes

`npm test` roda os cenários de aceitação da seção 9 do briefing como testes unitários
de `/lib/budget` (Vitest): mês isolado sem rollover, rollover positivo/negativo,
fechamento e carga do mês seguinte, Ressarcido (neutro para o orçamento, somado à
fatura do cartão), validação de soma de percentuais e o estado `available <= 0`.
`lib/storage/__tests__/supabaseRepository.test.ts` cobre a orquestração do repositório
de nuvem (seed, cascata de rollover, mês fechado/inexistente, export→import) com um
client Supabase falso em memória.

## Checklist de aderência

### Fórmulas (seção 6)

- [x] `proportionalFixed(t) = (fixedTotal + unforeseenTotal) * pct(t)`
- [x] `available(t) = incomeTotal * pct(t) - proportionalFixed(t) + carryIn(t)`
- [x] `remaining(t) = available(t) - spent(t)`
- [x] `usedPct(t) = spent(t) / available(t)`, mostrando "—" e estado de alerta quando `available(t) <= 0`
- [x] Ressarcidos (`reimbursed`): gasto no cartão que alguém devolve — entram em `cardTotal` (fatura) e são invisíveis para `spent(t)`, `available(t)`, `balance` e `expenseTotal`
- [x] Rollover: `carryIn` do mês N = `remaining` do mês N-1 (inclusive negativo)
- [x] Fechar mês congela os números; reabrir recalcula em cascata os meses seguintes
- [x] `topicsSnapshot` guarda o `pct` vigente em cada mês (config posterior não altera meses passados)
- [x] Validação: soma dos `targetPct` ativos deve ser 100%, com indicação do quanto falta/sobra

### Telas (seção 7)

- [x] **Dashboard do mês** — seletor de mês, cabeçalho com renda/gasto/posso-gastar/saldo, card por categoria com barra de progresso (verde/amarelo/vermelho), card de custos fixos/imprevistos com rateio por categoria, FAB "+ Lançar gasto" e botão "+ Renda"
- [x] **Detalhe da categoria** — lista de gastos editável/excluível e a conta completa (`renda × pct − rateio + mês passado = posso gastar`)
- [x] **Lançamentos do mês** — abas Gastos / Renda / Custos Fixos / Imprevistos / Ressarcidos, busca e edição/exclusão inline
- [x] **Histórico & Gráficos** — tabela mês a mês, evolução do gasto por categoria (linhas), composição do gasto por mês (barras empilhadas), sobra acumulada/rollover (linhas) e indicador de aderência à meta
- [x] **Configurações** — editor de categorias (nome/%/ordem/arquivar) com validador de 100%, categorias especiais renomeáveis, exportar/importar JSON, apagar tudo, tema claro/escuro, conta (e-mail + sair), importar dados locais
- [x] **Login** — entrar / criar conta / esqueci a senha, com confirmação de e-mail

### Requisitos não-funcionais (seção 8)

- [x] Alvos de toque ≥ 44px; campo de valor com teclado numérico (`inputMode="decimal"`)
- [~] Dados na nuvem (Supabase), isolados por usuário via RLS; o app precisa de conexão para ler/gravar (cache offline é trabalho futuro)
- [x] Lançar um gasto em ≤ 3 toques (categoria → descrição opcional → salvar) além do valor
- [x] Labels em todos os inputs, navegação por teclado, contraste AA nas cores de status

### Fora do escopo v1, preparado no schema (seção 11)

- [x] `Expense.installmentPlan?: InstallmentPlan` reservado para cartão parcelado — não usado por nenhum cálculo nem tela da v1
- [x] `BudgetRepository` não assume um único usuário nem armazenamento local — a implementação de nuvem (Supabase + login) trocou apenas a instância em `lib/storage/index.ts`
