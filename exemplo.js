/**
 * Exemplo: uma fila de eventos que não foram processados.
 *
 * O cenário é genérico de propósito — vale para qualquer coisa que entra num
 * sistema, deveria virar alguma coisa, e às vezes não vira: pedido, pagamento,
 * webhook, mensagem, importação.
 *
 * Rode com:  node exemplo.js
 *            node exemplo.js --com-buraco     (mostra a auditoria pegando um caso esquecido)
 */

const { auditar, relatar } = require('./auditoria');

// ---------------------------------------------------------------------------
// Uma amostra pequena, com os casos chatos que a vida real tem
// ---------------------------------------------------------------------------
const eventos = [
  // dono conhecido, dá para reprocessar
  { id: 1, ref: 'A-100', dono: 'u1', tentativas: 2, erro: 'dono_nao_encontrado', jaAplicado: false },
  { id: 2, ref: 'A-101', dono: 'u2', tentativas: 1, erro: 'dono_nao_encontrado', jaAplicado: false },

  // o mesmo evento reapresentado pela origem antes do ACK — é UM, não três
  { id: 3, ref: 'A-102', dono: 'u3', tentativas: 0, erro: null, jaAplicado: true },
  { id: 4, ref: 'A-102', dono: 'u3', tentativas: 0, erro: null, jaAplicado: true },
  { id: 5, ref: 'A-102', dono: 'u3', tentativas: 0, erro: null, jaAplicado: true },

  // já entrou por outro caminho; só o registro bruto ficou sem baixa
  { id: 6, ref: 'A-103', dono: 'u4', tentativas: 0, erro: null, jaAplicado: true },

  // identificador de serviço, não é gente
  { id: 7, ref: 'A-104', dono: 'SISTEMA', tentativas: 4, erro: 'dono_nao_encontrado', jaAplicado: false },
  { id: 8, ref: 'A-105', dono: 'SISTEMA', tentativas: 5, erro: 'dono_nao_encontrado', jaAplicado: false },

  // dono que o sistema nunca conheceu — perda real, e tudo bem
  { id: 9, ref: 'A-106', dono: 'desconhecido-1', tentativas: 5, erro: 'dono_nao_encontrado', jaAplicado: false },
  { id: 10, ref: 'A-107', dono: 'desconhecido-2', tentativas: 5, erro: 'dono_nao_encontrado', jaAplicado: false },

  // payload quebrado
  { id: 11, ref: null, dono: null, tentativas: 1, erro: 'ilegivel', jaAplicado: false, corrompido: true },
];

const CONHECIDOS = new Set(['u1', 'u2', 'u3', 'u4']);
const SERVICO = new Set(['SISTEMA']);
const MAX_TENTATIVAS = 5;

// ---------------------------------------------------------------------------
// Os baldes. A ordem é a definição: vence o primeiro que casar.
// ---------------------------------------------------------------------------
const baldes = [
  {
    nome: 'ILEGIVEL',
    quando: (e) => e.corrompido === true,
    veredito: 'perda',
  },
  {
    nome: 'IDENTIFICADOR_DE_SERVICO',
    quando: (e) => SERVICO.has(e.dono),
    veredito: 'ignorar',
  },
  {
    nome: 'JA_APLICADO',
    quando: (e) => e.jaAplicado === true,
    veredito: 'só dar baixa',
    nota: 'não era perda — o efeito já aconteceu, faltou marcar a origem',
  },
  {
    nome: 'RECUPERAVEL',
    quando: (e) => CONHECIDOS.has(e.dono),
    veredito: 'reprocessar',
  },
  // Tire o comentário da linha abaixo para ver a auditoria FECHAR.
  // Rode com --com-buraco para ver ela FALHAR sem este balde.
  ...(process.argv.includes('--com-buraco')
    ? []
    : [
        {
          nome: 'DONO_DESCONHECIDO',
          quando: (e) => !CONHECIDOS.has(e.dono),
          veredito: 'perda',
        },
      ]),
];

const resultado = auditar(eventos, {
  baldes,
  // o evento repetido pela origem conta uma vez
  chave: (e) => e.ref ?? `sem-ref-${e.id}`,
});

const codigo = relatar(resultado, {
  titulo: 'EVENTOS QUE NÃO VIRARAM NADA',
});

// ---------------------------------------------------------------------------
// A resposta que alguém de fato quer ouvir
// ---------------------------------------------------------------------------
if (resultado.fechou) {
  const por = (nome) =>
    resultado.linhas.find((b) => b.nome === nome)?.peso ?? 0;

  console.log('RESPOSTA');
  console.log(`  dá para reprocessar ....... ${por('RECUPERAVEL')}`);
  console.log(`  já aconteceu, só dar baixa  ${por('JA_APLICADO')}`);
  console.log(`  perda definitiva .......... ${por('DONO_DESCONHECIDO') + por('ILEGIVEL')}`);
  console.log(`  nem é gente ............... ${por('IDENTIFICADOR_DE_SERVICO')}\n`);
}

process.exit(codigo);
