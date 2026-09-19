# Capital

Aplicativo web mobile-first de orçamento doméstico por envelopes (categorias com
percentuais definidos pelo usuário), substituindo uma planilha. Renda, gastos, custos
fixos e imprevistos são lançados manualmente; o app calcula quanto ainda pode
ser gasto em cada categoria, descontando o rateio dos custos fixos/imprevistos e
carregando a sobra de um mês para o outro (rollover). Gastos marcados como "feitos no
cartão" entram na fatura do cartão, além de contarem no orçamento normal da categoria em que
foram lançados — e **fatura e orçamento são coisas separadas** (veja o módulo Cartão).

PWA instalável, com **login por e-mail e senha**. Os dados ficam num **PostgreSQL próprio no
Orange Pi**, sem serviço de banco na nuvem: o navegador só fala com a API do próprio app, que
grava no banco sempre em nome do usuário logado. Cada conta só enxerga os próprios dados. Sem
conexão o app abre, mas as telas ficam carregando até a rede voltar.

### Módulos: cada pessoa monta o seu Capital

**Tudo o que o app faz é um módulo**, e todos **começam desligados** numa conta nova. Cada pessoa
liga os seus em **Mais → Módulos** (`/modulos`). Desligar um módulo nunca apaga dados: ele só
some do rodapé, do Mais, do Início e dos formulários. Religou, está tudo lá.

A ficha de cada módulo (nome, explicação, grupo, dependências, tela e card do Início) fica escrita
uma vez em `lib/modules/catalog.ts`. O rodapé, o Mais, o Início e a tela Módulos leem dela. Os
ícones e os cards ficam em `components/modules`.

**Dependências.** Alguns módulos precisam de outro para funcionar. A tela Módulos mostra os
módulos como uma árvore, cada um embaixo do módulo de que depende:

- Lançamentos
  - Gastos por categoria
    - Histórico e gráficos
  - Cartão
    - A receber
  - Gastos recorrentes
  - Reserva investida
  - Lançar por voz ou texto
- Reserva de emergência, Lembretes e Monitor de Gmail funcionam sozinhos.

Um módulo cujo pai está desligado aparece com **cadeado** e "Precisa de …". Tentar ligá-lo não
liga nada, e **o app nunca liga o pai sozinho**: a linha balança, o que falta ligar se acende e um
aviso diz a ordem. Desligar um módulo de que outros dependem pede confirmação e desliga os filhos
junto. Cada mudança é salva na hora, com "Desfazer". A regra também vale no servidor:
`resolveModules` só considera ligado um módulo cujos pais estão ligados.

**Dinheiro do mês**

- **Lançamentos** (`/mes/[mês]/lancamentos`) — gastos e rendas do mês com busca, abas por
  categoria, "Lançar gasto", "Renda" e "Apagar dados do mês". Sem ele não existe formulário de gasto.
- **Gastos por categoria** (`/mes/[mês]/categorias`) — metas em % da renda, "posso gastar", sobra
  por categoria, custos fixos e imprevistos com o rateio, e "Fechar mês". Detalhe da categoria em
  `/mes/[mês]/categoria/[id]`. Desligado, o gasto continua sendo lançado numa categoria (que segue
  editável na engrenagem de Lançamentos, com nome, descrição e cor), mas somem as metas, o
  percentual e a regra dos 100%. As regras das categorias estão em "Categorias" logo abaixo.
- **Cartão** (`/cartao`) — tudo do cartão num módulo só: a pergunta "A compra foi no cartão?", os
  cartões cadastrados, o parcelamento e a fatura de cada mês. Desligado, a pergunta some; gastos
  antigos marcados no cartão continuam marcados. A tela tem três abas, no jeito de um app de
  banco, e está detalhada em "O módulo Cartão" logo abaixo.
- **A receber** — uma compra no cartão feita para outra pessoa, que vai devolver o valor. Entra na
  fatura (`cardTotal` e `reimbursableTotal`) e **não** entra em nenhuma categoria, no rateio dos
  custos fixos nem no gasto do mês. Tem uma aba em Lançamentos.
- **Histórico e gráficos** (`/historico`) — aderência à meta, gráficos e a tabela mês a mês.

**Carteira** (cada um com tela própria; o antigo painel `/carteira` redireciona para o Início):
  - **Gastos recorrentes** — modelos dos gastos de todo mês; "Lançar" abre o formulário de gasto
    já preenchido, com a data de hoje, na competência que você estava vendo.
  - **Reserva investida** — cotas de um ativo (AUPO11 por padrão) divididas em categorias da
    reserva, cada uma ligada a uma categoria do orçamento. Remanejar compra cotas para a categoria
    da reserva e lança o gasto na categoria do orçamento, na mesma
    transação. A cotação é grátis e sem token (`lib/server/quotes.ts`): vem da própria B3
    (`cotacao.b3.com.br`, com uns 15 min de atraso) e, se ela falhar, do Yahoo Finance; fica em
    cache e se atualiza sozinha ao abrir a Carteira quando tem mais de 15 min. Nenhuma das duas é
    uma API documentada com garantia, por isso há duas e o app nunca depende de uma resposta ao
    vivo para abrir a tela.
  - **Reserva de emergência** — reserva em conta + reserva investida livre, dívida do cartão e dos
    parcelados, reserva prevista e gap. A dívida do cartão é a soma das faturas **em aberto** (de
    todos os cartões e competências, inclusive a "Não informado"); a dos parcelados é só o que cai
    **depois** da competência corrente, então cada real é contado uma vez.

### O módulo Cartão

Tudo o que é cartão vive em `/cartao`, em três abas — a **Fatura** olha um mês por vez, os
**Parcelados** olham os meses à frente e **Cartões** cuida dos cartões em si.

**Fatura × orçamento.** São contas diferentes, e misturá-las era a origem dos erros:

- **Fatura** é o que o banco cobra na competência. É **sempre a parcela** — uma compra em 1× é o
  caso de uma parcela só. A conta está em `lib/budget/bill.ts`: os gastos no cartão daquela
  competência que não vieram de um parcelamento, mais as parcelas com linha naquele mês
  (respeitando um ajuste feito na mão), mais as parcelas cobradas ali que ainda não têm linha
  (mês que ninguém abriu, ou parcelamento "à vista"), menos o gasto único de um "à vista".
- **Orçamento** é o que consome categoria, e quem manda nisso é a forma de contabilizar a compra.

**Parcelar ao lançar o gasto.** Marcando "A compra foi no cartão?" e escolhendo o cartão, o
formulário pergunta como você pagou: `À vista` ou `Parcelado`. Parcelado pede em quantas vezes
(2 a 120, com a prévia "10× de R$ 87,24") e a primeira cobrança (já preenchida com o próximo
vencimento do cartão), usa **a categoria que você escolheu no formulário** e oferece as duas
formas de entrar no orçamento:

- **À vista (recomendado)** — o gasto inteiro conta na categoria no mês da compra; nos meses
  seguintes só a parcela aparece na fatura.
- **Em parcelas** — a parcela de cada mês conta na categoria daquele mês e aparece nos
  lançamentos dela, inclusive nos meses que ainda não foram abertos.

`1 vez` não cria parcelamento: vira um gasto comum.

**"Não informado".** O seletor de cartão sempre oferece **Não informar** — nada no Capital é de
preenchimento obrigatório. Essas compras formam a fatura **"Não informado"**, que funciona
**exatamente como a de um cartão**: fica como dívida até você tocar em **Fatura paga**, e
"Marcar como não paga" desfaz. **Nenhuma fatura sai sozinha no Capital**, nem essa: se você não
marcar, a de setembro e a de outubro aparecem somadas, cada uma na sua linha. A única diferença é
que ela não tem vencimento nem aviso no celular, porque não há data para avisar. No banco ela é a
constante `UNASSIGNED_CARD_ID` em `card_bill_payments.card_id`.

**Limite (opcional).** Preenchido no cartão, a aba Fatura mostra "R$ 3.480 de R$ 5.000
disponíveis" e uma barra, com `disponível = limite − faturas em aberto do cartão − parcelas
futuras dele`. Em branco, **nada** aparece.

**Mês fechado trava a compra inteira.** Uma compra parcelada com qualquer parcela em mês fechado
não pode ser criada, editada nem excluída: o app recusa a operação inteira, diz quais meses estão
no caminho e leva até eles, onde o "Reabrir mês" já existe. A recusa vale nos dois lados — o
formulário não deixa salvar e `saveInstallment`/`deleteInstallment` respondem 409. Editar **uma
parcela sozinha** num mês aberto continua liberado; tocar numa parcela pergunta antes se você
quer editar a compra toda ou só aquele mês.

**Vencimento.** Sempre calculado (`lib/budget/cards.ts`): o dia do cartão, no mês seguinte à
competência (ou no mesmo, se a pessoa escolher), caindo para o último dia nos meses curtos e, **se
cair em sábado ou domingo, passando para a segunda**, como no banco — o adiamento pode atravessar
o mês sem mudar a competência da fatura. Feriados não entram: precisariam de um calendário que o
app não tem. Excluir um cartão não apaga nada: as compras só perdem o vínculo e passam para a
fatura "Não informado".

**Avisos da fatura** (`lib/server/cardBills.ts`): um job por minuto, no mesmo motor dos lembretes,
avisa no celular com a antecedência escolhida em cada cartão (só no dia, 1, 2, 3, 5 ou 7 dias
antes), de novo no dia do vencimento e, enquanto a fatura não for marcada como paga, uma vez por
dia por até uma semana depois — tudo pela data já adiada do fim de semana. O horário e o "insistir
até marcar como paga" ficam na engrenagem da tela. A notificação traz o botão **Fatura paga ✅**,
que funciona sem abrir o app (token assinado, igual ao "Realizado" dos lembretes), e a categoria
"Cartões" pode ser desligada na Central de notificações. A fatura "Não informado" não avisa.

**Assistente**

- **Lembretes** (`/lembretes`), com notificação no celular (Web Push):
  - **Tipos:** uma vez (data e hora, com aviso antecipado opcional de 30 min, 1 hora ou 1 dia),
    tarefa do dia (aparece todo dia e avisa nos horários escolhidos até ser concluída; concluída,
    vai para o histórico), toda semana (vários dias) e todo mês (dia 29–31 cai no último dia dos
    meses curtos).
  - **Nada de horário fixo:** cada lembrete tem o seu horário, e cada pessoa escolhe em
    Configurações → Lembretes quando lembrar de novo o que não foi marcado como feito (padrão
    08:00, 12:00, 15:00 e 18:00; dá para desligar em geral ou em cada lembrete). O que ficou para
    trás continua avisando nos dias seguintes, como "atrasado desde dd/MM".
  - **Notificação:** o botão "Realizado ✅" funciona sem abrir o app (token assinado, 36 h), e as
    tarefas do mesmo horário vão numa notificação só. As regras são puras em `lib/reminders`.
  - **Telas:** Hoje (atrasados, hoje, tarefas e amanhã), Todos (por tipo, com histórico) e
    Calendário dos compromissos; card "Lembretes de hoje" no Início.
- **Lançar por voz ou texto** (usa a IA local do servidor, Whisper e Ollama): microfone no Início
  e no formulário de gasto. Grava até 60 s ou recebe o texto
  ("Descreva o gasto") e mostra **"Confira o gasto"**, com um lápis que abre o formulário
  preenchido. Nada é salvo sem confirmar.
  - **Regras primeiro, IA depois:** valor, categoria (as do usuário, sem ligar para maiúsculas,
    acentos e plural; sinônimos de "A receber"), data (ontem, anteontem, dia da semana, "dia 12")
    e cartão saem de regras puras em `lib/ai`. O modelo local só escreve a descrição e o que as
    regras não resolveram, o que corta a espera no Pi de ~13 s para ~3 s.
  - **Progresso real:** o servidor transmite cada etapa (transcrevendo, carregando a IA, lendo,
    montando) e os tokens conforme saem; a barra usa esses sinais e o tempo medido no Pi.
  - Ao abrir a tela, o servidor já carrega o modelo e lê o começo do prompt (aquecimento).
- **Monitor de Gmail** (`/gmail`): cada pessoa conecta o próprio Gmail com
  "Login com Google" (permissão só de leitura) e, a cada minuto, avisa no celular quando chega um
  e-mail com uma das palavras-chave no assunto, no remetente ou na prévia (sem ligar para
  maiúsculas e acentos). **Uma** notificação por e-mail, com todas as palavras encontradas, e
  nunca o mesmo e-mail duas vezes; tocar abre o e-mail no Gmail. Mostra o histórico de alertas.
  Ignora o que você enviou, rascunhos e spam. Se o Google recusar a conexão, avisa uma vez e pede
  para conectar de novo.

### Navegação: rodapé, Mais e Início

- **Rodapé** (`resolveNav` em `lib/modules/nav.ts`): até **4 itens e o Mais sempre no fim**. Os
  itens podem ser o Início e os módulos ligados que têm tela. A escolha fica por conta, em
  `budget_settings.nav` (vale em todos os aparelhos). Sem escolha salva, o padrão é o Início e os
  primeiros módulos ligados com tela, na ordem do catálogo. Módulos desligados saem sozinhos. Se o
  Início sair do rodapé, `/` abre o primeiro item.
- **Escolher e ordenar o rodapé** (`/rodape`, em Mais): prévia ao vivo e uma lista
  única; o que fica acima da linha do Mais está no rodapé. Arrasta-se pela alça (`@dnd-kit`, com
  toque, mouse e teclado, avisos em português para leitor de tela) ou pelos botões subir, descer,
  pôr e tirar. Um quinto item empurra o último para o Mais; o rodapé nunca fica vazio. Salva na hora,
  com "Desfazer", e "Voltar ao padrão" apaga a escolha.
- **Mais** (`/mais`): a lista completa. O Início, a tela de **todo** módulo ligado (mesmo os que já
  estão no rodapé), agrupadas em Dinheiro do mês, Carteira e Assistente, e sempre Módulos, Rodapé,
  Privacidade (`/privacidade`) e Configurações. Uma tela fora do rodapé aberta pelo Mais acende a
  aba Mais.
- **Início** (`/mes/[mês]`): um painel com **um card por módulo ligado**, na ordem do rodapé e
  depois do Mais (Cartão e A receber logo depois de quem eles dependem). Tocar num card abre a
  tela do módulo. Cada card carrega os próprios dados, mostra esqueleto enquanto carrega e, se
  falhar, não derruba os outros. O card do Histórico lê só os últimos 6 meses. Sem nenhum módulo,
  o Início mostra "Escolha o que o seu Capital vai ter".
- **Tela de módulo desligado** (`ModuleGate`): explica o módulo e oferece ligar ali mesmo, ou diz
  qual módulo precisa ser ligado antes.
- **Avisos já vistos**: `budget_settings.dismissed_notices` guarda, por conta, as chaves dos avisos
  de uma vez só (a apresentação de cada módulo, `intro:<módulo>`, e futuros cards de novidade).

### Ajuda, configurações e primeira visita de cada módulo

- **Ajuda ("?")**: todo módulo tem um botão que roda o tour só dele, o spotlight do driver.js que
  escurece a tela, destaca uma parte por vez e explica para que serve. Fica no topo da tela do
  módulo; nos módulos sem tela, no card do Cartão no Início, na aba A receber de Lançamentos e na
  janela de voz. Os passos ficam em `lib/modules/tours.ts` (um `Record` por módulo, então módulo sem
  tour não compila) e apontam só para a tela do módulo, nunca para o rodapé. Todo tour termina no
  próprio botão de ajuda. O motor (`components/modules/tour/TourProvider.tsx`) navega entre as
  telas, espera cada elemento aparecer, abre e fecha o formulário de gasto ou a janela de voz quando
  o passo pede e volta para onde começou. Um teste confere que toda âncora de tour existe nas telas e
  que todo módulo tem o botão de ajuda.
- **Configurações do módulo (engrenagem)**: ficam na tela do próprio módulo. Categorias: nome,
  descrição, cor, ordem e metas (com a regra dos 100%), e "Restaurar categorias padrão".
  Lançamentos: nome, descrição e cor das categorias, sem metas. Lembretes: notificações deste
  aparelho e horários para lembrar de novo. Gmail: notificações. Cartões: horário do aviso, insistir
  até a fatura ser paga e notificações deste aparelho. Reserva de emergência: reserva em
  conta e custos de emergência. Reserva investida: o ativo. **Configurações** fica só com o que é
  geral: conta, tema, backup, dados locais e apagar tudo (Módulos, Rodapé e Privacidade ficam no
  Mais).
- **Primeira visita** (`useModuleIntro`): a primeira vez que a pessoa abre a tela de um módulo, o
  tour dele começa sozinho. Nas Categorias vêm antes as perguntas das porcentagens (veja abaixo).
  Fica guardado por conta, então acontece uma vez só, no aparelho que chegar primeiro. Não existe
  mais um tour geral do app nem uma "Ajuda" no Mais: a ajuda de cada coisa fica na tela dela.

### Categorias

- **As quatro padrão** (`DEFAULT_TOPICS` em `lib/budget/topics.ts`) vêm com uma descrição que ensina
  o jeito certo de usar: **Diversos** (os prazeres e confortos da vida, presentes e o que poderia
  esperar, mas você quer agora), **Investimentos** (qualquer investimento que faça o dinheiro
  render), **Metas** (casa, carro, casamento, aniversário, viagem) e **Conhecimentos** (tudo que
  agrega conhecimento). Toda categoria tem descrição, que a pessoa escreve ao criar e pode editar.
  Cada padrão guarda um `preset`, para ser reconhecida mesmo renomeada.
- **Custo fixo**: um gasto que se repete todo mês e é maior do que a categoria recebe vai para custo
  fixo (uma faculdade de R$ 1.000 por mês, por exemplo). A tela Categorias explica renda, custos
  fixos, imprevistos e cada categoria.
- **Criar é possível, mas desaconselhado**: ao lado de todo "Adicionar categoria" o app diz que a
  maioria das pessoas fica satisfeita com as quatro padrão, e pede confirmação antes de criar.
- **Nunca se exclui, só se arquiva.** A categoria arquivada some da lista (não há lista de
  arquivadas) e os meses passados continuam como estavam. No mês atual e nos próximos ela some na
  hora; se o mês atual já tiver gastos nela, ela fica até o fim do mês, marcada como arquivada e sem
  % da renda, para nenhum gasto sumir dos totais. O servidor garante: um salvamento que deixe uma
  categoria de fora a guarda arquivada (`keepEveryTopic`).
- **Restaurar categorias padrão** (na engrenagem): as quatro padrão voltam como vieram (nome,
  descrição, cor e %) e todas as outras são arquivadas, com "Desfazer".
- **"Me ajude com as %"** (botão na tela Categorias, e na primeira visita): perguntas de renda,
  custos fixos e imprevistos, para que serve cada categoria e as porcentagens, com a prévia de
  quanto cada % deixa para gastar. Dá para criar uma categoria ali também, com o mesmo aviso.

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
   # VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT (notificações) e ACTION_TOKEN_SECRET
   #   — um par/segredo próprio do Pi; os comandos para gerar estão no .env.example
   # WHISPER_URL e OLLAMA_URL (lançar por voz ou texto), ex.: http://100.81.141.54:8090 e :11434
   # GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e ENCRYPTION_KEY (monitor de Gmail; passo a passo no .env.example)
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
  /screens               Uma tela por arquivo (Início, Categorias, Lançamentos, Módulos, Mais, Configurações…)
  /modules               Ícones dos módulos, a tela bloqueada, ligar/desligar e os cards do Início
  /month                  Componentes e contexto compartilhados pelas rotas /mes/[month]/*
  /history                Gráficos (Recharts) e o indicador de aderência à meta
  /layout, /ui, /providers, /pwa
/lib
  /budget                 Regras de negócio — funções puras, sem React nem storage
  /reminders              Regras dos lembretes (vencimentos, quando notificar, textos), puras, no fuso de São Paulo
  /ai                     Lançar por voz/texto: regras de leitura do gasto, prompt, rascunho e progresso (puras)
  /gmail                  Monitor de Gmail: palavras-chave num e-mail e o texto da notificação (puras)
  /notifications          Web Push: tipos, nome dos aparelhos e o lado do navegador (permissão, inscrição)
  /modules                A ficha de cada módulo, dependências, rodapé, Mais e cards do Início (puras)
  /storage                Contrato BudgetRepository e o repositório do navegador (HTTP)
  /server                 Só no servidor: banco (Drizzle), repositório Postgres, auth, e-mail, API
  /auth                   Server Actions de autenticação (entrar, criar conta, sair, redefinir senha)
  /hooks                  Hooks React que ligam a UI ao repositório (useMonthData, useAllMonths)
/drizzle                  Migrações SQL (geradas por `npm run db:generate`)
/deploy/postgres          Stack Docker do banco no Orange Pi (Postgres + backup)
/scripts                  Migrações manuais e a geração dos ícones do PWA
/proxy.ts                 Portão das rotas: sem cookie de sessão → /login (páginas) ou 401 (API)
/instrumentation.ts       Aplica as migrações e liga a agenda em segundo plano quando o servidor sobe
```

### Agenda em segundo plano (`lib/server/scheduler.ts`)

Roda dentro do próprio servidor do Capital, sem n8n nem container extra: a cada minuto (5 s
depois da virada) envia as notificações de lembrete que venceram, confere o Gmail das contas
conectadas e, no horário da B3 (dias úteis, 10:00–18:30), atualiza a cotação dos ativos que alguém
tem, a cada 30 min. De hora em hora também avisa, pelo sino, quem já tinha conta quando uma
novidade do app entrou no ar (`lib/notifications/announcements.ts`). Cada tarefa guarda
quando rodou (`job_runs`): depois de um deploy ou reinício ela recupera o que ficou para trás, e
cada envio é anotado antes (`reminder_deliveries`, chave única), então nada sai duas vezes.
`SCHEDULER=off` desliga a agenda num servidor.

Excluir uma notificação (arrastando para o lado) **não** apaga a linha quando ela tem `source_key`
— a de uma novidade, por exemplo: só marca `dismissed_at`, e a linha continua lá como lápide. Sem
isso o índice único `(user_id, source_key)` deixaria de enxergá-la e a tarefa mandaria exatamente o
mesmo aviso na hora seguinte, e na outra, e na outra. Notificação sem `source_key` (lembrete,
alerta do Gmail) ninguém recria, então essa é apagada de verdade.

### Monitor de Gmail (`lib/server/gmail`)

OAuth web próprio, com `fetch` e sem SDK: `/api/v1/gmail/oauth/start` manda ao Google com o escopo
`gmail.readonly` e um cookie assinado com o `state`; `/callback` confere o `state`, troca o código
pelo refresh token, guarda-o cifrado (AES-256-GCM, `ENCRYPTION_KEY`, `lib/server/secretBox.ts`) e
começa a olhar a partir do `historyId` atual. A verificação usa `history.list` desde o último
`historyId` (se ele expirou, os e-mails do último dia), lê Subject, From e snippet, e grava em
`gmail_alerts` antes de notificar: a chave primária é o que impede o alerta repetido.
"Desconectar" apaga a conexão guardada, mas não revoga a permissão no Google, porque o n8n pode usar
o mesmo cliente OAuth e perderia o acesso junto.

**Limites do Google:** a permissão de ler e-mails é um escopo "restrito". Com o app "Em produção"
e sem a verificação paga do Google, até 100 pessoas conseguem conectar, e cada uma vê uma vez o aviso
"app não verificado" (Avançado → Acessar). A verificação só compensa para abrir a muito mais gente.
O servidor guarda, cifrado, o acesso de leitura ao e-mail de cada pessoa que conectar: quem
administra o servidor precisa ser de confiança para elas. Cada conta gasta poucas chamadas por
minuto, quase só espera de rede.

### IA local (`lib/server/ai`)

Whisper (whisper.cpp, `WHISPER_URL`, com `--convert` para aceitar o webm do navegador) e Ollama
(`OLLAMA_URL`, modelo `OLLAMA_MODEL`, padrão `qwen2.5:1.5b`), atrás das interfaces `Transcriber` e
`ExpenseExtractor`. Grátis e sem chave. `POST /api/v1/ai/expense/audio` (multipart, até 5 MB) e
`/text` respondem em `text/event-stream`: plano com a estimativa de cada etapa, início de cada
etapa, transcrição, tokens e, no fim, o rascunho (`{ draft, transcript, warnings }`). A resposta
do modelo é restrita por JSON schema aos campos que faltam e às categorias do usuário, e a geração
para assim que o JSON fecha. `/warmup` aquece o modelo. Qualquer usuário com o módulo ligado, até 40
análises por hora cada. O Ollama atende uma análise por vez: com duas ao mesmo tempo, a segunda espera. Os tempos de cada etapa são aprendidos em memória a cada análise.

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
  `components/pwa/RegisterServiceWorker.tsx` apenas em produção. Também mostra as notificações
  (`push`), executa os botões delas (`notificationclick`) e reinscreve o aparelho quando o
  navegador troca a inscrição (`pushsubscriptionchange`). No `npm run dev` ele só é registrado
  ao ativar as notificações, como `/sw.js?dev=1`, sem cache.
- Notificações: Configurações → Notificações ativa o aparelho (a permissão só é pedida num
  toque), manda um teste e lista os aparelhos. No Brave, ative antes "Usar os serviços do Google
  para mensagens push" em `brave://settings/privacy`.
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
  módulos, rodapé e avisos vistos por usuário (e no backup), isolamento entre contas e escritas
  simultâneas.
- **Componentes** (`components/**/__tests__`, Testing Library): o formulário de gasto com a
  categoria "A receber" e sem o módulo Cartão, e a prévia do "Fechar mês".
- **`lib/reminders/__tests__/schedule.test.ts`:** os lembretes com relógio falso em São Paulo:
  mês curto, vários dias da semana, aviso antecipado, repetição até "Realizado", atrasados,
  horários do usuário, tarefas agrupadas e o que não dispara antes da criação.
- **`lib/server/__tests__/reminders.test.ts` e `push.test.ts`:** a agenda contra o banco (envia no
  minuto certo, nunca duas vezes, recupera o que perdeu fora do ar, só para quem ligou o módulo),
  o token do "Realizado" (válido, expirado e adulterado) e os aparelhos (404/410 apaga).
- **`lib/ai/__tests__/rules.test.ts` e `lib/server/__tests__/aiEngine.test.ts`:** os 4 exemplos do
  prompt do bot com as categorias do usuário, o que o modelo pequeno errou no teste do Pi ("89 e
  90", "vai me devolver"), valores, datas relativas, cartão, normalização de categorias, schema da
  resposta e as etapas transmitidas, com a IA simulada. `aiOllama.integration.test.ts` roda os
  mesmos exemplos contra o Ollama real, só com `OLLAMA_TEST_URL` definido.
- **`lib/gmail/__tests__/match.test.ts` e `lib/server/__tests__/gmail.test.ts`:** palavras-chave
  (maiúsculas, acentos, remetente, prévia), um aviso por e-mail com todas as palavras e nunca
  repetido, e-mails enviados e spam ignorados, `historyId` expirado, conexão recusada (avisa uma
  vez e para), token cifrado e o `state` do OAuth, com o Gmail simulado.
- **`lib/modules/__tests__`:** o catálogo, as dependências (filho travado sem o pai, o que ligar
  antes e em que ordem, desligar em cascata, a árvore), o rodapé (padrão, escolha, cortes, arrastar,
  botões, nunca vazio), o Mais, a aba acesa, a ordem dos cards do Início e os tours (todo módulo tem
  tour e botão de ajuda, e toda âncora existe nas telas).
- **`lib/budget/__tests__/topics.test.ts`, `components/settings/__tests__` e
  `components/onboarding/__tests__`:** as categorias padrão e suas descrições, restaurar o padrão
  (inclusive com dados antigos, sem `preset`), nunca apagar uma categoria, a arquivada no mês atual,
  nos próximos e nos passados, o editor sem "Excluir" e com os avisos, e o "Me ajude com as %"
  criando uma categoria com descrição.
- **Repositório HTTP** (`lib/storage/__tests__`).
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

- [x] **Início** — painel com um card por módulo ligado, seletor de mês, FAB "+ Lançar gasto", "+ Renda" e o microfone
- [x] **Categorias do mês** — cabeçalho com renda/gasto/posso-gastar/saldo, card por categoria com barra de progresso (verde/amarelo/vermelho), card de custos fixos/imprevistos com rateio por categoria e "Fechar mês"
- [x] **Detalhe da categoria** — lista de gastos editável/excluível e a conta completa (`renda × pct − rateio + mês passado = posso gastar`)
- [x] **Lançamentos do mês** — abas Gastos / Renda / Custos Fixos / Imprevistos, busca e edição/exclusão inline
- [x] **Histórico & Gráficos** — tabela mês a mês, evolução do gasto por categoria (linhas), composição do gasto por mês (barras empilhadas), sobra acumulada/rollover (linhas) e indicador de aderência à meta
- [x] **Configurações** — exportar/importar JSON, apagar tudo, tema claro/escuro, conta (e-mail + sair), importar dados locais. O editor de categorias (nome/descrição/%/ordem/arquivar, validador de 100% e restaurar padrão) fica na engrenagem de Categorias
- [x] **Login** — entrar / criar conta / esqueci a senha, com confirmação de e-mail

### Requisitos não-funcionais (seção 8)

- [x] Alvos de toque ≥ 44px; campo de valor com teclado numérico (`inputMode="decimal"`)
- [~] Dados no Postgres próprio do Orange Pi, isolados por usuário na API; o app precisa de conexão para ler/gravar (cache offline é trabalho futuro)
- [x] Lançar um gasto em ≤ 3 toques (categoria → descrição opcional → salvar) além do valor
- [x] Labels em todos os inputs, navegação por teclado, contraste AA nas cores de status

### Fora do escopo v1, preparado no schema (seção 11)

- [x] `Expense.installmentPlan?: InstallmentPlan` reservado para cartão parcelado — não usado por nenhum cálculo nem tela da v1
- [x] `BudgetRepository` não assume um único usuário nem armazenamento local — a troca do Supabase pelo Postgres próprio mudou só a instância em `lib/storage/index.ts`
