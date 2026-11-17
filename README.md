# Auditoria com conta fechada

Um classificador que se recusa a dar um número em que você não pode confiar.

## O problema

Alguém pergunta: *"quantos pedidos ficaram sem processar?"*

Você roda uma consulta. Dá 6.634. Você responde 6.634.

No dia seguinte descobre que 3.983 eram de um usuário de serviço. Você responde 2.651.

Depois descobre que 1.080 já tinham sido processados por outro caminho e só o registro bruto ficou sem baixa. Você responde 1.571.

Depois descobre que metade é de gente que nunca existiu no sistema. Você responde 194.

Quatro respostas para a mesma pergunta. Nenhuma delas estava errada do jeito que você consultou — e é exatamente por isso que é perigoso. Cada consulta tinha um filtro diferente, e **nenhuma delas conferia se a conta fechava.**

Quem recebeu o primeiro número já tomou decisão com ele.

## A ideia

Em vez de contar o que interessa, classifique **tudo**.

1. Declare todos os grupos possíveis, em cascata — vence o primeiro que casar.
2. Classifique cada item em exatamente um grupo.
3. Exija que a soma dos grupos seja igual ao total.
4. Se sobrar ou faltar item, **falhe**.

Um número que falhou é melhor que um número errado com cara de certo.

A peça que faz isso funcionar é o balde `NAO_CLASSIFICADO`. Ele existe para que "esqueci de um caso" vire uma falha barulhenta em vez de silêncio. Sem ele, o item que não casa com nada simplesmente some da conta, e o relatório continua parecendo correto.

## Uso

```js
const { auditar, relatar } = require('./auditoria');

const resultado = auditar(eventos, {
  baldes: [
    { nome: 'ILEGIVEL',      quando: e => e.corrompido,            veredito: 'perda' },
    { nome: 'DE_SERVICO',    quando: e => SERVICO.has(e.dono),     veredito: 'ignorar' },
    { nome: 'JA_APLICADO',   quando: e => e.jaAplicado,            veredito: 'só dar baixa' },
    { nome: 'RECUPERAVEL',   quando: e => CONHECIDOS.has(e.dono),  veredito: 'reprocessar' },
    { nome: 'DESCONHECIDO',  quando: () => true,                   veredito: 'perda' },
  ],
  chave: e => e.ref,   // o mesmo evento reapresentado conta UMA vez
});

process.exit(relatar(resultado));
```

```
balde                         itens     peso       %  veredito
JA_APLICADO                       2        4    36.4  só dar baixa
DE_SERVICO                        2        2    18.2  ignorar
RECUPERAVEL                       2        2    18.2  reprocessar
DESCONHECIDO                      2        2    18.2  perda
ILEGIVEL                          1        1     9.1  perda
TOTAL                             9       11

CONFERÊNCIA
  OK    os baldes somam os itens                   9 / 9
  OK    os baldes somam o peso                    11 / 11
  OK    nada ficou sem balde                       0 / 0

  Conta fechada. Os números acima são exatos.
```

E quando falta um caso:

```
  FALHA nada ficou sem balde                       2 / 0

  2 item(ns) não casaram com balde nenhum. Exemplos:
    {"id":9,"ref":"A-106","dono":"desconhecido-1", ...}

  A CONTA NÃO FECHOU. Os números acima não valem nada.
```

Sai com código 1. Dá para colocar no CI.

```bash
node exemplo.js              # conta fecha
node exemplo.js --com-buraco # tira um balde de propósito e vê a auditoria pegar
```

## Três armadilhas que isso resolve

**Item x registro.** O mesmo item costuma aparecer várias vezes na origem — reapresentação antes do ACK, retentativa, log duplicado. Contar registro achando que é item infla o relatório sem ninguém perceber. Por isso existe `chave`, que deduplica antes de contar, e por isso o relatório mostra os dois números com rótulo.

**O filtro que esconde.** Filtrar por "os que falharam" parece óbvio e é traiçoeiro: em muitos sistemas o campo de erro não é limpo no sucesso, então a consulta traz item já resolvido. O universo aqui é sempre o conjunto inteiro — o recorte vira balde, não filtro.

**O caso esquecido.** Toda cascata tem um caso que ninguém pensou. A diferença é se você descobre pelo `NAO_CLASSIFICADO` hoje, ou por uma reunião daqui a um mês.

## O que não é

Não é um ORM, não fala com banco, não tem dependência. São duas funções. A ideia é que você leia os 180 linhas, entenda, e copie pro seu projeto — não que instale mais um pacote.

## Licença

MIT.
