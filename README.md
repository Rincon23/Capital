# Capital

Aplicativo web mobile-first de orçamento doméstico por envelopes (categorias com
percentuais definidos pelo usuário), substituindo uma planilha. Renda, gastos, custos
fixos, imprevistos e estornos são lançados manualmente; o app calcula quanto ainda pode
ser gasto em cada categoria, descontando o rateio dos custos fixos/imprevistos e
carregando a sobra de um mês para o outro (rollover).

PWA instalável, funciona **offline** e guarda todos os dados **no próprio dispositivo**
(IndexedDB) — nada é enviado para servidores externos.

## Como rodar

Requer Node.js 20+.

```bash
npm install

npm run dev      # servidor de desenvolvimento em http://localhost:3000
npm run build    # build de produção (gera o service worker em public/sw.js)
npm start        # serve o build de produção

npm test         # roda os testes de /lib/budget (Vitest)
npm run lint     # ESLint
npm run format   # Prettier
```

Na primeira execução, o app popula automaticamente as categorias e um mês de exemplo
(dados-semente da seção 10 do briefing) — não é preciso nenhuma configuração inicial.

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
  /hooks                  Hooks React que ligam a UI ao repositório (useMonthData, useAllMonths)
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

### Camada de dados isolada (`/lib/storage`) — o caminho para a v2 em nuvem

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

A v1 implementa essa interface com **`IndexedDbBudgetRepository`** (Dexie.js), mantendo
o rollover consistente automaticamente: toda alteração em um mês recalcula em cascata o
`carryIn` dos meses seguintes já existentes (`recascade`, usado também ao reabrir um mês
fechado).

**Migração para v2 (nuvem, ex.: Supabase):** criar `SupabaseBudgetRepository`
implementando a mesma interface (mesmas assinaturas de método, mesmos tipos de
`lib/budget/types.ts`) e trocar a instância exportada em `lib/storage/index.ts`
(`export const budgetRepository: BudgetRepository = new SupabaseBudgetRepository()`).
Nenhuma tela ou regra de negócio precisa mudar. O modelo de dados já é particionado por
mês e não pressupõe um único usuário — basta que a v2 escope as tabelas por `userId`
(hoje implícito, já que o app é single-user); os tipos e o formato de `BackupPayload`
permanecem os mesmos, o que também permite migrar dados existentes de um dispositivo
para a nuvem via export/import.

### Preferências leves (`lib/storage/preferences.ts`)

Apenas tema (claro/escuro/sistema) e o último mês visualizado usam `localStorage`,
conforme pedido — nunca dados financeiros.

## PWA e offline

- `public/manifest.json` — instalável, ícones 192/512 (`any` e `maskable`).
- `public/sw.js` — service worker escrito à mão (cache-first para assets do Next
  content-hashed, network-first com fallback para navegação, stale-while-revalidate
  para o restante), registrado por `components/pwa/RegisterServiceWorker.tsx` apenas em
  produção. Como todos os dados do app vivem no IndexedDB (sem chamadas de rede), o
  service worker só precisa manter o _app shell_ disponível offline.
- `public/offline.html` — página de fallback quando uma rota nunca visitada é aberta
  sem rede.

> Nota: os ícones em `/public/icon-*.png` foram gerados por
> `scripts/generate-icons.mjs` como placeholder de marca (`node scripts/generate-icons.mjs`
> para regenerar). Troque por assets de marca reais antes de publicar.

## Testes

`npm test` roda os cenários de aceitação da seção 9 do briefing como testes unitários
de `/lib/budget` (Vitest): mês isolado sem rollover, rollover positivo/negativo,
fechamento e carga do mês seguinte, estorno (Ressarcido), validação de soma de
percentuais e o estado `available <= 0`.

## Checklist de aderência

### Fórmulas (seção 6)

- [x] `proportionalFixed(t) = (fixedTotal + unforeseenTotal) * pct(t)`
- [x] `available(t) = incomeTotal * pct(t) - proportionalFixed(t) + carryIn(t)`
- [x] `remaining(t) = available(t) - spent(t)`
- [x] `usedPct(t) = spent(t) / available(t)`, mostrando "—" e estado de alerta quando `available(t) <= 0`
- [x] Estornos (`reimbursed`) abatem `spent(t)` da categoria e não entram no rateio de fixos/imprevistos
- [x] Rollover: `carryIn` do mês N = `remaining` do mês N-1 (inclusive negativo)
- [x] Fechar mês congela os números; reabrir recalcula em cascata os meses seguintes
- [x] `topicsSnapshot` guarda o `pct` vigente em cada mês (config posterior não altera meses passados)
- [x] Validação: soma dos `targetPct` ativos deve ser 100%, com indicação do quanto falta/sobra

### Telas (seção 7)

- [x] **Dashboard do mês** — seletor de mês, cabeçalho com renda/gasto/posso-gastar/saldo, card por categoria com barra de progresso (verde/amarelo/vermelho), card de custos fixos/imprevistos com rateio por categoria, FAB "+ Lançar gasto" e botão "+ Renda"
- [x] **Detalhe da categoria** — lista de gastos editável/excluível e a conta completa (`renda × pct − rateio + mês passado = posso gastar`)
- [x] **Lançamentos do mês** — abas Gastos / Renda / Custos Fixos / Imprevistos / Ressarcidos, busca e edição/exclusão inline
- [x] **Histórico & Gráficos** — tabela mês a mês, evolução do gasto por categoria (linhas), composição do gasto por mês (barras empilhadas), sobra acumulada/rollover (linhas) e indicador de aderência à meta
- [x] **Configurações** — editor de categorias (nome/%/ordem/arquivar) com validador de 100%, categorias especiais renomeáveis, exportar/importar JSON, apagar tudo, tema claro/escuro

### Requisitos não-funcionais (seção 8)

- [x] Alvos de toque ≥ 44px; campo de valor com teclado numérico (`inputMode="decimal"`)
- [x] Offline-first — todas as escritas vão para IndexedDB; nada é enviado para fora do dispositivo
- [x] Lançar um gasto em ≤ 3 toques (categoria → descrição opcional → salvar) além do valor
- [x] Labels em todos os inputs, navegação por teclado, contraste AA nas cores de status

### Fora do escopo v1, preparado no schema (seção 11)

- [x] `Expense.installmentPlan?: InstallmentPlan` reservado para cartão parcelado — não usado por nenhum cálculo nem tela da v1
- [x] `BudgetRepository` não assume um único usuário nem armazenamento local; a v2 (nuvem/login) troca apenas a implementação
