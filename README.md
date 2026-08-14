# Painel Bolsão Matriz 2027

Painel corporativo de acompanhamento de vendas e pré-matrículas dos Bolsões
Matriz 2027, por unidade. Next.js 16 (App Router) + TypeScript + Tailwind,
publicável na Vercel sem infraestrutura de banco de dados.

> Ver também [`/metodologia`](./app/metodologia/page.tsx) dentro do próprio
> painel — a mesma documentação de regras de negócio fica visível para
> escolas e gestão diretamente na aplicação.

## Decisão de acesso registrada (leia antes de publicar)

O painel foi construído **sem autenticação, por decisão explícita e
informada da área responsável**, apesar de conter nome completo, CPF e
telefone do responsável financeiro, endereço completo e data de nascimento
do aluno. O risco foi explicitamente sinalizado (dados pessoais de crianças
e responsáveis publicamente acessíveis a qualquer pessoa com o link, sem
controle de quem acessa) e a decisão final foi publicar mesmo assim, com
tudo visível. Essa decisão está registrada aqui para rastreabilidade; para
mudar isso no futuro, a forma mais simples é adicionar um gate de senha
única no middleware do Next.js (`middleware.ts`) antes de reabrir o acesso.

Como mitigação mínima que **não** contraria essa decisão, o layout define
`robots: { index: false, follow: false }` (ver `app/layout.tsx`) — isso
evita que buscadores indexem a página, reduzindo descoberta acidental, mas
não restringe quem acessa o link diretamente.

## Arquitetura

```
Bolsão Matriz 2027/                      <- pasta de origem dos exports CSV
├── *.csv                                <- arquivo(s) bruto(s) exportado(s) da Layers
└── painel-bolsao-2027/                  <- aplicação (este diretório)
    ├── data/raw/                        <- espelho dos CSVs usado pelo build (ver "Atualizar os dados")
    ├── lib/                             <- ingestão, normalização, regras de negócio, KPIs (sem UI)
    │   ├── units.ts                     <- lista das 11 unidades + identificação por canal de venda
    │   ├── normalize.ts                 <- parsing de moeda, data, formulário do aluno
    │   ├── status.ts                    <- classificação do status de pagamento
    │   ├── etl.ts                       <- leitura dos CSVs, deduplicação, montagem de pedidos e KPIs
    │   └── types.ts                     <- tipos compartilhados
    ├── components/                      <- UI (client components para interatividade: busca, filtro, ordenação)
    ├── app/                             <- rotas (App Router)
    │   ├── page.tsx                     <- visão geral (todas as unidades)
    │   ├── unidade/[slug]/page.tsx      <- drill-down por unidade (11 páginas estáticas)
    │   └── metodologia/page.tsx         <- documentação de regras, visível no próprio painel
    └── scripts/
        ├── sync-data.mjs                <- copia os CSVs da pasta raiz para data/raw/
        ├── check-etl.ts                 <- roda o ETL fora do Next.js e imprime KPIs/alertas (smoke test)
        └── check-edge-cases.ts          <- testes pontuais de unidades/status/datas/valores
```

**Por que sem banco de dados:** o volume de dados (algumas centenas a poucos
milhares de pré-matrículas ao longo da campanha) e a cadência de
atualização (manual, por novo export CSV) não justificam um banco. Os dados
processados ficam embutidos no build do Next.js (Server Components lêem os
CSVs em `data/raw/` em tempo de build/execução no servidor) e as 11 páginas
de unidade são pré-renderizadas estaticamente (`generateStaticParams`).
Atualizar dados = trocar os CSVs e gerar um novo deploy. Isso elimina custo
e manutenção de infraestrutura de dados, ao preço de a atualização não ser
em tempo real (é por deploy).

**Separação de responsabilidades:**

- **Ingestão/tratamento:** `scripts/sync-data.mjs` (copia) + `lib/etl.ts` (parse, dedup, agregação)
- **Regras de negócio:** `lib/units.ts`, `lib/normalize.ts`, `lib/status.ts` — cada arquivo documenta, em comentário, a regra e por que foi adotada
- **Backend/API:** nenhum — os Server Components do Next.js chamam `lib/etl.ts` diretamente no servidor; não há API pública nem chave exposta ao cliente
- **Frontend:** `app/` (rotas) + `components/` (UI interativa)
- **Configuração/deploy:** `next.config.ts`, `package.json`, este README

## Estrutura e granularidade dos dados de origem

Os arquivos `*_itens_da_venda___resumo_*.csv` são exports do checkout Layers
do produto "Pré-Matrícula Bolsão 2027" (R$300, à vista ou parcelado no
cartão). Existem dois formatos observados, ambos suportados pelo mesmo
parser (`lib/etl.ts` lê o nome de coluna que existir em cada arquivo):

- **Export por unidade** (primeira extração, 08/08/2026 ~12h): um arquivo
  por unidade, coluna de status chamada `Status do Pagamento`.
- **Export consolidado "Matriz"** (segunda extração, mesma data ~12h40,
  arquivo `Matriz_itens_da_venda___resumo_*.csv`): um único arquivo com
  todas as unidades, confirmado como **superset estrito** do export por
  unidade (contém os mesmos pedidos + novos). Traz 3 colunas extras:
  `Categoria`, `Nome do Marketplace` (segundo sinal de unidade, usado como
  checagem cruzada — ver alerta `unidade_marketplace_canal_divergentes`) e
  `Código do Pedido` (um ID alternativo, ex. `LM-XXXXX-YYYYY`, mantido só
  para rastreabilidade). A coluna de status aqui se chama `Status da
  Venda` em vez de `Status do Pagamento` — mesmo conceito, nome de coluna
  diferente. **A partir desta segunda extração, o export consolidado
  passou a ser a única fonte na pasta raiz** — os 5 arquivos por unidade
  não estão mais lá (o script `sync-data.mjs` espelha isso: remove de
  `data/raw/` qualquer CSV que não exista mais na pasta de origem).

Cada linha é um item comprado dentro de um pedido. **Um pedido pode conter
mais de um aluno** — caso real confirmado nos dados (pedido
`LP1-MHPM3-AM7J4`, Campo Grande): um responsável comprou 2
pré-matrículas (para 2 filhos, "Rafael" e "Gabriel" Christianes) em um
único checkout, gerando 2 linhas com o mesmo `Código da Venda`, mesmo SKU
e mesmo link de acompanhamento, mas alunos diferentes.

- **Chave de pedido:** `Código da Venda`. O valor do pedido é lido de
  `Valor dos Itens` (valor do pedido, repetido em todas as linhas do mesmo
  pedido), não somado por linha — evita duplicar valor quando um pedido
  tem múltiplos itens/alunos. Por isso `Pedido` (tipo em `lib/types.ts`)
  não guarda "o aluno" — guarda `itens[]`, e o KPI de alunos itera por
  item, não por pedido.
- **Chave de aluno:** não existe ID de aluno na fonte (o CPF do formulário é
  do responsável financeiro). A chave usada é `nome do aluno normalizado +
  data de nascimento normalizada`, extraídos do campo `Formulários`
  (formato consistente em todos os registros analisados até agora: `aluno
  | nascimento | responsável | telefone | série atual | série
  pretendida`). Quando isso falha, cai para `responsável (nome + CPF)` e,
  em último caso, para o próprio pedido — cada fallback gera um alerta no
  painel de qualidade de dados. **Validação real desta chave:** o mesmo
  aluno ("Breno Henrique Boaventura Barcellos casemiro", Tijuca) aparece
  em 2 pedidos diferentes (uma tentativa `Vencido` às 10:30, uma tentativa
  `Pago` às 12:09) — a chave nome+nascimento corretamente identifica as
  duas linhas como o mesmo aluno, contando 1 (não 2) em "alunos com
  pré-matrícula", enquanto ainda conta 2 em "pedidos" (2 transações
  distintas de fato ocorreram).
- **Unidade:** resolvida pelo campo `Nome do Canal` de cada linha (ex.:
  `"Bolsão 2027 - Tijuca"`), **não** pelo nome do arquivo.

### Regra especial — Américas

O marketplace da unidade Américas está cadastrado dentro da mesma
comunidade/arquivo de Rocha Miranda na plataforma Layers. A separação usa o
texto do canal de venda de cada linha (`identifyUnitByChannel` em
`lib/units.ts`), não o nome do arquivo — isso classifica corretamente uma
venda de Américas mesmo vindo dentro do arquivo `Rocha Miranda_*.csv`. Como
verificação adicional, o ETL registra um alerta (`unidade_reclassificada_por_canal`)
sempre que o canal de uma linha diverge da unidade sugerida pelo nome do
arquivo de origem — isso torna visível qualquer futura reclassificação, em
vez de silenciosa. O export consolidado "Matriz" também traz "Nome do
Marketplace" como segundo sinal independente de unidade — se ele divergir
do canal, o ETL gera `unidade_marketplace_canal_divergentes` em vez de
decidir sozinho. **Nos dados atuais (52 registros, extração de 08/08/2026
12:40) não há nenhuma venda de Américas ainda** — a unidade aparece
corretamente com todos os indicadores zerados, e não há um exemplo real
para validar a regra fim-a-fim; a lógica foi validada com um teste
sintético (`scripts/check-edge-cases.ts`). **Ponto a validar quando a
primeira venda de Américas aparecer:** conferir manualmente que o texto do
canal nesse export realmente identifica Américas (ex.: contém "Américas")
— se a Layers usar uma nomenclatura diferente da esperada, adicionar o novo
alias em `UNITS` (`lib/units.ts`).

## Classificação do status de pagamento

O campo `Status do Pagamento` (export por unidade) / `Status da Venda`
(export consolidado "Matriz" — mesmo conceito, nome de coluna diferente) é
o status já resumido pela Layers no nível do pedido (não há arquivo de
parcelas/repasses nesta fonte — diferente do pipeline de mensalidades
recorrentes documentado em `documentacao_tecnica_data_engine.md`, que é
uma fonte de dados diferente, via Parquet/S3). Valores confirmados nos
dados atuais: `"Pago"`, `"Vencido"`, `"Em aberto"` e `"Recebido"`
(confirmado como sinônimo de "Pago" pelo usuário em 11/08/2026 — 42 de 82
registros daquela carga, mais da metade). Os demais mapeamentos em
`lib/status.ts` (Pendente/Cancelado/Estornado/Chargeback/Reembolsado etc.)
foram antecipados a partir do vocabulário usado nos três documentos de
referência lidos, **mas não confirmados nesta fonte específica** —
qualquer status que não bata com o mapeamento cai em `"não classificado"`
e é sinalizado no painel de qualidade de dados, em vez de presumido.
**Ponto a validar:** quando aparecerem os primeiros
`"Cancelado"`/`"Estornado"` reais, conferir se o texto exato bate com o
mapeamento em `lib/status.ts` — o painel avisa automaticamente se não
bater.

## Tentativa vencida substituída por pagamento posterior

Regra de negócio explícita: quando o **mesmo aluno** (mesma chave
nome+nascimento) tem um pedido `pendente/vencido` e outro pedido `pago`,
o pedido pendente/vencido é **descartado por completo** — não entra em
"Pedidos", "Valor vendido", "Valor pendente" nem na tabela de alunos.
Ele é tratado como uma tentativa de checkout abandonada/expirada,
substituída pela matrícula paga, e não como uma venda adicional. O
descarte é registrado como alerta `pedido_pendente_substituido_por_pago`
no painel de qualidade de dados (arquivo, linha e código do pedido
descartado ficam visíveis para auditoria).

Caso real que motivou a regra: aluno "Breno Henrique Boaventura Barcellos
casemiro" (Tijuca) tinha um pedido `Vencido` às 10:30 e outro `Pago` às
12:09 no mesmo dia (08/08/2026) — sem esta regra, o pedido vencido ainda
contava em "Pedidos" e "Pendente/vencido" mesmo depois do pagamento ter
sido concluído.

**Escopo deliberadamente limitado:** a regra só descarta
`pendente_vencido` quando há um `pago` do mesmo aluno. Pedidos
`cancelado`/`estornado` do mesmo aluno **não** são descartados por esta
regra — permanecem visíveis como histórico de cancelamento/estorno. Um
aluno com `pendente_vencido` e **sem** nenhum pedido pago continua
aparecendo normalmente (ex.: caso real "Lara Valentina da Silva" em Rocha
Miranda — não descartado, pois seu único pedido está em aberto; note que
há um segundo registro parecido, "Lara Valentina Da Silva Rodrigues", pago,
com a mesma data de nascimento — mas com nome ligeiramente diferente o
suficiente para não bater na chave exata nome+nascimento; **ponto a
revisar manualmente**, já que pode ser a mesma criança com uma variação de
grafia do sobrenome).

## Critérios dos KPIs

| KPI | Definição | Fonte |
|---|---|---|
| Alunos com pré-matrícula | Alunos únicos (pela chave acima, **por item**, não por pedido — um pedido pode ter vários alunos) com ao menos um pedido fora de `cancelado`/`estornado`, após o descarte de pendentes substituídos (ver seção acima) | `lib/etl.ts::computeKpiForPedidos` |
| Pedidos | Contagem de `Código da Venda` únicos, após o descarte de pendentes substituídos | idem |
| Valor vendido | Soma do valor de todos os pedidos, qualquer status (bruto) | idem |
| Valor pago | Soma dos pedidos com status "Pago" | idem |
| Pendente/vencido, Cancelado, Estornado | Soma por bucket de status | idem |
| Ticket médio pago | Valor pago ÷ **unidades pagas** (soma de "Quantidade" nos itens pagos — não a contagem de pedidos) | idem |
| % pago | Valor pago ÷ valor vendido | idem |
| Evolução diária | Pedidos e valor agrupados por dia da venda (fuso `America/Sao_Paulo`) | `lib/etl.ts::buildEvolucaoDiaria` |

**Por que "unidades pagas" e não "pedidos pagos" no ticket médio:** um pedido
pode valer por mais de uma pré-matrícula de duas formas na fonte —
múltiplas linhas (uma por aluno, `Quantidade=1` cada) ou uma única linha
com `Quantidade=2` representando 2 unidades mas só 1 aluno nomeado no
formulário (caso real: pedido `LP1-JYX97-JZCHN`, R$600, `Quantidade=2`,
1 único aluno identificado — Bryan Gaspar do Amaral Medeiros). Dividir por
contagem de pedidos nesse segundo padrão inflava o ticket médio (mostrava
R$312,33 em vez de R$300,00 quando esse pedido existia na base). Somar
`Quantidade` cobre os dois padrões corretamente sem depender de nomear o
2º aluno, que a fonte não fornece — esse caso gera o alerta
`quantidade_maior_que_alunos_identificados` no painel de qualidade de
dados, para revisão manual de quem é o 2º aluno.

Todas as definições também estão documentadas em `/metodologia` dentro do
próprio painel.

## Exportação para Excel

O botão **Exportar Excel** na tabela "Alunos e pedidos" (visão geral e em
cada página de unidade) gera um `.xlsx` no navegador, sem passar pelo
servidor (`lib/export-xlsx.ts`, biblioteca `exceljs` carregada sob demanda
só quando o botão é clicado, para não pesar o carregamento inicial da
página). Exporta as linhas **conforme os filtros e a busca ativos no
momento** (não só a página atual carregada por "Carregar mais"), com um
conjunto de colunas mais completo que a tabela em tela — inclui CPF,
telefone, e-mail e endereço do responsável, IDs de pedido/transação e
canal/marketplace de origem, para uso administrativo pelas escolas e pela
gestão.

## Qualidade de dados

O ETL gera um alerta estruturado (arquivo, linha, código do pedido,
descrição) para cada uma destas situações, exibidas no painel inicial:

`unidade_nao_identificada`, `unidade_reclassificada_por_canal`,
`unidade_marketplace_canal_divergentes`, `aluno_nao_identificado`,
`aluno_e_responsavel_nao_identificados`, `valor_zero_ou_ausente`,
`data_venda_invalida`, `formato_data_ambiguo`, `status_pagamento_ausente`,
`status_nao_mapeado`, `linha_sem_codigo_venda`, `linha_duplicada`,
`valor_pedido_inconsistente`.

(Um pedido com mais de um aluno — ver seção acima — **não** é tratado como
inconsistência: é um cenário de negócio válido e esperado.)

Na carga mais recente (1 arquivo consolidado, 52 registros, extração de
08/08/2026 12:40), **nenhum alerta foi disparado** — os dados estavam
limpos. Isso não significa que a checagem foi pulada: os mesmos alertas
disparam automaticamente em cargas futuras se qualquer uma dessas
inconsistências aparecer. A deduplicação (`linha_duplicada`) usa uma chave
que inclui o aluno (`Código da Venda + SKU + link + alunoKey`) exatamente
para não confundir uma linha genuinamente repetida com um pedido legítimo
de múltiplos alunos que compartilha SKU e link (caso Christianes acima).

### Formato de data — hipótese corrigida em 11/08/2026

O campo `Data da Venda` vem como `"10/8/2026, 13:10"`. **Até 08/08/2026 o
código assumia `mês/dia/ano`** (padrão en-US) — hipótese adotada sem
evidência real, porque os únicos dados disponíveis até então eram todos do
dia 8/8, onde dia e mês coincidem e nada desambigua. A carga de
11/08/2026 trouxe a primeira evidência real: registros `"10/8/2026"`.
Sob a hipótese antiga (M/D) isso seria **8 de outubro — uma data futura
impossível** para uma venda já registrada num arquivo gerado em
11/08/2026 (confirmado pelo timestamp ISO no nome do arquivo). Sob `D/M`
(dia/mês/ano) é 10 de agosto, um dia antes da geração do arquivo —
plausível. **O parser foi corrigido para `dia/mês/ano`** (ver
`lib/normalize.ts::parseDataVenda`); o alerta `formato_data_ambiguo`
agora dispara quando o componente de mês (2º valor) é maior que 12.

### Colunas monetárias mudaram de nome (corrigido em 11/08/2026)

A carga de 11/08/2026 trouxe as colunas `Valor do Item na Venda`, `Valor
dos Itens`, `Valor dos Juros` e `Valor do Frete` renomeadas com sufixo
`" ($)"` (ex.: `"Valor dos Itens ($)"`), sem aviso — isso fazia todo
valor ser lido como zero/ausente silenciosamente (86 alertas
`valor_zero_ou_ausente` numa única carga). O parser agora lê essas
colunas por uma lista de nomes possíveis (`lib/etl.ts::col()`), não por
um nome fixo só, para não quebrar de novo se a Layers renomear outra
coluna equivalente no futuro.

## Como rodar localmente

Pré-requisitos: Node.js 20+.

```bash
cd painel-bolsao-2027
npm install
npm run dev
```

Abra http://localhost:3000.

Para validar o ETL isoladamente (sem subir o servidor):

```bash
npm run check-etl          # imprime KPIs, evolução diária e alertas de qualidade
npm run check-edge-cases   # valida a lógica de unidade/status/data/moeda com casos sintéticos
```

## Como atualizar os dados

1. Coloque o(s) novo(s) export(s) CSV da Layers na pasta raiz do projeto
   (`Bolsão Matriz 2027/`, um nível acima deste diretório) — pode ser o
   export consolidado "Matriz" (recomendado, um arquivo só) ou os exports
   por unidade. Remova da pasta raiz os arquivos que não deveriam mais
   valer (ex.: um export por unidade já substituído pelo consolidado).
2. Rode:
   ```bash
   npm run sync-data
   ```
   Isso **espelha** a pasta raiz em `data/raw/`: copia os `.csv`
   presentes e remove de `data/raw/` qualquer arquivo que não exista mais
   na pasta raiz (evita alertas de "linha duplicada" por cópias antigas
   esquecidas).
3. Confira os números antes de publicar:
   ```bash
   npm run check-etl
   ```
4. Gere um novo deploy (ver seção abaixo). Sem um novo deploy, os dados no
   ar não mudam — este painel não lê dados em tempo real.

## Como publicar/atualizar online

O projeto está pronto para deploy na Vercel (zero configuração adicional
necessária — é um projeto Next.js padrão).

1. **Repositório Git:** crie um repositório (GitHub, GitLab, etc.) e faça
   push deste diretório (`painel-bolsao-2027/`) como raiz do repositório.
2. **Vercel:** em https://vercel.com/new, importe o repositório. A Vercel
   detecta Next.js automaticamente — não é necessário configurar build
   command, output directory nem variáveis de ambiente.
3. Cada push na branch principal gera um novo deploy automaticamente
   (Vercel Git Integration). Para atualizar os dados em produção, siga
   "Como atualizar os dados" acima e depois `git push`.
4. **Custo esperado:** o plano gratuito (Hobby) da Vercel é suficiente para
   o volume de tráfego esperado de um painel interno.

## Pontos que ainda precisam de validação

1. **Américas:** nenhuma venda real disponível ainda para confirmar que o
   texto do canal usado pela Layers bate com o esperado (`"Américas"`).
2. **Status de pagamento além de "Pago"/"Vencido"/"Em aberto"/"Recebido":**
   os demais valores do mapeamento em `lib/status.ts` (Cancelado,
   Estornado, Chargeback, Reembolsado etc.) foram antecipados a partir de
   documentação de um pipeline de dados diferente (mensalidades
   recorrentes), não desta fonte. Confirmar assim que aparecerem
   cancelamentos/estornos reais.
3. **Decisão de acesso sem autenticação:** ver seção no topo deste README —
   registrada como decisão de negócio explícita, não uma omissão técnica.
4. **Possível duplicidade não auto-resolvida ("Lara Valentina", Rocha
   Miranda):** dois pedidos com a mesma data de nascimento (21/07/2018) e
   nomes quase idênticos ("Lara Valentina Da Silva Rodrigues" e "Lara
   Valentina da Silva", comprador "Edison"/"Edilson Luis Rodrigues" no
   mesmo endereço) — **agora os dois pedidos aparecem como `Pago`**
   (atualização de 11/08/2026), então a regra de "vencido substituído por
   pago" não se aplica (ela só descarta pendente/vencido, não dois pagos).
   Se for a mesma criança, isso infla Rocha Miranda em 1 aluno/pedido e
   R$300 a mais do que o real. A chave exata nome+nascimento não une os
   dois por causa da diferença de sobrenome — requer checagem manual da
   equipe (ex.: contatar o responsável) para confirmar se é 1 criança com
   2 cobranças ou 2 crianças distintas com coincidência de nome e data.
