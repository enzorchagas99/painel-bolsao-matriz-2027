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
├── *.csv                                <- arquivos brutos exportados da Layers (uma unidade por arquivo)
└── painel-bolsao-2027/                  <- aplicação (este diretório)
    ├── data/raw/                        <- cópia dos CSVs usada pelo build (ver "Atualizar os dados")
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
cartão), um arquivo por unidade. Cada linha é um item comprado dentro de um
pedido — hoje sempre 1 item por pedido.

- **Chave de pedido:** `Código da Venda`. O valor do pedido é lido de
  `Valor dos Itens` (valor do pedido), não somado por linha — evita
  duplicar valor se um pedido futuro tiver múltiplos itens.
- **Chave de aluno:** não existe ID de aluno na fonte (o CPF do formulário é
  do responsável financeiro). A chave usada é `nome do aluno normalizado +
  data de nascimento normalizada`, extraídos do campo `Formulários`
  (formato consistente nos 14 registros analisados: `aluno | nascimento |
  responsável | telefone | série atual | série pretendida`). Quando isso
  falha, cai para `responsável (nome + CPF)` e, em último caso, para o
  próprio pedido — cada fallback gera um alerta no painel de qualidade de
  dados.
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
vez de silenciosa. **Nos dados atuais (14 registros, extração de
08/08/2026) não há nenhuma venda de Américas ainda** — a unidade aparece
corretamente com todos os indicadores zerados, e não há um exemplo real
para validar a regra fim-a-fim; a lógica foi validada com um teste
sintético (`scripts/check-edge-cases.ts`). **Ponto a validar quando a
primeira venda de Américas aparecer:** conferir manualmente que o texto do
canal nesse export realmente identifica Américas (ex.: contém "Américas")
— se a Layers usar uma nomenclatura diferente da esperada, adicionar o novo
alias em `UNITS` (`lib/units.ts`).

## Classificação do status de pagamento

O campo `Status do Pagamento` é o status já resumido pela Layers no nível
do pedido (não há arquivo de parcelas/repasses nesta fonte — diferente do
pipeline de mensalidades recorrentes documentado em
`documentacao_tecnica_data_engine.md`, que é uma fonte de dados diferente,
via Parquet/S3). Valores confirmados nos dados atuais: `"Pago"` e
`"Vencido"`. Os demais mapeamentos em `lib/status.ts`
(Pendente/Cancelado/Estornado/Chargeback/Reembolsado etc.) foram
antecipados a partir do vocabulário usado nos três documentos de referência
lidos, **mas não confirmados nesta fonte específica** — qualquer status que
não bata com o mapeamento cai em `"não classificado"` e é sinalizado no
painel de qualidade de dados, em vez de presumido. **Ponto a validar:**
quando aparecerem os primeiros `"Cancelado"`/`"Estornado"` reais, conferir
se o texto exato bate com o mapeamento em `lib/status.ts` — o painel avisa
automaticamente se não bater.

## Critérios dos KPIs

| KPI | Definição | Fonte |
|---|---|---|
| Alunos com pré-matrícula | Alunos únicos (pela chave acima) com ao menos um pedido fora de `cancelado`/`estornado` | `lib/etl.ts::computeKpiForPedidos` |
| Pedidos | Contagem de `Código da Venda` únicos | idem |
| Valor vendido | Soma do valor de todos os pedidos, qualquer status (bruto) | idem |
| Valor pago | Soma dos pedidos com status "Pago" | idem |
| Pendente/vencido, Cancelado, Estornado | Soma por bucket de status | idem |
| Ticket médio pago | Valor pago ÷ pedidos pagos | idem |
| % pago | Valor pago ÷ valor vendido | idem |
| Evolução diária | Pedidos e valor agrupados por dia da venda (fuso `America/Sao_Paulo`) | `lib/etl.ts::buildEvolucaoDiaria` |

Todas as definições também estão documentadas em `/metodologia` dentro do
próprio painel.

## Qualidade de dados

O ETL gera um alerta estruturado (arquivo, linha, código do pedido,
descrição) para cada uma destas situações, exibidas no painel inicial:

`unidade_nao_identificada`, `unidade_reclassificada_por_canal`,
`aluno_nao_identificado`, `aluno_e_responsavel_nao_identificados`,
`valor_zero_ou_ausente`, `data_venda_invalida`, `formato_data_ambiguo`,
`status_pagamento_ausente`, `status_nao_mapeado`, `linha_sem_codigo_venda`,
`linha_duplicada`, `valor_pedido_inconsistente`, `pedido_com_alunos_divergentes`.

Na carga usada para desenvolver este painel (5 arquivos, 14 registros,
extração de 08/08/2026), **nenhum alerta foi disparado** — os dados estavam
limpos. Isso não significa que a checagem foi pulada: os mesmos alertas
disparam automaticamente em cargas futuras se qualquer uma dessas
inconsistências aparecer.

### Hipótese de formato de data assumida (verificar em novas cargas)

O campo `Data da Venda` vem como `"8/8/2026, 11:14"`. Foi adotada a
hipótese `mês/dia/ano` (padrão en-US, compatível com
`Date.toLocaleString('en-US')`, que é o formato mais provável de origem do
export). Como todos os 14 registros disponíveis são do mesmo dia
(08/08/2026), não há como confirmar isso pelos dados atuais — se em uma
carga futura aparecer uma data cujo primeiro número seja maior que 12 (ex.:
`25/1/2026`), o parser não consegue interpretar da forma esperada e o ETL
gera o alerta `formato_data_ambiguo`, sinalizando a inconsistência para
revisão em vez de silenciosamente errar a data.

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

1. Coloque os novos exports CSV da Layers na pasta raiz do projeto
   (`Bolsão Matriz 2027/`, um nível acima deste diretório) — pode
   substituir os arquivos antigos ou adicionar novos, um por unidade.
2. Rode:
   ```bash
   npm run sync-data
   ```
   Isso copia os `.csv` da pasta raiz para `data/raw/`, de onde o painel lê.
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
2. **Status de pagamento além de "Pago"/"Vencido":** os demais valores do
   mapeamento em `lib/status.ts` foram antecipados a partir de documentação
   de um pipeline de dados diferente (mensalidades recorrentes), não desta
   fonte. Confirmar assim que aparecerem cancelamentos/estornos reais.
3. **Hipótese de formato de data (mês/dia/ano):** não confirmável com os
   dados atuais (todos do mesmo dia). O painel de qualidade de dados avisa
   automaticamente se uma data futura contradisser a hipótese.
4. **Decisão de acesso sem autenticação:** ver seção no topo deste README —
   registrada como decisão de negócio explícita, não uma omissão técnica.
