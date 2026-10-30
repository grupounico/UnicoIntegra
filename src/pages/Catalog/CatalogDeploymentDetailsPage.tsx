import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Ban, Check, ChevronDown, Copy, Eye, EyeOff, ExternalLink, ImagePlus, KeyRound, Loader2, PencilLine, Play, Plus, RefreshCw, RotateCcw, Store, TriangleAlert, X } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import ConfirmDialog from '../../components/ConfirmDialog';
import { cancelDeployment, catalogErpName, getDeployment, refreshDeploymentRuns, revealDeploymentSellerToken, runAtenderBemImport, retryDeployment, retryUnit, retryUnitShadowActivation, runUnit, type Deployment, type DeploymentEvent, type DeploymentStatus, type DeploymentUnit, type SellerAccessToken } from '../../services/catalogDeployment.service';
import { getAuthSession } from '../../utils/authSession';
import { hasAtenderBemSession } from '../../services/atenderBemSession';
import { CatalogPageHeader, CatalogScreen, EmptyState, StatusDot, ToneDot, formatCnpj, formatDate, primaryButtonClass, relativeTime, secondaryButtonClass, statusLabel, type Tone } from './catalogUi';
import AddCatalogDeploymentUnitDialog from './AddCatalogDeploymentUnitDialog';

const resumableStatuses: DeploymentStatus[] = ['failed', 'partially_failed', 'monitoring_timeout', 'reconciliation_required'];
const stepLabels: Record<string, string> = { vercel_register_project_domain: 'Cadastrar domínio em Production', vercel_configure_production_access: 'Configurar acesso público', vercel_validate_main_release: 'Validar release', vercel_assign_storefront_alias: 'Associar domínio à release', storefront_validate_identity: 'Validar loja pública' };
const attentionStatuses: DeploymentStatus[] = ['failed', 'partially_failed', 'monitoring_timeout', 'reconciliation_required'];
const editableStatuses: DeploymentStatus[] = ['draft', ...attentionStatuses];
const compactButtonClass = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50';
const processingStatuses: DeploymentStatus[] = ['queued', 'provisioning_hub', 'validating_hub_catalog', 'provisioning_unicommerce', 'validating_unicommerce', 'importing_banco_unico', 'waiting_storefront', 'waiting_storefront_release'];
const stages = [
  { key: 'hub', label: 'Estrutura no Hub', statuses: ['queued', 'provisioning_hub'] },
  { key: 'catalog', label: 'Catálogo validado', statuses: ['validating_hub_catalog'] },
  { key: 'unicommerce', label: 'Tenant preparado', statuses: ['provisioning_unicommerce', 'validating_unicommerce'] },
  { key: 'import', label: 'Produtos importados', statuses: ['importing_banco_unico'] },
  { key: 'activation', label: 'Ativação', statuses: ['awaiting_activation', 'waiting_storefront', 'waiting_storefront_release', 'completed'] },
];

function atenderBemProgress(deployment: Deployment) {
  const completed = deployment.units.filter(unit => unit.atenderBemConfig?.import?.status === 'completed' && !unit.atenderBemConfig.import.errors).length;
  const configured = deployment.units.filter(unit => unit.atenderBemConfig).length;
  const processing = deployment.units.some(unit => ['uploading', 'queued', 'running', 'reindexing'].includes(unit.atenderBemConfig?.import?.status || ''));
  const attention = deployment.units.some(unit => ['failed', 'cancelled', 'unknown', 'failed_before_import', 'reindex_unknown'].includes(unit.atenderBemConfig?.import?.status || '') || Boolean(unit.atenderBemConfig?.import?.errors));
  const done = deployment.units.length > 0 && completed === deployment.units.length;
  const tone: Tone = done ? 'success' : processing ? 'info' : attention ? 'danger' : 'neutral';
  return { completed, configured, processing, done, tone, label: done ? 'Concluído' : processing ? 'Em andamento' : attention ? 'Atenção necessária' : configured ? 'Configuração salva' : 'Pendente' };
}

function DeploymentProgress({ deployment }: { deployment: Deployment }) {
  const atenderBem = atenderBemProgress(deployment);
  const baseStages = deployment.flowMode === 'hub_banco_only'
    ? [stages[0], stages[1], { key: 'bank', label: 'Banco Único', statuses: ['importing_banco_unico', 'completed'] }]
    : stages;
  const visibleStages = [...baseStages, { key: 'atenderbem', label: 'AtenderBem', statuses: [] }, { key: 'ia', label: 'IA', statuses: [] }];
  const aiDone = deployment.units.length > 0 && deployment.units.every(unit => unit.atenderBemConfig?.ai?.status === 'created');
  const activeIndex = deployment.status === 'completed' ? baseStages.length : Math.max(0, baseStages.findIndex(stage => stage.statuses.includes(deployment.status)));
  const halted = attentionStatuses.includes(deployment.status) || deployment.status === 'cancelled';
  const states = visibleStages.map((stage, index) => {
    const ai = stage.key === 'ia';
    const final = stage.key === 'atenderbem' || ai;
    const done = ai ? aiDone : final ? atenderBem.done : index < activeIndex || deployment.status === 'completed';
    const active = ai ? !done && atenderBem.done : final ? !done && (atenderBem.processing || deployment.status === 'completed') : index === activeIndex && deployment.status !== 'completed';
    return { ...stage, done, active, stopped: !final && active && halted };
  });
  const doneCount = states.filter(stage => stage.done).length;
  const current = states.find(stage => stage.active) ?? states.find(stage => !stage.done);
  return <section aria-label="Etapas da implantação">
    <p className="text-xs text-slate-600"><span className="font-medium tabular-nums text-slate-900">{doneCount} de {states.length}</span> etapas concluídas{current ? <> · {current.stopped ? 'parada em' : 'agora'} <span className={`font-medium ${current.stopped ? 'text-rose-700' : 'text-slate-900'}`}>{current.label}</span></> : null}</p>
    <ol className="mt-2 flex gap-1">
      {states.map(stage => <li key={stage.key} className="min-w-0 flex-1" aria-current={stage.active ? 'step' : undefined}>
        <span aria-hidden="true" className={`block h-1 rounded-full ${stage.done ? 'bg-emerald-500' : stage.stopped ? 'bg-rose-500' : stage.active ? 'bg-primary' : 'bg-slate-200'}`} />
        <span className={`mt-1.5 hidden truncate text-[11px] sm:block ${stage.active ? 'font-medium text-slate-900' : 'text-slate-500'}`} title={stage.label}>{stage.label}<span className="sr-only">{stage.done ? ' (concluída)' : stage.active ? ' (atual)' : ''}</span></span>
      </li>)}
    </ol>
  </section>;
}

function AtenderBemImportStatus({ deploymentId, unit, onRefresh }: { deploymentId: string; unit: DeploymentUnit; onRefresh: () => Promise<void> }) {
  const progress = unit.atenderBemConfig?.import;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const jobId = progress?.jobId;
  const status = progress?.status;
  const check = useCallback(async () => {
    setBusy(true);
    try { await runAtenderBemImport(deploymentId, unit.id, true); await onRefresh(); setError(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível consultar a importação.'); }
    finally { setBusy(false); }
  }, [deploymentId, unit.id, onRefresh]);
  useEffect(() => {
    if (!jobId || !['queued', 'running'].includes(status || '') || !hasAtenderBemSession()) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() { await check(); if (active) timer = setTimeout(() => void poll(), 15000); }
    timer = setTimeout(() => void poll(), 3000);
    return () => { active = false; clearTimeout(timer); };
  }, [jobId, status, check]);
  if (!progress) return null;
  const labels: Record<string, string> = { uploading: 'Enviando CSV', queued: 'Importação na fila', running: 'Importando produtos', completed: 'Importação concluída; reindexação solicitada', failed: 'Importação falhou', cancelled: 'Importação cancelada', unknown: 'Confira a importação no AtenderBem antes de repetir', reindexing: 'Solicitando reindexação', reindex_unknown: 'Produtos importados; confira a reindexação no AtenderBem', failed_before_import: 'Falha no envio do CSV' };
  const tone: Tone = progress.status === 'completed' && !progress.errors ? 'success' : ['failed', 'cancelled', 'failed_before_import'].includes(progress.status) || progress.errors ? 'danger' : ['unknown', 'reindex_unknown'].includes(progress.status) ? 'warning' : 'info';
  return <li className="py-3">
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900" title={unit.name}>{unit.name}</p>
        <p role="status" className="mt-0.5 flex min-w-0 items-center gap-2 text-xs"><ToneDot tone={tone} label={labels[progress.status] || progress.status} className="text-xs" />{jobId ? <span className="shrink-0 tabular-nums text-slate-500">Execução {jobId}</span> : null}</p>
      </div>
      {jobId && ['queued', 'running', 'failed', 'cancelled'].includes(progress.status) && <button type="button" disabled={busy} className={compactButtonClass} onClick={() => void check()}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}Atualizar andamento</button>}
    </div>
    {progress.total !== undefined && <p className="mt-1.5 text-xs tabular-nums text-slate-600">{(progress.processed || 0).toLocaleString('pt-BR')} de {progress.total.toLocaleString('pt-BR')} processados · {(progress.created || 0).toLocaleString('pt-BR')} criados · {(progress.updated || 0).toLocaleString('pt-BR')} atualizados · {progress.errors || 0} erros</p>}
    {error && <p role="alert" className="mt-1.5 text-xs text-rose-700">{error}</p>}
  </li>;
}

function NextStep({ deployment, onRefresh }: { deployment: Deployment; onRefresh: () => Promise<void> }) {
  const atenderBem = atenderBemProgress(deployment);
  const aiDone = deployment.units.length > 0 && deployment.units.every(unit => unit.atenderBemConfig?.ai?.status === 'created');
  const activeImports = deployment.units.filter(unit => unit.atenderBemConfig?.import && !(unit.atenderBemConfig.import.status === 'completed' && !unit.atenderBemConfig.import.errors));
  if (atenderBem.done && aiDone) return null;
  const ai = atenderBem.done;
  return <section aria-labelledby="next-step-title" className="rounded-xl border border-slate-200 px-5 py-4 sm:px-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs text-slate-500">Próximo passo</p>
        <h2 id="next-step-title" className="mt-0.5 text-sm font-semibold text-slate-950">{ai ? 'Criar a IA de atendimento' : 'Conectar catálogo ao AtenderBem'}</h2>
        <p className="mt-0.5 text-sm text-slate-600">{ai ? 'Assistente, URAs e automações com os dados desta implantação.' : atenderBem.configured ? `${atenderBem.configured} de ${deployment.units.length} unidades configuradas · ${atenderBem.label.toLowerCase()}` : 'Instância, acesso ao CSV e grupo de produtos por unidade.'}</p>
      </div>
      <Link className={`${primaryButtonClass} shrink-0`} to={`/main/catalogo/${deployment.id}/${ai ? 'ia' : 'atenderbem'}`}>{ai ? 'Criar IA' : atenderBem.configured ? 'Continuar' : 'Configurar'}<ArrowRight className="size-4" /></Link>
    </div>
    {!ai && activeImports.length ? <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">{activeImports.map(unit => <AtenderBemImportStatus key={unit.id} deploymentId={deployment.id} unit={unit} onRefresh={onRefresh} />)}</ul> : null}
  </section>;
}

const eventLabels: Record<string, string> = {
  active_tenant_reconciled: 'Tenant ativo conferido', storefront_retry_scheduled: 'Nova tentativa automática agendada', storefront_ready: 'Loja publicada e validada',
  deployment_created: 'Rascunho criado', deployment_queued: 'Implantação adicionada à fila', deployment_provisioning_hub: 'Criação no Hub iniciada',
  deployment_validating_hub_catalog: 'Validação do catálogo iniciada', deployment_provisioning_unicommerce: 'Preparação do Unicommerce iniciada',
  deployment_importing_banco_unico: 'Importação no Banco Único iniciada', deployment_awaiting_activation: 'Implantação pronta para revisão',
  tenants_activated: 'Tenants ativados', deployment_failed: 'Implantação interrompida', deployment_cancelled: 'Implantação cancelada',
  unit_failed: 'Falha em uma unidade', unit_retry_requested: 'Nova tentativa solicitada', unit_added: 'Filial adicionada ao grupo',
  unit_configuration_updated: 'Configuração da unidade corrigida',
  hub_run_status_changed: 'Status da carga atualizado', hub_run_delayed: 'Carga demorando mais que o esperado',
  hub_run_poll_retry: 'Nova consulta ao Hub agendada', hub_run_reconciled: 'Carga anterior reconciliada',
  hub_run_not_found: 'Carga ainda não localizada no Hub',
  hub_snapshot_activation_requested: 'Ativação do catálogo solicitada',
  hub_activation_requested: 'Ativação do catálogo solicitada',
  hub_activation_pending: 'Ativação do catálogo em processamento',
  unit_hub_banco_ready: 'Cobertura mínima atingida no Banco Único',
  hub_banco_only_completed: 'Hub e Banco Único concluídos',
  seller_token_revealed: 'Token do Hub consultado',
  atenderbem_configuration_saved: 'Configuração do AtenderBem salva',
  atenderbem_group_created: 'Grupo criado no AtenderBem',
  atenderbem_import_started: 'Importação de produtos no AtenderBem iniciada',
};

function eventTitle(event: DeploymentEvent) {
  const step = typeof event.safeMetadata?.step === 'string' ? stepLabels[event.safeMetadata.step] : undefined;
  if (step) return `${step} · ${event.eventType === 'step_completed' ? 'Concluído' : event.eventType === 'step_failed' ? 'Falhou' : 'Iniciado'}`;
  return eventLabels[event.eventType] || statusLabel((event.toStatus || event.eventType) as DeploymentStatus);
}

const TIMELINE_PREVIEW = 5;

function DeploymentTimeline({ events, units }: { events: DeploymentEvent[]; units: DeploymentUnit[] }) {
  const [expanded, setExpanded] = useState(false);
  const reversed = [...events].reverse();
  const visible = expanded ? reversed : reversed.slice(0, TIMELINE_PREVIEW);
  return <section aria-labelledby="timeline-title" className="min-w-0">
    <div className="flex items-baseline justify-between gap-3"><h2 id="timeline-title" className="text-sm font-semibold text-slate-950">Linha do tempo</h2><span className="text-xs tabular-nums text-slate-500">{events.length} {events.length === 1 ? 'evento' : 'eventos'}</span></div>
    <div className="mt-2">
      {reversed.length ? <ol>{visible.map((event, index) => {
        const unit = units.find((item) => item.id === event.unitId);
        const danger = event.eventType.includes('failed');
        const title = eventTitle(event);
        return <li key={event.id} className="relative flex gap-3 py-3 before:absolute before:bottom-0 before:left-[3px] before:top-6 before:w-px before:bg-slate-200 last:before:hidden">
          <span aria-hidden="true" className={`relative mt-1.5 size-[7px] shrink-0 rounded-full ${danger ? 'bg-rose-500' : index === 0 ? 'bg-primary' : 'bg-slate-300'}`} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3"><p className={`line-clamp-2 min-w-0 text-sm font-medium ${danger ? 'text-rose-700' : 'text-slate-900'}`} title={title}>{title}</p><time dateTime={event.createdAt} title={formatDate(event.createdAt)} className="shrink-0 whitespace-nowrap text-xs text-slate-500">{relativeTime(event.createdAt)}</time></div>
            {unit ? <p className="mt-0.5 truncate text-xs text-slate-500" title={unit.name}>{unit.name}</p> : null}
          </div>
        </li>;
      })}</ol> : <p className="py-8 text-center text-sm text-slate-500">Nenhum evento registrado.</p>}
      {reversed.length > TIMELINE_PREVIEW ? <button type="button" onClick={() => setExpanded(current => !current)} aria-expanded={expanded} className="mb-2 mt-1 inline-flex min-h-9 items-center gap-1.5 rounded text-sm font-medium text-slate-600 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-primary"><ChevronDown aria-hidden="true" className={`size-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />{expanded ? 'Mostrar menos' : `Mostrar todos (${reversed.length})`}</button> : null}
    </div>
  </section>;
}

function runStatusLabel(status: string | null | undefined) {
  const labels: Record<string, string> = { queued: 'Na fila', running: 'Em processamento', shadow: 'Snapshot pronto', activation_requested: 'Ativação solicitada', published: 'Publicado', delayed: 'Processamento demorado', failed: 'Falhou', cancelled: 'Cancelado' };
  return status ? labels[status] || status : 'Aguardando';
}

function UnitFact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className={`mt-0.5 truncate text-sm text-slate-900 ${mono ? 'font-mono text-xs leading-5' : 'font-medium tabular-nums'}`} title={value}>{value}</dd></div>;
}

function UnitRow({ deployment, unit, busyAction, onAction }: { deployment: Deployment; unit: DeploymentUnit; busyAction: string; onAction: (action: 'retry' | 'run' | 'activate', unit: DeploymentUnit) => void }) {
  const [open, setOpen] = useState(false);
  const busy = busyAction.endsWith(unit.id);
  const run = unit.hubRun;
  const runTone: Tone = run?.status === 'delayed' ? 'warning' : run?.status === 'failed' ? 'danger' : run?.status === 'published' ? 'success' : 'info';
  const canRetry = resumableStatuses.includes(deployment.status) && (['failed', 'reconciliation_required'].includes(unit.status) || Boolean(unit.lastErrorCode));
  const canActivate = unit.publicationMode === 'shadow' && unit.status === 'activating_shadow';
  const canRun = Boolean(unit.hubIntegrationId) && ['failed', 'catalog_active'].includes(unit.status);
  const canOpenStore = Boolean(unit.storefrontUrl) && unit.storefrontStatus === 'ready';
  const canEdit = editableStatuses.includes(deployment.status);
  const detailsId = `unit-details-${unit.id}`;
  return <li className="px-5 py-4 sm:px-6">
    <div className="flex items-start justify-between gap-4">
      <button type="button" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen(current => !current)} className="group flex min-w-0 items-start gap-2 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <ChevronDown aria-hidden="true" className={`mt-0.5 size-4 shrink-0 text-slate-400 transition-transform group-hover:text-slate-700 ${open ? 'rotate-180' : ''}`} />
        <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-slate-950" title={unit.name}>{unit.name}</span>
        <span className="mt-0.5 block truncate text-xs tabular-nums text-slate-500">{unit.code} · {formatCnpj(unit.cnpj)}{unit.isInitial ? ' · Inicial' : ''}</span>
        </span>
      </button>
      <span className="min-w-0 max-w-[45%] shrink-0"><StatusDot status={unit.status} /></span>
    </div>
    <div id={detailsId} hidden={!open} className="pl-6">
    <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
      <UnitFact label="ERP integrado" value={`${catalogErpName(unit.erpId, unit.provider)}${unit.sourceUnitId ? ` #${unit.sourceUnitId}` : ''}`} />
      <UnitFact label="Itens válidos" value={unit.latestValidRows?.toLocaleString('pt-BR') ?? '—'} />
      <UnitFact label="ID no Hub" value={unit.hubSellerUnitId ?? '—'} mono={Boolean(unit.hubSellerUnitId)} />
      {deployment.flowMode === 'hub_banco_only'
        ? <UnitFact label="Cobertura Banco Único" value={unit.coveragePercent !== null && unit.coveragePercent !== undefined ? `${unit.coveragePercent.toFixed(1)}%` : '—'} />
        : <UnitFact label="Tenant" value={unit.unicommerceTenantId ?? '—'} mono={Boolean(unit.unicommerceTenantId)} />}
    </dl>
    {run ? <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center justify-between gap-3"><ToneDot tone={runTone} label={`Carga no Hub · ${runStatusLabel(run.status)}`} className="text-xs" /><code className="shrink-0 text-[11px] text-slate-600" title={run.runId}>Run {run.runId.slice(0, 8)}</code></div>
      <dl className="mt-2.5 grid grid-cols-3 gap-3 text-xs">
        <div><dt className="text-slate-500">Processados</dt><dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{run.processedRows?.toLocaleString('pt-BR') ?? '—'}</dd></div>
        <div><dt className="text-slate-500">Válidos</dt><dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{run.validRows?.toLocaleString('pt-BR') ?? '—'}</dd></div>
        <div><dt className="text-slate-500">Publicados</dt><dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{run.publishedRows?.toLocaleString('pt-BR') ?? '—'}</dd></div>
      </dl>
      <p className="mt-2 text-xs text-slate-500">Última consulta {run.lastPolledAt ? relativeTime(run.lastPolledAt) : '—'}</p>
    </div> : null}
    </div>
    {unit.lastErrorMessage ? <p className="ml-6 mt-3 flex gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-800"><TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" /><span className="min-w-0 [overflow-wrap:anywhere]">{unit.lastErrorMessage}</span></p> : null}
    {canOpenStore || canEdit || canRetry || canActivate || canRun ? <div className="ml-6 mt-3 flex flex-wrap items-center gap-2">
      {canOpenStore ? <a href={unit.storefrontUrl!} target="_blank" rel="noreferrer" className={compactButtonClass}><Store className="size-3.5" />Abrir loja<ExternalLink aria-hidden="true" className="size-3 text-slate-500" /></a> : null}
      {canEdit ? <Link to={`/main/catalogo/${deployment.id}/corrigir?unit=${unit.id}`} className={compactButtonClass}><PencilLine className="size-3.5" />Corrigir dados</Link> : null}
      {canRetry ? <button type="button" onClick={() => onAction('retry', unit)} title="Continuar após a última etapa confirmada desta unidade" disabled={Boolean(busyAction)} className={compactButtonClass}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}Retomar unidade</button> : null}
      {canActivate ? <button type="button" onClick={() => onAction('activate', unit)} disabled={busy} className={compactButtonClass}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}Reenviar ativação</button> : null}
      {canRun ? <button type="button" onClick={() => onAction('run', unit)} disabled={busy} className={compactButtonClass}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}Executar nova carga</button> : null}
      {unit.status === 'failed' && deployment.status === 'failed' ? <span className="text-xs text-slate-500">A retomada preserva as etapas concluídas. Corrija a causa antes de continuar.</span> : null}
    </div> : null}
  </li>;
}

function ErrorResolutionCard({ deployment, onRetry, onReconciliation, busy }: { deployment: Deployment; onRetry: () => void; onReconciliation: () => void; busy: boolean }) {
  const affectedUnit = deployment.units.find((unit) => unit.lastErrorCode);
  const eventError = [...deployment.events].reverse().find((event) => event.safeMetadata?.code && (!affectedUnit || event.unitId === affectedUnit.id))?.safeMetadata;
  const errorCode = deployment.lastErrorCode || affectedUnit?.lastErrorCode;
  const errorMessage = deployment.lastErrorMessage || affectedUnit?.lastErrorMessage;
  const errorStage = typeof eventError?.stage === 'string' ? eventError.stage : deployment.currentStage;
  const sellerAlreadyExists = errorCode === 'RECONCILIATION_REQUIRED' && errorStage === 'creating_seller';
  const action = sellerAlreadyExists
    ? 'O grupo já tem um seller no Hub. Retome a implantação para vinculá-lo e continuar a criação da filial.'
    : typeof eventError?.action === 'string' ? eventError.action : deployment.lastErrorCode === 'HUB_EMPTY_CATALOG' ? 'Revise a carga e o vínculo da unidade antes de prosseguir.' : 'Revise a configuração indicada e tente novamente.';
  return <section role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 sm:px-6"><div className="flex gap-3"><TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-rose-600" /><div className="min-w-0 flex-1"><p className="text-xs font-medium text-rose-700">Atenção necessária{errorCode ? <> · <code className="font-mono">{errorCode}</code></> : null}</p><h2 className="mt-1 text-base font-semibold text-rose-950 [overflow-wrap:anywhere]">{sellerAlreadyExists ? 'O grupo já existe no Hub; a filial pode ser vinculada a ele.' : errorMessage || 'A implantação precisa de intervenção.'}</h2><p className="mt-1 text-sm leading-6 text-rose-900">{action}</p><dl className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-xs text-rose-900"><div><dt className="inline text-rose-700">Etapa: </dt><dd className="inline font-semibold">{errorStage ? statusLabel(errorStage as DeploymentStatus) : 'Não informada'}</dd></div><div><dt className="inline text-rose-700">Unidade: </dt><dd className="inline font-semibold">{affectedUnit?.name || 'Implantação geral'}</dd></div></dl><p className="mt-2 text-xs leading-5 text-rose-800">A retomada continua após a última etapa confirmada, preservando os recursos e as unidades já concluídos.</p><div className="mt-4 flex flex-wrap gap-3">{resumableStatuses.includes(deployment.status) ? <button type="button" onClick={onRetry} disabled={busy} className={primaryButtonClass}>{busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}Retomar implantação</button> : null}{!sellerAlreadyExists && (deployment.status === 'reconciliation_required' || deployment.lastErrorCode === 'RECONCILIATION_REQUIRED') ? <button type="button" onClick={onReconciliation} className={secondaryButtonClass}><ExternalLink className="size-4" />Solicitar reconciliação</button> : null}</div></div></div></section>;
}

function SellerTokenDialog({ deploymentId, requestedBy, onClose }: { deploymentId: string; requestedBy: string; onClose: () => void }) {
  const [credential, setCredential] = useState<SellerAccessToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void revealDeploymentSellerToken(deploymentId, requestedBy)
      .then((result) => { if (active) setCredential(result); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'Não foi possível obter o token do Hub.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [deploymentId, requestedBy]);

  async function copyToken() {
    if (!credential) return;
    try {
      await navigator.clipboard.writeText(credential.token);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Não foi possível copiar automaticamente. Revele o token e copie manualmente.');
    }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="seller-token-title">
    <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
      <div className="flex items-start justify-between gap-4"><div className="flex gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary"><KeyRound className="size-5" /></span><div><h2 id="seller-token-title" className="text-base font-semibold text-slate-950">Token de consulta do Hub</h2><p className="mt-1 text-xs leading-5 text-slate-500">Use esta credencial no header <code className="rounded bg-slate-100 px-1.5 py-0.5">X-API-Key</code> para consultar os recursos deste seller no Hub.</p></div></div><button type="button" onClick={onClose} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Fechar"><X className="size-4" /></button></div>
      <div className="mt-5">
        {loading ? <div className="flex min-h-24 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500"><Loader2 className="size-4 animate-spin text-primary" />Obtendo token…</div> : error && !credential ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : credential ? <><label className="text-xs font-semibold text-slate-700">X-API-Key</label><div className="mt-2 flex gap-2"><div className="relative min-w-0 flex-1"><input readOnly value={credential.token} type={visible ? 'text' : 'password'} className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-3 pr-11 font-mono text-xs text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-blue-100" /><button type="button" onClick={() => setVisible((current) => !current)} className="absolute right-1 top-1 flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" aria-label={visible ? 'Ocultar token' : 'Mostrar token'}>{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div><button type="button" onClick={() => void copyToken()} className={secondaryButtonClass}>{copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}{copied ? 'Copiado' : 'Copiar'}</button></div><p className="mt-2 text-xs text-slate-500">Seller {credential.hubSellerId}. O token não dá acesso direto ao PostgreSQL de origem.</p>{error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}</> : null}
      </div>
    </div>
  </div>;
}

export default function CatalogDeploymentDetailsPage() {
  const { deploymentId = '' } = useParams();
  const session = getAuthSession();
  const requestedBy = session?.username || session?.authUsername || 'Operador Unico';
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [refreshingRun, setRefreshingRun] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showSellerToken, setShowSellerToken] = useState(false);
  const [showAddUnit, setShowAddUnit] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!deploymentId) return;
    if (!silent) setLoading(true);
    try {
      const result = await getDeployment(deploymentId);
      setDeployment(result);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar a implantação.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [deploymentId]);

  useEffect(() => { void load(); }, [load]);
  const refreshAtenderBem = useCallback(() => load(true), [load]);

  const refreshRuns = useCallback(async () => {
    if (!deploymentId) return;
    setRefreshingRun(true);
    try {
      const result = await refreshDeploymentRuns(deploymentId);
      setDeployment(result);
      setError('');
    } catch {
      // Mantém o acompanhamento aberto; a próxima consulta automática tentará novamente.
    } finally {
      setRefreshingRun(false);
    }
  }, [deploymentId]);

  const deploymentStatus = deployment?.status;
  const hasHubRunInProgress = deployment?.units.some((unit) => ['scheduled', 'running', 'activating_shadow'].includes(unit.status)) ?? false;
  useEffect(() => {
    if (!deploymentStatus || (!processingStatuses.includes(deploymentStatus) && !hasHubRunInProgress)) return;
    const interval = window.setInterval(() => void refreshRuns(), 60000);
    return () => window.clearInterval(interval);
  }, [deploymentStatus, hasHubRunInProgress, refreshRuns]);

  const canCancel = useMemo(() => deployment && !['completed', 'cancelled'].includes(deployment.status), [deployment]);

  async function handleDeploymentAction(action: 'retry' | 'cancel') {
    if (!deployment) return;
    setBusyAction(action);
    setActionMessage('');
    try {
      const updated = action === 'retry' ? await retryDeployment(deployment.id, requestedBy) : await cancelDeployment(deployment.id, requestedBy);
      setDeployment(updated);
      setShowCancel(false);
      setActionMessage(action === 'retry' ? 'Retomada solicitada. Continuando após a última etapa confirmada.' : 'Implantação cancelada. Recursos externos já criados não foram excluídos.');
    } catch (caught) {
      setActionMessage(caught instanceof Error ? caught.message : 'A ação não pôde ser concluída.');
    } finally {
      setBusyAction('');
    }
  }

  async function handleUnitAction(action: 'retry' | 'run' | 'activate', unit: DeploymentUnit) {
    if (!deployment) return;
    setBusyAction(`${action}-${unit.id}`);
    setActionMessage('');
    try {
      const updated = action === 'retry'
        ? await retryUnit(deployment.id, unit.id, requestedBy)
        : action === 'activate'
          ? await retryUnitShadowActivation(deployment.id, unit.id)
          : await runUnit(deployment.id, unit.id, requestedBy);
      setDeployment(updated);
      setActionMessage('Ação solicitada. O acompanhamento foi retomado.');
    } catch (caught) {
      setActionMessage(caught instanceof Error ? caught.message : 'A ação não pôde ser concluída.');
    } finally {
      setBusyAction('');
    }
  }

  function handleUnitAdded(updated: Deployment) {
    setDeployment(updated);
    setShowAddUnit(false);
    setActionMessage(updated.status === 'draft'
      ? 'Filial adicionada ao grupo. Ela será processada quando você iniciar a implantação.'
      : 'Filial adicionada ao seller existente. A carga do grupo foi enfileirada.');
  }

  if (loading) return <CatalogScreen><CatalogPageHeader title="Carregando implantação" description="Buscando os dados mais recentes…" backTo="/main/catalogo" /><div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-500"><Loader2 className="size-7 animate-spin text-primary" /><p className="text-sm">Isso pode levar alguns minutos</p></div></CatalogScreen>;
  if (error || !deployment) return <CatalogScreen><CatalogPageHeader title="Implantação indisponível" description="Não foi possível abrir este acompanhamento." backTo="/main/catalogo" /><main className="p-8"><EmptyState title="Não foi possível carregar" description={error || 'Implantação não encontrada.'} action={<button type="button" onClick={() => void load()} className={primaryButtonClass}>Tentar novamente</button>} /></main></CatalogScreen>;

  const activatingUnit = deployment.units.find((unit) => unit.publicationMode === 'shadow' && unit.status === 'activating_shadow');
  const hubRunInProgress = hasHubRunInProgress;
  if ((deployment.flowMode === 'hub_banco_only' && processingStatuses.includes(deployment.status)) || hubRunInProgress) return <CatalogScreen>
    <CatalogPageHeader title={deployment.groupName} description={`${formatCnpj(deployment.groupCnpj)} · ${deployment.flowMode === 'hub_banco_only' ? 'Hub + Banco Único' : 'Implantação completa'}`} backTo="/main/catalogo" action={<div className="flex items-center gap-2">{deployment.hubSellerId ? <button type="button" onClick={() => setShowSellerToken(true)} className={secondaryButtonClass}><KeyRound className="size-4" />Token do Hub</button> : null}{activatingUnit ? <button type="button" onClick={() => void handleUnitAction('activate', activatingUnit)} disabled={busyAction === `activate-${activatingUnit.id}`} className={secondaryButtonClass}>{busyAction === `activate-${activatingUnit.id}` ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}Reenviar ativação</button> : null}<button type="button" onClick={() => void refreshRuns()} disabled={refreshingRun} className={secondaryButtonClass}>{refreshingRun ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}Atualizar</button></div>} />
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center"><Loader2 className="size-9 animate-spin text-primary" /><div><p className="text-base font-semibold text-slate-900">Isso pode levar alguns minutos</p><p className="mt-1 text-sm text-slate-500">Consultaremos o mesmo run no Hub automaticamente a cada minuto.</p></div><Link to={`/main/catalogo/${deployment.id}/atenderbem`} className={secondaryButtonClass}>Preparar AtenderBem<ArrowRight className="size-4" /></Link></div>
    {showSellerToken ? <SellerTokenDialog deploymentId={deployment.id} requestedBy={requestedBy} onClose={() => setShowSellerToken(false)} /> : null}
  </CatalogScreen>;

  const headline = deployment.status === 'awaiting_activation' ? 'Tudo pronto para a ativação'
    : deployment.status === 'completed' ? deployment.flowMode === 'hub_banco_only' ? 'Carga concluída no Hub e Banco Único' : 'Catálogo ativo'
      : processingStatuses.includes(deployment.status) ? statusLabel(deployment.status)
        : deployment.status === 'draft' ? 'Rascunho aguardando início'
          : deployment.status === 'cancelled' ? 'Implantação cancelada'
            : attentionStatuses.includes(deployment.status) ? 'Implantação precisa de intervenção' : 'Acompanhamento da implantação';
  const canAddUnit = ['draft', 'failed', 'partially_failed', 'monitoring_timeout', 'reconciliation_required', 'awaiting_activation', 'completed'].includes(deployment.status);

  return <CatalogScreen>
    <CatalogPageHeader title={deployment.groupName} description={`${formatCnpj(deployment.groupCnpj)} · @${deployment.username}`} backTo="/main/catalogo" action={<div className="flex shrink-0 items-center gap-2">
      {deployment.hubSellerId ? <button type="button" onClick={() => setShowSellerToken(true)} className={`${secondaryButtonClass} max-sm:hidden`} aria-label="Token do Hub" title="Token do Hub"><KeyRound className="size-4" /><span className="hidden md:inline">Token do Hub</span></button> : null}
      <button type="button" onClick={() => void (processingStatuses.includes(deployment.status) ? refreshRuns() : load(true))} disabled={refreshingRun} className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default" aria-label="Atualizar" title="Atualizar"><RefreshCw className={`size-4 ${refreshingRun ? 'motion-safe:animate-spin' : ''}`} /></button>
      {editableStatuses.includes(deployment.status) ? <Link to={`/main/catalogo/${deployment.id}/corrigir`} className={secondaryButtonClass} aria-label="Corrigir dados" title="Corrigir dados"><PencilLine className="size-4" /><span className="hidden md:inline">Corrigir dados</span></Link> : null}
      {deployment.status === 'awaiting_activation' ? <Link to={`/main/catalogo/${deployment.id}/revisao`} className={primaryButtonClass}><span className="hidden sm:inline">Revisar ativação</span><span className="sm:hidden">Ativar</span><ArrowRight className="size-4" /></Link> : null}
    </div>} />
    <main className="scrollbar-minimal min-h-0 flex-1 overflow-y-auto bg-white [scrollbar-gutter:stable]"><div className="mx-auto w-full max-w-[1280px] space-y-6 px-5 pb-12 pt-6 sm:px-8">
      <section className="border-b border-slate-200 pb-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <StatusDot status={deployment.status} />
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950 [text-wrap:balance]">{headline}</h1>
            <p className="mt-1 text-sm text-slate-500">{deployment.flowMode === 'hub_banco_only' ? 'Hub + Banco Único' : 'Implantação completa'} · por {deployment.requestedBy} em {formatDate(deployment.createdAt, false)} · atualizado <time dateTime={deployment.updatedAt} title={formatDate(deployment.updatedAt)}>{relativeTime(deployment.updatedAt)}</time></p>
          </div>
          {resumableStatuses.includes(deployment.status) || canCancel ? <div className="flex shrink-0 flex-wrap gap-2">
            {resumableStatuses.includes(deployment.status) ? <button type="button" onClick={() => void handleDeploymentAction('retry')} disabled={Boolean(busyAction)} className={secondaryButtonClass}>{busyAction === 'retry' ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}Retomar implantação</button> : null}
            {canCancel ? <button type="button" onClick={() => setShowCancel(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"><Ban className="size-4" />Cancelar implantação</button> : null}
          </div> : null}
        </div>
        <div className="mt-6"><DeploymentProgress deployment={deployment} /></div>
      </section>

      {actionMessage ? <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">{actionMessage}</div> : null}
      {deployment.status === 'draft' && deployment.flowMode === 'full' ? <section className="flex flex-col gap-4 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div className="min-w-0"><h2 className="text-sm font-semibold text-blue-950">Conclua a identidade visual</h2><p className="mt-1 text-sm leading-6 text-blue-900">Envie ou revise as oito imagens antes de iniciar a implantação. Os arquivos confirmados serão mantidos.</p></div><Link to={`/main/catalogo/${deployment.id}/imagens`} className={`${primaryButtonClass} shrink-0`}><ImagePlus className="size-4" />Enviar imagens</Link></section> : null}
      {attentionStatuses.includes(deployment.status) ? <ErrorResolutionCard deployment={deployment} onRetry={() => void handleDeploymentAction('retry')} onReconciliation={() => setActionMessage('Solicitação de reconciliação registrada para o time responsável.')} busy={Boolean(busyAction)} /> : null}

      <NextStep deployment={deployment} onRefresh={refreshAtenderBem} />

      <div className="grid items-start gap-8 pt-2 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="units-title" className="min-w-0">
          <div className="flex items-center justify-between gap-3"><h2 id="units-title" className="text-sm font-semibold text-slate-950">Unidades <span className="ml-1 font-normal tabular-nums text-slate-500">{deployment.units.length}</span></h2>{canAddUnit ? <button type="button" onClick={() => setShowAddUnit(true)} className={compactButtonClass}><Plus className="size-3.5" />Adicionar unidade</button> : null}</div>
          {deployment.units.length ? <ul className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200">{deployment.units.map((unit) => <UnitRow key={unit.id} deployment={deployment} unit={unit} busyAction={busyAction} onAction={(action, target) => void handleUnitAction(action, target)} />)}</ul> : <p className="mt-3 rounded-xl border border-dashed border-slate-300 px-5 py-8 text-center text-sm text-slate-500">Nenhuma unidade cadastrada.</p>}
        </section>
        <div className="xl:sticky xl:top-6"><DeploymentTimeline events={deployment.events} units={deployment.units} /></div>
      </div>
    </div></main>
    {showCancel ? <ConfirmDialog title="Cancelar esta implantação?" description="O processamento será interrompido. Recursos externos já criados no Hub, Unicommerce ou Banco Único não serão excluídos." confirmText="Cancelar implantação" cancelText="Manter processamento" tone="danger" loading={busyAction === 'cancel'} onClose={() => setShowCancel(false)} onConfirm={() => void handleDeploymentAction('cancel')} /> : null}
    {showSellerToken ? <SellerTokenDialog deploymentId={deployment.id} requestedBy={requestedBy} onClose={() => setShowSellerToken(false)} /> : null}
    {showAddUnit ? <AddCatalogDeploymentUnitDialog deployment={deployment} requestedBy={requestedBy} onClose={() => setShowAddUnit(false)} onAdded={handleUnitAdded} /> : null}
  </CatalogScreen>;
}
