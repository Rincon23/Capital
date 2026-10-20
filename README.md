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

### Palavras da interface

A interface usa palavras do dia a dia (só o texto muda; código, colunas e rotas continuam como
estavam): nem a tela Categorias nem o card da Início somam as categorias num "Ainda posso
gastar" ou num total "Para as categorias" — um total parecia dinheiro livre para gastar com tudo;
o topo das Categorias mostra só **Renda** e **Total gasto**, e cada categoria tem o seu **Limite**
e a **Sobra**.
Também: "na fatura de"/"no mês de" (nunca "competência"), **Falta para a reserva** (ou "Reserva
completa ✓"), **Meta da reserva**, **Dentro do planejado**, **Guardar / Retirar** (reserva
investida), **devolução**, **sem categoria** (a parte da reserva investida fora das categorias da
reserva), **dividido entre as categorias** e **telas** (as áreas de trabalho da Início).

### Módulos: cada pessoa monta o seu Capital

**Tudo o que o app faz é um módulo**, e todos **começam desligados** numa conta nova. Cada pessoa
liga os seus em **Módulos** (`/modulos`, na bandeja de apps). Desligar um módulo nunca apaga dados:
ele só some da bandeja, da Início e dos formulários. Religou, está tudo lá.

**Primeiro acesso.** Sem nenhum módulo ligado, a Início pergunta **"Como você quer usar o
Capital?"** com três cartões (`MODULE_KITS` em `lib/modules/kits.ts`): **Controlar meus gastos**
(Lançamentos + Gastos por categoria), **Gastos e cartão de crédito** (os dois + Cartão) e
**Escolher do meu jeito** (abre Módulos). Um kit liga o conjunto num toque (`turnModulesOn`) e abre
na hora a configuração das categorias, em 3 passos. Depois, o widget **Primeiros passos** fica no
topo da Início até a pessoa registrar a renda, lançar o primeiro gasto e abrir Categorias ("Ver
quanto ainda posso gastar"). Cada passo é um botão que abre o lugar certo e se marca sozinho (fica
salvo nos avisos já vistos). O widget some quando os três estão feitos e, como qualquer widget,
sai antes pelo "−". Contas de antes dessa tela nunca recebem o widget.

A ficha de cada módulo (nome, explicação, grupo, dependências, tela e card do Início) fica escrita
uma vez em `lib/modules/catalog.ts`. A bandeja de apps, a Início e a tela Módulos leem dela. Os
ícones e os cards ficam em `components/modules`.

**Tela Módulos.** Um card por módulo, nos grupos da bandeja de apps (Dinheiro do mês, Carteira,
Investimentos, Assistente): ícone, nome, o que é em poucas palavras (`tagline`) e o switch; tocar no
card mostra a descrição inteira. No topo, uma linha só: "Ligue só o que você usa. Desligar não
apaga nada."

**Dependências.** Alguns módulos precisam de outro para funcionar:

- Lançamentos
  - Gastos por categoria
    - Histórico e gráficos
  - Cartão
  - A receber
  - Contas do mês
  - Lançar por voz ou texto
- Reserva, Diagrama, Lembretes e Monitor de Gmail funcionam sozinhos.

Um módulo cujo pai está desligado aparece com **cadeado** e o selo "Precisa de …". Tocar nele
abre uma janelinha: "Para usar Histórico e gráficos, ligue também Gastos por categoria", com
**"Ligar os dois"** (ou "os três", na corrente inteira) e "Agora não". **O app nunca liga o pai
sozinho**: só quando a própria pessoa pede o conjunto, nessa janelinha, na tela de um módulo
desligado (`ModuleGate`) ou nos kits do primeiro acesso. Desligar um módulo de que outros dependem
pede confirmação e desliga os filhos junto. Cada mudança é salva na hora, com "Desfazer". A regra também vale no servidor:
`resolveModules` só considera ligado um módulo cujos pais estão ligados.

**Dinheiro do mês**

- **Lançamentos** (`/mes/[mês]/lancamentos`) — gastos e rendas do mês com busca, abas por
  categoria, "Lançar gasto", "Renda" e "Apagar dados do mês". Sem ele não existe formulário de gasto.
  **Custos Fixos e Imprevistos ficam na mesma aba**: são as duas categorias sem meta própria, as
  duas rateadas entre as categorias, e separá-las só obrigava a adivinhar em qual das duas o gasto
  tinha sido lançado; cada linha diz qual das duas é.
- **Gastos por categoria** (`/mes/[mês]/categorias`) — metas em % da renda, "posso gastar", sobra
  por categoria, custos fixos e imprevistos com o rateio, e "Fechar mês". Detalhe da categoria em
  `/mes/[mês]/categoria/[id]`. Desligado, o gasto continua sendo lançado numa categoria (que segue
  editável na engrenagem de Lançamentos, com nome, descrição e cor), mas somem as metas, o
  percentual e a regra dos 100%. As regras das categorias estão em "Categorias" logo abaixo.
- **Cartão** (`/cartao`) — tudo do cartão num módulo só: a pergunta "A compra foi no cartão?", os
  cartões cadastrados, o parcelamento e a fatura de cada mês. Desligado, a pergunta some; gastos
  antigos marcados no cartão continuam marcados. A tela tem três abas, no jeito de um app de
  banco, e está detalhada em "O módulo Cartão" logo abaixo.
- **A receber** — dinheiro que saiu por outra pessoa, que vai devolver. **Não** entra em nenhuma
  categoria, no rateio dos custos fixos nem no gasto do mês, e **não precisa ser no cartão**:
  emprestar R$ 50 em dinheiro é a mesma coisa — por isso o módulo só precisa de Lançamentos, e não
  do Cartão —, e a pergunta "a compra foi no cartão?" fica
  livre como em qualquer outro gasto — foi no cartão, entra na fatura (`cardTotal` e
  `reimbursableTotal`); não foi, é só um valor que alguém te deve. Tem uma aba em Lançamentos,
  dividida em **"Ainda devem"** e **"Já me pagaram"**, com o total de cada lado: um toque no
  círculo de cada linha marca quem pagou (`expenses.reimbursed_at`). A marca não mexe em número
  nenhum — o dinheiro saiu de qualquer jeito e nunca consumiu categoria —, ela só tira a linha do
  que ainda é seu a receber, e é esse valor que o card do Início mostra.
- **Histórico e gráficos** (`/historico`) — aba **Gastos**: o gasto de cada mês contra a sua média e a renda (toque numa barra para trocar de mês), as categorias do mês e cada categoria mês a mês (gasto × limite ou sobra). Com o **Diagrama** ligado, aba **Investimentos**: a subida e a descida da carteira em 1M/6M/1A/5A, por tipo e por ativo — a carteira de hoje aos preços de cada dia (Yahoo, grátis e sem token, em `price_history_cache`); sem as cotas, cada ativo conta igual.

**Carteira** (cada um com tela própria; o antigo painel `/carteira` redireciona para o Início):
  - **Contas do mês** (`/carteira/recorrentes`; o antigo "Gastos recorrentes") — as contas de todo
    mês (aluguel, luz, internet) como uma lista do mês na tela: no topo, **"Falta lançar R$ 640"**
    com a barra de quantas já foram (ou **"Tudo lançado ✓"**); embaixo, o que falta, a próxima a
    vencer primeiro ("vence dia 10", "vence hoje", "venceu dia 5" em vermelho), e as **Já
    lançadas**, com o dia. O mês troca deslizando, como na fatura do Cartão. Cada conta pode ter um
    **dia do vencimento** (`recurring_expenses.due_day`, 1–31, 29–31 caem no último dia dos meses
    curtos), opcional como tudo: "Não informar" é a primeira opção.
    "Lançar" abre o **mesmo formulário de gasto de sempre**, já preenchido e com a data de hoje, no
    mês que está na tela — inclusive com "À vista / Parcelado" quando a conta é paga no cartão,
    porque lançar é lançar uma compra nova como qualquer outra. O gasto salvo aponta para a conta
    (`expenses.recurring_id`; numa compra parcelada, `installments.recurring_id`, contada no mês da
    compra), e é **só isso** que marca a conta como lançada: nada fica guardado à parte, então
    apagar o gasto devolve a conta para a lista. Tocar numa conta que falta abre **Lançar**, **Já
    lancei este mês** (escolhe, entre os gastos do mês, o que foi essa conta — os da mesma categoria
    primeiro — e liga os dois) e **Editar conta**. Os gastos lançados de um recorrente antes disso
    existir foram ligados uma vez, na subida (`lib/server/recurringLaunchLink.ts`), só onde não havia
    dúvida: mesma descrição e mesma categoria de uma conta só.
    **Aviso no celular** (`lib/server/recurringBills.ts`): no dia do vencimento, no horário escolhido
    na engrenagem (padrão 09:00), e, com "Lembrar de novo até lançar", uma vez por dia por até 3
    dias depois, enquanto a conta não for lançada. A notificação traz **Lançar ✅**, que lança a conta
    como ela é sem abrir o app (token assinado, como o "Fatura paga"; duas vezes é uma só), menos a
    parcelada, que precisa do formulário. Só avisa das contas com dia do vencimento, e a categoria
    "Contas do mês" pode ser desligada na Central de notificações.
    **A própria conta pode ser parcelada**: marcando "Esse gasto é pago no cartão?", o formulário
    pergunta "Como você paga?" e guarda em quantas vezes e como entra no orçamento
    (`recurring_expenses.installment_count` e `installment_accounting`). Não guarda data: a
    primeira cobrança vem do cartão no dia do lançamento. Aí "Lançar" já abre em "Parcelado", com
    o número de vezes preenchido, e salvar cria a compra parcelada. Tirar o cartão da conta
    apaga o parcelamento dela, porque parcelar só existe no cartão.
  - **Reserva** (`/carteira/caixa`) — um módulo só para o que eram dois, "Reserva de emergência" e
    "Reserva investida": para a pessoa é uma coisa só, a reserva dela. A tela tem duas abas,
    **Emergência** e **Investida** (`?aba=investida`; o antigo `/carteira/reserva` leva para lá), e
    a engrenagem junta o que era das duas (reserva em conta, custos, meses da meta e o ativo). Quem
    tinha a investida ligada passou a ter a Reserva ligada, com o widget no mesmo lugar da Início
    (`migrateReserveModule` em `lib/modules/migration.ts`, uma vez na subida; o servidor também
    aceita a chave antiga de um backup ou de um app em cache).
    - **Investida** — no topo, o valor das cotas, com **Guardar / Retirar** em destaque; a cotação e
    o "Atualizar" ficam embaixo. São cotas de um ativo (AUPO11 por padrão) divididas em categorias da
    reserva, cada uma ligada a uma categoria do orçamento — guardar lança gasto, então essa parte
    precisa de Lançamentos; sem ele, a aba mostra as cotas e deixa comprar ou vender. **Remanejar vai nos dois sentidos**:
    *Guardar* compra cotas para a categoria da reserva e lança o gasto na categoria do orçamento;
    *Retirar* faz o caminho de volta — as cotas voltam para a reserva livre e a categoria do
    orçamento recebe um **estorno** (um lançamento negativo, "AUPO11 (retirada)"), para o mês não
    continuar mostrando um gasto que a pessoa desfez. Nenhuma categoria entrega mais cotas do que
    tem. Tudo na mesma transação. A cotação é grátis e sem token (`lib/server/quotes.ts`): vem da própria B3
    (`cotacao.b3.com.br`, com uns 15 min de atraso) e, se ela falhar, do Yahoo Finance; fica em
    cache e se atualiza sozinha ao abrir a Carteira quando tem mais de 15 min. Nenhuma das duas é
    uma API documentada com garantia, por isso há duas e o app nunca depende de uma resposta ao
    vivo para abrir a tela.
    - **Emergência** — no topo, o número da tela: "R$ 8.000 de R$ 12.000" (a reserva já
    sem as dívidas, contra a meta), com barra e "Faltam R$ 4.000" ou "Reserva completa ✓"; reserva
    em conta, investida sem categoria, dívidas e meta ficam em "Ver detalhes", e o texto do plano
    vira uma linha com ⓘ. A dívida do cartão é a soma das faturas **em aberto** (de
    todos os cartões e competências, inclusive a "Não informado"); a dos parcelados é só o que cai
    **depois** da competência corrente, então cada real é contado uma vez.
    **O plano da reserva** (`lib/budget/reserve.ts`) mora nesta tela, que é onde aparece o quanto
    falta: um imprevisto grande — R$ 5.000 de saúde para quem ganha R$ 3.000 — não cabe no mês em
    que acontece, sai da reserva, e é a reserva que fica no vermelho. Com o gap negativo a tela
    oferece **montar um plano**: quanto recompor e em quantos meses ("R$ 5.000 em 10 meses =
    R$ 500 por mês"), com espaço para dizer o que abriu o buraco. Todo mês o card mostra o
    progresso e um botão que lança a parcela: o valor vira um gasto **"Recompor a reserva"** na
    competência, como **imprevisto** (é o que ele é — recompor não é investir, que é dinheiro com
    objetivo de longo prazo; a categoria vem marcada como **Recomendado** e pode ser trocada). O
    plano **não mexe no saldo da reserva**: onde o dinheiro recomposto fica — na conta ou em cotas
    — não muda nada do que ele acompanha, e continua sendo a pessoa quem diz, na reserva em conta e
    nas cotas. O plano guarda só o que ela decidiu: quanto já voltou, quanto falta e
    quantos meses restam vêm sempre da soma das parcelas lançadas, então pular um mês adia o plano
    em vez de quebrá-lo, e duas parcelas no mesmo mês somam. Desistir do plano não apaga os gastos
    já lançados — o dinheiro voltou mesmo para a reserva.

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

**Lançar um gasto.** O botão "Cartão" ao lado do valor (rótulo acessível "A compra foi no
cartão?") tem borda e cor normais, para não passar despercebido. Salvar um gasto novo mostra o que
ele fez com a categoria, com **Desfazer** (`expenseFeedback` em `lib/budget/feedback.ts`): "R$ 45,00
em Diversos · ainda dá R$ 320,00 este mês", ou "passou R$ 30,00 da meta"; custos fixos e
imprevistos falam do total, e A receber e Fora do orçamento dizem que não mexem em categoria. Um
gasto sem descrição leva o nome da categoria. A receber e Fora do orçamento, ao serem escolhidos,
mostram uma linha curta (com o "Não recomendado") e o resto atrás de um ⓘ.

**Parcelar ao lançar o gasto.** Marcando "A compra foi no cartão?" e escolhendo o cartão, o
formulário pergunta como você pagou: `À vista` ou `Parcelado`. Parcelado pede em quantas vezes
(2 a 120) e a primeira cobrança (já preenchida com o próximo vencimento do cartão), usa **a
categoria que você escolheu no formulário** e oferece as duas formas de entrar no orçamento — que
nunca se chamam "à vista", palavra que fica só para o pagamento:

- **Contar tudo neste mês (recomendado)** — o gasto inteiro conta na categoria no mês da compra;
  nos meses seguintes só a parcela aparece na fatura.
- **Contar uma parcela por mês** — a parcela de cada mês conta na categoria daquele mês e aparece
  nos lançamentos dela, inclusive nos meses que ainda não foram abertos.

Em vez de frases, uma prévia mostra o resultado: "Na fatura 10× R$ 87,24", a faixa dos meses
("out/26 ▸ nov ▸ dez ▸ … ▸ jul/27") e o que a categoria recebe ("R$ 872,40 em out/26" ou "R$ 87,24
por mês"). Internamente os modos continuam `upfront` e `installment`.

`1 vez` não cria parcelamento: vira um gasto comum.

**Uma compra parcelada que já vinha sendo paga.** O **+** da aba Parcelados abre o mesmo
formulário da compra, vazio, e aceita uma primeira cobrança **no passado** — é assim que entra um
parcelamento de antes do Capital. Quando alguma parcela já caiu, o formulário para e pergunta o
que fazer com ela:

- **Começar a contar de agora (recomendado)** — as parcelas já pagas ficam **fora de tudo**:
  nenhum gasto, nenhuma fatura e nenhuma dívida nos meses que já passaram, que continuam com os
  números que têm. Só o que falta aparece. Como parte da compra já foi paga, a forma de
  contabilizar fica travada em **contar uma parcela por mês**: contar tudo de uma vez teria de
  lançar a compra inteira no mês em que ela foi feita, que é o passado que a pessoa pediu para não
  mexer.
- **Lançar tudo retroativo** — todas as parcelas entram nos meses em que caíram, **nos meses que
  já existem no app**; um mês fechado impede o cadastro, como em qualquer outra edição.

No banco isso é `installments.paid_count`: as `paid_count` primeiras cobranças simplesmente não
existem para o app (`activeChargeRange` em `lib/budget/installments.ts`), nem na fatura, nem no
orçamento, nem na dívida, nem na conta de quais meses a compra toca.

**Adiantar parcelas.** Cada compra em andamento tem **"Adiantar parcelas"**, para quando a pessoa
paga antes da hora — e, porque quase sempre há abatimento, o app **pergunta se teve desconto** em
vez de deixar a compra parecer mais cara do que foi. Escolhendo quantas parcelas foram adiantadas
(saem do **fim**, então a compra termina antes) e o desconto, o app mostra a conta pronta
("3× de R$ 87,24 = R$ 261,71 − R$ 50,00 de desconto · você pagou R$ 211,71") e, ao confirmar, faz
as duas metades numa transação só:

- as parcelas adiantadas saem do parcelamento (`installments.advanced_count`), então somem das
  faturas em que iam cair, da dívida e dos próximos meses; adiantando todas, a compra vai para os
  encerrados;
- o que foi realmente pago vira **um lançamento** na competência do pagamento, "Adiantamento ·
  *nome da compra*", na fatura do mesmo cartão. Contando **uma parcela por mês**, ele conta na
  categoria da compra, no lugar das parcelas que iam cair; contando **tudo no mês da compra**, ele
  entra como **Fora do orçamento**,
  porque a compra inteira já contou no mês em que foi feita e contar de novo seria cobrar duas
  vezes da mesma categoria.

O valor e o número de parcelas da compra **não** são reescritos: o que ela custou, custou, e mexer
neles mudaria o valor de cada cobrança.

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
    Calendário dos compromissos; card "Lembretes de hoje" no Início. No calendário, tocar num dia
    **com** compromisso abre o que tem nele; tocar num dia **livre** (de hoje em diante) abre o
    formulário de lembrete já naquela data — um dia que já passou não faz nada, porque não há o
    que lembrar.
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
- **Open Finance** (`/bancos`, só VIP; em construção, por fases): traz os bancos da pessoa pelo
  **Meu Pluggy**, grátis e só leitura, com a chave da própria pessoa.
  - **Configuração em 4 passos**, uma linha e um botão cada, e o app guarda em que passo a pessoa
    parou:
    1. conectar os bancos em meu.pluggy.ai (o app abre o site);
    2. criar a chave no dashboard da Pluggy (o app abre; o aviso de "teste de 15 dias" fica atrás
       do ⓘ, porque não vale para uso pessoal);
    3. colar o Client ID e o Client Secret, que a Pluggy confere antes de salvar;
    4. **"Trazer um banco"**: o app manda a pessoa ao Meu Pluggy para escolher **um** banco e
       autorizar, e a Pluggy a devolve para `/bancos`.
  - **Chegada do banco:** ele aparece como "Chegando…" e a tela relê a cada 5 s até as contas
    chegarem (~2 min).
  - **Nome do banco:** o Capital sugere, pelo código do banco na conta ou pelo nome da conta, e a
    pessoa troca no lápis, onde também tira o banco.
  - **"Trazer outro banco"** mostra "3 de 5 conexões grátis". Uma autorização largada pela
    metade some sozinha depois que o link vence.
  - **Engrenagem:** a chave (o Secret só como "••••1234"), "Trocar a chave" e "Desconectar
    tudo". Desconectar tira os bancos da aplicação da pessoa na Pluggy e apaga a chave; os
    bancos continuam no Meu Pluggy.
  - **Tela dos bancos:**
    - em destaque, o **saldo nas contas**: a soma das contas, sem os cartões, porque o valor do
      cartão é o que se deve;
    - cada banco com "atualizado há 5 h", as contas com saldo e os cartões com o valor em aberto
      e o vencimento, quando ele ainda está por vir;
    - "Buscar novidades" relê a Pluggy (não faz o banco mandar antes), até 6 vezes em 10 min.
  - **Avisos na tela:**
    - banco sem dados há mais de 48 h fica **"Parado"**, com "Reconectar no Meu Pluggy", mesmo
      com a Pluggy dizendo que está tudo bem;
    - 15 dias antes de a autorização vencer, aparece "A autorização vence em N dias", com
      "Renovar";
    - um banco que a Pluggy perdeu pede "Trazer de novo".
  - **Avisos no celular** (categoria "Open Finance" em Notificações, só para VIP):
    - depois de cada leitura com novidade, **um resumo por banco**: "🏦 Nubank — Chegaram 3
      compras no cartão (R$ 120,00) e 1 Pix recebido (R$ 50,00)." Nunca "agora";
    - banco **parado** (48 h) e autorização **vencendo** (15 dias) avisam uma vez cada;
    - ficam de fora a primeira leitura (o ano de histórico), o que tem mais de 7 dias, o
      pagamento de fatura, o estorno e o dinheiro movido entre contas da própria pessoa;
    - na engrenagem: compras, Pix enviados, Pix recebidos e um valor mínimo opcional. (Houve um
      aviso próprio do salário; o dono o tirou em 2026-10-20 por não ver utilidade.)
  - **"Confira os gastos"** (`/bancos/conferir`, precisa de Lançamentos; o aviso "Chegaram…" abre
    aqui). O que chegou dos bancos e ainda não está no Capital, desde uma semana antes de cada
    banco ser conectado (o ano de histórico não entra):
    - cada linha tem descrição, valor, data, banco e a categoria sugerida, com **"Lançar"** (um
      toque), o lápis (o formulário de gasto, de compra parcelada ou de renda, já preenchido) e
      "Ignorar". Débito sugere gasto, crédito sugere renda;
    - **categoria sugerida**, nesta ordem: o que a pessoa escolheu antes para a mesma descrição;
      uma categoria dita na descrição (as regras de `lib/ai`, sem IA); a categoria da Pluggy
      traduzida para os nomes das categorias da pessoa; e o que as categorias padrão significam
      (Diversos = comer fora, compras, lazer; Conhecimentos = cursos e livros; Metas = viagem;
      Custos Fixos = assinaturas, contas, aluguel). Sem palpite, o botão vira "Escolher
      categoria" e abre o formulário: nada é chutado;
    - **cartão**: cada cartão do banco é ligado uma vez a um cartão do Capital (ou "Não
      informar"). A pergunta só aparece para o cartão que tem compra na lista;
    - **compra parcelada**: as parcelas da mesma compra viram uma linha só, venha o banco com
      todas de uma vez ou uma por mês ("10× de R$ 87,23 · comprada em 09/02"). "Conferir
      parcelado" abre o formulário de compra parcelada, que já sabe quantas parcelas caíram
      ("Começar a contar de agora"). As próximas parcelas de uma compra que já está no Capital
      são reconhecidas e ficam de fora;
    - **duplicados**: um gasto (ou renda) lançado à mão com o mesmo valor, até 2 dias de
      diferença e no mesmo cartão vira "Parece que você já lançou isso", com "É o mesmo" (só liga
      os dois) ou "É outro";
    - **deixados de fora, com o motivo à vista**: pagamento de fatura, dinheiro entre contas da
      pessoa, aplicação/resgate/rendimento, estorno e parcela de compra já lançada. Cada um tem
      "Lançar mesmo assim" e "Tirar da lista", e há "Tirar todos da lista";
    - **fatura**: um pagamento de fatura que bate com uma fatura em aberto sugere "Marcar a fatura
      de out (Nubank) como paga?", sempre com um toque. Nenhuma fatura sai sozinha;
    - **A receber** (com o módulo ligado): um Pix recebido perto do valor de um "A receber" em
      aberto pergunta "É a devolução de 'Jantar — João' (R$ 35,67)?". Perto é até 10% dele, ou
      R$ 5 quando isso for mais, para cima ou para baixo (quem devolve arredonda):
      - ao confirmar, a **sobra** (Pix de R$ 36: R$ 0,33) entra como renda ("Devolução a mais:
        Jantar — João") e a **falta** (Pix de R$ 35: R$ 0,67) entra como gasto em Imprevistos
        ("Faltou na devolução: …"), no dia do Pix. A caixa avisa disso antes do toque;
      - **de quem é**: primeiro o que fala de quem pagou, pelo nome que o banco mandou ou pelo que
        o app aprendeu, como nas categorias dos gastos. Cada "Marcar como recebido" ensina: o
        próximo Pix do mesmo CPF prefere o A receber com as palavras que ele já pagou ("João").
        Depois, o valor mais perto; depois, o mais recente;
      - "É outro A receber" mostra os outros em aberto perto do valor, cada um com "É este";
      - "Marcar como recebido" usa o mesmo "Já me pagou" da tela do A receber; "É outra coisa"
        volta a oferecer a renda. Nunca automático.
  - **Reserva pelos bancos** (na engrenagem da Reserva, com Open Finance ligado):
    - "Atualizar pelos bancos conectados" lista as contas e os investimentos de cada banco. Nada
      vem marcado: o app não supõe qual banco é a reserva de cada um;
    - investimentos de renda fixa aparecem de cara; ações e fundos ficam atrás de "Mostrar ações
      e fundos", e o que tem saldo zero não aparece;
    - a "Reserva em conta" passa a ser a soma do que foi marcado, reescrita a cada leitura, e o
      campo fica só leitura com "BTG Pactual · atualizado há 5 h". Se um banco parou, avisa que o
      valor é o último que chegou;
    - "Mudar as contas da reserva" e "Voltar a digitar à mão" (o último valor fica para editar).
  - **Quantidades no Diagrama** (aba "Ativos e notas", com Open Finance ligado e conta VIP): a
    corretora diz quantas ações e cotas a pessoa tem, e o Diagrama confere ativo por ativo:
    - com o Diagrama ligado, a tela dos bancos tem **"Conferir investimentos"**: abre o Diagrama
      (`/diagrama?aba=ativos&conferir=1`) já na conferência, só com o que difere, ou com "Tudo
      confere com BTG Pactual". Se as quantidades ainda não chegaram, diz que vêm na próxima
      leitura;
    - cada ativo com código da B3 ganha "✓ Confere com BTG Pactual" ou "BTG Pactual: 120 · aqui:
      100" com **"Usar 120"**, que salva pela mesma função da ficha do ativo. Nada é trocado
      sozinho: uma compra leva uns 2 dias úteis para aparecer (liquidação na B3), e a linha de
      ajuda diz isso junto com "atualizado há 5 h" (ou que um banco parou);
    - um ativo que nenhum banco mandou aparece como "BTG Pactual: 0 · aqui: 50", com "Usar 0";
      se o banco tem outra classe da mesma empresa que o Diagrama não tem, a linha avisa ("No
      banco tem KLBN4: 157."), porque pode ser só o código trocado;
    - "Ver só os ativos diferentes do banco" esconde os que conferem;
    - **"No banco, mas não no Diagrama"**, com "Adicionar": o formulário de ativo já vem com o
      código, a quantidade e o tipo (ação → Ações nacionais, FII → Fundos imobiliários, BDR → Ações
      internacionais). Num ETF, ou num código terminado em 11 que o banco chama de ação (o BTG põe
      ali ETFs e FIIs, como AUVP11 e PMLL11), a pessoa escolhe o tipo e a busca traz o nome e se é
      ETF. Começa recolhido quando passa de 3 itens. Não são oferecidos o que a pessoa marcou como
      Reserva na lista dos bancos nem direitos de subscrição e recibos (finais 1, 2, 9, 10, 12–15,
      como HGRU12);
    - ficam de fora a renda fixa, os fundos sem código da B3, as opções e o que o Open Finance não
      traz (ativos no exterior, cripto): VOO ou BTC nunca aparecem como "faltando no banco";
    - **Reserva investida:** com o módulo Reserva ligado, as cotas dela contam junto com as do
      Diagrama no ticker dela (AUPO11…), porque costumam estar na mesma corretora. "Aqui" vira
      Diagrama + Reserva, e a correção só mexe no Diagrama ("Deixar 30 aqui" = banco − Reserva). Se
      a Reserva sozinha tem mais do que o banco, a linha leva a "Ver a Reserva".

### Navegação: a Início como a tela de um celular

Não há rodapé: a **Início** (`/mes/[mês]`) faz o papel da tela inicial de um celular (HyperOS), e
`/` sempre abre a Início do último mês visto.

- **Áreas de trabalho** (`resolveHomePages` em `lib/modules/home.ts`): a Início tem até **5 áreas**
  lado a lado, cada uma com os seus widgets, salvas por conta em `budget_settings.home_pages`
  (vale em todos os aparelhos; nulo é o padrão, uma área só na ordem do catálogo). Deslizar para o
  lado troca de área com a física de antes (a tela acompanha o dedo, cede na primeira e na última,
  troca com 30% da largura ou um peteleco, `components/layout/swipePhysics.ts`); funciona com mouse
  e com as setas, e as bolinhas embaixo dizem em qual você está. Cada área rola sozinha e guarda a
  própria posição; a área aberta fica guardada na sessão. Um módulo ligado traz o widget dele para
  o fim da última área; um widget extra (o Calendário dos Lembretes) entra logo depois do card do
  seu módulo, e o Primeiros passos entra no topo da primeira área. Um Início salvo antes das áreas
  (`home_order`) vira a área 1.
- **Bandeja de apps** (`components/layout/AppDrawer.tsx`): a setinha embaixo da Início (toque, Enter
  ou arrastar para cima) abre o que era o Mais: a conta, **todo** módulo ligado com tela, agrupado
  (com o selo de lembretes não lidos no ícone), Módulos, Privacidade, Configurações e, para o dono,
  Administração. Em grade ou lista. Fecha com o botão voltar do celular, Esc, o "⌄" ou arrastando
  para baixo. Links antigos para `/mais` abrem a Início com ela aberta; `/rodape` leva à Início.
- **Gestos que se mostram** (dicas de uma vez só, nunca um tour): a setinha tem o rótulo "Apps" e,
  até a bandeja ser aberta uma vez, dá uns pulinhos discretos quando a Início aparece
  (`hint:apps`). Com mais de uma área, a primeira vez mostra "Deslize para o lado para ver a outra
  tela" (`hint:swipe-areas`); nas telas com mês (Lançamentos, Categorias e a fatura do Cartão),
  "Deslize para trocar o mês" aparece embaixo do mês (`hint:swipe-month`, uma vez para todas). Cada
  dica (`useOneTimeHint`) fica salva nos avisos vistos assim que aparece, some sozinha em 6 segundos
  ou quando a pessoa faz o gesto, e as setas ‹ › continuam. Os avisos vistos só crescem: o
  `SettingsProvider` junta os de saves feitos ao mesmo tempo e salva um de cada vez, para nenhum se
  perder.
- **Telas de módulo**: toda tela tem a seta de voltar para a Início (como fechar um app), e a de uma
  categoria volta para Categorias.
- **Modo de edição** (o lápis, ou segurar num espaço vazio): as áreas encolhem e mostram a borda das
  vizinhas. Segure um widget (240 ms) e arraste para mudar de lugar, até a borda (600 ms) para levar
  à área do lado, ou, na última, criar uma área nova; "Mover" faz o mesmo sem arrastar. **Só o "−"
  vermelho tira um widget da Início**: soltar um widget, em qualquer lugar, nunca tira. A **bandeja
  de widgets** embaixo traz de volta os tirados, com um toque ou arrastando até o lugar, além de
  listar os widgets de módulos desligados. Excluir uma área leva os widgets dela para a área do
  lado; áreas vazias somem ao sair. "Voltar ao padrão" fica no topo: uma área só, com todos os
  widgets e nenhum guardado. Tudo salva na hora; o botão voltar do celular fecha a bandeja e depois
  sai do modo de edição. O seletor de mês fica no topo de todas as áreas.
- **Widgets** (`components/modules/home`): tocar num widget abre a tela do módulo. Cada um carrega
  os próprios dados, mostra esqueleto enquanto carrega e, se falhar, não derruba os outros; a
  carteira e os lembretes são lidos uma vez para todas as áreas. Sem nenhum módulo, a Início mostra
  "Como você quer usar o Capital?" (veja Primeiro acesso, acima).
- **Tela de módulo desligado** (`ModuleGate`): explica o módulo e oferece ligar ali mesmo, ou diz
  qual módulo precisa ser ligado antes.
- **Avisos já vistos**: `budget_settings.dismissed_notices` guarda, por conta, as chaves dos avisos
  de uma vez só: as perguntas da primeira visita de um módulo (`intro:<módulo>`), o Primeiros passos
  (`first-steps` quando a conta passou pelo primeiro acesso, e `first-steps:<passo>` para cada
  passo feito) e futuros cards de novidade.

### Ajuda, configurações e primeira visita de cada módulo

- **Ajuda ("?")**: todo módulo tem um botão que roda o tour só dele, o spotlight do driver.js que
  escurece a tela, destaca uma parte por vez e explica para que serve. Fica no topo da tela do
  módulo; nos módulos sem tela, no card do Cartão no Início, na aba A receber de Lançamentos e na
  janela de voz. Os passos ficam em `lib/modules/tours.ts` (um `Record` por módulo, então módulo sem
  tour não compila), **no máximo 4 por módulo, cada um com uma linha** (um teste confere) e apontam só para a tela do módulo (ou para o widget dele, e a Início troca
  para a área em que ele está), nunca para a setinha ou as bandejas. Todo tour termina no
  próprio botão de ajuda. O motor (`components/modules/tour/TourProvider.tsx`) navega entre as
  telas, espera cada elemento aparecer, abre e fecha o formulário de gasto ou a janela de voz quando
  o passo pede e volta para onde começou. Um teste confere que toda âncora de tour existe nas telas e
  que todo módulo tem o botão de ajuda.
- **Configurações do módulo (engrenagem)**: ficam na tela do próprio módulo. Categorias: nome,
  descrição, cor, ordem e metas (com a regra dos 100%), e "Restaurar categorias padrão".
  Lançamentos: nome, descrição e cor das categorias, sem metas. Lembretes: notificações deste
  aparelho e horários para lembrar de novo. Gmail: notificações. Cartões: horário do aviso, insistir
  até a fatura ser paga e notificações deste aparelho. Contas do mês: aviso no dia do vencimento,
  horário, lembrar de novo até lançar e notificações deste aparelho. Reserva: reserva em conta,
  custos de emergência e o ativo das cotas. **Configurações** fica só com o que é
  geral: conta, tema, backup, dados locais e apagar tudo (Módulos e Privacidade ficam na bandeja de
  apps).
- **Primeira visita** (`useModuleIntro`): o tour nunca começa sozinho, só pelo "?". O único módulo
  que pergunta algo sozinho na primeira visita é Categorias, com a configuração das categorias
  (veja abaixo), a menos que ela já tenha sido feita no primeiro acesso. Fica guardado por conta,
  então acontece uma vez só, no aparelho que chegar primeiro. Não existe
  mais um tour geral do app nem uma "Ajuda" geral: a ajuda de cada coisa fica na tela dela.

- **Confirmações** (`useConfirm`): título e uma frase só, com o que importa para decidir ("As compras
  de Nubank passam para a fatura Não informado.").

### Categorias

- **As quatro padrão** (`DEFAULT_TOPICS` em `lib/budget/topics.ts`) vêm com uma descrição que ensina
  o jeito certo de usar: **Diversos** (os prazeres e confortos da vida, presentes e o que poderia
  esperar, mas você quer agora), **Investimentos** (qualquer investimento que faça o dinheiro
  render), **Metas** (casa, carro, casamento, aniversário, viagem) e **Conhecimentos** (tudo que
  agrega conhecimento). Toda categoria tem descrição, que a pessoa escreve ao criar e pode editar.
  Cada padrão guarda um `preset`, para ser reconhecida mesmo renomeada.
- **Custos Fixos**: um gasto de todo mês que é maior do que o limite médio mensal da categoria vai
  para custos fixos, e não para a categoria (sem exemplo de valor: depende de quanto cada categoria
  recebe). A tela Categorias explica renda, custos fixos, imprevistos e cada categoria. O nome
  padrão está no plural — é uma categoria que
  guarda vários custos, e no singular parecia uma conta só; quem já tinha a conta criada foi
  renomeado uma vez só (`lib/server/fixedCostLabelMigration.ts`), e só quem ainda estava no nome
  padrão: um nome escolhido pela pessoa nunca é tocado.
- **Criar é possível, mas desaconselhado**: ao lado de todo "Adicionar categoria" o app diz que a
  maioria das pessoas fica satisfeita com as quatro padrão, e pede confirmação antes de criar.
- **Nunca se exclui, só se arquiva.** A categoria arquivada some da lista (não há lista de
  arquivadas) e os meses passados continuam como estavam. No mês atual e nos próximos ela some na
  hora; se o mês atual já tiver gastos nela, ela fica até o fim do mês, marcada como arquivada e sem
  % da renda, para nenhum gasto sumir dos totais. O servidor garante: um salvamento que deixe uma
  categoria de fora a guarda arquivada (`keepEveryTopic`).
- **Restaurar categorias padrão** (na engrenagem): as quatro padrão voltam como vieram (nome,
  descrição, cor e %) e todas as outras são arquivadas, com "Desfazer".
- **Configuração das categorias** (`OnboardingWizard`: no primeiro acesso, na primeira visita a
  Categorias e no botão "Me ajude com as %"), em 3 passos, sempre com "Pular": a renda; os custos
  fixos e os imprevistos na mesma tela (só para a prévia, nada é lançado; a regra do custo fixo fica
  no ⓘ); e as porcentagens, cada categoria com a descrição dela embaixo do nome e a prévia de quanto
  a % deixa para gastar. Dá para criar uma categoria ali também, com o mesmo aviso.
- **"Fora do orçamento"** (`categoryKind: 'uncounted'`): ao lado das categorias, no formulário de
  gasto, fica a saída de emergência — marcada **"Não recomendado"** ali mesmo, e explicada em duas
  linhas sempre que é escolhida. O gasto fica registrado e, se foi no cartão, entra na fatura, mas
  **não consome nenhuma categoria** e fica fora do total gasto do mês e do rateio dos custos fixos
  (é o mesmo mecanismo do "A receber", mas sem ninguém para devolver o dinheiro — por isso o
  aviso). Não é um módulo: está sempre ali, como Custo Fixo e Imprevistos, e o nome e a cor dela
  podem ser mudados na engrenagem, junto com as outras. Em Lançamentos ela só ganha uma aba
  **depois** que o mês tem algum gasto assim, para não ficar convidando.

- **Renda para uma categoria só** (`Income.topicId`): no formulário de renda (com o orçamento
  ligado), "Para quais categorias" oferece **"Todas, pelas %"** — marcada **"Recomendado"** e o
  padrão — e **"Uma categoria só"**, marcada **"Não recomendado"** e explicada sempre que é
  escolhida. A renda direcionada entra no total de renda do mês, mas não passa pelas %: vai
  inteira para o "posso gastar" da categoria escolhida ("+ Renda só desta categoria" no detalhe
  dela). Se a categoria não estiver mais no mês, a renda volta a ser dividida pelas %, para
  nenhum dinheiro sumir do orçamento.

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

**Conta de teste do primeiro acesso.** Com `TEST_ACCOUNT_EMAIL` (terminado em `.test`) e
`TEST_ACCOUNT_PASSWORD` no `.env.local`, entrar com esse e-mail e essa senha cria a conta (já
confirmada) e apaga todos os dados dela **a cada login** (`lib/server/testAccount.ts`): ela sempre
abre como uma conta nova, para testar o que aparece primeiro. Um e-mail que não termine em `.test`,
ou o `OWNER_EMAIL`, é ignorado, então nenhuma conta de verdade é apagada por engano.

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
   # WHISPER_URL e OLLAMA_URL (lançar por voz ou texto), ex.: http://100.x.y.z:8090 e :11434
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

**Porta só para o túnel:** o container publica a porta 3000 apenas em `127.0.0.1` (só o próprio
Pi), para ninguém na rede falar direto com o app, pular a Cloudflare e forjar o IP que os limites
de acesso usam (`cf-connecting-ip`). Funciona sem mudar nada quando o `cloudflared` roda com
`network_mode: host` e aponta para `http://localhost:3000`. Se ele alcança o app por outro
caminho, ponha esse endereço em `CAPITAL_BIND` no `.env.local` (ex.: `172.17.0.1`, o gateway da
rede Docker, com o túnel apontando para `http://172.17.0.1:3000`).

**Proteção contra sobrecarga:** o app conta as requisições por segundo e lê a temperatura da placa
(`lib/server/loadGuard.ts`). Um IP que exagera é bloqueado sozinho por um minuto; se o total passar
do ponto crítico, ou a placa esquentar demais, o servidor responde "volte em instantes" por um
tempo em vez de cair. O dono (`OWNER_EMAIL`) recebe um aviso no celular, e tudo aparece em
**Administração** (na bandeja de apps). Os limites ficam no `.env.local` (veja o `.env.example`).

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
  /screens               Uma tela por arquivo (Início, Categorias, Lançamentos, Módulos, Configurações…)
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
  /modules                A ficha de cada módulo, dependências, bandeja de apps e áreas da Início (puras)
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
depois da virada) envia as notificações de lembrete que venceram, os avisos das faturas e das
Contas do mês, confere o Gmail das contas conectadas e, no horário da B3 (dias úteis, 10:00–18:30), atualiza a cotação dos ativos que alguém
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

### Open Finance pelo Meu Pluggy (`lib/server/banks`) — em construção

Só leitura. Cada pessoa usa a própria aplicação grátis da Pluggy (o Client ID e o Secret são
dela); o servidor não tem chave da Pluggy. O plano por fases está em
`docs/prompt-open-finance-pluggy.md`.

- `pluggy.ts` fala com `https://api.pluggy.ai` por `fetch`, sem SDK.
- `service.ts` tem os fluxos:
  - conferir e salvar a chave;
  - criar o item, esperar o link de autorização e guardar a conexão como `pending`;
  - ler os itens `pending` a cada visita à tela: os que chegaram ganham as contas, os
    investimentos (com as quantidades, para "Conferir investimentos" já funcionar) e um nome
    sugerido; os que esperam autorização 2 min depois de o link vencer são apagados aqui e na
    Pluggy;
  - tirar um banco e desconectar tudo.
- `repository.ts` guarda:
  - a chave (`bank_keys`, Secret cifrado com `secretBox`);
  - as conexões (`bank_connections`, a única lista dos itens, porque o plano grátis não lista);
  - as contas (`bank_accounts`), com saldo, data do saldo e, nos cartões, limite e vencimento;
  - os investimentos (`bank_investments`), lidos junto, sem impedir a leitura do resto se
    falharem, com o código (ticker), o ISIN e a quantidade que a corretora manda;
  - a marca `feeds_reserve` de contas e investimentos. `writeReserve` grava a soma do que está
    marcado em `cash_settings.reserve_account_amount` depois de cada leitura com novidade, ao
    marcar e ao salvar a configuração da Reserva (o valor digitado não vence o dos bancos);
  - as transações (`bank_transactions`), pela id da Pluggy.
- As transações:
  - ficam como a Pluggy manda, com o cartão positivo na compra;
  - `outcome`/`entry_id` dizem o que viraram no Capital (F5), e uma leitura nova nunca mexe nisso;
  - nada disso é lançamento.
- **Sincronização** (`job.ts`, uma vez por hora na agenda, com `job_runs`), para cada VIP com o
  módulo ligado e a chave salva:
  - pergunta `GET /items/{id}` de cada banco;
  - **só quando `lastUpdatedAt` mudou** (o banco mandou dados), relê contas e transações: um ano
    na primeira vez, depois desde a última leitura menos 7 dias;
  - a pendente vira confirmada na mesma linha, nunca em duas;
  - um banco ou uma pessoa que falha não para os outros, e duas leituras da mesma pessoa nunca
    rodam juntas;
  - enquanto a Pluggy atualiza (`UPDATING`), o banco mantém o status que tinha;
  - um item que sumiu da Pluggy (404) vira "Trazer de novo";
  - uma leitura que volta sem contas mantém as que havia.
- "Parado" (48 h sem dados) e o aviso de autorização (15 dias antes) saem de `lib/banks/health.ts`.
- **"Confira os gastos"** (`review.ts`, lógica pura em `lib/banks/review.ts`, pensada para servir
  também a um "Importar extrato" OFX/CSV depois):
  - `buildReview` monta a lista com os lançamentos dos meses envolvidos (para os duplicados) e os
    parcelados (para reconhecer parcelas);
  - `applyReviewAction` lança com as **mesmas funções dos formulários** (`saveExpense`,
    `saveInstallment`, `saveIncome`), com `source: 'import'`;
  - antes de lançar, as transações são "reservadas" (`outcome = 'launching'`): um segundo toque
    ou outro aparelho recebe "Isso já foi conferido" em vez de um segundo lançamento, e uma falha
    (mês fechado, por exemplo) devolve a transação à lista;
  - `outcome` e `entry_id`/`entry_month` dizem o que cada transação virou;
    `bank_category_memory` guarda a categoria escolhida por descrição;
  - o vínculo de cartão fica em `bank_accounts.capital_card_id`/`card_linked`;
  - **A receber** (`reimbursementCandidates`, `paybackTolerance`): o servidor confere a distância
    de novo ao marcar (longe demais responde `TOO_FAR`), lança a sobra (`saveIncome`) ou a falta
    (`saveExpense` em `unforeseen`) antes do "Já me pagou", e o que o app aprendeu de quem pagou
    sai das próprias transações já conferidas (`outcome = 'reimbursed'` + a descrição do A
    receber, por `payerKey`: o CPF/CNPJ, ou o nome), sem tabela à parte.
- **Avisos** (`alerts.ts`, lógica pura em `lib/banks/alerts.ts`):
  - o job e "Buscar novidades" passam por `syncAndNotify`;
  - `sourceKey` evita repetir: o resumo por lote, o banco parado pela data do último dado e a
    autorização pela data de vencimento;
  - as escolhas ficam em `bank_settings.alerts` (`alertSettingsOf` lê só o que ainda existe).
- **Quantidades** (`GET /api/v1/banks/holdings`, lógica pura em `lib/banks/holdings.ts`): a rota
  devolve os investimentos com o banco de cada um e, com o módulo Reserva ligado, o ticker e as
  cotas da Reserva investida. A comparação roda na tela (`checkHoldings`), de novo a cada mudança
  do Diagrama, sem perguntar aos bancos:
  - entram ações, FIIs, ETFs e BDRs (`EQUITY`/`ETF`, subtipos `STOCK`, `REAL_ESTATE_FUND`, `ETF`,
    `BDR`) cujo código vira um ticker da B3 (maiúsculas, sem `.SA`, sem o `F` do fracionário);
  - soma por ticker entre bancos e linhas; uma linha sem quantidade tira o ticker da conta;
  - resultado por ativo: confere, diferente, só no Capital (com quantidade acima de 0) e, à
    parte, só no banco. Tolerância de 0,0001 cota;
  - a correção é sempre um toque da pessoa, por `updateAsset`, e nunca toca a Reserva investida;
  - a migração `0030` recua 1 s o `synced_update_at` de cada banco já lido: a próxima
    sincronização da hora relê tudo uma vez (como se o banco tivesse mandado dados) e as
    quantidades chegam sem esperar o banco. Até lá, a tela não mostra conferência nenhuma.
- O `apiKey` (2 h) fica só em memória, por pessoa.
- Toda rota confere VIP e o módulo ligado (`access.ts`) e tem limite de tentativas.
- A Pluggy devolve a pessoa para `<BETTER_AUTH_URL>/bancos`, ou para `PLUGGY_REDIRECT_URI`, que
  precisa ser https (no desenvolvimento, o endereço publicado; depois, volte à aba do localhost).
- "Apagar todos os dados" leva o Open Finance junto e tira os itens da Pluggy.
- A chave e as conexões ficam fora do backup: sem a chave, não há o que restaurar.

**Como a pessoa conecta:** os bancos se conectam **uma vez** em meu.pluggy.ai (a autorização é no
app do banco). O dashboard.pluggy.ai só cria a chave: uma aplicação com o conector MeuPluggy
ativo. O aviso de "teste de 15 dias" não vale para uso pessoal. No Capital, cada banco é **uma
autorização** no meu.pluggy.ai, sem passar de novo pelo banco. São até 5 conexões, do mesmo
titular, e os dados chegam uma vez por dia.

**O que a F0 conferiu na API (2026-10-20, com BTG, Nubank e um cartão Amazon Mastercard; a Caixa
não conectou nem no próprio Meu Pluggy):**

- **A conexão se cria sem widget.** `POST /items` com `connectorId: 200`, `parameters: {}`,
  `oauthRedirectUri` (HTTPS, nunca localhost) e `clientUserId`. Em menos de 1 s, o item fica
  `WAITING_USER_INPUT` e o endereço de autorização chega em `parameter.data` (`type: "oauth"`).
  **Esse endereço vale 4 minutos**: crie o item só quando a pessoa tocar e mande-a direto para lá.
  A pessoa escolhe **um banco** em meu.pluggy.ai e volta pelo `oauthRedirectUri`, com
  `?itemId=…` acrescentado. Em ~1,5 min o item fica `UPDATED`/`SUCCESS`. Às vezes a primeira
  leitura falha do lado da Pluggy (`OUTDATED`, `UNEXPECTED_ERROR`); como não dá para pedir outra
  leitura, a tela oferece "Tentar de novo", que tira a conexão e abre outra autorização. Não precisa do script do Pluggy Connect nem de mudança no CSP.
- O conector 200 é o `MeuPluggy` (`PERSONAL_BANK`, `oauth: true`, sem credenciais). Ele marca
  `isOpenFinance: false` por ser um repasse, mas os dados por baixo são Open Finance.
- `POST /auth` devolve um `apiKey` (JWT) que vale **2 h**. `POST /connect_token` recusa
  localhost ("must be a valid HTTPS URL (not localhost) or a valid deep link").
- `GET /items` (listar) responde **401**, então o Capital guarda os ids dos itens que ele cria.
  `PATCH /items/{id}` responde **400 "MeuPluggy item cant be updated"**: não dá para forçar a
  atualização.
- No item, `lastUpdatedAt` é a última sincronização do Meu Pluggy com o banco (pode ser anterior à
  criação do item), `nextAutoSyncAt` cai ~24 h depois e `consentExpiresAt` fica 1 ano após a
  autorização. Também vêm `autoSyncDisabledAt`, `consecutiveFailedLoginAttempts`,
  `hasResourcesPendingAuthorization` e `resourcesCollectedAt`.
- **O nome do banco não vem no item**: o conector é sempre "MeuPluggy". Conta bancária traz `name`
  ("BTG Banking", "Nu Pagamentos S.A. …") e o código do banco no começo de
  `bankData.transferNumber` (208, 260). Um cartão sozinho traz só o nome do cartão ("AMAZON
  MASTERCARD PLATINUM"). O Capital sugere o nome e a pessoa edita.
- `GET /v2/transactions` pagina por `next`. `page`/`pageSize` respondem **400**, e a v1
  (`/transactions`) responde **410** `ENDPOINT_DEPRECATED`. A primeira leitura traz **~12 meses**.
- Campos das transações:
  - sempre preenchidos nos três bancos: `description`, `descriptionRaw`, `category`, `operationType`
    e `paymentData.paymentMethod` (este, nas contas);
  - quase sempre vazio: `merchant`;
  - nunca preenchido: `balance` (o saldo depois da transação);
  - pagador e recebedor vêm com documento (CPF/CNPJ) muito mais vezes do que com nome.
- **Cartão:**
  - compra: valor positivo, `type: DEBIT`;
  - pagamento de fatura: negativo, `CREDIT`, `operationType: PAGAMENTO_FATURA` e categoria
    "Credit card payment";
  - estorno: negativo, `operationType: ESTORNO`;
  - parcelada: os três mandaram juntos `installmentNumber`, `totalInstallments` e `purchaseDate`.
  - `PENDING` no cartão quer dizer "ainda sem fatura fechada" (`billId` vazio). Num cartão era a
    maioria, inclusive compras antigas: não trate como "vai virar POSTED logo".
- Pistas para separar o que não é gasto: `TRANSFERENCIA_MESMA_INSTITUICAO` e a categoria "Same
  person transfer" (entre contas próprias); `APLICACAO_FINANCEIRA`, `RESGATE_APLIC_FINANCEIRA` e
  `RENDIMENTO_APLIC_FINANCEIRA` (investimento); `PORTABILIDADE_SALARIO` (salário portado);
  `TARIFA_SERVICOS_AVULSOS` (tarifa).
- `GET /bills` só traz faturas **fechadas**, com os pagamentos de cada uma. `GET /investments`
  traz ações, FIIs, Tesouro, CDB, LCI e LCA com `name` e `balance`; `institution` vem vazio. No
  BTG, os 67 investimentos vieram com `code` (o ticker, nas ações e nos FIIs) e `quantity`.

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
  plano, remanejar (guardar e retirar, com o estorno na categoria e o limite de cotas), uma
  compra parcelada de antes da conta sem mexer nos meses passados, adiantar parcelas (a compra
  encurta e o pagamento entra no mês) e caixa.
- **`lib/budget/__tests__/reserve.test.ts`:** o plano da reserva calculado a partir do que foi
  lançado (duas parcelas no mesmo mês somam, um mês pulado só adia, centavos não deixam o plano
  eternamente a R$ 0,004 do fim) e o "A receber" com quem já pagou, que não mexe em nenhum número
  do orçamento nem da fatura.
- **`lib/budget/__tests__/installments.test.ts`:** as parcelas que saem de um parcelamento sem
  nada de errado — as já pagas antes do cadastro e as adiantadas — sumindo ao mesmo tempo da
  fatura, do orçamento, da dívida e dos meses que a compra pode tocar; e a categoria "Fora do
  orçamento", que entra na fatura e em nenhuma categoria.
- **`lib/budget/__tests__/fixtures.test.ts`:** as fixtures reais da planilha em 15/09/2026
  (§9 da spec do assistente), com tolerância de R$ 0,01 — a planilha não arredonda entre as
  etapas e o Capital arredonda cada uma. Inclui as regras da categoria "A receber".
- **`lib/server/__tests__/budgetRepository.test.ts`:** cobre o repositório Postgres contra o
  schema e as migrações reais, num Postgres em memória (PGlite). Casos: seed, cascata de
  rollover, mês fechado/inexistente, fechar abrindo o mês seguinte, apagar mês, export→import,
  módulos, áreas da Início e avisos vistos por usuário (e no backup, inclusive os antigos com
  rodapé), isolamento entre contas e escritas
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
- **`lib/server/__tests__/pluggy.test.ts`, `banksSync.test.ts` e `lib/banks/__tests__`:** o Open
  Finance, com a Pluggy simulada nas respostas que ela dá de verdade. Cobrem:
  - a sincronização: um ano na primeira leitura, só "chegou algo?" enquanto o banco não manda
    nada, 7 dias para trás depois, a pendente que vira confirmada sem duplicar e sem perder o que
    a pessoa decidiu, `UPDATING`, item sumido, leitura sem contas e duas leituras ao mesmo tempo;
  - o job: só VIPs com o módulo, uma vez por hora, e uma falha não para ninguém;
  - "Parado" depois de 48 h, o aviso de autorização e o saldo sem os cartões;
  - a paginação por `next`, inclusive um `next` que aponta para fora da Pluggy;
  - a chave: conferida antes de salvar, cifrada, e só o fim do Secret volta;
  - trazer um banco: o corpo do `POST /items`, a espera pelo link e o `pending`;
  - os limites: sem https, as 5 conexões e sem chave;
  - a chegada das contas, com o nome sugerido, e o nome dado pela pessoa, que fica;
  - a autorização largada, apagada aqui e na Pluggy, e a conexão que caiu;
  - tirar um banco, desconectar tudo e "Apagar todos os dados";
  - os nomes sugeridos e o "há 5 h".
- **`lib/modules/__tests__`:** o catálogo, as dependências (filho travado sem o pai, o que ligar
  antes e em que ordem, desligar em cascata, a árvore), os kits do primeiro acesso, o Primeiros
  passos (quem recebe, como cada passo se marca, quando some), a bandeja de apps, as áreas da Início
  (padrão, a ordem antiga, widget novo, repetidos, áreas vazias, mover, pôr, tirar, criar e excluir
  área) e os tours (todo módulo tem tour e botão de ajuda, e toda âncora existe nas telas).
- **`components/modules/home/__tests__`:** "Como você quer usar o Capital?" (cada cartão liga o seu
  conjunto ou abre Módulos) e o widget Primeiros passos.
- **`lib/budget/__tests__/topics.test.ts`, `components/settings/__tests__` e
  `components/onboarding/__tests__`:** as categorias padrão e suas descrições, restaurar o padrão
  (inclusive com dados antigos, sem `preset`), nunca apagar uma categoria, a arquivada no mês atual,
  nos próximos e nos passados, o editor sem "Excluir" e com os avisos, e a configuração das
  categorias em 3 passos (inclusive criando uma categoria com descrição).
- **Repositório HTTP** (`lib/storage/__tests__`).
- O **limitador de tentativas** de login, e a conta de teste do primeiro acesso, que só vale para
  e-mail `.test`.

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
- [x] **Histórico & Gráficos** — abas Gastos (mês contra a média, categorias do mês, cada categoria mês a mês com gasto/limite e sobra) e Investimentos (com o Diagrama: subida e descida da carteira por período, por tipo e por ativo)
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
