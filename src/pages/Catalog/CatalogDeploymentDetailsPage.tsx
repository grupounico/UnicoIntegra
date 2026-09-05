import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowRight, Ban, Boxes, Check, CheckCircle2, Circle, ExternalLink, Loader2, Play, RefreshCw, RotateCcw, Server, Store, TriangleAlert } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import ConfirmDialog from '../../components/ConfirmDialog';
import { activateShadow, cancelDeployment, getDeployment, retryDeployment, retryUnit, runUnit, subscribeToDeployment, type Deployment, type DeploymentEvent, type DeploymentStatus, type DeploymentUnit } from '../../services/catalogDeployment.service';
import { getAuthSession } from '../../utils/authSession';
import { CatalogPageHeader, CatalogScreen, EmptyState, StatusBadge, formatCnpj, formatDate, primaryButtonClass, secondaryButtonClass, statusLabel } from './catalogUi';

const processingStatuses: DeploymentStatus[] = ['queued', 'provisioning_hub', 'validating_hub_catalog', 'provisioning_unicommerce', 'validating_unicommerce', 'importing_banco_unico'];
const stages = [
  { key: 'hub', label: 'Estrutura no Hub', statuses: ['queued', 'provisioning_hub'] },
  { key: 'catalog', label: 'Catálogo validado', statuses: ['validating_hub_catalog'] },
  { key: 'unicommerce', label: 'Tenant preparado', statuses: ['provisioning_unicommerce', 'validating_unicommerce'] },
  { key: 'import', label: 'Produtos importados', statuses: ['importing_banco_unico'] },
  { key: 'activation', label: 'Ativação', statuses: ['awaiting_activation', 'completed'] },
];

function stageIndex(status: DeploymentStatus) {
  if (status === 'completed') return 5;
  if (status === 'awaiting_activation') return 4;
  const index = stages.findIndex((stage) => stage.statuses.includes(status));
  return Math.max(0, index);
}

function DeploymentProgress({ deployment }: { deployment: Deployment }) {
  const activeIndex = stageIndex(deployment.status);
  return <section className="rounded-xl border border-[#dbe3ef] bg-white p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><h2 className="text-base font-semibold text-slate-950">Progresso da implantação</h2><p className="mt-1 text-sm text-slate-500">O status é atualizado automaticamente enquanto o processamento avança.</p></div>{processingStatuses.includes(deployment.status) ? <span className="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-primary"><span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-primary" /></span>Ao vivo</span> : null}</div><ol className="mt-7 grid gap-4 sm:grid-cols-5">{stages.map((stage, index) => { const done = index < activeIndex || deployment.status === 'completed'; const active = index === activeIndex && deployment.status !== 'completed'; return <li key={stage.key} className="relative"><div className="flex items-center sm:block"><div className="flex items-center"><span className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 ${done ? 'border-emerald-600 bg-emerald-600 text-white' : active ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-400'}`}>{done ? <Check className="size-4" /> : active ? <Loader2 className={`size-4 ${processingStatuses.includes(deployment.status) ? 'animate-spin' : ''}`} /> : <Circle className="size-3" />}</span>{index < stages.length - 1 ? <span className={`hidden h-0.5 flex-1 sm:block ${index < activeIndex ? 'bg-emerald-500' : 'bg-slate-200'}`} /> : null}</div><span className={`ml-3 text-xs font-semibold sm:ml-0 sm:mt-3 sm:block ${done ? 'text-emerald-700' : active ? 'text-primary' : 'text-slate-400'}`}>{stage.label}</span></div></li>; })}</ol></section>;
}

const eventLabels: Record<string, string> = {
  deployment_created: 'Rascunho criado', deployment_queued: 'Implantação adicionada à fila', deployment_provisioning_hub: 'Criação no Hub iniciada',
  deployment_validating_hub_catalog: 'Validação do catálogo iniciada', deployment_provisioning_unicommerce: 'Preparação do Unicommerce iniciada',
  deployment_importing_banco_unico: 'Importação no Banco Único iniciada', deployment_awaiting_activation: 'Implantação pronta para revisão',
  tenants_activated: 'Tenants ativados', deployment_failed: 'Implantação interrompida', deployment_cancelled: 'Implantação cancelada',
  unit_failed: 'Falha em uma unidade', unit_retry_requested: 'Nova tentativa solicitada',
};

function DeploymentTimeline({ events, units }: { events: DeploymentEvent[]; units: DeploymentUnit[] }) {
  const reversed = [...events].reverse();
  return <section className="rounded-xl border border-[#dbe3ef] bg-white"><div className="border-b border-[#dbe3ef] px-5 py-4 sm:px-6"><h2 className="text-base font-semibold text-slate-950">Linha do tempo</h2><p className="mt-0.5 text-xs text-slate-500">Últimos eventos desta implantação.</p></div><ol className="px-5 py-2 sm:px-6">{reversed.length ? reversed.map((event, index) => { const unit = units.find((item) => item.id === event.unitId); const danger = event.eventType.includes('failed'); return <li key={event.id} className="relative flex gap-4 py-4 before:absolute before:bottom-0 before:left-[7px] before:top-8 before:w-px before:bg-slate-200 last:before:hidden"><span className={`relative z-10 mt-1 size-4 shrink-0 rounded-full border-[3px] border-white ${danger ? 'bg-rose-500' : index === 0 ? 'bg-primary' : 'bg-slate-300'}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><p className="text-sm font-semibold text-slate-800">{eventLabels[event.eventType] || statusLabel((event.toStatus || event.eventType) as DeploymentStatus)}</p><time className="text-xs text-slate-400">{formatDate(event.createdAt)}</time></div><p className="mt-1 text-xs text-slate-500">{unit ? `${unit.name} · ` : ''}{event.createdBy ? `por ${event.createdBy}` : 'Atualização automática'}{event.fromStatus && event.toStatus ? ` · ${statusLabel(event.fromStatus as DeploymentStatus)} → ${statusLabel(event.toStatus as DeploymentStatus)}` : ''}</p></div></li>; }) : <li className="py-8 text-center text-sm text-slate-500">Nenhum evento registrado.</li>}</ol></section>;
}

function UnitStatusCard({ deployment, unit, busyAction, onAction }: { deployment: Deployment; unit: DeploymentUnit; busyAction: string; onAction: (action: 'retry' | 'run' | 'shadow', unit: DeploymentUnit) => void }) {
  const busy = busyAction.endsWith(unit.id);
  return <article className="rounded-xl border border-[#dbe3ef] bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Store className="size-5" /></span><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-950">{unit.name}</h3><p className="mt-1 text-xs text-slate-500">{unit.code} · {formatCnpj(unit.cnpj)}{unit.isInitial ? ' · Inicial' : ''}</p></div></div><StatusBadge status={unit.status} /></div><dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-slate-200 pt-4 text-xs"><div><dt className="text-slate-500">ID Alpha7</dt><dd className="mt-1 font-semibold text-slate-800">{unit.sourceUnitId}</dd></div><div><dt className="text-slate-500">Itens válidos</dt><dd className="mt-1 font-semibold tabular-nums text-slate-800">{unit.latestValidRows?.toLocaleString('pt-BR') ?? '—'}</dd></div><div><dt className="text-slate-500">ID no Hub</dt><dd className="mt-1 truncate font-mono text-[11px] font-semibold text-slate-800">{unit.hubSellerUnitId ?? '—'}</dd></div><div><dt className="text-slate-500">Tenant</dt><dd className="mt-1 truncate font-mono text-[11px] font-semibold text-slate-800">{unit.unicommerceTenantId ?? '—'}</dd></div></dl>{unit.lastErrorMessage ? <div className="mt-4 rounded-lg bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-700">{unit.lastErrorMessage}</div> : null}<div className="mt-4 flex flex-wrap gap-2">{unit.retryable ? <button type="button" onClick={() => onAction('retry', unit)} disabled={busy} className={secondaryButtonClass}>{busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}Tentar unidade</button> : null}{unit.hubIntegrationId && ['failed', 'shadow_ready', 'catalog_active'].includes(unit.status) ? <button type="button" onClick={() => onAction('run', unit)} disabled={busy} className={secondaryButtonClass}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}Executar carga</button> : null}{unit.status === 'shadow_ready' ? <button type="button" onClick={() => onAction('shadow', unit)} disabled={busy} className={primaryButtonClass}>{busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}Ativar snapshot</button> : null}{!unit.retryable && unit.status === 'failed' && deployment.status === 'failed' ? <span className="self-center text-xs text-slate-500">Corrija a origem antes de tentar novamente.</span> : null}</div></article>;
}

function ErrorResolutionCard({ deployment, onRetry, onReconciliation, busy }: { deployment: Deployment; onRetry: () => void; onReconciliation: () => void; busy: boolean }) {
  const eventError = [...deployment.events].reverse().find((event) => event.safeMetadata)?.safeMetadata;
  const action = typeof eventError?.action === 'string' ? eventError.action : deployment.lastErrorCode === 'HUB_EMPTY_CATALOG' ? 'Revise a carga e o vínculo da unidade antes de prosseguir.' : 'Revise a configuração indicada e tente novamente.';
  const affectedUnit = deployment.units.find((unit) => unit.lastErrorCode);
  return <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 sm:p-6"><div className="flex gap-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700"><TriangleAlert className="size-5" /></span><div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-[0.08em] text-rose-600">{deployment.lastErrorCode || 'Atenção necessária'}</p><h2 className="mt-1 text-base font-semibold text-rose-950">{deployment.lastErrorMessage || 'A implantação precisa de intervenção.'}</h2><p className="mt-2 text-sm leading-6 text-rose-800">{action}</p><dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-xs text-rose-800"><div><dt className="inline text-rose-600">Etapa: </dt><dd className="inline font-semibold">{deployment.currentStage ? statusLabel(deployment.currentStage as DeploymentStatus) : 'Não informada'}</dd></div><div><dt className="inline text-rose-600">Unidade: </dt><dd className="inline font-semibold">{affectedUnit?.name || 'Implantação geral'}</dd></div></dl><div className="mt-5 flex flex-wrap gap-3">{deployment.retryable ? <button type="button" onClick={onRetry} disabled={busy} className={primaryButtonClass}>{busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}Tentar novamente</button> : null}{deployment.status === 'reconciliation_required' || deployment.lastErrorCode === 'RECONCILIATION_REQUIRED' ? <button type="button" onClick={onReconciliation} className={secondaryButtonClass}><ExternalLink className="size-4" />Solicitar reconciliação</button> : null}</div></div></div></section>;
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
  const [showCancel, setShowCancel] = useState(false);

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

  const deploymentStatus = deployment?.status;
  useEffect(() => {
    if (!deploymentStatus || !processingStatuses.includes(deploymentStatus)) return;
    const interval = window.setInterval(() => void load(true), deploymentStatus === 'importing_banco_unico' ? 5000 : 2000);
    return () => window.clearInterval(interval);
  }, [deploymentStatus, load]);

  useEffect(() => {
    if (!deploymentId) return;
    return subscribeToDeployment(deploymentId, () => void load(true));
  }, [deploymentId, load]);

  const canCancel = useMemo(() => deployment && !['completed', 'cancelled'].includes(deployment.status), [deployment]);

  async function handleDeploymentAction(action: 'retry' | 'cancel') {
    if (!deployment) return;
    setBusyAction(action);
    setActionMessage('');
    try {
      const updated = action === 'retry' ? await retryDeployment(deployment.id, requestedBy) : await cancelDeployment(deployment.id, requestedBy);
      setDeployment(updated);
      setShowCancel(false);
      setActionMessage(action === 'retry' ? 'Nova tentativa solicitada.' : 'Implantação cancelada. Recursos externos já criados não foram excluídos.');
    } catch (caught) {
      setActionMessage(caught instanceof Error ? caught.message : 'A ação não pôde ser concluída.');
    } finally {
      setBusyAction('');
    }
  }

  async function handleUnitAction(action: 'retry' | 'run' | 'shadow', unit: DeploymentUnit) {
    if (!deployment) return;
    setBusyAction(`${action}-${unit.id}`);
    setActionMessage('');
    try {
      const updated = action === 'retry' ? await retryUnit(deployment.id, unit.id, requestedBy) : action === 'run' ? await runUnit(deployment.id, unit.id, requestedBy) : await activateShadow(deployment.id, unit.id, requestedBy);
      setDeployment(updated);
      setActionMessage('Ação solicitada. O acompanhamento foi retomado.');
    } catch (caught) {
      setActionMessage(caught instanceof Error ? caught.message : 'A ação não pôde ser concluída.');
    } finally {
      setBusyAction('');
    }
  }

  if (loading) return <CatalogScreen><CatalogPageHeader title="Carregando implantação" description="Buscando os dados mais recentes…" backTo="/main/catalogo" /><div className="flex flex-1 items-center justify-center"><Loader2 className="size-6 animate-spin text-primary" /></div></CatalogScreen>;
  if (error || !deployment) return <CatalogScreen><CatalogPageHeader title="Implantação indisponível" description="Não foi possível abrir este acompanhamento." backTo="/main/catalogo" /><main className="p-8"><EmptyState title="Não foi possível carregar" description={error || 'Implantação não encontrada.'} action={<button type="button" onClick={() => void load()} className={primaryButtonClass}>Tentar novamente</button>} /></main></CatalogScreen>;

  return <CatalogScreen>
    <CatalogPageHeader title={deployment.groupName} description={`${formatCnpj(deployment.groupCnpj)} · @${deployment.username}`} backTo="/main/catalogo" action={<div className="flex items-center gap-2"><button type="button" onClick={() => void load(true)} className="flex size-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50" aria-label="Atualizar"><RefreshCw className="size-4" /></button>{deployment.status === 'awaiting_activation' ? <Link to={`/main/catalogo/${deployment.id}/revisao`} className={primaryButtonClass}>Revisar ativação<ArrowRight className="size-4" /></Link> : null}</div>} />
    <main className="scrollbar-minimal min-h-0 flex-1 overflow-y-auto"><div className="mx-auto w-full max-w-[1280px] px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <section className="mb-6 flex flex-col gap-4 rounded-xl border border-[#dbe3ef] bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div><div className="flex flex-wrap items-center gap-3"><StatusBadge status={deployment.status} /><span className="text-xs text-slate-400">ID {deployment.id.slice(0, 8)}</span></div><h1 className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-slate-950">{deployment.status === 'awaiting_activation' ? 'Tudo pronto para a ativação' : deployment.status === 'completed' ? 'Catálogo ativo' : processingStatuses.includes(deployment.status) ? statusLabel(deployment.status) : 'Acompanhamento da implantação'}</h1><p className="mt-1 text-sm text-slate-500">Solicitado por {deployment.requestedBy} em {formatDate(deployment.createdAt)}.</p></div><div className="flex gap-3">{deployment.retryable ? <button type="button" onClick={() => void handleDeploymentAction('retry')} disabled={busyAction === 'retry'} className={secondaryButtonClass}>{busyAction === 'retry' ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}Tentar novamente</button> : null}{canCancel ? <button type="button" onClick={() => setShowCancel(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"><Ban className="size-4" />Cancelar</button> : null}</div></section>
      {actionMessage ? <div role="status" className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{actionMessage}</div> : null}
      {['failed', 'partially_failed', 'monitoring_timeout', 'reconciliation_required'].includes(deployment.status) ? <div className="mb-6"><ErrorResolutionCard deployment={deployment} onRetry={() => void handleDeploymentAction('retry')} onReconciliation={() => setActionMessage('Solicitação de reconciliação registrada para o time responsável.')} busy={busyAction === 'retry'} /></div> : null}
      <DeploymentProgress deployment={deployment} />
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]"><div><div className="mb-3 flex items-center justify-between"><div><h2 className="text-base font-semibold text-slate-950">Unidades</h2><p className="mt-0.5 text-xs text-slate-500">Status operacional de cada origem.</p></div><span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">{deployment.units.length}</span></div><div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">{deployment.units.map((unit) => <UnitStatusCard key={unit.id} deployment={deployment} unit={unit} busyAction={busyAction} onAction={(action, target) => void handleUnitAction(action, target)} />)}</div></div><DeploymentTimeline events={deployment.events} units={deployment.units} /></div>
      <section className="mt-6 grid gap-4 sm:grid-cols-3"><div className="rounded-xl border border-[#dbe3ef] bg-white p-5"><span className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Server className="size-4" /></span><p className="mt-4 text-xs text-slate-500">Seller no Hub</p><p className="mt-1 truncate font-mono text-sm font-semibold text-slate-800">{deployment.hubSellerId || 'Ainda não criado'}</p></div><div className="rounded-xl border border-[#dbe3ef] bg-white p-5"><span className="flex size-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700"><Boxes className="size-4" /></span><p className="mt-4 text-xs text-slate-500">Imagens confirmadas</p><p className="mt-1 text-sm font-semibold text-slate-800">{deployment.assets.filter((asset) => asset.status === 'confirmed').length} de 5</p></div><div className="rounded-xl border border-[#dbe3ef] bg-white p-5"><span className="flex size-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Activity className="size-4" /></span><p className="mt-4 text-xs text-slate-500">Última atualização</p><p className="mt-1 text-sm font-semibold text-slate-800">{formatDate(deployment.updatedAt)}</p></div></section>
    </div></main>
    {showCancel ? <ConfirmDialog title="Cancelar esta implantação?" description="O processamento será interrompido. Recursos externos já criados no Hub, Unicommerce ou Banco Único não serão excluídos." confirmText="Cancelar implantação" cancelText="Manter processamento" tone="danger" loading={busyAction === 'cancel'} onClose={() => setShowCancel(false)} onConfirm={() => void handleDeploymentAction('cancel')} /> : null}
  </CatalogScreen>;
}
