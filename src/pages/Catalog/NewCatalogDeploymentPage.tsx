import { useMemo, useState } from 'react';
import { Check, CheckCircle2, ChevronDown, ChevronUp, Eye, EyeOff, FileImage, ImagePlus, Info, Loader2, Plus, Trash2, UploadCloud } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { createDeployment, startDeployment, uploadDeploymentAsset, type AssetType, type Deployment, type GroupForm, type UnitForm } from '../../services/catalogDeployment.service';
import { getAuthSession } from '../../utils/authSession';
import { CatalogPageHeader, CatalogScreen, fieldClass, formatCnpj, labelClass, primaryButtonClass, secondaryButtonClass } from './catalogUi';

type FormErrors = Record<string, string>;
type UploadState = Record<AssetType, { state: 'idle' | 'uploading' | 'confirmed' | 'error'; fileName?: string; preview?: string; message?: string }>;

const assetDefinitions: Array<{ type: AssetType; label: string; hint: string }> = [
  { type: 'banner_1', label: 'Banner principal', hint: 'Imagem de destaque 1' },
  { type: 'banner_2', label: 'Banner secundário', hint: 'Imagem de destaque 2' },
  { type: 'banner_3', label: 'Banner complementar', hint: 'Imagem de destaque 3' },
  { type: 'logo_desktop', label: 'Logo desktop', hint: 'Versão horizontal' },
  { type: 'logo_mobile', label: 'Logo mobile', hint: 'Versão compacta' },
];

function newUnit(index = 0): UnitForm {
  return { codigo: index === 0 ? 'MATRIZ' : '', nome: '', cnpj: '', sourceUnitId: index + 1, credentialRef: '', provider: 'alpha7', pageSize: 500, validEanDropThresholdBps: 1000, initial: index === 0 };
}

function isValidCnpj(value: string) {
  const cnpj = value.replace(/\D/g, '');
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const digit = (length: number) => {
    let sum = 0;
    let weight = length - 7;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cnpj[index]) * weight;
      weight -= 1;
      if (weight === 1) weight = 9;
    }
    const result = 11 - (sum % 11);
    return result >= 10 ? 0 : result;
  };
  return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13]);
}

function validateGroup(group: GroupForm) {
  const errors: FormErrors = {};
  if (!isValidCnpj(group.cnpj)) errors.groupCnpj = 'Informe um CNPJ válido.';
  if (!group.nome.trim()) errors.groupName = 'Informe o nome do grupo.';
  else if (group.nome.trim().length > 255) errors.groupName = 'Use no máximo 255 caracteres.';
  if (!group.username.trim()) errors.username = 'Informe o usuário.';
  else if (group.username.length > 50) errors.username = 'Use no máximo 50 caracteres.';
  else if (!/^[A-Za-z0-9._-]+$/.test(group.username)) errors.username = 'Use apenas letras, números, ponto, hífen ou sublinhado, sem espaços.';
  return errors;
}

function validateUnits(units: UnitForm[]) {
  const errors: FormErrors = {};
  const codes = new Set<string>();
  const sourceIds = new Set<number>();
  if (!units.length) errors.units = 'Adicione pelo menos uma unidade.';
  if (units.filter((unit) => unit.initial).length > 1) errors.units = 'Escolha somente uma unidade inicial.';
  units.forEach((unit, index) => {
    const prefix = `unit-${index}`;
    const code = unit.codigo.trim().toLowerCase();
    if (!code) errors[`${prefix}-codigo`] = 'Informe o código.';
    else if (codes.has(code)) errors[`${prefix}-codigo`] = 'Este código já está em uso.';
    codes.add(code);
    if (!unit.nome.trim()) errors[`${prefix}-nome`] = 'Informe o nome da unidade.';
    if (!isValidCnpj(unit.cnpj)) errors[`${prefix}-cnpj`] = 'Informe um CNPJ válido.';
    if (!Number.isInteger(Number(unit.sourceUnitId)) || Number(unit.sourceUnitId) <= 0) errors[`${prefix}-source`] = 'Use um número inteiro positivo.';
    else if (sourceIds.has(Number(unit.sourceUnitId))) errors[`${prefix}-source`] = 'Este ID já está em uso.';
    sourceIds.add(Number(unit.sourceUnitId));
    try {
      const url = new URL(unit.credentialRef);
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !url.pathname.slice(1)) throw new Error();
    } catch {
      errors[`${prefix}-credential`] = 'Use uma URL PostgreSQL completa e válida.';
    }
    if (!Number.isInteger(Number(unit.pageSize)) || Number(unit.pageSize) < 1 || Number(unit.pageSize) > 500) errors[`${prefix}-pageSize`] = 'Use um valor entre 1 e 500.';
    if (!Number.isInteger(Number(unit.validEanDropThresholdBps)) || Number(unit.validEanDropThresholdBps) < 0 || Number(unit.validEanDropThresholdBps) > 10000) errors[`${prefix}-threshold`] = 'Use um valor entre 0 e 10000.';
  });
  return errors;
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1.5 text-xs font-medium text-rose-600">{message}</p> : null;
}

function Stepper({ step }: { step: number }) {
  const steps = ['Grupo', 'Unidades', 'Identidade visual'];
  return <ol className="grid grid-cols-3 border-b border-[#dbe3ef] bg-white px-5 sm:px-8">{steps.map((label, index) => { const number = index + 1; const done = number < step; const active = number === step; return <li key={label} className={`relative flex items-center gap-2.5 py-4 text-xs font-semibold sm:text-sm ${active ? 'text-primary' : done ? 'text-emerald-700' : 'text-slate-400'}`}><span className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs ${active ? 'border-primary bg-primary text-white' : done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white'}`}>{done ? <Check className="size-3.5" /> : number}</span><span className="hidden sm:inline">{label}</span>{active ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" /> : null}</li>; })}</ol>;
}

export default function NewCatalogDeploymentPage() {
  const navigate = useNavigate();
  const session = getAuthSession();
  const requestedBy = session?.username || session?.authUsername || 'Operador Unico';
  const [step, setStep] = useState(1);
  const [group, setGroup] = useState<GroupForm>({ cnpj: '', nome: '', username: '' });
  const [units, setUnits] = useState<UnitForm[]>([newUnit()]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [expanded, setExpanded] = useState(0);
  const [showCredentials, setShowCredentials] = useState<Record<number, boolean>>({});
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [uploads, setUploads] = useState<UploadState>(() => Object.fromEntries(assetDefinitions.map(({ type }) => [type, { state: 'idle' }])) as UploadState);

  const confirmedCount = deployment?.assets.filter((asset) => asset.status === 'confirmed').length ?? 0;
  const allConfirmed = confirmedCount === assetDefinitions.length;
  const groupSummary = useMemo(() => group.nome.trim() || 'Novo grupo', [group.nome]);

  function changeUnit(index: number, patch: Partial<UnitForm>) {
    setUnits((current) => current.map((unit, unitIndex) => unitIndex === index ? { ...unit, ...patch } : unit));
    setErrors({});
  }

  function chooseInitial(index: number) {
    setUnits((current) => current.map((unit, unitIndex) => ({ ...unit, initial: unitIndex === index })));
  }

  function proceedGroup(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors = validateGroup(group);
    setErrors(nextErrors);
    if (!Object.keys(nextErrors).length) setStep(2);
  }

  async function createDraft(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors = validateUnits(units);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      const firstIndex = Number(Object.keys(nextErrors).find((key) => key.startsWith('unit-'))?.split('-')[1] ?? 0);
      setExpanded(firstIndex);
      return;
    }
    setSaving(true);
    setSubmitError('');
    try {
      const normalizedUnits = units.map((unit, index) => ({ ...unit, codigo: unit.codigo.trim(), nome: unit.nome.trim(), cnpj: unit.cnpj.replace(/\D/g, ''), sourceUnitId: Number(unit.sourceUnitId), pageSize: Number(unit.pageSize), validEanDropThresholdBps: Number(unit.validEanDropThresholdBps), initial: units.some((item) => item.initial) ? unit.initial : index === 0 }));
      const created = await createDeployment({ requestedBy, group: { ...group, cnpj: group.cnpj.replace(/\D/g, ''), nome: group.nome.trim(), username: group.username.trim() }, units: normalizedUnits });
      setDeployment(created);
      setStep(3);
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : 'Não foi possível criar o rascunho.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAsset(type: AssetType, file?: File) {
    if (!file || !deployment) return;
    if (!file.type.startsWith('image/')) {
      setUploads((current) => ({ ...current, [type]: { state: 'error', fileName: file.name, message: 'Selecione um arquivo de imagem.' } }));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploads((current) => ({ ...current, [type]: { state: 'error', fileName: file.name, message: 'O arquivo deve ter no máximo 10 MB.' } }));
      return;
    }
    const preview = URL.createObjectURL(file);
    setUploads((current) => ({ ...current, [type]: { state: 'uploading', fileName: file.name, preview } }));
    try {
      const updated = await uploadDeploymentAsset(deployment.id, type, file);
      setDeployment(updated);
      setUploads((current) => ({ ...current, [type]: { state: 'confirmed', fileName: file.name, preview } }));
    } catch (caught) {
      setUploads((current) => ({ ...current, [type]: { state: 'error', fileName: file.name, preview, message: caught instanceof Error ? caught.message : 'Falha no envio.' } }));
    }
  }

  async function handleStart() {
    if (!deployment || !allConfirmed) return;
    setStarting(true);
    setSubmitError('');
    try {
      await startDeployment(deployment.id, requestedBy);
      navigate(`/main/catalogo/${deployment.id}`);
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : 'Não foi possível iniciar a implantação.');
      setStarting(false);
    }
  }

  return (
    <CatalogScreen>
      <CatalogPageHeader title="Novo catálogo" description="Configure o grupo, as unidades e a identidade visual." backTo="/main/catalogo" />
      <Stepper step={step} />
      <main className="scrollbar-minimal min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-[1200px] gap-6 px-5 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:px-10 lg:py-8">
          <section>
            {step === 1 ? <form onSubmit={proceedGroup} className="rounded-xl border border-[#dbe3ef] bg-white">
              <div className="border-b border-[#dbe3ef] px-5 py-5 sm:px-6"><p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">Etapa 1 de 3</p><h2 className="mt-1.5 text-xl font-semibold tracking-[-0.025em] text-slate-950">Dados do grupo</h2><p className="mt-1 text-sm leading-6 text-slate-500">Identifique a rede que será criada no ecossistema Unico.</p></div>
              <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
                <label className={labelClass}>CNPJ do grupo<input value={group.cnpj} onChange={(event) => { setGroup({ ...group, cnpj: formatCnpj(event.target.value) }); setErrors({}); }} className={fieldClass} inputMode="numeric" placeholder="00.000.000/0000-00" aria-invalid={Boolean(errors.groupCnpj)} /><FieldError message={errors.groupCnpj} /></label>
                <label className={labelClass}>Nome do grupo<input value={group.nome} onChange={(event) => { setGroup({ ...group, nome: event.target.value }); setErrors({}); }} className={fieldClass} maxLength={255} placeholder="Ex.: Rede Saúde" aria-invalid={Boolean(errors.groupName)} /><FieldError message={errors.groupName} /></label>
                <label className={`${labelClass} sm:col-span-2`}>Usuário de acesso<div className="relative"><span className="absolute left-3.5 top-1/2 mt-1 -translate-y-1/2 text-sm text-slate-400">@</span><input value={group.username} onChange={(event) => { setGroup({ ...group, username: event.target.value }); setErrors({}); }} className={`${fieldClass} pl-8`} maxLength={50} placeholder="rede-saude" autoCapitalize="none" aria-invalid={Boolean(errors.username)} /></div><p className="mt-1.5 text-xs text-slate-500">Letras, números, ponto, hífen e sublinhado. Não use espaços.</p><FieldError message={errors.username} /></label>
              </div>
              <div className="flex justify-end border-t border-[#dbe3ef] px-5 py-4 sm:px-6"><button type="submit" className={primaryButtonClass}>Continuar para unidades</button></div>
            </form> : null}

            {step === 2 ? <form onSubmit={(event) => void createDraft(event)}>
              <div className="rounded-xl border border-[#dbe3ef] bg-white">
                <div className="flex items-start justify-between gap-4 border-b border-[#dbe3ef] px-5 py-5 sm:px-6"><div><p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">Etapa 2 de 3</p><h2 className="mt-1.5 text-xl font-semibold tracking-[-0.025em] text-slate-950">Unidades da implantação</h2><p className="mt-1 text-sm leading-6 text-slate-500">Informe a origem dos produtos de cada unidade Alpha7.</p></div><button type="button" onClick={() => { setUnits((current) => [...current, newUnit(current.length)]); setExpanded(units.length); }} className={`${secondaryButtonClass} shrink-0`}><Plus className="size-4" /><span className="hidden sm:inline">Adicionar unidade</span></button></div>
                {errors.units ? <div className="m-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errors.units}</div> : null}
                <div className="divide-y divide-[#dbe3ef]">{units.map((unit, index) => {
                  const isOpen = expanded === index;
                  return <article key={index}>
                    <button type="button" onClick={() => setExpanded(isOpen ? -1 : index)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-50 sm:px-6"><span className="flex min-w-0 items-center gap-3"><span className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${unit.initial ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'}`}>{index + 1}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-900">{unit.nome || `Unidade ${index + 1}`}</span><span className="mt-0.5 block text-xs text-slate-500">{unit.codigo || 'Código pendente'}{unit.initial ? ' · Unidade inicial' : ''}</span></span></span>{isOpen ? <ChevronUp className="size-4 text-slate-400" /> : <ChevronDown className="size-4 text-slate-400" />}</button>
                    {isOpen ? <div className="grid gap-5 bg-slate-50/70 px-5 py-5 sm:grid-cols-2 sm:px-6">
                      <label className={labelClass}>Código da unidade<input value={unit.codigo} onChange={(event) => changeUnit(index, { codigo: event.target.value.toUpperCase() })} className={fieldClass} maxLength={100} placeholder="MATRIZ" /><FieldError message={errors[`unit-${index}-codigo`]} /></label>
                      <label className={labelClass}>Nome da unidade<input value={unit.nome} onChange={(event) => changeUnit(index, { nome: event.target.value })} className={fieldClass} maxLength={255} placeholder="Farmácia Matriz" /><FieldError message={errors[`unit-${index}-nome`]} /></label>
                      <label className={labelClass}>CNPJ da unidade<input value={unit.cnpj} onChange={(event) => changeUnit(index, { cnpj: formatCnpj(event.target.value) })} className={fieldClass} inputMode="numeric" placeholder="00.000.000/0000-00" /><FieldError message={errors[`unit-${index}-cnpj`]} /></label>
                      <label className={labelClass}>ID da unidade no Alpha7<input value={unit.sourceUnitId} onChange={(event) => changeUnit(index, { sourceUnitId: Number(event.target.value) })} className={fieldClass} type="number" min={1} step={1} /><FieldError message={errors[`unit-${index}-source`]} /></label>
                      <label className={`${labelClass} sm:col-span-2`}>Conexão PostgreSQL<div className="relative"><input value={unit.credentialRef} onChange={(event) => changeUnit(index, { credentialRef: event.target.value })} className={`${fieldClass} pr-12 font-mono text-xs`} type={showCredentials[index] ? 'text' : 'password'} autoComplete="off" spellCheck={false} placeholder="postgresql://usuario:senha@host:5432/database" /><button type="button" onClick={() => setShowCredentials((current) => ({ ...current, [index]: !current[index] }))} className="absolute right-1.5 top-1/2 mt-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" aria-label={showCredentials[index] ? 'Ocultar conexão' : 'Mostrar conexão'}>{showCredentials[index] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div><p className="mt-1.5 text-xs leading-5 text-slate-500">Codifique caracteres especiais do usuário e senha, como <code className="rounded bg-slate-200 px-1">@ → %40</code>.</p><FieldError message={errors[`unit-${index}-credential`]} /></label>
                      <label className={labelClass}>Itens por página<input value={unit.pageSize} onChange={(event) => changeUnit(index, { pageSize: Number(event.target.value) })} className={fieldClass} type="number" min={1} max={500} /><FieldError message={errors[`unit-${index}-pageSize`]} /></label>
                      <label className={labelClass}>Limite de queda de EAN (bps)<input value={unit.validEanDropThresholdBps} onChange={(event) => changeUnit(index, { validEanDropThresholdBps: Number(event.target.value) })} className={fieldClass} type="number" min={0} max={10000} /><FieldError message={errors[`unit-${index}-threshold`]} /></label>
                      <div className="flex items-center justify-between gap-4 sm:col-span-2"><label className="flex items-center gap-3 text-sm font-medium text-slate-700"><input type="radio" name="initial-unit" checked={unit.initial === true} onChange={() => chooseInitial(index)} className="size-4 accent-[#145efc]" />Unidade inicial do grupo</label>{units.length > 1 ? <button type="button" onClick={() => { setUnits((current) => { const remaining = current.filter((_, unitIndex) => unitIndex !== index); if (!remaining.some((item) => item.initial) && remaining[0]) remaining[0] = { ...remaining[0], initial: true }; return remaining; }); setExpanded(0); }} className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700"><Trash2 className="size-3.5" />Remover</button> : null}</div>
                    </div> : null}
                  </article>;
                })}</div>
                <div className="flex flex-col-reverse gap-3 border-t border-[#dbe3ef] px-5 py-4 sm:flex-row sm:justify-between sm:px-6"><button type="button" onClick={() => setStep(1)} className={secondaryButtonClass}>Voltar</button><button type="submit" disabled={saving} className={primaryButtonClass}>{saving ? <Loader2 className="size-4 animate-spin" /> : null}{saving ? 'Criando rascunho…' : 'Criar rascunho e continuar'}</button></div>
              </div>
            </form> : null}

            {step === 3 && deployment ? <div className="rounded-xl border border-[#dbe3ef] bg-white">
              <div className="border-b border-[#dbe3ef] px-5 py-5 sm:px-6"><p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">Etapa 3 de 3</p><h2 className="mt-1.5 text-xl font-semibold tracking-[-0.025em] text-slate-950">Identidade visual</h2><p className="mt-1 text-sm leading-6 text-slate-500">Envie as cinco imagens obrigatórias. O upload é feito diretamente para o storage seguro.</p></div>
              <div className="m-5 flex gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800 sm:m-6"><Info className="mt-0.5 size-4 shrink-0" /><p>O rascunho foi criado. Os dados não podem ser editados nesta etapa; para alterá-los, cancele e crie uma nova implantação.</p></div>
              <div className="grid gap-4 px-5 pb-6 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">{assetDefinitions.map(({ type, label, hint }) => {
                const upload = uploads[type];
                const confirmed = deployment.assets.find((asset) => asset.type === type)?.status === 'confirmed';
                return <label key={type} className={`group relative flex min-h-44 cursor-pointer flex-col overflow-hidden rounded-xl border-2 border-dashed p-4 transition ${confirmed ? 'border-emerald-300 bg-emerald-50/40' : upload.state === 'error' ? 'border-rose-300 bg-rose-50/40' : 'border-slate-300 bg-slate-50 hover:border-primary hover:bg-blue-50/40'}`}>
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={upload.state === 'uploading'} onChange={(event) => void handleAsset(type, event.target.files?.[0])} />
                  {upload.preview ? <img src={upload.preview} alt="" className="absolute inset-0 size-full object-cover opacity-[0.12]" /> : null}
                  <span className={`relative flex size-10 items-center justify-center rounded-lg ${confirmed ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-500 shadow-sm'}`}>{upload.state === 'uploading' ? <Loader2 className="size-5 animate-spin" /> : confirmed ? <CheckCircle2 className="size-5" /> : <ImagePlus className="size-5" />}</span>
                  <span className="relative mt-auto pt-6"><span className="block text-sm font-semibold text-slate-900">{label}</span><span className="mt-1 block text-xs text-slate-500">{confirmed ? upload.fileName || 'Arquivo confirmado' : upload.state === 'uploading' ? 'Enviando e confirmando…' : hint}</span>{upload.message ? <span className="mt-1 block text-xs font-medium text-rose-600">{upload.message}</span> : null}</span>
                </label>;
              })}</div>
              <div className="flex flex-col gap-3 border-t border-[#dbe3ef] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-slate-600"><FileImage className="size-4" /><strong className="font-semibold text-slate-900">{confirmedCount} de 5</strong> arquivos confirmados</div><div className="flex flex-col-reverse gap-3 sm:flex-row"><Link to={`/main/catalogo/${deployment.id}`} className={secondaryButtonClass}>Continuar depois</Link><button type="button" onClick={() => void handleStart()} disabled={!allConfirmed || starting} className={primaryButtonClass}>{starting ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}{starting ? 'Iniciando…' : 'Iniciar implantação'}</button></div></div>
            </div> : null}

            {submitError ? <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{submitError}</div> : null}
          </section>

          <aside className="h-fit rounded-xl border border-[#dbe3ef] bg-white p-5 lg:sticky lg:top-6">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Resumo</p><h2 className="mt-2 text-lg font-semibold tracking-[-0.025em] text-slate-950">{groupSummary}</h2><p className="mt-1 text-sm text-slate-500">{group.cnpj ? formatCnpj(group.cnpj) : 'CNPJ ainda não informado'}</p>
            <dl className="mt-5 divide-y divide-slate-200 border-y border-slate-200 text-sm"><div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">Usuário</dt><dd className="truncate font-medium text-slate-800">{group.username ? `@${group.username}` : '—'}</dd></div><div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">Unidades</dt><dd className="font-medium text-slate-800">{units.length}</dd></div><div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">Provedor</dt><dd className="font-medium text-slate-800">Alpha7</dd></div><div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">Publicação</dt><dd className="font-medium text-slate-800">Shadow</dd></div></dl>
            <div className="mt-5 rounded-lg bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-700">Como funciona</p><ol className="mt-3 space-y-2.5 text-xs leading-5 text-slate-500"><li className="flex gap-2"><span className="font-semibold text-primary">1.</span>O catálogo é validado no Hub.</li><li className="flex gap-2"><span className="font-semibold text-primary">2.</span>Os tenants são preparados sem publicação.</li><li className="flex gap-2"><span className="font-semibold text-primary">3.</span>A ativação acontece após sua revisão.</li></ol></div>
          </aside>
        </div>
      </main>
    </CatalogScreen>
  );
}
