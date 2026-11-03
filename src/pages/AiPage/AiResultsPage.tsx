import { Activity, AlertTriangle, ArrowLeft, CheckCircle2, Clock3, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AttendanceReportRun, ReportCohort, ReportInstance, ReportSummary } from '../../services/attendanceReports.types';
import { clearAuthSession } from '../../utils/authSession';
import {
  defaultReportPeriod, formatCollectedAt, formatReportNumber as number, formatReportPeriod,
  formatReportPercent, formatReportPoints, formatReportSeconds, isActiveReport, localReportDay,
  previousReportPeriod, reportRate, safeRatio, sameReportFilters, summaryIndicators, UNAVAILABLE, validateReportInput,
} from './attendanceReports.utils';
import { useAttendanceReports } from './useAttendanceReports';

const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-100';
const secondaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';
const statusLabels = { QUEUED: 'Na fila', RUNNING: 'Em andamento', COMPLETED: 'Completo', PARTIAL: 'Parcial', FAILED: 'Falhou' };
const phases: Record<string, string> = { metadata: 'Listando atendimentos', messages: 'Lendo conversas', crm: 'Consultando CRM', erp: 'Conferindo ERP', done: 'Coleta encerrada' };

function Progress({ run }: { run: AttendanceReportRun }) {
  const active = isActiveReport(run.status);
  const percent = safeRatio(run.progress.processed, run.progress.expected);
  return (
    <section aria-label="Progresso do levantamento" aria-live="polite" className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            {active ? <RefreshCw className="h-4 w-4 animate-spin text-violet-600" /> : run.status === 'COMPLETED' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
            {statusLabels[run.status]}
            <span className="text-sm font-normal text-slate-500">{phases[run.progress.phase ?? ''] ?? 'Aguardando início da coleta'}</span>
          </div>
          <p className="mt-2 text-sm text-slate-600">Solicitado: {formatReportPeriod(run.request)} · {run.request.queueIds.length} unidades</p>
          {run.request.comparison && <p className="mt-1 text-xs text-slate-500">Comparação: {formatReportPeriod(run.request.comparison)}</p>}
        </div>
        <span className="text-xs text-slate-500">Criado em {formatCollectedAt(run.createdAt)}</span>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Conversas processadas" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent === null ? undefined : Math.min(100, Math.round(percent * 100))}>
        <div className={`h-full rounded-full bg-violet-500 ${percent === null && active ? 'w-1/5 animate-pulse' : ''}`} style={percent !== null ? { width: `${Math.min(100, percent * 100)}%` } : undefined} />
      </div>
      <p className="mt-2 text-xs text-slate-500">Listados: {number(run.progress.listed)} · Processados: {number(run.progress.processed)}/{number(run.progress.expected)} · Falhas: {number(run.progress.failed)}</p>
      {run.status === 'FAILED' && <p className="mt-3 text-sm text-rose-700">A coleta falhou. Confira as falhas abaixo e tente gerar um novo levantamento.</p>}
      {run.errors.length > 0 && <details className="mt-3 text-sm text-slate-600">
        <summary className="cursor-pointer font-medium">Fontes com falhas ({run.errors.length})</summary>
        <ul className="mt-2 max-h-44 space-y-1 overflow-auto text-xs">
          {run.errors.map((error, index) => <li key={index}>{error.source} · {error.code}{error.queueId !== undefined ? ` · fila ${error.queueId}` : ''}{error.pipelineId !== undefined ? ` · funil ${error.pipelineId}` : ''}</li>)}
        </ul>
      </details>}
    </section>
  );
}

function Comparison({ cohort, customWindows }: { cohort: ReportCohort | null | undefined; customWindows: boolean }) {
  if (!cohort) return <><td className="px-4 py-4 text-slate-400">{UNAVAILABLE}</td><td className="px-4 py-4 text-slate-400">{UNAVAILABLE}</td></>;
  const changes = cohort.changes;
  return <>
    <td className="px-4 py-4 align-top">
      <div>{formatReportPercent(changes.humanMessagesReductionPct)}</div>
      <div className="mt-1 text-xs text-slate-500">{number(changes.humanMessagesPerChatBefore, 3)} → {number(changes.humanMessagesPerChatAfter, 3)} msgs/chat</div>
      <div className="mt-1 text-xs text-slate-500">{number(cohort.before.chats)} → {number(cohort.after.chats)} chats</div>
      {customWindows && <div className="mt-1 text-xs text-slate-500">Antes: {formatReportPeriod({ dateFrom: cohort.before_dates[0], dateTo: cohort.before_dates[1] })}<br />Depois: {formatReportPeriod({ dateFrom: cohort.after_dates[0], dateTo: cohort.after_dates[1] })}</div>}
    </td>
    <td className="px-4 py-4 align-top">
      <div>{formatReportPoints(changes.sales.differencePp)}</div>
      <div className="mt-1 text-xs text-slate-500">IC95%: {formatReportPoints(changes.sales.lower95Pp)} a {formatReportPoints(changes.sales.upper95Pp)}</div>
      <div className="mt-1 text-xs text-slate-500">{number(cohort.before.sale_reason)}/{number(cohort.before.chats)} → {number(cohort.after.sale_reason)}/{number(cohort.after.chats)}</div>
    </td>
  </>;
}

function SummaryCells({ summary }: { summary: ReportSummary }) {
  return <>
    <td className="px-4 py-4">{number(summary.chats)}</td>
    <td className="px-4 py-4">{number(summary.ai_entered)}<p className="mt-1 text-xs text-slate-500">{reportRate(summary.ai_entered, summary.chats)}</p></td>
    <td className="px-4 py-4">{number(summary.ai_response_without_human)}<p className="mt-1 text-xs text-slate-500">{reportRate(summary.ai_response_without_human, summary.chats)}</p></td>
    <td className="px-4 py-4">{formatReportSeconds(summary.request_response_s?.median)}<p className="mt-1 text-xs text-slate-500">n={number(summary.request_response_s?.n)}</p></td>
    <td className="px-4 py-4">{number(safeRatio(summary.human_messages, summary.chats), 3)}<p className="mt-1 text-xs text-slate-500">{number(summary.human_messages)}/{number(summary.chats)}</p></td>
    <td className="px-4 py-4">{number(summary.sale_reason)}<p className="mt-1 text-xs text-slate-500">{reportRate(summary.sale_reason, summary.chats)}</p></td>
    <td className="px-4 py-4">{number(summary.survey?.mean, 2)}<p className="mt-1 text-xs text-slate-500">n={number(summary.survey?.n)} · {reportRate(summary.survey?.n, summary.chats)}</p></td>
    <td className="px-4 py-4">{number(summary.technical_error)}</td>
  </>;
}

function Result({ run, instance }: { run: AttendanceReportRun; instance: ReportInstance }) {
  const result = run.result!;
  const sampleOnly = result.total === null;
  const summary = result.total ?? result.observed_total;
  const hasComparison = Boolean(result.comparisonPeriod || run.request.preset || Object.values(result.cohorts).some(Boolean));
  return <section aria-label="Resultado exibido" className="space-y-5">
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-900">Resultado exibido · {instance.name}</h2>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${run.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{statusLabels[run.status]}</span>
      </div>
      <p className="mt-2 text-sm text-slate-700">{formatReportPeriod(result.period)} · {result.timezone}</p>
      {result.comparisonPeriod && <p className="mt-1 text-sm text-slate-600">Comparado com {formatReportPeriod(result.comparisonPeriod)}</p>}
      {run.request.preset && <p className="mt-1 text-sm text-slate-600">Janelas de comparação por unidade do estudo original, indicadas na tabela.</p>}
      <p className="mt-2 text-xs text-slate-500">Unidades: {run.request.queueIds.map(id => instance.units.find(unit => unit.queueId === id)?.name ?? `Fila ${id}`).join(', ')}</p>
      <p className="mt-2 text-xs text-slate-500">Coleta: {formatCollectedAt(result.coverage.collectedAt)} · Corte das mensagens: {formatCollectedAt(result.coverage.messageCutoff)}</p>
      <p className="mt-1 text-xs text-slate-500">Cobertura da coleta{run.request.comparison ? ' (ambos os períodos)' : ''}: {number(result.coverage.processedChats)}/{number(result.coverage.expectedChats)} chats processados · {number(result.coverage.failedChats)} falhas · {number(result.explicit_test_chats)} testes excluídos na coleta</p>
      {(run.status === 'PARTIAL' || !result.coverage.complete) && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        {sampleOnly ? 'Amostra observada: faltam conversas. Os números abaixo não representam o total completo do período.' : 'Resultado parcial: há fontes com falhas. Confira a cobertura e os indicadores indisponíveis.'}
      </div>}
      {result.period.dateTo === localReportDay() && <p className="mt-3 text-sm text-amber-800">O dia atual está incompleto. A coleta considera somente as mensagens até o horário de corte.</p>}
    </div>

    <div>
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{sampleOnly ? 'Indicadores da amostra observada' : 'Indicadores do período'}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {summaryIndicators(summary).map(item => <article key={item.label} className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-600">{item.label}</p>
          <p className={`mt-2 font-semibold tracking-tight text-slate-950 ${item.value === UNAVAILABLE ? 'text-xl' : 'text-3xl'}`}>{item.value}</p>
          <p className="mt-2 text-xs text-slate-500">{item.detail}</p>
        </article>)}
      </div>
    </div>

    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-5"><h2 className="font-semibold text-slate-900">Resultados por unidade</h2><p className="mt-1 text-xs text-slate-500">Resposta à solicitação: mediana em segundos, além de saudações. Satisfação: média de 1 a 5, com participação da pesquisa.</p></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1150px] text-left text-sm">
          <caption className="sr-only">Indicadores por unidade de {formatReportPeriod(result.period)}</caption>
          <thead className="bg-slate-50 text-xs text-slate-500"><tr>
            {['Unidade', 'Chats', 'Passagem IA', 'IA sem humano', 'Resposta à solicitação', 'Msgs humanas/chat', 'Encerrados como venda', 'Satisfação', 'Falhas técnicas', ...(hasComparison ? ['Redução msgs humanas', 'Variação vendas'] : [])].map(label => <th scope="col" key={label} className="px-4 py-3 font-medium">{label}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {run.request.queueIds.map(id => {
              const summary = result.all_stores[id];
              return <tr key={id}>
                <th scope="row" className="min-w-44 px-4 py-4 align-top font-medium text-slate-900">{instance.units.find(unit => unit.queueId === id)?.name ?? `Fila ${id}`}<p className="mt-1 text-xs font-normal text-slate-400">Fila {id}</p></th>
                {summary ? <><SummaryCells summary={summary} />{hasComparison && <Comparison cohort={result.cohorts[id]} customWindows={Boolean(run.request.preset)} />}</> : <td colSpan={hasComparison ? 10 : 8} className="px-4 py-4 text-amber-800">Dados incompletos nesta unidade · {UNAVAILABLE}</td>}
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </div>
    <div className="rounded-xl border border-slate-200 bg-slate-100/70 p-5 text-xs leading-relaxed text-slate-600">
      <p>Resposta da IA sem mensagem humana não comprova resolução autônoma. Encerramento como venda é uma classificação do chat, sem comprovação de pagamento. Comparações são descritivas e não demonstram efeito causal da IA.</p>
      <details className="mt-2"><summary className="cursor-pointer font-medium">Metodologia e limites</summary><p className="mt-2">Versão: {result.methodologyVersion}</p><ul className="mt-2 list-disc space-y-1 pl-4">{result.interpretation.map((text, index) => <li key={index}>{text}</li>)}</ul></details>
    </div>
  </section>;
}

export default function AiResultsPage() {
  const reports = useAttendanceReports();
  const { instance, input, activeRun, displayed } = reports;
  const active = Boolean(activeRun && isActiveReport(activeRun.status));
  const busy = reports.loading || reports.submitting;
  const validation = instance ? validateReportInput(input, instance.units.map(unit => unit.queueId)) : null;
  const dirty = Boolean(displayed && !sameReportFilters(input, displayed.request));
  const sessionExpired = ['INTEGRA_SESSION_REQUIRED', 'INTEGRA_SESSION_INVALID', 'INTEGRA_AUTH_INVALID'].includes(reports.errorCode);
  const comparison = input.comparison;

  return <div className="flex h-screen max-h-screen flex-col overflow-hidden bg-slate-50 font-sans text-slate-800">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-6 md:px-8">
      <div><Link to="/main/iaPage" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-violet-700"><ArrowLeft size={14} /> Voltar para IAs</Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Activity className="h-6 w-6 text-violet-600" /> Resultados em operação</h1>
        <p className="mt-1 text-sm text-slate-500">Acompanhe os atendimentos e a participação das IAs por unidade.</p>
      </div>
      <button type="button" className={secondaryButton} disabled={busy || !instance?.configured} onClick={reports.showLatest}><Clock3 size={16} /> Ver último completo</button>
    </header>
    <main className="flex-1 space-y-5 overflow-y-auto p-5 md:p-8">
      {reports.error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        <p>{reports.error}{active && reports.paused ? ' O acompanhamento foi pausado; a coleta continua no servidor.' : ''}</p>
        {sessionExpired ? <Link to="/" onClick={clearAuthSession} className="font-semibold underline">Entrar novamente</Link> : <button type="button" className={secondaryButton} disabled={busy} onClick={reports.retry}>{active ? 'Retomar acompanhamento' : 'Tentar novamente'}</button>}
      </div>}
      <section aria-label="Filtros do levantamento" className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold text-slate-900">Novo levantamento</h2><span className="text-xs text-slate-500">Datas inclusivas · America/Sao_Paulo</span></div>
        <label className="mb-4 block max-w-md text-sm font-medium text-slate-600">Rede
          <select aria-label="Rede" className={`${inputClass} mt-1`} value={reports.key} disabled={!reports.instancesLoaded || reports.submitting} onChange={event => reports.selectInstance(event.target.value)}>
            {!instance && <option value={reports.key}>{reports.key || 'Selecione uma rede'}</option>}
            {reports.instances.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}
          </select>
        </label>
        {instance && !instance.configured && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Esta rede ainda precisa do token de feed configurado no back para consultar os relatórios.</p>}
        {reports.instancesLoaded && !instance && !reports.error && <p className="mb-4 text-sm text-slate-500">{reports.instances.length ? 'A rede informada na URL não está cadastrada. Selecione uma rede disponível.' : 'Nenhuma rede de relatórios foi cadastrada no servidor.'}</p>}
        <form onSubmit={event => { event.preventDefault(); if (!validation && !active && !busy) void reports.generate(); }}>
          <fieldset disabled={busy || active || !instance?.configured} className="space-y-4 disabled:opacity-70">
            <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-600">Data inicial<input aria-label="Data inicial" type="date" required max={localReportDay()} className={`${inputClass} mt-1`} value={input.dateFrom} onChange={event => reports.setInput({ ...input, dateFrom: event.target.value })} /></label>
              <label className="text-sm font-medium text-slate-600">Data final<input aria-label="Data final" type="date" required max={localReportDay()} className={`${inputClass} mt-1`} value={input.dateTo} onChange={event => reports.setInput({ ...input, dateTo: event.target.value })} /></label>
            </div>
            <div><div className="mb-2 flex flex-wrap items-center gap-4"><span className="text-sm font-medium text-slate-600">Unidades</span>
              <button type="button" className="text-xs font-medium text-violet-700 hover:underline" onClick={() => reports.setInput({ ...input, queueIds: instance?.units.map(unit => unit.queueId) ?? [] })}>Selecionar todas</button>
            </div><div className="flex flex-wrap gap-2">
              {instance?.units.map(unit => <label key={unit.queueId} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${input.queueIds.includes(unit.queueId) ? 'border-violet-200 bg-violet-50 text-violet-800' : 'border-slate-200 text-slate-600'}`}>
                <input type="checkbox" checked={input.queueIds.includes(unit.queueId)} onChange={event => reports.setInput({ ...input, queueIds: event.target.checked ? [...input.queueIds, unit.queueId] : input.queueIds.filter(id => id !== unit.queueId) })} />{unit.name}
              </label>)}
            </div></div>
            <label className="flex w-fit items-center gap-2 text-sm font-medium text-slate-600"><input type="checkbox" checked={Boolean(comparison)} onChange={event => reports.setInput({ ...input, comparison: event.target.checked ? previousReportPeriod(input.dateFrom && input.dateTo ? input : defaultReportPeriod()) : undefined })} />Comparar com outro período</label>
            {comparison && <div className="grid max-w-2xl gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-600">Comparação: data inicial<input aria-label="Comparação: data inicial" type="date" required max={localReportDay()} className={`${inputClass} mt-1`} value={comparison.dateFrom} onChange={event => reports.setInput({ ...input, comparison: { ...comparison, dateFrom: event.target.value } })} /></label>
              <label className="text-sm font-medium text-slate-600">Comparação: data final<input aria-label="Comparação: data final" type="date" required max={localReportDay()} className={`${inputClass} mt-1`} value={comparison.dateTo} onChange={event => reports.setInput({ ...input, comparison: { ...comparison, dateTo: event.target.value } })} /></label>
            </div>}
          </fieldset>
          {validation && !busy && instance?.configured && <p className="mt-3 text-sm text-amber-800">{validation}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy || active || !instance?.configured || Boolean(validation)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw size={16} className={reports.submitting ? 'animate-spin' : ''} />{reports.submitting ? 'Solicitando coleta…' : 'Gerar levantamento'}</button>
            <p className="text-xs text-slate-500">{active ? 'Acompanhe a coleta abaixo. Ela continua mesmo ao sair desta página.' : 'Consulta as fontes novamente. Abrir esta página não inicia uma coleta.'}</p>
          </div>
        </form>
      </section>
      {reports.loading && <p role="status" className="flex items-center gap-2 text-sm text-slate-500"><RefreshCw size={16} className="animate-spin" /> Consultando levantamento…</p>}
      {dirty && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Os filtros foram alterados. O resultado exibido ainda corresponde ao período e às unidades indicados nele.</p>}
      {activeRun && <Progress run={activeRun} />}
      {displayed && instance ? <Result run={displayed} instance={instance} /> : !busy && !reports.error && instance?.configured && !activeRun && <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center"><Activity className="mx-auto mb-3 h-9 w-9 text-slate-300" /><h2 className="font-semibold text-slate-700">Nenhum resultado completo disponível</h2><p className="mt-2 text-sm text-slate-500">Escolha o período e gere o primeiro levantamento. Se o recurso ainda não estiver habilitado no Banco Único, revise sua configuração.</p></div>}
    </main>
  </div>;
}
