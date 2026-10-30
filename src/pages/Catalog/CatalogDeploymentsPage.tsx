import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown, Check, ChevronRight, Plus, RefreshCw, Search, X } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { listAllDeployments, type Deployment, type DeploymentStatus } from '../../services/catalogDeployment.service';
import { FiltersButton, SITUATIONS, activeFilterChips, filtersFromParams, matchesFilters, writeFilters, EMPTY_FILTERS, type ListFilters, type Situation } from './CatalogListControls';
import { CatalogPageHeader, CatalogScreen, EmptyState, StatusDot, formatCnpj, formatDate, primaryButtonClass, relativeTime } from './catalogUi';

const ATTENTION: DeploymentStatus[] = ['failed', 'partially_failed', 'reconciliation_required', 'monitoring_timeout'];
const AWAITING: DeploymentStatus[] = ['awaiting_activation', 'waiting_storefront', 'waiting_storefront_release'];

// Where the deployment is in its pipeline, as segments for the progress bar.
function stageProgress(deployment: Deployment) {
  const stages = deployment.flowMode === 'hub_banco_only' ? ['Hub', 'Catálogo', 'Banco Único'] : ['Hub', 'Catálogo', 'Tenant', 'Produtos', 'Ativação'];
  const indexByStatus: Partial<Record<DeploymentStatus, number>> = {
    draft: 0, queued: 0, provisioning_hub: 0, validating_hub_catalog: 1,
    provisioning_unicommerce: 2, validating_unicommerce: 2, importing_banco_unico: deployment.flowMode === 'hub_banco_only' ? 2 : 3,
    awaiting_activation: stages.length - 1, waiting_storefront: stages.length - 1, waiting_storefront_release: stages.length - 1,
  };
  if (deployment.status === 'completed') return { stages, done: stages.length, current: -1, tone: 'success' as const, label: 'Todas as etapas concluídas' };
  if (deployment.status === 'cancelled') return { stages, done: 0, current: -1, tone: 'neutral' as const, label: 'Cancelada' };
  if (deployment.status === 'draft') return { stages, done: 0, current: -1, tone: 'neutral' as const, label: 'Ainda não iniciada' };
  const attention = ATTENTION.includes(deployment.status);
  const current = indexByStatus[deployment.status] ?? indexByStatus[deployment.currentStage as DeploymentStatus] ?? (attention ? 0 : -1);
  const stage = stages[current];
  return {
    stages, done: Math.max(0, current), current,
    tone: attention ? 'danger' as const : AWAITING.includes(deployment.status) ? 'warning' as const : 'info' as const,
    label: attention ? `Interrompida em ${stage ?? 'uma etapa'}` : stage ? `${stage} · etapa ${current + 1} de ${stages.length}` : 'Aguardando atualização',
  };
}

const segmentTone = { success: 'bg-emerald-500', info: 'bg-primary', warning: 'bg-amber-500', danger: 'bg-rose-500', neutral: 'bg-slate-300' };

function StageBar({ deployment }: { deployment: Deployment }) {
  const progress = stageProgress(deployment);
  return <span className="block min-w-0">
    <span className="flex gap-1" aria-hidden="true">
      {progress.stages.map((stage, index) => <span key={stage} className={`h-1.5 flex-1 rounded-full ${index < progress.done ? 'bg-emerald-500' : index === progress.current ? segmentTone[progress.tone] : 'bg-slate-200'}`} />)}
    </span>
    <span className={`mt-1.5 block truncate text-xs ${progress.tone === 'danger' ? 'text-rose-700' : 'text-slate-600'}`}>{progress.label}</span>
  </span>;
}

// Lenient matching: ignores accents, case, spaces and punctuation ("Farmácia São-João" ~ "farmaciasaojoao").
function searchKey(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]/g, '');
}

type DeploymentSortField = 'createdAt' | 'updatedAt' | 'groupName' | 'status' | 'units';
type SortOrder = 'asc' | 'desc';
const IN_PROGRESS: DeploymentStatus[] = ['queued', 'provisioning_hub', 'validating_hub_catalog', 'provisioning_unicommerce', 'validating_unicommerce', 'importing_banco_unico', 'waiting_storefront_release', 'waiting_storefront'];
// Status sorting follows urgency (needs attention, in progress, draft, done), not the alphabet.
const STATUS_SORT_PRIORITY: DeploymentStatus[] = [...ATTENTION, 'awaiting_activation', ...IN_PROGRESS, 'draft', 'completed', 'cancelled'];
const PAGE_SIZE = 20;

function compareDeployments(sort: DeploymentSortField, order: SortOrder) {
  const direction = order === 'asc' ? 1 : -1;
  const rank = (status: DeploymentStatus) => { const index = STATUS_SORT_PRIORITY.indexOf(status); return index < 0 ? STATUS_SORT_PRIORITY.length : index; };
  const time = (value: string) => new Date(value).getTime();
  return (a: Deployment, b: Deployment) => {
    const primary = sort === 'groupName' ? a.groupName.localeCompare(b.groupName, 'pt-BR', { sensitivity: 'base' })
      : sort === 'status' ? rank(a.status) - rank(b.status)
        : sort === 'units' ? a.units.length - b.units.length
          : time(a[sort]) - time(b[sort]);
    return primary * direction || time(b.createdAt) - time(a.createdAt);
  };
}

const sortOptions: { sort: DeploymentSortField; order: SortOrder; label: string }[] = [
  { sort: 'createdAt', order: 'desc', label: 'Criação: mais recentes' },
  { sort: 'createdAt', order: 'asc', label: 'Criação: mais antigas' },
  { sort: 'updatedAt', order: 'desc', label: 'Atualização: mais recentes' },
  { sort: 'updatedAt', order: 'asc', label: 'Atualização: mais antigas' },
  { sort: 'groupName', order: 'asc', label: 'Nome: A–Z' },
  { sort: 'groupName', order: 'desc', label: 'Nome: Z–A' },
  { sort: 'status', order: 'asc', label: 'Status: atenção primeiro' },
  { sort: 'status', order: 'desc', label: 'Status: concluídos primeiro' },
  { sort: 'units', order: 'desc', label: 'Unidades: mais unidades' },
  { sort: 'units', order: 'asc', label: 'Unidades: menos unidades' },
];
// Direction applied when a column is chosen for the first time.
const defaultOrder: Record<DeploymentSortField, SortOrder> = { createdAt: 'desc', updatedAt: 'desc', groupName: 'asc', status: 'asc', units: 'desc' };
const sortFields = Object.keys(defaultOrder) as DeploymentSortField[];

// Choices offered by each column menu, worded for that column.
const menuChoices: Record<DeploymentSortField, { order: SortOrder; label: string }[]> = {
  createdAt: [{ order: 'desc', label: 'Mais recentes' }, { order: 'asc', label: 'Mais antigas' }],
  updatedAt: [{ order: 'desc', label: 'Mais recentes' }, { order: 'asc', label: 'Mais antigas' }],
  groupName: [{ order: 'asc', label: 'A–Z' }, { order: 'desc', label: 'Z–A' }],
  status: [{ order: 'asc', label: 'Atenção primeiro' }, { order: 'desc', label: 'Concluídos primeiro' }],
  units: [{ order: 'desc', label: 'Mais unidades' }, { order: 'asc', label: 'Menos unidades' }],
};

function SortMenu({ field, label, sort, order, onSelect, align = 'left' }: { field: DeploymentSortField; label: string; sort: DeploymentSortField; order: SortOrder; onSelect: (field: DeploymentSortField, order: SortOrder) => void; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const active = sort === field;
  const Icon = !active ? ArrowUpDown : order === 'asc' ? ArrowUp : ArrowDown;
  const current = active ? menuChoices[field].find((choice) => choice.order === order)?.label : undefined;

  const close = useCallback((restoreFocus = false) => { setOpen(false); if (restoreFocus) buttonRef.current?.focus(); }, []);
  function toggle() {
    if (open) { close(); return; }
    // Fixed position escapes the list card's overflow clipping.
    const rect = buttonRef.current!.getBoundingClientRect();
    const left = align === 'right' ? rect.right - 224 : rect.left;
    setPosition({ top: rect.bottom + 6, left: Math.max(8, Math.min(left, window.innerWidth - 232)) });
    setOpen(true);
  }
  useEffect(() => {
    if (!open) return;
    const items = () => [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ?? [])];
    (items().find((item) => item.getAttribute('aria-checked') === 'true') ?? items()[0])?.focus();
    const onPointer = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node) && !buttonRef.current?.contains(event.target as Node)) close(); };
    const onMove = () => close();
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => { document.removeEventListener('mousedown', onPointer); window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onMove, true); };
  }, [open, close]);
  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (event.key === 'Tab') close();
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); }
    else if (event.key === 'Home') { event.preventDefault(); items[0]?.focus(); }
    else if (event.key === 'End') { event.preventDefault(); items[items.length - 1]?.focus(); }
  }
  const choose = (nextField: DeploymentSortField, nextOrder: SortOrder) => { onSelect(nextField, nextOrder); close(true); };

  return <>
    <button ref={buttonRef} type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      className={`-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-1 transition-colors hover:bg-slate-200/60 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-primary ${active || open ? 'text-slate-900' : ''} ${open ? 'bg-slate-200/60' : ''}`}>
      {label}<Icon aria-hidden="true" className={`size-3.5 ${active ? 'text-primary' : 'text-slate-400'}`} />
      <span className="sr-only">{current ? `, ordenado: ${current}` : ', ordenar'}</span>
    </button>
    {open ? <div ref={menuRef} id={menuId} role="menu" aria-label={`Ordenar por ${label.toLocaleLowerCase('pt-BR')}`} onKeyDown={onMenuKeyDown}
      style={{ top: position.top, left: position.left }} className="fixed z-50 w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
      <p className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-slate-500">Ordenar por {label.toLocaleLowerCase('pt-BR')}</p>
      {menuChoices[field].map((choice) => {
        const checked = active && order === choice.order;
        return <button key={choice.order} type="button" role="menuitemradio" aria-checked={checked} onClick={() => choose(field, choice.order)}
          className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm outline-none transition-colors hover:bg-slate-100 focus-visible:bg-slate-100 ${checked ? 'font-medium text-slate-950' : 'text-slate-700'}`}>
          {choice.order === 'asc' ? <ArrowUp aria-hidden="true" className="size-4 text-slate-400" /> : <ArrowDown aria-hidden="true" className="size-4 text-slate-400" />}
          <span className="flex-1">{choice.label}</span>
          {checked ? <Check aria-hidden="true" className="size-4 text-primary" /> : null}
        </button>;
      })}
      {active ? <>
        <div role="separator" className="my-1 h-px bg-slate-100" />
        <button type="button" role="menuitem" onClick={() => choose('createdAt', 'desc')} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-slate-700 outline-none transition-colors hover:bg-slate-100 focus-visible:bg-slate-100">
          <X aria-hidden="true" className="size-4 text-slate-400" />Remover ordenação
        </button>
      </> : null}
    </div> : null}
  </>;
}

const COLUMNS = 'grid-cols-[minmax(240px,1.7fr)_minmax(170px,0.9fr)_minmax(180px,1fr)_88px_112px_16px]';

function DeploymentRow({ deployment }: { deployment: Deployment }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(`/main/catalogo/${deployment.id}`)} className={`group grid w-full ${COLUMNS} items-center gap-6 px-5 py-3.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary`}>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-slate-950" title={deployment.groupName}>{deployment.groupName}</span>
        <span className="mt-0.5 block truncate text-xs text-slate-500" title={`${formatCnpj(deployment.groupCnpj)} · @${deployment.username}`}><span className="tabular-nums">{formatCnpj(deployment.groupCnpj)}</span> · @{deployment.username}{deployment.flowMode === 'hub_banco_only' ? ' · Hub + Banco Único' : ''}</span>
      </span>
      <span className="min-w-0"><StatusDot status={deployment.status} /></span>
      <StageBar deployment={deployment} />
      <span className="text-right text-sm tabular-nums text-slate-800">{deployment.units.length}</span>
      <time dateTime={deployment.updatedAt} title={formatDate(deployment.updatedAt)} className="truncate whitespace-nowrap text-sm text-slate-600">{relativeTime(deployment.updatedAt)}</time>
      <ChevronRight aria-hidden="true" className="size-4 text-slate-300 transition-colors group-hover:text-slate-500" />
    </button>
  );
}

type View = '' | Situation;
const VIEWS: { value: View; label: string }[] = [{ value: '', label: 'Todas' }, ...SITUATIONS.filter((item) => ['attention', 'in_progress', 'awaiting', 'completed'].includes(item.value)).map((item) => ({ value: item.value as View, label: item.label }))];

export default function CatalogDeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const sortParam = searchParams.get('sort') as DeploymentSortField | null;
  const sort: DeploymentSortField = sortParam && sortFields.includes(sortParam) ? sortParam : 'createdAt';
  const order: SortOrder = searchParams.get('order') === 'asc' ? 'asc' : searchParams.get('order') === 'desc' ? 'desc' : defaultOrder[sort];
  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);
  const applyFilters = useCallback((next: ListFilters) => {
    setPage(1);
    setSearchParams((current) => writeFilters(new URLSearchParams(current), next), { replace: true });
  }, [setSearchParams]);
  const applyFiltersAndSort = useCallback((next: ListFilters, nextSort: DeploymentSortField, nextOrder: SortOrder) => {
    setPage(1);
    setSearchParams((current) => {
      const params = writeFilters(new URLSearchParams(current), next);
      if (nextSort === 'createdAt' && nextOrder === 'desc') { params.delete('sort'); params.delete('order'); }
      else { params.set('sort', nextSort); params.set('order', nextOrder); }
      return params;
    }, { replace: true });
  }, [setSearchParams]);
  const applySort = useCallback((nextSort: DeploymentSortField, nextOrder: SortOrder) => {
    setPage(1);
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (nextSort === 'createdAt' && nextOrder === 'desc') { params.delete('sort'); params.delete('order'); }
      else { params.set('sort', nextSort); params.set('order', nextOrder); }
      return params;
    }, { replace: true });
  }, [setSearchParams]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDeployments(await listAllDeployments());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar as implantações.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  // Filtering is local and instant, so search follows typing after a short pause.
  useEffect(() => {
    const timer = window.setTimeout(() => { setAppliedSearch(search.trim()); setPage(1); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  // The full list is loaded once; filters, sorting and pagination run here without new requests.
  const searchIndex = useMemo(() => new Map(deployments.map((item) => [item.id, searchKey([item.groupName, item.username, item.groupCnpj, ...item.units.flatMap((unit) => [unit.name, unit.code, unit.cnpj, unit.atenderBemConfig?.ai?.instance ?? '', unit.atenderBemConfig?.mcpUrl ?? ''])].join(' '))])), [deployments]);
  const searched = useMemo(() => {
    const term = searchKey(appliedSearch);
    return term ? deployments.filter((item) => searchIndex.get(item.id)?.includes(term)) : deployments;
  }, [deployments, searchIndex, appliedSearch]);
  const filtered = useMemo(() => searched.filter((item) => matchesFilters(item, filters)).sort(compareDeployments(sort, order)), [searched, filters, sort, order]);
  // View counts honour every filter except the situation, which the views themselves set.
  const viewCounts = useMemo(() => {
    const base = searched.filter((item) => matchesFilters(item, { ...filters, situations: [] }));
    return Object.fromEntries(VIEWS.map((view) => [view.value, view.value ? base.filter((item) => matchesFilters(item, { ...EMPTY_FILTERS, situations: [view.value as Situation] })).length : base.length])) as Record<View, number>;
  }, [searched, filters]);
  const activeView: View | null = filters.situations.length === 0 ? '' : filters.situations.length === 1 && VIEWS.some((view) => view.value === filters.situations[0]) ? filters.situations[0] : null;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const chips = activeFilterChips(filters).filter((chip) => activeView === null || !chip.key.startsWith('s-'));

  return (
    <CatalogScreen>
      <CatalogPageHeader title="Catálogo de produtos" description="Implantações de catálogo por grupo de farmácias." action={<div className="flex shrink-0 items-center gap-2"><button type="button" onClick={() => void load()} disabled={loading} className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default" aria-label="Atualizar lista" title="Atualizar lista"><RefreshCw className={`size-4 ${loading ? 'motion-safe:animate-spin' : ''}`} /></button><Link to="/main/catalogo/novo" className={`${primaryButtonClass} shrink-0`}><Plus className="size-4" /><span className="hidden sm:inline">Novo catálogo</span><span className="sm:hidden">Novo</span></Link></div>} />
      <main className="scrollbar-minimal min-h-0 flex-1 overflow-y-auto bg-white [scrollbar-gutter:stable]">
        <div className="mx-auto w-full max-w-[1280px] px-5 pb-12 pt-6 sm:px-8">
          <nav aria-label="Visões rápidas" className="flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_theme(colors.slate.200)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {VIEWS.map((view) => {
              const selected = activeView === view.value;
              return <button key={view.value || 'all'} type="button" aria-pressed={selected} onClick={() => applyFilters({ ...filters, situations: view.value ? [view.value] : [] })}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${selected ? 'border-slate-900 font-medium text-slate-950' : 'border-transparent text-slate-600 hover:text-slate-950'}`}>
                {view.label}
                <span className={`rounded-full px-1.5 text-xs tabular-nums ${selected ? 'bg-slate-900 text-white' : view.value === 'attention' && viewCounts.attention ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'}`}>{loading ? '–' : viewCounts[view.value]}</span>
              </button>;
            })}
          </nav>

          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <form onSubmit={(event) => { event.preventDefault(); setPage(1); setAppliedSearch(search.trim()); }} className="relative flex-1" role="search">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape' && search) { event.preventDefault(); setSearch(''); } }} className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-10 text-sm [&::-webkit-search-cancel-button]:hidden text-slate-950 outline-none transition placeholder:text-slate-500 hover:border-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10" placeholder="Buscar por grupo, usuário ou CNPJ" aria-label="Buscar implantações" />
              {search ? <button type="button" onClick={() => setSearch('')} aria-label="Limpar busca" className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-primary"><X className="size-4" /></button> : null}
            </form>
            <FiltersButton filters={filters} sort={`${sort}:${order}`} sortOptions={sortOptions.map((option) => ({ value: `${option.sort}:${option.order}`, label: option.label }))}
              onApply={(next, nextSort) => { const [nextField, nextOrder] = nextSort.split(':') as [DeploymentSortField, SortOrder]; applyFiltersAndSort(next, nextField, nextOrder); }} />
          </div>

          {chips.length ? <div className="mt-3 flex flex-wrap items-center gap-2">
            {chips.map((chip) => <button key={chip.key} type="button" onClick={() => applyFilters(chip.remove(filters))} aria-label={`Remover filtro ${chip.label}`}
              className="inline-flex min-h-7 items-center gap-1 rounded-full border border-slate-300 bg-white py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary">
              <span className="max-w-[16rem] truncate">{chip.label}</span><X aria-hidden="true" className="size-3.5 shrink-0 text-slate-500" />
            </button>)}
            <button type="button" onClick={() => applyFilters(EMPTY_FILTERS)} className="text-xs font-medium text-slate-600 underline-offset-2 hover:text-slate-950 hover:underline focus-visible:outline-2 focus-visible:outline-primary">Limpar filtros</button>
          </div> : null}

          <section aria-label="Implantações" className="mt-4 overflow-hidden rounded-xl border border-slate-200">
            <div className={`hidden ${COLUMNS} items-center gap-6 border-b border-slate-200 bg-slate-50/70 px-5 py-2 text-xs font-medium text-slate-500 lg:grid`}>
              <span><SortMenu field="groupName" label="Grupo" sort={sort} order={order} onSelect={applySort} /></span>
              <span><SortMenu field="status" label="Situação" sort={sort} order={order} onSelect={applySort} /></span>
              <span>Progresso</span>
              <span className="text-right"><SortMenu field="units" label="Unidades" sort={sort} order={order} onSelect={applySort} align="right" /></span>
              <span><SortMenu field="updatedAt" label="Atualizado" sort={sort} order={order} onSelect={applySort} align="right" /></span>
              <span />
            </div>
            {loading ? <div role="status" className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-600"><RefreshCw className="size-4 text-primary motion-safe:animate-spin" />Carregando implantações…</div>
              : error ? <div className="p-6"><EmptyState title="Não foi possível carregar" description={error} action={<button type="button" onClick={() => void load()} className={primaryButtonClass}>Tentar novamente</button>} /></div>
                : visible.length ? <>
                  <div className="hidden divide-y divide-slate-100 lg:block">{visible.map((deployment) => <DeploymentRow key={deployment.id} deployment={deployment} />)}</div>
                  <ul className="divide-y divide-slate-100 lg:hidden">{visible.map((deployment) => <li key={deployment.id}>
                    <Link to={`/main/catalogo/${deployment.id}`} className="block px-4 py-4 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary">
                      <span className="flex items-start justify-between gap-3"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-950">{deployment.groupName}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{formatCnpj(deployment.groupCnpj)}</span></span><span className="min-w-0 max-w-[45%] shrink-0"><StatusDot status={deployment.status} /></span></span>
                      <span className="mt-3 block"><StageBar deployment={deployment} /></span>
                      <span className="mt-2 flex justify-between gap-3 text-xs text-slate-600"><span className="shrink-0">{deployment.units.length} {deployment.units.length === 1 ? 'unidade' : 'unidades'}</span><time dateTime={deployment.updatedAt} title={formatDate(deployment.updatedAt)}>Atualizado {relativeTime(deployment.updatedAt)}</time></span>
                    </Link>
                  </li>)}</ul>
                </>
                  : <div className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
                    <p className="text-sm font-medium text-slate-950">{deployments.length ? 'Nenhuma implantação com esses critérios' : 'Nenhuma implantação ainda'}</p>
                    <p className="mt-1 max-w-sm text-sm text-slate-600">{deployments.length ? 'Ajuste a busca ou os filtros para ver outras implantações.' : 'Cadastre o primeiro catálogo para acompanhar a implantação por aqui.'}</p>
                    <div className="mt-4">{deployments.length ? <button type="button" onClick={() => { setSearch(''); setAppliedSearch(''); applyFilters(EMPTY_FILTERS); }} className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">Limpar busca e filtros</button> : <Link to="/main/catalogo/novo" className={primaryButtonClass}><Plus className="size-4" />Novo catálogo</Link>}</div>
                  </div>}
            {!loading && !error && filtered.length ? <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/50 px-5 py-2.5">
              <p className="text-xs tabular-nums text-slate-600">{filtered.length === deployments.length ? `${filtered.length} implantações` : `${filtered.length} de ${deployments.length} implantações`}{totalPages > 1 ? ` · ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filtered.length)}` : ''}</p>
              {totalPages > 1 ? <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1} aria-label="Página anterior" className="flex size-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><ArrowLeft className="size-3.5" /></button>
                <span className="px-1 text-xs tabular-nums text-slate-600">{currentPage} de {totalPages}</span>
                <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage === totalPages} aria-label="Próxima página" className="flex size-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><ArrowRight className="size-3.5" /></button>
              </div> : null}
            </div> : null}
          </section>
        </div>
      </main>
    </CatalogScreen>
  );
}
