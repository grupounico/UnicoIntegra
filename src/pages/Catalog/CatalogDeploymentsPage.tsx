import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Plus, RefreshCw, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { listDeployments, type Deployment, type DeploymentStatus } from '../../services/catalogDeployment.service';
import { CatalogPageHeader, CatalogScreen, EmptyState, StatusBadge, fieldClass, formatCnpj, formatDate, primaryButtonClass } from './catalogUi';

const progressByStatus: Record<DeploymentStatus, number> = {
  draft: 5, queued: 12, provisioning_hub: 27, validating_hub_catalog: 42,
  provisioning_unicommerce: 58, validating_unicommerce: 68, importing_banco_unico: 82,
  awaiting_activation: 94, completed: 100, partially_failed: 82, failed: 45,
  monitoring_timeout: 62, reconciliation_required: 58, cancelled: 0,
};

const statusOptions: Array<{ value: DeploymentStatus | ''; label: string }> = [
  { value: '', label: 'Todos os status' },
  { value: 'draft', label: 'Rascunho' },
  { value: 'queued', label: 'Na fila' },
  { value: 'provisioning_hub', label: 'Criando no Hub' },
  { value: 'importing_banco_unico', label: 'Importando produtos' },
  { value: 'awaiting_activation', label: 'Aguardando ativação' },
  { value: 'completed', label: 'Concluído' },
  { value: 'failed', label: 'Falhou' },
  { value: 'reconciliation_required', label: 'Reconciliação necessária' },
  { value: 'cancelled', label: 'Cancelado' },
];

function DeploymentRow({ deployment }: { deployment: Deployment }) {
  const navigate = useNavigate();
  const progress = progressByStatus[deployment.status];
  return (
    <button type="button" onClick={() => navigate(`/main/catalogo/${deployment.id}`)} className="grid w-full grid-cols-[minmax(240px,1.5fr)_minmax(165px,0.8fr)_minmax(190px,0.9fr)_minmax(150px,0.7fr)_24px] items-center gap-5 px-6 py-4 text-left transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary">
      <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-950">{deployment.groupName}</span><span className="mt-1 block truncate text-xs text-slate-500">{formatCnpj(deployment.groupCnpj)} · @{deployment.username}</span></span>
      <span><StatusBadge status={deployment.status} /></span>
      <span className="min-w-0"><span className="flex items-center justify-between text-xs text-slate-500"><span>Progresso</span><span className="font-medium tabular-nums text-slate-700">{progress}%</span></span><span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${deployment.status === 'failed' ? 'bg-rose-500' : deployment.status === 'awaiting_activation' ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${progress}%` }} /></span></span>
      <span><span className="block text-sm font-medium text-slate-700">{deployment.units.length} {deployment.units.length === 1 ? 'unidade' : 'unidades'}</span><span className="mt-1 block text-xs text-slate-500">{formatDate(deployment.updatedAt)}</span></span>
      <ArrowRight className="size-4 text-slate-300" />
    </button>
  );
}

export default function CatalogDeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [status, setStatus] = useState<DeploymentStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const digits = appliedSearch.replace(/\D/g, '');
      const response = await listDeployments({ page: 1, pageSize: 20, status, ...(digits.length >= 3 && /^[\d./-]+$/.test(appliedSearch) ? { cnpj: digits } : { search: appliedSearch }) });
      setDeployments(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar as implantações.');
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, status]);

  useEffect(() => { void load(); }, [load]);

  return (
    <CatalogScreen>
      <CatalogPageHeader title="Catálogo de produtos" description="Cadastre, acompanhe e ative novos catálogos Unico." action={<Link to="/main/catalogo/novo" className={`${primaryButtonClass} shrink-0`}><Plus className="size-4" /><span className="hidden sm:inline">Novo catálogo</span><span className="sm:hidden">Novo</span></Link>} />
      <main className="scrollbar-minimal mx-auto min-h-0 w-full max-w-[1440px] flex-1 overflow-y-auto px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-[#dbe3ef] bg-white p-5"><p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Em andamento</p><p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{deployments.filter((item) => ['queued', 'provisioning_hub', 'validating_hub_catalog', 'provisioning_unicommerce', 'validating_unicommerce', 'importing_banco_unico'].includes(item.status)).length}</p><p className="mt-1 text-xs text-slate-500">Processamento assíncrono</p></div>
          <div className="rounded-xl border border-[#dbe3ef] bg-white p-5"><p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Aguardando ação</p><p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-amber-700">{deployments.filter((item) => ['awaiting_activation', 'reconciliation_required', 'monitoring_timeout'].includes(item.status)).length}</p><p className="mt-1 text-xs text-slate-500">Revisão ou ativação manual</p></div>
          <div className="rounded-xl border border-[#dbe3ef] bg-white p-5"><p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Concluídos</p><p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-emerald-700">{deployments.filter((item) => item.status === 'completed').length}</p><p className="mt-1 text-xs text-slate-500">Catálogos ativos</p></div>
        </section>

        <section className="mt-6 overflow-hidden rounded-xl border border-[#dbe3ef] bg-white">
          <div className="flex flex-col gap-3 border-b border-[#dbe3ef] p-4 sm:flex-row sm:items-center">
            <form onSubmit={(event) => { event.preventDefault(); setAppliedSearch(search.trim()); }} className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className={`${fieldClass} mt-0 pl-10`} placeholder="Buscar por grupo, usuário ou CNPJ" aria-label="Buscar implantações" />
            </form>
            <select value={status} onChange={(event) => setStatus(event.target.value as DeploymentStatus | '')} className={`${fieldClass} mt-0 sm:w-64`} aria-label="Filtrar por status">{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            <button type="button" onClick={() => void load()} className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition hover:bg-slate-50" aria-label="Atualizar lista"><RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} /></button>
          </div>

          <div className="hidden grid-cols-[minmax(240px,1.5fr)_minmax(165px,0.8fr)_minmax(190px,0.9fr)_minmax(150px,0.7fr)_24px] gap-5 border-b border-[#dbe3ef] bg-slate-50 px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 lg:grid"><span>Grupo</span><span>Status</span><span>Andamento</span><span>Unidades / atualização</span><span /></div>
          {loading ? <div className="flex min-h-72 items-center justify-center"><RefreshCw className="size-5 animate-spin text-primary" /><span className="ml-3 text-sm text-slate-500">Carregando catálogos…</span></div>
            : error ? <EmptyState title="Não foi possível carregar" description={error} action={<button type="button" onClick={() => void load()} className={primaryButtonClass}>Tentar novamente</button>} />
              : deployments.length ? <div className="hidden divide-y divide-[#dbe3ef] lg:block">{deployments.map((deployment) => <DeploymentRow key={deployment.id} deployment={deployment} />)}</div>
                : <EmptyState title="Nenhum catálogo encontrado" description="Ajuste os filtros ou inicie o cadastro de um novo catálogo." action={<Link to="/main/catalogo/novo" className={primaryButtonClass}><Plus className="size-4" />Novo catálogo</Link>} />}

          {!loading && !error && deployments.length ? <div className="divide-y divide-[#dbe3ef] lg:hidden">{deployments.map((deployment) => <Link key={deployment.id} to={`/main/catalogo/${deployment.id}`} className="block p-5 transition hover:bg-slate-50"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-sm font-semibold text-slate-950">{deployment.groupName}</h2><p className="mt-1 text-xs text-slate-500">{formatCnpj(deployment.groupCnpj)}</p></div><StatusBadge status={deployment.status} /></div><div className="mt-4 flex items-center justify-between text-xs text-slate-500"><span>{deployment.units.length} {deployment.units.length === 1 ? 'unidade' : 'unidades'}</span><span>{formatDate(deployment.updatedAt)}</span></div></Link>)}</div> : null}
        </section>
      </main>
    </CatalogScreen>
  );
}
