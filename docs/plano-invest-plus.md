# Plano: separar o Diagrama do Capital + no Invest +

Escrito em 2026-11-09. Nada foi feito ainda: este arquivo é só o plano, para o dono aprovar.

## O que o dono pediu

- Um **app novo, o Invest +**, num repositório próprio no GitHub, na mesma pasta onde está o
  Capital (`Projetos Git`). Ele é **só o módulo Diagrama**, focado em investimentos.
- O **Capital +** passa a cuidar **só dos gastos**: o Diagrama sai dele.
- O Invest + tem uma **aba de Open Finance** para **conferir os investimentos** (a conferência de
  quantidades que hoje fica no Capital). No Capital, o Open Finance perde o "Conferir
  investimentos" e **mantém** "Conferir gastos" e "Conferir recebimentos".
- **Missões:** tudo o que for missão do Diagrama sai do Capital, e o Invest + **não tem** sistema
  de missões.
- **Mesma cara do Capital.** Não é um redesenho: é separar os apps, mantendo tudo como está.
- **Banco de dados próprio** para o Invest +.

## Decisões que recomendo (o dono confirma ou troca)

| # | Pergunta | Recomendação |
|---|---|---|
| D1 | Nome da pasta e do repositório | **`Invest`** (como `Capital`), com o app chamado "Invest +" na tela. O "+" no nome da pasta atrapalha Docker, npm e URLs. |
| D2 | Repositório público ou privado | **Privado** (dá para abrir depois). |
| D3 | Endereço na internet | **`https://invest.rincon.dev.br`**, pelo mesmo túnel Cloudflare do Pi. |
| D4 | Contas | **Copiar para o Invest + as contas de quem usa o Diagrama**, com o mesmo e-mail e a mesma senha. Depois disso cada app tem a sua conta (trocar a senha num não troca no outro). |
| D5 | Banco de dados | **Sim, banco separado**: um banco `invest` (e `invest_dev`) com usuário próprio, **no mesmo Postgres do Pi** que já roda o Capital. Um app nunca lê os dados do outro, e o Pi não gasta memória com um segundo Postgres. O backup diário passa a salvar os dois bancos. |
| D6 | Chave da Pluggy | **Copiar a chave** de quem já tem uma (o script decifra com a chave do Capital e cifra de novo com a do Invest +). A corretora é **conectada de novo** no Invest + (uma autorização no meu.pluggy.ai), porque um item compartilhado entre os dois apps seria apagado nos dois quando a pessoa tirasse o banco num deles. |
| D7 | A Reserva investida na conferência | **Decidido (2026-11-09):** a Reserva investida (AUPO11) **continua no Capital**. No Invest +, a pessoa marca o que o banco tem e não é do Diagrama como **"Fora do Diagrama"**: num ativo que só o banco tem, tudo fica fora; num ativo que os dois têm, a diferença fica fora (o caso da Reserva). A migração já marca as cotas da Reserva de cada pessoa como fora. |
| D8 | XP já ganho com "Conhecer Diagrama" no Capital | **Manter o XP já ganho** (ninguém cai de nível); só a missão deixa de existir. |
| D9 | Ícone | **Decidido (2026-11-09):** mesmo estilo do Capital (letra branca com contorno, "+" amarelo no canto superior direito), com **fundo laranja** e **"I"** no lugar do "C". |
| D13 | Cotações | **Decidido (2026-11-09):** **um serviço de cotações só**, para não pesar o Pi. Ele mora no Invest + (que tem quase todos os tickers): um endereço interno, só pela rede Docker e com senha, que responde do cache e só busca na B3/Yahoo o que está velho. O Capital pergunta a ele o preço do ticker da Reserva e guarda a última resposta; se o Invest + estiver fora do ar, a Reserva mostra o último preço. |
| D10 | Quem já usava o Diagrama no Capital | Um **aviso único** no Capital ("O Diagrama agora é o Invest +", com o link), e o endereço `/diagrama` **leva para o Invest +** por um tempo, em vez de "Página não encontrada". |
| D11 | Tabelas do Diagrama no banco do Capital | **Ficam intactas** até o Invest + estar em uso há algumas semanas; só então uma migração as apaga, **com o OK do dono**. |
| D12 | "Você sabia?" (fatos sobre investir) | **Fica no Capital** como está. O Invest + começa sem ele. |

## O que vai para o Invest + e o que fica no Capital

| Parte | Capital + | Invest + |
|---|---|---|
| Lançamentos, Categorias, Cartão, A receber, Contas do mês, Reserva, Lembretes, Tags, fechar mês | fica | não entra |
| Missões, XP, níveis, "Você sabia?" | fica (sem a missão do Diagrama) | não entra |
| Diagrama (ativos, notas, aporte, metas, perguntas automáticas Graham e P/VP) | sai | entra igual |
| Histórico | só a aba Gastos | a aba Investimentos vira o Histórico do Invest + |
| Open Finance | chave, bancos, Conferir gastos/recebimentos, Reserva pelo saldo, avisos | chave, corretoras, **Conferir investimentos** |
| Cotações (B3 + Yahoo) | pergunta ao Invest + (D13) | o serviço único de cotações |
| Fundamentus, histórico de preços | sai | entra |
| Login, Início em telas de widgets, gaveta de apps, tema, notificações, Administração, testes automáticos, proteção de carga, PWA | fica | entra igual (cópia) |
| "Restrito" | fica | entra (Open Finance restrito por padrão, como hoje) |

O código das partes comuns é **copiado**, não compartilhado: dois repositórios sem pacote em comum
são mais simples de manter, e cada app pode mudar sem quebrar o outro.

## Fases

Cada fase vira um ou mais commits. A ordem garante que **ninguém fica um dia sem o Diagrama**: o
Capital só perde o Diagrama depois que o Invest + estiver no ar com os dados migrados.

### F0 — Ponto de partida

1. Criar `Projetos Git\Invest` a partir do Capital no commit atual (`git archive`), com **histórico
   novo**: o primeiro commit diz de qual commit do Capital ele saiu. Copiar o histórico do Capital
   traria anos de coisas que não são do Invest +.
2. Criar o repositório `Rincon23/Invest` no GitHub e enviar. O `gh` desta máquina não está logado:
   o dono roda `gh auth login` uma vez, ou cria o repositório vazio em github.com/new.
3. `.env.local` próprio do Invest + para desenvolvimento (segredos novos: `BETTER_AUTH_SECRET`,
   VAPID, `ACTION_TOKEN_SECRET`, `ENCRYPTION_KEY`). Nada é versionado.

### F1 — Enxugar o Invest + (só o código)

1. **Catálogo de módulos** com três módulos: Diagrama, Histórico (só investimentos) e Open Finance.
   Saem do código: Lançamentos, Categorias, Cartão, A receber, Contas do mês, Reserva, Lembretes,
   Tags, meses e fechamento, Missões/XP/níveis, "Você sabia?", e as migrações de boot que só
   existiam por dados antigos do Capital (`*Migration.ts`).
2. **A mesma cara:** Início em telas de widgets, gaveta de apps, cabeçalho, tema, botão "?" com o
   tour de cada módulo, Configurações, Notificações, Privacidade e Administração continuam iguais,
   só sem o que saiu.
3. **Primeiro acesso:** uma boas-vindas curta, sem missões, com um botão para o Diagrama.
4. **Nome e marca:** "Invest +" (com espaço inquebrável antes do "+" no HTML) em títulos, login,
   e-mails, push e manifest; ícone novo (D9) por `scripts/generate-icons.mjs`; `CACHE_VERSION`
   novo no `public/sw.js`.
5. **Deploy próprio:** `package.json` (`invest`), `docker-compose.yml` (projeto, imagem e container
   `invest`, porta `127.0.0.1:3001`), `update.sh`, `.env.example` e um `README.md` só do Invest +.
6. **Testes:** os do Diagrama, do Histórico de investimentos, da conferência e do app comum
   continuam passando; os dos módulos que saíram saem junto. Os testes automáticos da
   Administração ficam só com as verificações do Invest +.

### F2 — Banco de dados novo

1. **Schema só com o que o Invest + usa**, com as migrações recomeçando do zero (`0000_init.sql`):
   contas e sessões (Better Auth), configurações, acesso aos restritos, notificações e aparelhos
   do push, agenda e testes automáticos, cotações e histórico de preços, Fundamentus, tabelas do
   Diagrama e do Open Finance (chave, conexões, investimentos). Nada de meses, gastos, cartões etc.
2. **No Pi:** criar os bancos `invest` e `invest_dev` com seus usuários no `capital-postgres`
   existente (um script novo em `deploy/postgres`, porque o `initdb` só roda na primeira vez); o
   `pg_hba.conf` e o acesso de desenvolvimento pela Tailscale passam a valer para os dois.
3. **Backup:** o `capital-db-backup` salva também o banco `invest`, e a pasta `backups/config`
   guarda o `.env.local` do Invest + (sem a `ENCRYPTION_KEY` dele, a chave da Pluggy não volta).
   Continua saindo do Pi pelo Syncthing.

### F3 — Open Finance do Invest + (só investimentos)

1. Mesma configuração de hoje: a pessoa cola a própria chave da Pluggy, traz uma corretora por vez
   (link de autorização de 4 minutos), "Trazer de novo", "Tirar banco", trocar a chave.
2. A leitura diária traz **só os investimentos** (`GET /investments`), sem contas, transações,
   revisão de gastos, Reserva pelo saldo nem avisos de gastos.
3. **"Conferir investimentos"** funciona como hoje: o botão no Open Finance abre a conferência no
   Diagrama, ativo por ativo, com "Usar" e "Adicionar" a um toque.
4. O ajuste da Reserva investida (D7): marcar um investimento do banco como "Fora do Diagrama".
5. **Conferir com a chave do dono, antes de seguir:** se uma conexão nova da mesma corretora conta
   no limite de 5 do Meu Pluggy junto com as do Capital. O resultado vai para o README do Invest +.

### F4 — Migração dos dados (Capital → Invest +)

Um script no Invest + (`scripts/migrate-from-capital.ts`) que **só lê** o banco do Capital e grava no
do Invest +. Pode rodar mais de uma vez sem duplicar nada, e tem um modo de ensaio que só mostra as
contagens.

1. Contas de quem tem algo no Diagrama (D4): `users` e a senha (`account` do tipo e-mail e senha),
   com **os mesmos ids**, para os dados do Diagrama entrarem sem tradução. Sessões não vão: a pessoa
   entra uma vez no Invest +. Antes, um teste confirma que o Better Auth aceita a senha copiada.
2. Acesso aos restritos (`vip_users`) dessas contas, e as escolhas de "Restrito" do Diagrama e do
   Open Finance (`module_access`).
3. Tudo do Diagrama: configurações e metas, ativos com notas e quantidades, renda fixa, perguntas e
   respostas, aportes. Os caches (Fundamentus, histórico de preços) se refazem sozinhos.
4. A chave da Pluggy (D6), cifrada de novo com a `ENCRYPTION_KEY` do Invest +.
5. **Conferência:** o script compara, conta por conta, o que leu e o que gravou; o dono abre o
   Invest + e vê o Diagrama dele igual ao do Capital antes de seguir.

Ordem: ensaio no `capital_dev` → `invest_dev`, depois produção no Pi, com um backup do banco do
Capital feito na hora.

### F5 — Publicar o Invest + no Pi

1. No Pi, uma pasta própria **`~/investapp/`** (repositório em `~/investapp/Invest`, logs em
   `~/investapp/logs`), nunca arquivos soltos no `~`. O banco continua em `~/capitalapp/db`.
2. `.env.local` de produção, `docker compose up -d --build` (container `invest`, rede `capital-db`).
3. Nome `invest.rincon.dev.br` no túnel Cloudflare apontando para `localhost:3001` (feito pelo dono
   no painel da Cloudflare) e `invest.rincon.dev.br` em `APP_ALLOWED_ORIGINS`.
4. Conferir: logs do container, tabelas criadas, testes automáticos verdes na Administração, login
   com uma conta migrada, instalação do PWA no celular.

### F6 — Tirar do Capital o que foi para o Invest +

Só depois da F5 conferida.

1. **Diagrama:** sai do catálogo (e o grupo "Investimentos" da gaveta, que fica vazio), a tela
   `/diagrama`, as rotas `/api/v1/diagram/*`, `components/diagram`, `lib/diagram`,
   `diagramRepository`, `fundamentals.ts`, o widget da Início, os tours, a verificação dos testes
   automáticos e a parte do Diagrama no "Exportar dados".
2. **Missões:** some a missão "Conhecer Diagrama" (sai junto com o módulo do catálogo); conferir que
   nenhuma outra missão leva ao Diagrama e que o XP já ganho continua contando (D8).
3. **Histórico:** fica só a aba Gastos (saem as abas, `InvestmentHistory`, `InvestmentCharts`, o
   histórico de preços e o tour que pedia o Diagrama).
4. **Open Finance:** sai o botão "Conferir investimentos", a rota `/api/v1/banks/holdings` e a
   conferência de quantidades (`lib/banks/holdings.ts`). **Ficam** "Conferir gastos", "Conferir
   recebimentos", a Reserva pelo saldo das contas e dos investimentos marcados, e os avisos.
5. **Cotações:** o Capital deixa de falar com a B3 e o Yahoo; o preço da Reserva investida vem do
   serviço do Invest + (D13), com o último preço guardado quando ele não responde.
6. **Limpeza das preferências salvas:** "diagram" sai dos widgets da Início de cada conta (e da conta
   modelo) e das preferências, numa migração de boot como as outras.
7. **Quem usava o Diagrama** (D10): aviso único e `/diagrama` levando ao Invest +.
8. Textos que citam o Diagrama: Privacidade (Fundamentus, Yahoo), README, tours.
9. Testes, conferência no localhost, push e deploy no Pi como sempre.

### F7 — Depois, com o OK do dono

Uma migração no Capital que apaga as tabelas do Diagrama (`diagram_*`), `fundamentals_cache`,
`price_history_cache` e a coluna de quantidade dos investimentos do Open Finance, com um backup
feito na hora. Até lá, "Apagar todos os dados" do Capital continua apagando essas tabelas também.

## Riscos e cuidados

- **Limite de 5 conexões do Meu Pluggy:** se as conexões do Invest + contarem junto com as do
  Capital, quem já usa as 5 vai precisar escolher. A F3 confere antes.
- **Senha copiada:** se o Better Auth não aceitar o hash copiado, a alternativa é a pessoa usar
  "Esqueci a senha" no primeiro acesso ao Invest +.
- **Memória do Pi:** um segundo container Next.js gasta algumas centenas de MB. O build de cada um
  leva mais de 10 minutos; não rodar os dois `update.sh` ao mesmo tempo.
- **Cota de e-mails do Gmail:** se os dois apps usarem o mesmo Gmail, o limite por hora/dia de cada
  um é contado à parte, mas a cota do Google é uma só.
- **Desenvolvimento:** o localhost do Invest + usa o `invest_dev` do Pi pela Tailscale; quando ela
  falhar, o mesmo truque do PGlite do Capital.
