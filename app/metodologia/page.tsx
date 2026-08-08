export const metadata = {
  title: "Metodologia — Painel Bolsão Matriz 2027",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[10px] border border-line-soft bg-white p-6 shadow-soft">
      <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
      <div className="prose-sm mt-3 space-y-3 text-sm leading-relaxed text-ink-2">
        {children}
      </div>
    </section>
  );
}

export default function MetodologiaPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <p className="font-display text-xs font-bold uppercase tracking-[0.12em] text-brand-teal-dark">
          Rastreabilidade
        </p>
        <h1 className="mt-1 font-display text-3xl font-extrabold text-ink">
          Metodologia e origem dos dados
        </h1>
        <p className="mt-2 text-sm text-ink-3">
          Esta página documenta, para uso das escolas e da gestão, exatamente de onde vêm os
          números do painel e quais regras foram aplicadas para calculá-los.
        </p>
      </div>

      <Section title="Fonte dos dados">
        <p>
          Os dados vêm dos relatórios &ldquo;itens da venda — resumo&rdquo; exportados em CSV
          diretamente do checkout Layers (produto &ldquo;Pré-Matrícula Bolsão 2027&rdquo;), um
          arquivo por unidade. Cada linha do CSV corresponde a um item comprado dentro de um
          pedido (hoje, sempre 1 item por pedido, R$300 à vista ou parcelado no cartão).
        </p>
        <p>
          Os arquivos processados nesta carga estão listados no rodapé técnico do painel de
          qualidade de dados na página inicial. Atualizar os dados = substituir os CSVs em{" "}
          <code>data/raw/</code> e publicar uma nova versão (ver README do projeto).
        </p>
      </Section>

      <Section title="Granularidade e chaves adotadas">
        <p>
          <strong>Pedido/venda:</strong> chave = &ldquo;Código da Venda&rdquo;. O valor do
          pedido é lido de &ldquo;Valor dos Itens&rdquo; (valor do pedido, repetido em todas as
          linhas) e não somado por linha — evita contar o mesmo pedido em dobro.
        </p>
        <p>
          <strong>Um pedido pode ter mais de um aluno:</strong> caso real já observado — um
          responsável comprou 2 pré-matrículas (2 filhos) em um único checkout, gerando 2 linhas
          com o mesmo código de pedido. O valor financeiro do pedido continua contado uma única
          vez; a tabela de alunos mostra os 2 filhos como registros separados, com o valor
          dividido proporcionalmente para não parecer que a soma da coluna é maior que o
          realmente cobrado.
        </p>
        <p>
          <strong>Aluno:</strong> não existe um ID de aluno na fonte — o CPF do formulário
          pertence ao responsável financeiro, não à criança. A chave usada é{" "}
          <em>nome do aluno + data de nascimento</em>, extraídos do campo de formulário da
          venda. Quando isso não é possível, o painel cai para responsável (nome + CPF) e, em
          último caso, para o próprio pedido — cada uma dessas exceções aparece no painel de
          qualidade de dados.
        </p>
        <p>
          <strong>Tentativa vencida substituída por pagamento posterior:</strong> quando o mesmo
          aluno tem um pedido pendente/vencido e outro pago, o pedido pendente/vencido é
          descartado de todas as contagens (não entra em pedidos, valor vendido, nem aparece na
          tabela) — é tratado como uma tentativa de checkout abandonada, não como uma venda a
          mais. Caso real que validou a regra: um aluno em Tijuca teve um pedido vencido às 10:30
          e outro pago às 12:09 no mesmo dia; hoje ele conta como 1 aluno e 1 pedido (o pago), não
          2. Cancelamentos e estornos do mesmo aluno não são afetados por esta regra — continuam
          visíveis normalmente.
        </p>
        <p>
          <strong>Unidade:</strong> resolvida pelo canal de venda de cada linha (ex.:
          &ldquo;Bolsão 2027 - Tijuca&rdquo;), não pelo nome do arquivo de origem.
        </p>
      </Section>

      <Section title="Regra especial — Américas">
        <p>
          O marketplace da unidade Américas está cadastrado dentro da mesma comunidade/arquivo
          de Rocha Miranda na plataforma Layers. Por isso, a separação não usa o nome do
          arquivo: cada linha é classificada pelo texto do canal de venda, o que identifica
          corretamente uma venda de Américas mesmo vindo dentro do arquivo de Rocha Miranda.
          Enquanto não houver vendas de Américas nos dados, a unidade aparece com todos os
          indicadores zerados — isso é o comportamento esperado, não uma falha de carga.
        </p>
      </Section>

      <Section title="Classificação de status de pagamento">
        <p>
          O campo de origem é o status de pagamento já resumido pela Layers no nível do pedido.
          Ele é agrupado em quatro categorias no painel: <strong>Pago</strong>,{" "}
          <strong>Pendente/Vencido</strong>, <strong>Cancelado</strong> e{" "}
          <strong>Estornado</strong>. Um quinto estado, &ldquo;Não classificado&rdquo;, aparece
          quando o texto do status não bate com nenhum valor conhecido — nesse caso o valor não
          entra em nenhuma das quatro somas de valor (nem pago, nem pendente, nem cancelado, nem
          estornado) e o registro é sinalizado no painel de qualidade de dados para revisão
          manual, em vez de ser presumido.
        </p>
        <p>
          Esta fonte não tem um arquivo de parcelas/repasses (diferente do pipeline de
          mensalidades recorrentes das escolas); por isso não é possível aqui diferenciar
          &ldquo;pago mas retido pelo gateway&rdquo; de &ldquo;pago e liberado à escola&rdquo;.
        </p>
      </Section>

      <Section title="Critérios dos principais indicadores">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Alunos com pré-matrícula:</strong> alunos únicos (pela chave acima) com pelo
            menos um pedido que não esteja cancelado nem estornado.
          </li>
          <li>
            <strong>Pedidos:</strong> contagem de códigos de venda únicos.
          </li>
          <li>
            <strong>Valor vendido:</strong> soma do valor de todos os pedidos, de qualquer
            status (valor bruto contratado).
          </li>
          <li>
            <strong>Valor pago:</strong> soma apenas dos pedidos com status &ldquo;Pago&rdquo;.
          </li>
          <li>
            <strong>Ticket médio pago:</strong> valor pago ÷ número de pedidos pagos.
          </li>
          <li>
            <strong>% pago:</strong> valor pago ÷ valor vendido.
          </li>
        </ul>
      </Section>

      <Section title="Qualidade de dados">
        <p>
          O painel inicial mostra um alerta com a contagem de exceções encontradas na carga
          atual (unidade não identificada, aluno não identificado, status não mapeado, valores
          zerados, datas inválidas, linhas duplicadas entre exportações, entre outras). Quando
          não há alertas, é porque a carga atual não apresentou nenhuma dessas inconsistências —
          não significa que a verificação foi pulada.
        </p>
      </Section>

      <Section title="Acesso e privacidade">
        <p>
          Esta é uma decisão de negócio registrada explicitamente: o painel foi publicado sem
          autenticação, por escolha direta da área responsável, mesmo contendo nome, CPF,
          telefone e endereço do responsável financeiro e data de nascimento do aluno. Qualquer
          pessoa com o link tem acesso a esses dados. Ver README do projeto para o registro
          completo dessa decisão.
        </p>
      </Section>
    </div>
  );
}
