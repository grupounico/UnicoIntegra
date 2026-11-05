/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Check, ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import type { CatalogFlowMode, CatalogProvider, Deployment, DeploymentStatus } from '../../services/catalogDeployment.service';

// ---------- Filters ----------

export type Situation = 'attention' | 'in_progress' | 'awaiting' | 'draft' | 'completed' | 'cancelled';
export type AtenderBemFilter = '' | 'none' | 'configured' | 'imported' | 'attention';
export type ListFilters = { situations: Situation[]; flow: '' | CatalogFlowMode; erps: CatalogProvider[]; atenderBem: AtenderBemFilter; ai: '' | 'created' | 'missing'; period: '' | '7' | '30' | '90' };

export const EMPTY_FILTERS: ListFilters = { situations: [], flow: '', erps: [], atenderBem: '', ai: '', period: '' };

export const SITUATIONS: { value: Situation; label: string; statuses: DeploymentStatus[] }[] = [
  { value: 'attention', label: 'Requer atenção', statuses: ['failed', 'partially_failed', 'reconciliation_required', 'monitoring_timeout'] },
  { value: 'in_progress', label: 'Em andamento', statuses: ['queued', 'provisioning_hub', 'validating_hub_catalog', 'provisioning_unicommerce', 'validating_unicommerce', 'importing_banco_unico'] },
  { value: 'awaiting', label: 'Aguardando ativação', statuses: ['awaiting_activation', 'waiting_storefront', 'waiting_storefront_release'] },
  { value: 'draft', label: 'Rascunho', statuses: ['draft'] },
  { value: 'completed', label: 'Concluído', statuses: ['completed'] },
  { value: 'cancelled', label: 'Cancelado', statuses: ['cancelled'] },
];
const FLOW_OPTIONS = [{ value: '', label: 'Todos os tipos' }, { value: 'full', label: 'Completa' }, { value: 'hub_banco_only', label: 'Hub + Banco Único' }];
export const ERP_OPTIONS: { value: CatalogProvider; label: string }[] = [{ value: 'alpha7', label: 'Alpha7' }, { value: 'linx', label: 'Linx' }, { value: 'automatiza', label: 'Automatiza' }, { value: 'vetor', label: 'Vetor' }];
const ATENDERBEM_OPTIONS = [{ value: '', label: 'Qualquer situação' }, { value: 'none', label: 'Não configurado' }, { value: 'configured', label: 'Configurado' }, { value: 'imported', label: 'Catálogo importado' }, { value: 'attention', label: 'Requer verificação' }];
const AI_OPTIONS = [{ value: '', label: 'Qualquer situação' }, { value: 'created', label: 'Criada' }, { value: 'missing', label: 'Não criada' }];
const PERIOD_OPTIONS = [{ value: '', label: 'Todo o período' }, { value: '7', label: 'Últimos 7 dias' }, { value: '30', label: 'Últimos 30 dias' }, { value: '90', label: 'Últimos 90 dias' }];
const IMPORT_ATTENTION = ['failed', 'cancelled', 'unknown', 'failed_before_import', 'reindex_unknown'];

function atenderBemState(deployment: Deployment): Exclude<AtenderBemFilter, '' | 'configured'> | 'partial' {
  const configs = deployment.units.map((unit) => unit.atenderBemConfig).filter(Boolean);
  if (!configs.length) return 'none';
  if (configs.some((config) => IMPORT_ATTENTION.includes(config?.import?.status || '') || Boolean(config?.import?.errors))) return 'attention';
  if (configs.length === deployment.units.length && configs.every((config) => config?.import?.status === 'completed')) return 'imported';
  return 'partial';
}

export function matchesFilters(deployment: Deployment, filters: ListFilters, now = Date.now()) {
  if (filters.situations.length && !filters.situations.some((value) => SITUATIONS.find((item) => item.value === value)?.statuses.includes(deployment.status))) return false;
  if (filters.flow && deployment.flowMode !== filters.flow) return false;
  if (filters.erps.length && !deployment.units.some((unit) => filters.erps.includes(unit.provider))) return false;
  if (filters.atenderBem) {
    const state = atenderBemState(deployment);
    if (filters.atenderBem === 'configured' ? state === 'none' : state !== filters.atenderBem) return false;
  }
  if (filters.ai) {
    const created = deployment.units.some((unit) => unit.atenderBemConfig?.ai?.status === 'created');
    if ((filters.ai === 'created') !== created) return false;
  }
  if (filters.period && now - new Date(deployment.createdAt).getTime() > Number(filters.period) * 86_400_000) return false;
  return true;
}

export function countFilters(filters: ListFilters) {
  return filters.situations.length + filters.erps.length + [filters.flow, filters.atenderBem, filters.ai, filters.period].filter(Boolean).length;
}

// Removable chips for every active criterion, in the order the panel shows them.
export function activeFilterChips(filters: ListFilters): { key: string; label: string; remove: (current: ListFilters) => ListFilters }[] {
  const option = (list: { value: string; label: string }[], value: string) => list.find((item) => item.value === value)?.label ?? value;
  return [
    ...filters.situations.map((value) => ({ key: `s-${value}`, label: option(SITUATIONS, value), remove: (current: ListFilters) => ({ ...current, situations: current.situations.filter((item) => item !== value) }) })),
    ...(filters.flow ? [{ key: 'flow', label: option(FLOW_OPTIONS, filters.flow), remove: (current: ListFilters) => ({ ...current, flow: '' as const }) }] : []),
    ...filters.erps.map((value) => ({ key: `e-${value}`, label: `ERP ${option(ERP_OPTIONS, value)}`, remove: (current: ListFilters) => ({ ...current, erps: current.erps.filter((item) => item !== value) }) })),
    ...(filters.atenderBem ? [{ key: 'ab', label: `AtenderBem: ${option(ATENDERBEM_OPTIONS, filters.atenderBem).toLocaleLowerCase('pt-BR')}`, remove: (current: ListFilters) => ({ ...current, atenderBem: '' as const }) }] : []),
    ...(filters.ai ? [{ key: 'ai', label: `IA ${option(AI_OPTIONS, filters.ai).toLocaleLowerCase('pt-BR')}`, remove: (current: ListFilters) => ({ ...current, ai: '' as const }) }] : []),
    ...(filters.period ? [{ key: 'period', label: option(PERIOD_OPTIONS, filters.period), remove: (current: ListFilters) => ({ ...current, period: '' as const }) }] : []),
  ];
}

// URL keys stay short and readable, e.g. ?situacao=attention,draft&erp=alpha7&periodo=30.
export function filtersFromParams(params: URLSearchParams): ListFilters {
  const list = <T extends string>(key: string, allowed: readonly T[]) => (params.get(key) || '').split(',').filter((value): value is T => (allowed as readonly string[]).includes(value));
  const one = <T extends string>(key: string, allowed: readonly T[]) => { const value = params.get(key) || ''; return ((allowed as readonly string[]).includes(value) ? value : '') as T | ''; };
  return {
    situations: list('situacao', SITUATIONS.map((item) => item.value)),
    flow: one('tipo', ['full', 'hub_banco_only'] as CatalogFlowMode[]),
    erps: list('erp', ERP_OPTIONS.map((item) => item.value)),
    atenderBem: one('atenderbem', ['none', 'configured', 'imported', 'attention'] as const),
    ai: one('ia', ['created', 'missing'] as const),
    period: one('periodo', ['7', '30', '90'] as const),
  };
}

export function writeFilters(params: URLSearchParams, filters: ListFilters) {
  const entries: [string, string][] = [['situacao', filters.situations.join(',')], ['tipo', filters.flow], ['erp', filters.erps.join(',')], ['atenderbem', filters.atenderBem], ['ia', filters.ai], ['periodo', filters.period]];
  for (const [key, value] of entries) if (value) params.set(key, value); else params.delete(key);
  return params;
}

// ---------- Popover plumbing ----------

// Fixed positioning lets popovers escape the list card's overflow clipping.
function useAnchoredPopover(anchor: RefObject<HTMLElement | null>, panel: RefObject<HTMLElement | null>, { width, align = 'left' }: { width: number; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number; maxHeight: number }>({ top: 0, left: 0, maxHeight: 400 });
  const show = useCallback(() => {
    const rect = anchor.current!.getBoundingClientRect();
    const left = align === 'right' ? rect.right - width : rect.left;
    const below = window.innerHeight - rect.bottom - 14;
    const above = rect.top - 14;
    // Open upward only when the space below is tight and there is more room above.
    const upward = below < 360 && above > below;
    setPosition({ ...(upward ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }), left: Math.max(8, Math.min(left, window.innerWidth - width - 8)), maxHeight: Math.max(160, upward ? above : below) });
    setOpen(true);
  }, [anchor, align, width]);
  const hide = useCallback((restoreFocus = false) => { setOpen(false); if (restoreFocus) anchor.current?.focus(); }, [anchor]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => { if (!panel.current?.contains(event.target as Node) && !anchor.current?.contains(event.target as Node)) setOpen(false); };
    const onMove = (event: Event) => { if (!panel.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => { document.removeEventListener('mousedown', onPointer); window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onMove, true); };
  }, [open, anchor, panel]);
  return { open, position, show, hide };
}

function moveFocus(container: HTMLElement | null, selector: string, event: KeyboardEvent) {
  const items = [...(container?.querySelectorAll<HTMLElement>(selector) ?? [])];
  const index = items.indexOf(document.activeElement as HTMLElement);
  const target = event.key === 'ArrowDown' ? index + 1 : event.key === 'ArrowUp' ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null;
  if (target === null) return false;
  event.preventDefault();
  items[(target + items.length) % items.length]?.focus();
  return true;
}

// ---------- Custom select (single choice listbox) ----------

export function Select({ label, value, options, onChange, prefix, className = '', width = 240 }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; prefix?: string; className?: string; width?: number }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const { open, position, show, hide } = useAnchoredPopover(buttonRef, listRef, { width: Math.max(width, buttonRef.current?.offsetWidth ?? 0) });
  const selected = options.find((option) => option.value === value) ?? options[0];
  useEffect(() => {
    if (!open) return;
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    (items.find((item) => item.getAttribute('aria-selected') === 'true') ?? items[0])?.focus();
  }, [open]);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); hide(true); return; }
    if (event.key === 'Tab') { hide(); return; }
    moveFocus(listRef.current, '[role="option"]', event);
  }
  return <>
    <button ref={buttonRef} type="button" onClick={() => (open ? hide() : show())} onKeyDown={(event) => { if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); show(); } }}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-label={`${label}: ${selected.label}`}
      className={`inline-flex min-h-11 items-center justify-between gap-2 rounded-lg border bg-white px-3.5 text-left text-sm transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${open ? 'border-primary ring-2 ring-primary/10' : 'border-slate-300'} ${className}`}>
      <span className="min-w-0 truncate">{prefix ? <span className="text-slate-500">{prefix} </span> : null}<span className="font-medium text-slate-900">{selected.label}</span></span>
      <ChevronDown aria-hidden="true" className={`size-4 shrink-0 text-slate-500 transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
    </button>
    {open ? <div ref={listRef} id={listId} role="listbox" aria-label={label} onKeyDown={onKeyDown}
      style={{ top: position.top, bottom: position.bottom, left: position.left, width: Math.max(width, buttonRef.current?.offsetWidth ?? 0), maxHeight: Math.min(288, position.maxHeight) }}
      className="fixed z-[60] overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
      {options.map((option) => {
        const isSelected = option.value === selected.value;
        return <div key={option.value || 'all'} role="option" tabIndex={-1} aria-selected={isSelected}
          onClick={() => { onChange(option.value); hide(true); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onChange(option.value); hide(true); } }}
          className={`flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none transition-colors hover:bg-slate-100 focus-visible:bg-slate-100 ${isSelected ? 'font-medium text-slate-950' : 'text-slate-700'}`}>
          <span className="min-w-0 flex-1 truncate" title={option.label}>{option.label}</span>
          {isSelected ? <Check aria-hidden="true" className="size-4 shrink-0 text-primary" /> : null}
        </div>;
      })}
    </div> : null}
  </>;
}

// ---------- Filters popover ----------

function Chips<T extends string>({ label, options, values, onChange }: { label: string; options: { value: T; label: string }[]; values: T[]; onChange: (values: T[]) => void }) {
  return <fieldset>
    <legend className="text-xs font-medium text-slate-600">{label}</legend>
    <div className="mt-2 flex flex-wrap gap-1.5">
      {options.map((option) => {
        const pressed = values.includes(option.value);
        return <button key={option.value} type="button" aria-pressed={pressed} onClick={() => onChange(pressed ? values.filter((item) => item !== option.value) : [...values, option.value])}
          className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${pressed ? 'border-primary bg-blue-50 font-medium text-blue-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
          {pressed ? <Check aria-hidden="true" className="size-3.5 shrink-0" /> : null}<span className="max-w-[14rem] truncate">{option.label}</span>
        </button>;
      })}
    </div>
  </fieldset>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><p className="text-xs font-medium text-slate-600">{label}</p><div className="mt-2">{children}</div></div>;
}

export function FiltersButton({ filters, sort, sortOptions, onApply }: { filters: ListFilters; sort: string; sortOptions: { value: string; label: string }[]; onApply: (filters: ListFilters, sort: string) => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const headingId = useId();
  const { open, position, show, hide } = useAnchoredPopover(buttonRef, panelRef, { width: 440, align: 'right' });
  const [draft, setDraft] = useState(filters);
  const [draftSort, setDraftSort] = useState(sort);
  const count = countFilters(filters);
  const draftCount = countFilters(draft);
  useEffect(() => { if (open) { setDraft(filters); setDraftSort(sort); panelRef.current?.querySelector<HTMLElement>('button, [tabindex="0"]')?.focus(); } }, [open, filters, sort]);
  const apply = () => { onApply(draft, draftSort); hide(true); };
  const sortLabel = sortOptions.find((option) => option.value === sort)?.label;
  return <>
    <button ref={buttonRef} type="button" onClick={() => (open ? hide() : show())} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined}
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border bg-white px-3.5 text-sm font-medium transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${count || open ? 'border-primary text-slate-950' : 'border-slate-300 text-slate-700'}`}>
      <SlidersHorizontal aria-hidden="true" className="size-4" />Filtros
      {count ? <span className="rounded-full bg-primary px-1.5 py-px text-xs font-semibold tabular-nums text-white">{count}<span className="sr-only"> ativos</span></span> : null}
      {sortLabel && sort !== sortOptions[0]?.value ? <span className="hidden max-w-[12rem] truncate border-l border-slate-200 pl-2 font-normal text-slate-600 md:inline" title={sortLabel}>{sortLabel}</span> : null}
    </button>
    {open ? <div ref={panelRef} id={panelId} role="dialog" aria-labelledby={headingId} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); hide(true); } }}
      style={{ top: position.top, bottom: position.bottom, left: position.left, maxHeight: position.maxHeight }}
      className="fixed z-50 flex w-[440px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.14)]">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <h2 id={headingId} className="text-sm font-semibold text-slate-950">Filtrar e ordenar</h2>
        <button type="button" onClick={() => hide(true)} className="flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary" aria-label="Fechar filtros"><X className="size-4" /></button>
      </div>
      <div className="scrollbar-minimal min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-4">
        <Field label="Ordenar por"><Select label="Ordenar por" value={draftSort} options={sortOptions} onChange={setDraftSort} className="w-full" width={398} /></Field>
        <div className="h-px bg-slate-100" />
        <Chips label="Situação" options={SITUATIONS} values={draft.situations} onChange={(situations) => setDraft({ ...draft, situations })} />
        <Chips label="ERP" options={ERP_OPTIONS} values={draft.erps} onChange={(erps) => setDraft({ ...draft, erps })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo de implantação"><Select label="Tipo de implantação" value={draft.flow} options={FLOW_OPTIONS} onChange={(flow) => setDraft({ ...draft, flow: flow as ListFilters['flow'] })} className="w-full" width={200} /></Field>
          <Field label="Período de criação"><Select label="Período de criação" value={draft.period} options={PERIOD_OPTIONS} onChange={(period) => setDraft({ ...draft, period: period as ListFilters['period'] })} className="w-full" width={200} /></Field>
          <Field label="AtenderBem"><Select label="AtenderBem" value={draft.atenderBem} options={ATENDERBEM_OPTIONS} onChange={(atenderBem) => setDraft({ ...draft, atenderBem: atenderBem as AtenderBemFilter })} className="w-full" width={200} /></Field>
          <Field label="IA de atendimento"><Select label="IA de atendimento" value={draft.ai} options={AI_OPTIONS} onChange={(ai) => setDraft({ ...draft, ai: ai as ListFilters['ai'] })} className="w-full" width={200} /></Field>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
        <button type="button" onClick={() => { setDraft(EMPTY_FILTERS); setDraftSort(sortOptions[0]?.value ?? draftSort); }} disabled={!draftCount && draftSort === sortOptions[0]?.value} className="text-sm font-medium text-slate-600 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default disabled:text-slate-400">Limpar tudo</button>
        <div className="flex gap-2">
          <button type="button" onClick={() => hide(true)} className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary">Cancelar</button>
          <button type="button" onClick={apply} className="inline-flex min-h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-white hover:bg-[#0f50df] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Aplicar{draftCount ? ` (${draftCount})` : ''}</button>
        </div>
      </div>
    </div> : null}
  </>;
}
