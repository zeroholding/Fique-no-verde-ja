/**
 * E-mail diário do saldo dos pacotes Flex, às 9h de Brasília.
 *
 * QUEM DISPARA: o próprio servidor. `instrumentation.ts` liga uma verificação
 * de minuto em minuto; a partir das 9h, se o e-mail do dia ainda não saiu, ele
 * sai. Não há agendador externo configurado para este projeto, e o Coolify
 * mantém o container no ar, então o relógio do processo basta.
 *
 * Os dois riscos de temporizador em processo (o motivo de o outbox do Tracken
 * usar endpoint) estão cobertos pela tabela `package_balance_email_runs`, uma
 * linha por dia:
 *   - reinício no deploy: o envio do dia fica registrado, então subir de novo
 *     depois das 9h não manda outro; e se o container estava fora às 9h, o
 *     e-mail pendente sai quando ele voltar.
 *   - duas réplicas: o dia é reservado com INSERT ... ON CONFLICT condicional,
 *     e só quem reservou envia.
 *
 * FALHA: até 6 tentativas, com 10 min entre elas (401 de IP não autorizado no
 * Brevo, por exemplo, pode ser corrigido no meio da manhã). A chave de
 * idempotência do Brevo só é trocada quando o Brevo RESPONDEU com recusa; sem
 * resposta (o e-mail pode ter saído), a nova tentativa reusa a mesma chave e o
 * Brevo não entrega duas vezes.
 *
 * CONFERÊNCIA PÓS-DEPLOY: na primeira subida do servidor com o Brevo
 * configurado, o mesmo e-mail (dados reais) sai UMA vez para
 * `CONFERENCIA_POS_DEPLOY.para`, com "[CONFERÊNCIA]" no assunto, para conferir
 * que tudo chega certo sem esperar as 9h. Fica registrado em
 * `package_balance_email_checks`; reinícios não repetem. Para conferir de novo,
 * troque a `chave`.
 *
 * Variáveis de ambiente:
 *   BREVO_API_KEY                         obrigatória (ver lib/email/brevo.ts)
 *   BREVO_SENDER_EMAIL                    opcional, padrão adm@fiquenoverdeja.com.br
 *   SALDO_PACOTES_EMAIL_PARA              opcional; vírgula separa vários.
 *                                         Padrão: gianlucca.florencio@zeroholding.com.br
 *   SALDO_PACOTES_EMAIL_DESLIGADO=1       desliga a agenda
 *   SALDO_PACOTES_EMAIL_AGENDA=1          liga a agenda fora de produção
 */

import { randomUUID } from "crypto";

import {
  EMAIL_VALIDO,
  ErroBrevo,
  configBrevo,
  enviarEmailBrevo,
  motivoConfigBrevoAusente,
  type ConfigBrevo,
} from "@/lib/email/brevo";

import { carregarSaldos, executarNoPool, type Executor, type ResumoSaldos } from "./consulta";
import { FUSO, montarEmailSaldos, type EmailMontado } from "./email";

type Ambiente = Record<string, string | undefined>;

export const HORA_DO_ENVIO = 9;
export const DESTINATARIO_PADRAO = "gianlucca.florencio@zeroholding.com.br";
export const MAXIMO_TENTATIVAS = 6;
const ESPERA_ENTRE_TENTATIVAS_MIN = 10;
/** Reserva sem resposta depois disto é de um processo que morreu no meio. */
const RESERVA_ABANDONADA_MIN = 15;
const INTERVALO_DA_AGENDA_MS = 60_000;
/** Primeira verificação logo depois de subir: cobre o deploy feito depois das 9h. */
const PRIMEIRA_VERIFICACAO_MS = 20_000;

/** E-mail de conferência que sai uma única vez depois do deploy. */
export const CONFERENCIA_POS_DEPLOY = {
  chave: "conferencia-saldo-pacotes-2026-10",
  para: ["gerenciamorais@gmail.com"],
} as const;
const MAXIMO_TENTATIVAS_CONFERENCIA = 3;

/* -------------------------------------------------------------------------- */
/*                                  Tabela                                    */
/* -------------------------------------------------------------------------- */

/**
 * Mesmo SQL de `database/migrations/028_create_package_balance_email_runs.sql`.
 * As migrations deste projeto são aplicadas à mão, então o envio também garante
 * a tabela na primeira vez. Idempotente.
 */
export const SQL_TABELA_ENVIOS = `
CREATE TABLE IF NOT EXISTS package_balance_email_runs (
  run_date DATE PRIMARY KEY,
  status VARCHAR(20) NOT NULL CHECK (status IN ('sending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  idempotency_key VARCHAR(80),
  recipients TEXT,
  message_id TEXT,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

/**
 * Reserva o dia. Devolve linha só para quem pode enviar agora: o primeiro do
 * dia, ou quem retoma uma falha (depois da espera) ou uma reserva abandonada,
 * dentro do limite de tentativas.
 */
const SQL_RESERVAR_DIA = `
INSERT INTO package_balance_email_runs AS r (run_date, status, attempts, idempotency_key, started_at, updated_at)
VALUES ($1::date, 'sending', 1, $2, now(), now())
ON CONFLICT (run_date) DO UPDATE
   SET status = 'sending',
       attempts = r.attempts + 1,
       idempotency_key = COALESCE(r.idempotency_key, EXCLUDED.idempotency_key),
       started_at = now(),
       updated_at = now()
 WHERE r.attempts < $3::int
   AND (
        (r.status = 'failed' AND r.updated_at < now() - make_interval(mins => $4::int))
     OR (r.status = 'sending' AND r.started_at < now() - make_interval(mins => $5::int))
   )
RETURNING r.attempts AS tentativa, r.idempotency_key AS chave`;

const SQL_MARCAR_ENVIADO = `
UPDATE package_balance_email_runs
   SET status = 'sent', sent_at = now(), message_id = $2, recipients = $3, last_error = NULL, updated_at = now()
 WHERE run_date = $1::date`;

/** `$3` = o e-mail pode ter saído; nesse caso a chave fica para a próxima tentativa. */
const SQL_MARCAR_FALHA = `
UPDATE package_balance_email_runs
   SET status = 'failed',
       last_error = $2,
       idempotency_key = CASE WHEN $3::boolean THEN idempotency_key ELSE NULL END,
       updated_at = now()
 WHERE run_date = $1::date`;

const SQL_SITUACAO_DO_DIA = `SELECT status, attempts FROM package_balance_email_runs WHERE run_date = $1::date`;

/**
 * Envios avulsos que devem sair uma vez só (a conferência pós-deploy).
 * Mesmo SQL de `database/migrations/029_create_package_balance_email_checks.sql`.
 */
export const SQL_TABELA_CONFERENCIAS = `
CREATE TABLE IF NOT EXISTS package_balance_email_checks (
  check_key VARCHAR(80) PRIMARY KEY,
  status VARCHAR(20) NOT NULL CHECK (status IN ('sending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  recipients TEXT,
  message_id TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

/** Mesma reserva do envio do dia, pela chave da conferência. */
const SQL_RESERVAR_CONFERENCIA = `
INSERT INTO package_balance_email_checks AS r (check_key, status, attempts, recipients, updated_at)
VALUES ($1, 'sending', 1, $2, now())
ON CONFLICT (check_key) DO UPDATE
   SET status = 'sending',
       attempts = r.attempts + 1,
       recipients = EXCLUDED.recipients,
       updated_at = now()
 WHERE r.attempts < $3::int
   AND (
        (r.status = 'failed' AND r.updated_at < now() - make_interval(mins => $4::int))
     OR (r.status = 'sending' AND r.updated_at < now() - make_interval(mins => $5::int))
   )
RETURNING r.attempts AS tentativa`;

const SQL_CONFERENCIA_ENVIADA = `
UPDATE package_balance_email_checks
   SET status = 'sent', message_id = $2, last_error = NULL, updated_at = now()
 WHERE check_key = $1`;

const SQL_CONFERENCIA_FALHOU = `
UPDATE package_balance_email_checks SET status = 'failed', last_error = $2, updated_at = now() WHERE check_key = $1`;

const SQL_SITUACAO_DA_CONFERENCIA = `SELECT status, attempts FROM package_balance_email_checks WHERE check_key = $1`;

const tabelasProntas = new WeakMap<Executor, Promise<void>>();

/** Cria as tabelas uma vez por processo; se falhar, a próxima chamada tenta de novo. */
export function garantirTabela(executar: Executor): Promise<void> {
  let pronta = tabelasProntas.get(executar);
  if (!pronta) {
    pronta = executar(SQL_TABELA_ENVIOS)
      .then(() => executar(SQL_TABELA_CONFERENCIAS))
      .then(() => undefined)
      .catch((erro: unknown) => {
        tabelasProntas.delete(executar);
        // Duas réplicas criando ao mesmo tempo: a segunda recebe 42P07/23505,
        // e a tabela existe.
        const codigo = (erro as { code?: string } | null)?.code;
        if (codigo === "42P07" || codigo === "23505") return;
        throw erro;
      });
    tabelasProntas.set(executar, pronta);
  }
  return pronta;
}

/* -------------------------------------------------------------------------- */
/*                              Configuração                                  */
/* -------------------------------------------------------------------------- */

/** Dia (AAAA-MM-DD) e minutos desde a meia-noite, no horário de Brasília. */
export function relogioDeBrasilia(agora: Date): { dia: string; minutos: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(agora);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((parte) => parte.type === tipo)?.value ?? "";
  return {
    dia: `${valor("year")}-${valor("month")}-${valor("day")}`,
    minutos: Number(valor("hour")) * 60 + Number(valor("minute")),
  };
}

export function destinatariosDoEmail(ambiente: Ambiente = process.env): string[] {
  const configurado = ambiente.SALDO_PACOTES_EMAIL_PARA?.trim();
  const lista = (configurado ? configurado.split(/[,;\s]+/) : [DESTINATARIO_PADRAO])
    .map((email) => email.trim().toLowerCase())
    .filter((email) => EMAIL_VALIDO.test(email));
  return [...new Set(lista)];
}

/** Endereço público do sistema, base dos links e do logotipo. */
export function urlDoSistema(ambiente: Ambiente = process.env): string {
  const configurada = ambiente.NEXT_PUBLIC_APP_URL?.trim();
  if (configurada && /^https?:\/\//i.test(configurada)) return configurada.replace(/\/+$/, "");
  return "https://fiquenoverdeja.com.br";
}

const ligado = (valor: string | undefined) => ["1", "true", "sim"].includes((valor ?? "").trim().toLowerCase());

/** Por que a agenda não liga neste processo, ou `null` se liga. */
export function motivoAgendaDesligada(ambiente: Ambiente = process.env): string | null {
  if (ligado(ambiente.SALDO_PACOTES_EMAIL_DESLIGADO)) return "SALDO_PACOTES_EMAIL_DESLIGADO=1";
  if (ambiente.NODE_ENV !== "production" && !ligado(ambiente.SALDO_PACOTES_EMAIL_AGENDA)) {
    return "fora de produção (ligue com SALDO_PACOTES_EMAIL_AGENDA=1)";
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*                                  Envio                                     */
/* -------------------------------------------------------------------------- */

export type EmailDoMomento = { resumo: ResumoSaldos; email: EmailMontado; para: string[] };

/** Lê o saldo agora e monta o e-mail. Também serve a prévia da rota. */
export async function montarEmailDoMomento(
  executar: Executor = executarNoPool,
  agora: Date = new Date(),
  ambiente: Ambiente = process.env,
): Promise<EmailDoMomento> {
  const resumo = await carregarSaldos(executar);
  const urlBase = urlDoSistema(ambiente);
  const para = destinatariosDoEmail(ambiente);
  const email = montarEmailSaldos({
    resumo,
    geradoEm: agora,
    urlBase,
    urlLogo: `${urlBase}/assets/logolinhafqnvj.png`,
    destinatarios: para,
  });
  return { resumo, email, para };
}

export type EnvioFeito = { messageId: string | null; para: string[]; assunto: string; resumo: ResumoSaldos };

export type OpcoesDoEnvio = {
  executar?: Executor;
  agora?: Date;
  ambiente?: Ambiente;
  chaveIdempotencia?: string;
  fetchImpl?: typeof fetch;
  /** Outros destinatários no lugar dos do envio diário (a conferência). */
  para?: readonly string[];
  /** Vai na frente do assunto, como "[CONFERÊNCIA] ". */
  prefixoAssunto?: string;
};

/** Monta com o saldo de agora e envia. Sem registro do dia: é o envio manual. */
export async function enviarSaldoAgora(config: ConfigBrevo, opcoes: OpcoesDoEnvio = {}): Promise<EnvioFeito> {
  const momento = await montarEmailDoMomento(opcoes.executar, opcoes.agora, opcoes.ambiente);
  const para = opcoes.para ? [...opcoes.para] : momento.para;
  if (para.length === 0) throw new Error("Nenhum destinatário válido em SALDO_PACOTES_EMAIL_PARA.");
  const assunto = `${opcoes.prefixoAssunto ?? ""}${momento.email.assunto}`;
  const { messageId } = await enviarEmailBrevo(
    config,
    {
      para: para.map((email) => ({ email })),
      assunto,
      html: momento.email.html,
      texto: momento.email.texto,
      tags: ["saldo-pacotes"],
      chaveIdempotencia: opcoes.chaveIdempotencia,
    },
    opcoes.fetchImpl,
  );
  return { messageId, para, assunto, resumo: momento.resumo };
}

export type DesfechoDoDia =
  | { tipo: "ANTES_DO_HORARIO"; dia: string }
  | { tipo: "SEM_CONFIGURACAO"; dia: string; motivo: string }
  | { tipo: "ENVIADO"; dia: string; tentativa: number; messageId: string | null }
  /** O e-mail saiu, mas a marcação no banco falhou; a reserva expira e a chave evita duplicar. */
  | { tipo: "ENVIADO_SEM_REGISTRO"; dia: string; erro: string }
  | { tipo: "JA_ENVIADO"; dia: string }
  /** Outra réplica está enviando, ou a falha anterior ainda está na espera. */
  | { tipo: "AGUARDANDO"; dia: string }
  | { tipo: "FALHOU"; dia: string; tentativa: number; erro: string }
  | { tipo: "DESISTIU"; dia: string; tentativas: number };

export type DependenciasDoEnvio = OpcoesDoEnvio & { config?: ConfigBrevo | null };

/** Envia o e-mail do dia, se já for hora e ninguém tiver enviado. Idempotente. */
export async function processarEnvioDoDia(deps: DependenciasDoEnvio = {}): Promise<DesfechoDoDia> {
  const agora = deps.agora ?? new Date();
  const executar = deps.executar ?? executarNoPool;
  const ambiente = deps.ambiente ?? process.env;
  const { dia, minutos } = relogioDeBrasilia(agora);
  if (minutos < HORA_DO_ENVIO * 60) return { tipo: "ANTES_DO_HORARIO", dia };

  const config = deps.config !== undefined ? deps.config : configBrevo(ambiente);
  if (!config) return { tipo: "SEM_CONFIGURACAO", dia, motivo: motivoConfigBrevoAusente(ambiente) };
  if (destinatariosDoEmail(ambiente).length === 0) {
    return { tipo: "SEM_CONFIGURACAO", dia, motivo: "SALDO_PACOTES_EMAIL_PARA sem e-mail válido" };
  }

  await garantirTabela(executar);
  const { rows } = await executar(SQL_RESERVAR_DIA, [
    dia,
    `saldo-pacotes-${dia}-${randomUUID().slice(0, 8)}`,
    MAXIMO_TENTATIVAS,
    ESPERA_ENTRE_TENTATIVAS_MIN,
    RESERVA_ABANDONADA_MIN,
  ]);
  const reserva = rows[0];
  if (!reserva) {
    const situacao = (await executar(SQL_SITUACAO_DO_DIA, [dia])).rows[0];
    if (situacao?.status === "sent") return { tipo: "JA_ENVIADO", dia };
    const tentativas = Number(situacao?.attempts ?? 0);
    if (tentativas >= MAXIMO_TENTATIVAS) return { tipo: "DESISTIU", dia, tentativas };
    return { tipo: "AGUARDANDO", dia };
  }

  const tentativa = Number(reserva.tentativa);
  let envio: EnvioFeito;
  try {
    envio = await enviarSaldoAgora(config, {
      executar,
      agora,
      ambiente,
      chaveIdempotencia: String(reserva.chave),
      fetchImpl: deps.fetchImpl,
    });
  } catch (erro) {
    const mensagem = (erro instanceof Error ? erro.message : String(erro)).slice(0, 500);
    const talvezEnviado = erro instanceof ErroBrevo && erro.talvezEnviado;
    await executar(SQL_MARCAR_FALHA, [dia, mensagem, talvezEnviado]);
    return { tipo: "FALHOU", dia, tentativa, erro: mensagem };
  }

  try {
    await executar(SQL_MARCAR_ENVIADO, [dia, envio.messageId, envio.para.join(", ")]);
  } catch (erro) {
    // Não marca falha: o e-mail saiu. A reserva expira e a próxima tentativa
    // reusa a mesma chave, que o Brevo não entrega de novo.
    return { tipo: "ENVIADO_SEM_REGISTRO", dia, erro: erro instanceof Error ? erro.message : String(erro) };
  }
  return { tipo: "ENVIADO", dia, tentativa, messageId: envio.messageId };
}

export type DesfechoDaConferencia =
  | { tipo: "SEM_CONFIGURACAO"; motivo: string }
  | { tipo: "ENVIADO"; tentativa: number; messageId: string | null; para: string[] }
  | { tipo: "JA_ENVIADO" }
  | { tipo: "AGUARDANDO" }
  | { tipo: "FALHOU"; tentativa: number; erro: string }
  | { tipo: "DESISTIU"; tentativas: number };

/**
 * Envia a conferência pós-deploy, se ainda não saiu. Não depende do horário:
 * roda na primeira verificação depois que o servidor sobe com o Brevo
 * configurado.
 */
export async function processarConferencia(
  deps: DependenciasDoEnvio = {},
  conferencia: { chave: string; para: readonly string[] } = CONFERENCIA_POS_DEPLOY,
): Promise<DesfechoDaConferencia> {
  const executar = deps.executar ?? executarNoPool;
  const ambiente = deps.ambiente ?? process.env;
  const config = deps.config !== undefined ? deps.config : configBrevo(ambiente);
  if (!config) return { tipo: "SEM_CONFIGURACAO", motivo: motivoConfigBrevoAusente(ambiente) };

  await garantirTabela(executar);
  const { rows } = await executar(SQL_RESERVAR_CONFERENCIA, [
    conferencia.chave,
    conferencia.para.join(", "),
    MAXIMO_TENTATIVAS_CONFERENCIA,
    ESPERA_ENTRE_TENTATIVAS_MIN,
    RESERVA_ABANDONADA_MIN,
  ]);
  const reserva = rows[0];
  if (!reserva) {
    const situacao = (await executar(SQL_SITUACAO_DA_CONFERENCIA, [conferencia.chave])).rows[0];
    if (situacao?.status === "sent") return { tipo: "JA_ENVIADO" };
    const tentativas = Number(situacao?.attempts ?? 0);
    if (tentativas >= MAXIMO_TENTATIVAS_CONFERENCIA) return { tipo: "DESISTIU", tentativas };
    return { tipo: "AGUARDANDO" };
  }

  const tentativa = Number(reserva.tentativa);
  try {
    const envio = await enviarSaldoAgora(config, {
      executar,
      agora: deps.agora,
      ambiente,
      fetchImpl: deps.fetchImpl,
      para: conferencia.para,
      prefixoAssunto: "[CONFERÊNCIA] ",
    });
    await executar(SQL_CONFERENCIA_ENVIADA, [conferencia.chave, envio.messageId]);
    return { tipo: "ENVIADO", tentativa, messageId: envio.messageId, para: envio.para };
  } catch (erro) {
    const mensagem = (erro instanceof Error ? erro.message : String(erro)).slice(0, 500);
    await executar(SQL_CONFERENCIA_FALHOU, [conferencia.chave, mensagem]).catch(() => undefined);
    return { tipo: "FALHOU", tentativa, erro: mensagem };
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Agenda                                    */
/* -------------------------------------------------------------------------- */

type EstadoDaAgenda = {
  intervalo: ReturnType<typeof setInterval> | null;
  rodando: Promise<void> | null;
  /** Dia já resolvido neste processo (enviado ou desistido): não consulta mais o banco. */
  diaResolvido: string | null;
  /** Conferência pós-deploy já resolvida neste processo. */
  conferenciaResolvida: boolean;
  avisos: Set<string>;
};

/**
 * Em `globalThis`: o módulo pode ser carregado mais de uma vez (rotas
 * diferentes, recarga em desenvolvimento), e duas agendas no mesmo processo
 * seriam trabalho em dobro.
 */
const escopo = globalThis as typeof globalThis & { __fnvjSaldoPacotes?: EstadoDaAgenda };
const estado: EstadoDaAgenda = (escopo.__fnvjSaldoPacotes ??= {
  intervalo: null,
  rodando: null,
  diaResolvido: null,
  conferenciaResolvida: false,
  avisos: new Set<string>(),
});

function avisarUmaVez(chave: string, mensagem: string, nivel: "warn" | "error" = "warn"): void {
  if (estado.avisos.has(chave)) return;
  estado.avisos.add(chave);
  console[nivel](mensagem);
}

function registrarDesfecho(desfecho: DesfechoDoDia): void {
  switch (desfecho.tipo) {
    case "ANTES_DO_HORARIO":
    case "AGUARDANDO":
      return;
    case "SEM_CONFIGURACAO":
      avisarUmaVez(`config:${desfecho.motivo}`, `[saldo-pacotes] E-mail diário não enviado: ${desfecho.motivo}.`);
      return;
    case "ENVIADO":
      estado.diaResolvido = desfecho.dia;
      console.log(
        `[saldo-pacotes] E-mail de ${desfecho.dia} enviado (tentativa ${desfecho.tentativa}, messageId ${desfecho.messageId ?? "-"}).`,
      );
      return;
    case "ENVIADO_SEM_REGISTRO":
      estado.diaResolvido = desfecho.dia;
      console.error(`[saldo-pacotes] E-mail de ${desfecho.dia} enviado, mas o registro falhou: ${desfecho.erro}`);
      return;
    case "JA_ENVIADO":
      estado.diaResolvido = desfecho.dia;
      return;
    case "DESISTIU":
      estado.diaResolvido = desfecho.dia;
      avisarUmaVez(
        `desistiu:${desfecho.dia}`,
        `[saldo-pacotes] E-mail de ${desfecho.dia} não saiu depois de ${desfecho.tentativas} tentativas. ` +
          "O motivo está em package_balance_email_runs.last_error.",
        "error",
      );
      return;
    case "FALHOU":
      console.error(
        `[saldo-pacotes] Falha no e-mail de ${desfecho.dia} (tentativa ${desfecho.tentativa} de ${MAXIMO_TENTATIVAS}): ` +
          `${desfecho.erro}${desfecho.tentativa < MAXIMO_TENTATIVAS ? ` Nova tentativa em ${ESPERA_ENTRE_TENTATIVAS_MIN} min.` : ""}`,
      );
      return;
  }
}

function registrarConferencia(desfecho: DesfechoDaConferencia): void {
  switch (desfecho.tipo) {
    case "AGUARDANDO":
    case "SEM_CONFIGURACAO": // o aviso de configuração já sai pelo envio do dia
      return;
    case "ENVIADO":
      estado.conferenciaResolvida = true;
      console.log(
        `[saldo-pacotes] Conferência pós-deploy enviada para ${desfecho.para.join(", ")} ` +
          `(messageId ${desfecho.messageId ?? "-"}).`,
      );
      return;
    case "JA_ENVIADO":
      estado.conferenciaResolvida = true;
      return;
    case "DESISTIU":
      estado.conferenciaResolvida = true;
      avisarUmaVez(
        "conferencia:desistiu",
        `[saldo-pacotes] Conferência pós-deploy não saiu depois de ${desfecho.tentativas} tentativas. ` +
          "O motivo está em package_balance_email_checks.last_error.",
        "error",
      );
      return;
    case "FALHOU":
      console.error(`[saldo-pacotes] Falha na conferência pós-deploy (tentativa ${desfecho.tentativa}): ${desfecho.erro}`);
      return;
  }
}

async function verificar(dia: string): Promise<void> {
  if (!estado.conferenciaResolvida) registrarConferencia(await processarConferencia());
  if (estado.diaResolvido !== dia) registrarDesfecho(await processarEnvioDoDia());
}

function verificarAgora(): void {
  if (estado.rodando) return;
  const { dia } = relogioDeBrasilia(new Date());
  if (estado.diaResolvido === dia && estado.conferenciaResolvida) return;
  estado.rodando = verificar(dia)
    .catch((erro: unknown) => {
      // Banco fora, por exemplo. A verificação do próximo minuto tenta de novo;
      // o mesmo erro só vai para o log uma vez por dia.
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      avisarUmaVez(`erro:${dia}:${mensagem}`, `[saldo-pacotes] Falha ao verificar o e-mail de ${dia}: ${mensagem}`, "error");
    })
    .finally(() => {
      estado.rodando = null;
    });
}

/** Liga a verificação de minuto em minuto. Chamar de novo não duplica. */
export function iniciarAgendaSaldoPacotes(): boolean {
  if (estado.intervalo) return true;
  const motivo = motivoAgendaDesligada();
  if (motivo) {
    console.log(`[saldo-pacotes] Agenda do e-mail diário desligada: ${motivo}.`);
    return false;
  }

  estado.intervalo = setInterval(verificarAgora, INTERVALO_DA_AGENDA_MS);
  estado.intervalo.unref?.();
  setTimeout(verificarAgora, PRIMEIRA_VERIFICACAO_MS).unref?.();

  console.log(
    `[saldo-pacotes] Agenda ligada: e-mail diário às ${HORA_DO_ENVIO}h (${FUSO}) para ` +
      `${destinatariosDoEmail().join(", ") || "(sem destinatário válido)"}.`,
  );
  return true;
}
