/**
 * Auditoria com conta fechada.
 *
 * Um classificador que se recusa a dar um número em que você não pode confiar.
 *
 * A ideia é simples: em vez de responder "quantos X existem?" com uma consulta,
 * você declara TODOS os grupos possíveis, classifica cada item em exatamente um
 * deles, e no fim exige que a soma dos grupos seja igual ao total. Se sobrar ou
 * faltar item, a auditoria falha — e um número que falhou é melhor que um
 * número errado com cara de certo.
 */

/**
 * Classifica `itens` nos `baldes`, em cascata: vence o primeiro cujo `quando`
 * responder verdadeiro. A ordem é parte da definição, não detalhe de
 * implementação — é ela que garante que nenhum item caia em dois grupos.
 *
 * @param {Array} itens
 * @param {object} config
 * @param {Array<{nome: string, quando: Function, veredito?: string, nota?: string}>} config.baldes
 * @param {Function} [config.peso] quanto cada item vale na conta (padrão: 1).
 *   Serve para quando um item representa vários — um lote, uma repetição, um
 *   registro que aparece duplicado na origem.
 * @param {Function} [config.chave] identidade do item, para deduplicar antes de
 *   contar. Sem ela, nada é deduplicado.
 */
function auditar(itens, { baldes, peso = () => 1, chave = null }) {
  if (!Array.isArray(baldes) || baldes.length === 0) {
    throw new Error('auditar: defina pelo menos um balde');
  }

  const nomes = baldes.map((b) => b.nome);
  const repetido = nomes.find((nome, i) => nomes.indexOf(nome) !== i);
  if (repetido) {
    throw new Error(`auditar: balde "${repetido}" declarado duas vezes`);
  }

  // Dedup antes de contar. Um item que aparece três vezes na origem é UM item
  // com peso três, não três itens — confundir os dois é a forma mais comum de
  // inflar um relatório sem perceber.
  let universo = itens;
  if (chave) {
    const porChave = new Map();
    for (const item of itens) {
      const k = chave(item);
      const existente = porChave.get(k);
      if (existente) {
        existente.repeticoes += 1;
        continue;
      }
      porChave.set(k, { item, repeticoes: 1 });
    }
    universo = [...porChave.values()];
  } else {
    universo = itens.map((item) => ({ item, repeticoes: 1 }));
  }

  const contas = new Map(
    baldes.map((b) => [
      b.nome,
      { ...b, itens: 0, peso: 0, repeticoes: 0, exemplos: [] },
    ]),
  );

  /**
   * O balde que não deveria receber nada.
   *
   * Ele existe para que "esqueci de um caso" apareça como falha em vez de
   * virar silêncio. Sem ele, um item sem balde simplesmente some da conta, e
   * o relatório continua parecendo correto.
   */
  const sobra = { nome: 'NAO_CLASSIFICADO', itens: 0, peso: 0, repeticoes: 0, exemplos: [] };

  for (const entrada of universo) {
    const { item, repeticoes } = entrada;
    const p = peso(item) * repeticoes;

    const balde = baldes.find((b) => b.quando(item)) ;
    const alvo = balde ? contas.get(balde.nome) : sobra;

    alvo.itens += 1;
    alvo.peso += p;
    alvo.repeticoes += repeticoes;
    if (alvo.exemplos.length < 5) alvo.exemplos.push(item);
    entrada.balde = balde ? balde.nome : sobra.nome;
  }

  const totalItens = universo.length;
  const totalPeso = universo.reduce(
    (s, e) => s + peso(e.item) * e.repeticoes,
    0,
  );

  const linhas = [...contas.values(), sobra].filter((b) => b.itens > 0);

  const somaItens = linhas.reduce((s, b) => s + b.itens, 0);
  const somaPeso = linhas.reduce((s, b) => s + b.peso, 0);

  const conferencias = [
    ['os baldes somam os itens', somaItens, totalItens],
    ['os baldes somam o peso', somaPeso, totalPeso],
    ['nada ficou sem balde', sobra.itens, 0],
  ];

  const fechou = conferencias.every(([, obtido, esperado]) => obtido === esperado);

  return {
    fechou,
    totalItens,
    totalPeso,
    origem: itens.length,
    linhas,
    conferencias,
    classificados: universo,
  };
}

const n = (v) => Number(v || 0).toLocaleString('pt-BR');
const padR = (v, w) => String(v).padEnd(w);
const padL = (v, w) => String(v).padStart(w);

/** Imprime o relatório e a conferência. Devolve o código de saída sugerido. */
function relatar(resultado, { titulo = 'AUDITORIA' } = {}) {
  const barra = '='.repeat(72);
  console.log(`\n${barra}\n${titulo}\n${barra}`);

  if (resultado.origem !== resultado.totalItens) {
    console.log(
      `${n(resultado.origem)} registros na origem -> ${n(resultado.totalItens)} itens distintos ` +
        `(${n(resultado.origem - resultado.totalItens)} eram repetição)`,
    );
  }

  console.log(
    `\n${padR('balde', 26)}${padL('itens', 9)}${padL('peso', 9)}${padL('%', 8)}  veredito`,
  );
  for (const b of [...resultado.linhas].sort((x, y) => y.peso - x.peso)) {
    const pct = resultado.totalPeso
      ? ((b.peso / resultado.totalPeso) * 100).toFixed(1)
      : '0.0';
    console.log(
      `${padR(b.nome, 26)}${padL(n(b.itens), 9)}${padL(n(b.peso), 9)}${padL(pct, 8)}  ${b.veredito ?? ''}`,
    );
  }
  console.log(
    `${padR('TOTAL', 26)}${padL(n(resultado.totalItens), 9)}${padL(n(resultado.totalPeso), 9)}`,
  );

  console.log(`\n${barra}\nCONFERÊNCIA\n${barra}`);
  for (const [nome, obtido, esperado] of resultado.conferencias) {
    const ok = obtido === esperado;
    console.log(
      `  ${ok ? 'OK   ' : 'FALHA'} ${padR(nome, 34)} ${padL(n(obtido), 9)} / ${n(esperado)}`,
    );
  }

  if (!resultado.fechou) {
    const orfaos = resultado.linhas.find((b) => b.nome === 'NAO_CLASSIFICADO');
    if (orfaos) {
      console.log(
        `\n  ${n(orfaos.itens)} item(ns) não casaram com balde nenhum. Exemplos:`,
      );
      orfaos.exemplos.forEach((e) => console.log(`    ${JSON.stringify(e)}`));
    }
    console.log(
      '\n  A CONTA NÃO FECHOU. Os números acima não valem nada.\n',
    );
    return 1;
  }

  console.log('\n  Conta fechada. Os números acima são exatos.\n');
  return 0;
}

module.exports = { auditar, relatar };
