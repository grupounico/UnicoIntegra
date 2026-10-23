import { API_BASE } from './api';
import { atenderBemHeaders } from './atenderBemSession';

export const CATALOG_ASSET_DEFINITIONS = Object.freeze([
  { type: 'banner_1', label: 'Banner principal', hint: 'Imagem de destaque 1' },
  { type: 'banner_2', label: 'Banner secundário', hint: 'Imagem de destaque 2' },
  { type: 'banner_3', label: 'Banner complementar', hint: 'Imagem de destaque 3' },
  { type: 'banner_mobile_1', label: 'Banner principal mobile', hint: 'Destaque 1 · 2000×800' },
  { type: 'banner_mobile_2', label: 'Banner secundário mobile', hint: 'Destaque 2 · 2000×800' },
  { type: 'banner_mobile_3', label: 'Banner complementar mobile', hint: 'Destaque 3 · 2000×800' },
  { type: 'logo_desktop', label: 'Logo desktop', hint: 'Versão horizontal' },
  { type: 'logo_mobile', label: 'Logo mobile', hint: 'Versão compacta' },
] as const);

export type AssetType = typeof CATALOG_ASSET_DEFINITIONS[number]['type'];

export type CatalogFlowMode = 'full' | 'hub_banco_only';
export type CatalogErpId = 1 | 2 | 3 | 4;
export type CatalogProvider = 'alpha7' | 'linx' | 'automatiza' | 'vetor';

export const CATALOG_ERPS = Object.freeze([
  { id: 1 as const, provider: 'alpha7' as const, name: 'Alpha7', databaseDriver: 'postgres' as const, databaseName: 'PostgreSQL', sourceUnitLabel: 'ID da unidade no Alpha7', publicationMode: 'automatic' as const },
  { id: 2 as const, provider: 'linx' as const, name: 'Linx', databaseDriver: null, databaseName: null, sourceUnitLabel: null, publicationMode: 'shadow' as const },
  { id: 3 as const, provider: 'automatiza' as const, name: 'Automatiza', databaseDriver: 'mysql' as const, databaseName: 'MySQL', sourceUnitLabel: 'ID da loja no Automatiza (shop_id)', publicationMode: 'shadow' as const },
  { id: 4 as const, provider: 'vetor' as const, name: 'Vetor', databaseDriver: null, databaseName: null, sourceUnitLabel: 'Código da filial no Vetor (cdFilial)', publicationMode: 'shadow' as const },
]);

export function catalogErp(erpId: CatalogErpId | null | undefined, provider?: CatalogProvider) {
  return CATALOG_ERPS.find((erp) => erp.id === erpId) || CATALOG_ERPS.find((erp) => erp.provider === provider);
}

export function catalogErpName(erpId: CatalogErpId | null | undefined, provider?: CatalogProvider) {
  return catalogErp(erpId, provider)?.name || 'ERP desconhecido';
}

export type DeploymentStatus =
  | 'draft'
  | 'queued'
  | 'provisioning_hub'
  | 'validating_hub_catalog'
  | 'provisioning_unicommerce'
  | 'validating_unicommerce'
  | 'importing_banco_unico'
  | 'waiting_storefront_release'
  | 'waiting_storefront'
  | 'awaiting_activation'
  | 'completed'
  | 'partially_failed'
  | 'failed'
  | 'monitoring_timeout'
  | 'reconciliation_required'
  | 'cancelled';

export type UnitStatus =
  | 'pending'
  | 'hub_unit_created'
  | 'integration_created'
  | 'scheduled'
  | 'running'
  | 'shadow_ready'
  | 'activating_shadow'
  | 'catalog_active'
  | 'unicommerce_tenant_created'
  | 'unicommerce_ready'
  | 'banco_unico_importing'
  | 'banco_unico_ready'
  | 'awaiting_activation'
  | 'active'
  | 'failed'
  | 'reconciliation_required';

export interface GroupForm {
  cnpj: string;
  nome: string;
  username: string;
}

export interface UnitForm {
  codigo: string;
  nome: string;
  cnpj: string;
  erpId: CatalogErpId;
  sourceUnitId: number | null;
  credentialRef: string;
  vetorApiKey: string;
  orderWebhookUrl: string;
  provider?: CatalogProvider;
  pageSize?: number;
  validEanDropThresholdBps?: number;
  slug?: string;
  initial?: boolean;
}

export interface DeploymentUnit {
  atenderBemConfig?: AtenderBemConfiguration | null;
  storefrontDomain?: string | null;
  id: string;
  deploymentId: string;
  code: string;
  name: string;
  cnpj: string;
  slug: string;
  isInitial: boolean;
  erpId: CatalogErpId;
  provider: CatalogProvider;
  sourceUnitId: number | null;
  publicationMode: 'shadow' | 'automatic';
  pageSize: number;
  validEanDropThresholdBps: number;
  hasCredential: boolean;
  hasOrderWebhookUrl: boolean;
  status: UnitStatus;
  hubSellerUnitId: string | null;
  hubIntegrationId: string | null;
  latestRunId: string | null;
  latestRunStatus: string | null;
  latestProcessedRows?: number | null;
  latestValidRows: number | null;
  latestPublishedRows?: number | null;
  latestRunScheduledAt?: string | null;
  latestRunStartedAt?: string | null;
  latestRunFinishedAt: string | null;
  latestRunPolledAt?: string | null;
  nextRunPollAt?: string | null;
  monitoringDelayedAt?: string | null;
  hubRun?: {
    runId: string;
    status: string | null;
    upstreamStatus: string | null;
    processedRows: number | null;
    validRows: number | null;
    publishedRows: number | null;
    scheduledAt: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    lastPolledAt: string | null;
    nextPollAt: string | null;
    delayedAt: string | null;
  } | null;
  unicommerceTenantId: string | null;
  storefrontUrl?: string | null;
  storefrontStatus?: string | null;
  clientId: number | null;
  bancoUnicoImportJobId: number | null;
  coveragePercent?: number | null;
  coveragePublished?: number | null;
  coverageErrors?: number | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  retryable: boolean;
}

export interface DeploymentAi {
  modality: 'venda';
  status: 'creating' | 'created' | 'failed';
  instance: string;
  name: string;
  signatureName: string;
  productsGroupId: number;
  assistantId?: number | null;
  supportFlows?: Record<string, string | null>;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

export interface AtenderBemConfiguration {
  version: number;
  ai?: DeploymentAi;
  status: 'configured' | 'creating_group' | 'group_ready' | 'group_creation_unknown';
  import?: { status: string; jobId?: number; fileId?: number; bytes?: number; total?: number; processed?: number; created?: number; updated?: number; errors?: number; reindexMarked?: number };
  mcpUrl: string;
  feedBaseUrl: string;
  feedUnitId: number;
  feedAuth: 'bearer' | 'api-key';
  groupMode: 'create' | 'existing';
  groupName: string;
  groupId: number | null;
  hasMcpKey: boolean;
  hasFeedKey: boolean;
  source: 'meta';
  missingPolicy: 'ignore';
  filePolicy: 'replace';
  refreshHours: number;
  executionEnabled: false;
  updatedAt: string;
}

export interface AtenderBemConfigurationInput {
  mcpUrl: string;
  mcpKey: string;
  feedKey: string;
  feedAuth: 'bearer' | 'api-key';
  groupMode: 'create' | 'existing';
  groupName: string;
  groupId: string;
}

export interface DeploymentAsset {
  id: string;
  deploymentId: string;
  type: AssetType;
  uploadId: string | null;
  objectKey: string | null;
  publicUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  checksumSha256: string | null;
  width: number | null;
  height: number | null;
  status: 'pending' | 'uploading' | 'confirmed' | 'failed';
  createdAt?: string;
  updatedAt?: string;
}

export interface DeploymentEvent {
  id: string;
  deploymentId: string;
  unitId: string | null;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  safeMetadata?: Record<string, unknown> | null;
  createdBy: string | null;
  createdAt: string;
}

export interface Deployment {
  id: string;
  idempotencyKey: string;
  groupCnpj: string;
  groupName: string;
  username: string;
  flowMode: CatalogFlowMode;
  status: DeploymentStatus;
  currentStage: string | null;
  requestedBy: string;
  correlationId: string | null;
  hubSellerId: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  retryable: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  activatedAt: string | null;
  activatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  units: DeploymentUnit[];
  assets: DeploymentAsset[];
  events: DeploymentEvent[];
}

export interface DeploymentError {
  code: string;
  message: string;
  stage: string | null;
  deploymentId: string | null;
  unitId: string | null;
  retryable: boolean;
  action: string | null;
}

export interface SellerAccessToken {
  token: string;
  hubSellerId: string;
  header: 'X-API-Key';
}

export interface PaginatedDeployments {
  data: Deployment[];
  meta: { page: number; pageSize: number; totalItems: number; totalPages: number; summary?: { inProgress: number; awaitingAction: number; completed: number } };
}

export interface CreateDeploymentPayload {
  requestedBy: string;
  flowMode: CatalogFlowMode;
  group: GroupForm;
  units: Array<Omit<UnitForm, 'sourceUnitId' | 'credentialRef' | 'vetorApiKey'> & {
    sourceUnitId?: number | null;
    credentialRef?: string;
    vetorApiKey?: string;
  }>;
}

export type AddDeploymentUnitPayload = {
  requestedBy: string;
} & CreateDeploymentPayload['units'][number];

export interface UpdateDeploymentUnitPayload {
  requestedBy: string;
  codigo?: string;
  nome?: string;
  cnpj?: string;
  sourceUnitId?: number;
  credentialRef?: string;
  vetorApiKey?: string;
  orderWebhookUrl?: string;
  pageSize?: number;
  validEanDropThresholdBps?: number;
}

const MOCK_STORAGE_KEY = 'unico-catalog-deployments-v2';

export const CATALOG_DEMO_MODE = import.meta.env.VITE_CATALOG_MOCK === 'true'
  || (import.meta.env.DEV && !import.meta.env.VITE_URLBASE);

export class CatalogApiError extends Error {
  details: DeploymentError;

  constructor(details: DeploymentError) {
    super(details.message);
    this.name = 'CatalogApiError';
    this.details = details;
  }
}

function uuid() {
  return crypto.randomUUID();
}

function jsonHeaders(mutable = false) {
  return {
    'Content-Type': 'application/json',
    'X-Correlation-Id': uuid(),
    ...(mutable ? { 'Idempotency-Key': uuid() } : {}),
  };
}

async function request<T>(path: string, options: RequestInit = {}, mutable = false): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { ...jsonHeaders(mutable), ...options.headers },
  });

  const body = await response.json().catch(() => null) as T | DeploymentError | null;
  if (!response.ok) {
    const fallback: DeploymentError = {
      code: 'REQUEST_FAILED',
      message: 'Não foi possível concluir a solicitação.',
      stage: null,
      deploymentId: null,
      unitId: null,
      retryable: response.status >= 500,
      action: 'Tente novamente ou confirme a disponibilidade da API.',
    };
    throw new CatalogApiError((body && typeof body === 'object' && 'code' in body ? body : fallback) as DeploymentError);
  }
  return body as T;
}

export async function getAtenderBemSettings(): Promise<{ feedBaseUrl: string; feedUnitIdSource: 'saved' | 'hubSellerUnitId' | 'sourceUnitId' }> {
  return request('/api/v1/deployments/atenderbem/settings');
}

export async function saveAtenderBemConfiguration(deploymentId: string, unitId: string, input: AtenderBemConfigurationInput, requestedBy: string): Promise<AtenderBemConfiguration> {
  if (CATALOG_DEMO_MODE) throw new Error('Para salvar credenciais, use o Integra conectado ao backend.');
  return request(`/api/v1/deployments/${deploymentId}/units/${unitId}/atenderbem`, { method: 'PUT', headers: atenderBemHeaders(), body: JSON.stringify({ ...input, requestedBy }) });
}

function makeUnit(deploymentId: string, input: CreateDeploymentPayload['units'][number]): DeploymentUnit {
  const slugBase = input.slug || `${input.nome}-${input.codigo}`;
  const erp = CATALOG_ERPS.find((item) => item.id === input.erpId) || CATALOG_ERPS[0];
  return {
    id: uuid(), deploymentId, code: input.codigo, name: input.nome, cnpj: input.cnpj.replace(/\D/g, ''),
    slug: slugBase.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    isInitial: input.initial === true, erpId: erp.id, provider: erp.provider, sourceUnitId: erp.sourceUnitLabel ? input.sourceUnitId ?? null : null,
    publicationMode: erp.publicationMode, pageSize: erp.id === 2 ? 500 : input.pageSize ?? 500,
    validEanDropThresholdBps: erp.id === 2 ? 1000 : input.validEanDropThresholdBps ?? 1000,
    hasCredential: Boolean(erp.databaseDriver ? input.credentialRef : erp.id === 4 && input.vetorApiKey), hasOrderWebhookUrl: Boolean(input.orderWebhookUrl), status: 'pending',
    hubSellerUnitId: null, hubIntegrationId: null, latestRunId: null, latestRunStatus: null,
    latestValidRows: null, latestRunFinishedAt: null, unicommerceTenantId: null, clientId: null,
    bancoUnicoImportJobId: null, lastErrorCode: null, lastErrorMessage: null, retryable: false,
  };
}

function assetsFor(deploymentId: string, confirmed = false): DeploymentAsset[] {
  return CATALOG_ASSET_DEFINITIONS.map(({ type }) => ({
    id: uuid(), deploymentId, type, uploadId: confirmed ? `upload-${type}` : null,
    objectKey: confirmed ? `demo/${deploymentId}/${type}.png` : null, publicUrl: null,
    mimeType: confirmed ? 'image/png' : null, sizeBytes: confirmed ? 128000 : null,
    checksumSha256: confirmed ? 'a'.repeat(64) : null, width: null, height: null,
    status: confirmed ? 'confirmed' : 'pending',
  }));
}

function demoDeployment(input: {
  name: string; username: string; cnpj: string; status: DeploymentStatus; ageHours: number;
  unitNames: string[]; error?: { code: string; message: string; retryable: boolean };
}): Deployment {
  const id = uuid();
  const createdAt = new Date(Date.now() - input.ageHours * 3_600_000).toISOString();
  const units = input.unitNames.map((name, index) => makeUnit(id, {
    codigo: index === 0 ? 'MATRIZ' : `FILIAL-${index}`, nome: name, cnpj: input.cnpj,
    erpId: 1, sourceUnitId: index + 1, credentialRef: 'postgresql://demo:demo@localhost:5432/catalogo',
    orderWebhookUrl: `https://pedidos.example.com/webhooks/${index + 1}`, initial: index === 0,
  }));
  units.forEach((unit) => {
    unit.status = input.status === 'completed' ? 'active'
      : input.status === 'awaiting_activation' ? 'awaiting_activation'
        : input.status === 'failed' ? 'failed' : 'running';
    unit.latestValidRows = input.status === 'awaiting_activation' || input.status === 'completed' ? 12840 + (unit.sourceUnitId || 0) * 761 : null;
    unit.unicommerceTenantId = input.status === 'awaiting_activation' || input.status === 'completed' ? `tenant-${unit.sourceUnitId || unit.id}` : null;
    if (input.error) {
      unit.lastErrorCode = input.error.code;
      unit.lastErrorMessage = input.error.message;
      unit.retryable = input.error.retryable;
    }
  });
  const eventStatuses = input.status === 'failed'
    ? ['draft', 'queued', 'provisioning_hub', 'failed']
    : input.status === 'awaiting_activation'
      ? ['draft', 'queued', 'provisioning_hub', 'validating_hub_catalog', 'provisioning_unicommerce', 'importing_banco_unico', 'awaiting_activation']
      : ['draft', 'queued', 'provisioning_hub'];
  return {
    id, idempotencyKey: uuid(), groupCnpj: input.cnpj, groupName: input.name, username: input.username, flowMode: 'full',
    status: input.status, currentStage: input.status, requestedBy: 'Operador Unico', correlationId: uuid(),
    hubSellerId: input.status === 'draft' ? null : String(900000 + input.ageHours),
    lastErrorCode: input.error?.code ?? null, lastErrorMessage: input.error?.message ?? null,
    retryable: input.error?.retryable ?? false, startedAt: input.status === 'draft' || input.status === 'provisioning_hub' ? null : createdAt,
    finishedAt: input.status === 'completed' || input.status === 'failed' ? new Date(new Date(createdAt).getTime() + 900000).toISOString() : null,
    activatedAt: input.status === 'completed' ? new Date(new Date(createdAt).getTime() + 900000).toISOString() : null,
    activatedBy: input.status === 'completed' ? 'Operador Unico' : null, createdAt, updatedAt: new Date().toISOString(),
    units, assets: assetsFor(id, true),
    events: eventStatuses.map((status, index) => ({
      id: uuid(), deploymentId: id, unitId: null, eventType: status === 'draft' ? 'deployment_created' : `deployment_${status}`,
      fromStatus: index ? eventStatuses[index - 1] : null, toStatus: status, createdBy: 'Operador Unico',
      createdAt: new Date(new Date(createdAt).getTime() + index * 120000).toISOString(),
    })),
  };
}

function seedMocks(): Deployment[] {
  return [
    demoDeployment({ name: 'Rede Saúde Integral', username: 'rede-saude', cnpj: '11222333000181', status: 'awaiting_activation', ageHours: 3, unitNames: ['Farmácia Matriz', 'Unidade Centro'] }),
    demoDeployment({ name: 'Drogaria Horizonte', username: 'drogaria-horizonte', cnpj: '27865757000102', status: 'provisioning_hub', ageHours: 1, unitNames: ['Loja Principal'] }),
    demoDeployment({ name: 'Grupo Bem-Estar', username: 'grupo-bem-estar', cnpj: '45972345000150', status: 'failed', ageHours: 28, unitNames: ['Matriz'], error: { code: 'HUB_EMPTY_CATALOG', message: 'A carga do Hub terminou sem itens válidos.', retryable: false } }),
  ];
}

function readMocks() {
  const raw = localStorage.getItem(MOCK_STORAGE_KEY);
  if (raw) return (JSON.parse(raw) as Deployment[]).map((deployment) => {
    if (deployment.flowMode !== 'full') return deployment;
    const existing = deployment.assets;
    const missing = assetsFor(deployment.id).filter((asset) => !existing.some((current) => current.type === asset.type));
    return missing.length ? { ...deployment, assets: [...existing, ...missing] } : deployment;
  });
  const seeded = seedMocks();
  localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

function writeMocks(deployments: Deployment[]) {
  localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(deployments));
}

function evolveMock(deployment: Deployment): Deployment {
  if (!deployment.startedAt || !['queued', 'provisioning_hub', 'validating_hub_catalog', 'provisioning_unicommerce', 'importing_banco_unico'].includes(deployment.status)) return deployment;
  const elapsed = (Date.now() - new Date(deployment.startedAt).getTime()) / 1000;
  const next: DeploymentStatus = deployment.flowMode === 'hub_banco_only'
    ? elapsed < 2 ? 'queued' : elapsed < 5 ? 'provisioning_hub' : elapsed < 8 ? 'validating_hub_catalog' : elapsed < 14 ? 'importing_banco_unico' : 'completed'
    : elapsed < 2 ? 'queued' : elapsed < 5 ? 'provisioning_hub' : elapsed < 8 ? 'validating_hub_catalog' : elapsed < 11 ? 'provisioning_unicommerce' : elapsed < 14 ? 'importing_banco_unico' : 'awaiting_activation';
  if (next === deployment.status) return deployment;
  const updated = { ...deployment, status: next, currentStage: next, updatedAt: new Date().toISOString() };
  updated.units = deployment.units.map((unit) => ({ ...unit, status: next === 'completed' && deployment.flowMode === 'hub_banco_only' ? 'banco_unico_ready' : next === 'awaiting_activation' ? 'awaiting_activation' : next === 'importing_banco_unico' ? 'banco_unico_importing' : next === 'provisioning_unicommerce' ? 'unicommerce_tenant_created' : 'running', latestValidRows: ['awaiting_activation', 'completed'].includes(next) ? 13601 : unit.latestValidRows, coveragePercent: next === 'completed' && deployment.flowMode === 'hub_banco_only' ? 100 : unit.coveragePercent, unicommerceTenantId: next === 'awaiting_activation' ? `tenant-${unit.id}` : unit.unicommerceTenantId }));
  updated.events = [...deployment.events, { id: uuid(), deploymentId: deployment.id, unitId: null, eventType: `deployment_${next}`, fromStatus: deployment.status, toStatus: next, createdBy: 'Sistema', createdAt: new Date().toISOString() }];
  return updated;
}

function mockUpdate(id: string, updater: (deployment: Deployment) => Deployment) {
  const deployments = readMocks();
  const index = deployments.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('Implantação não encontrada.');
  const current = deployments[index];
  if (!current) throw new Error('Implantação não encontrada.');
  const updated = updater(current);
  deployments[index] = updated;
  writeMocks(deployments);
  return updated;
}

function deploymentSummary(data: Deployment[]) {
  return { inProgress: data.filter((item) => ['queued', 'provisioning_hub', 'validating_hub_catalog', 'provisioning_unicommerce', 'validating_unicommerce', 'importing_banco_unico', 'waiting_storefront_release', 'waiting_storefront'].includes(item.status)).length, awaitingAction: data.filter((item) => ['awaiting_activation', 'reconciliation_required', 'monitoring_timeout'].includes(item.status)).length, completed: data.filter((item) => item.status === 'completed').length };
}

export async function listDeployments(params: { page?: number; pageSize?: number; status?: string; cnpj?: string; search?: string } = {}): Promise<PaginatedDeployments> {
  if (!CATALOG_DEMO_MODE) {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== '').map(([key, value]) => [key, String(value)]));
    const response = await request<PaginatedDeployments>(`/api/v1/deployments?${query}`);
    if (response.meta.summary) return response;
    const summaryQuery = new URLSearchParams(query); summaryQuery.set('pageSize', '100');
    const fetchSummaryPage = (page: number) => { const pageQuery = new URLSearchParams(summaryQuery); pageQuery.set('page', String(page)); return request<PaginatedDeployments>(`/api/v1/deployments?${pageQuery}`); };
    const allPages = await fetchSummaryPage(1);
    const pages = await Promise.all(Array.from({ length: Math.ceil(allPages.meta.totalItems / 100) - 1 }, (_, index) => fetchSummaryPage(index + 2)));
    return { ...response, meta: { ...response.meta, summary: deploymentSummary([...(allPages.data || []), ...pages.flatMap((item) => item.data || [])]) } };
  }
  let data = readMocks().map(evolveMock);
  writeMocks(data);
  if (params.status) data = data.filter((item) => item.status === params.status);
  if (params.cnpj) data = data.filter((item) => item.groupCnpj.includes(params.cnpj!.replace(/\D/g, '')));
  if (params.search) {
    const search = params.search.toLowerCase();
    data = data.filter((item) => item.groupName.toLowerCase().includes(search) || item.username.toLowerCase().includes(search));
  }
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const summary = deploymentSummary(data);
  return { data: data.slice((page - 1) * pageSize, page * pageSize), meta: { page, pageSize, totalItems: data.length, totalPages: Math.max(1, Math.ceil(data.length / pageSize)), summary } };
}

export async function getDeployment(id: string): Promise<Deployment> {
  if (!CATALOG_DEMO_MODE) return request(`/api/v1/deployments/${id}`);
  return mockUpdate(id, evolveMock);
}

export async function revealDeploymentSellerToken(id: string, requestedBy: string): Promise<SellerAccessToken> {
  if (!CATALOG_DEMO_MODE) {
    return request(`/api/v1/deployments/${id}/seller-token`, {
      method: 'POST',
      body: JSON.stringify({ requestedBy }),
    }, true);
  }
  return { token: `hub_demo_${id.replace(/-/g, '').slice(0, 24)}`, hubSellerId: 'demo', header: 'X-API-Key' };
}

export async function createDeployment(payload: CreateDeploymentPayload): Promise<Deployment> {
  if (!CATALOG_DEMO_MODE) return request('/api/v1/deployments', { method: 'POST', body: JSON.stringify(payload) }, true);
  const id = uuid();
  const now = new Date().toISOString();
  const deployment: Deployment = {
    id, idempotencyKey: uuid(), groupCnpj: payload.group.cnpj.replace(/\D/g, ''), groupName: payload.group.nome,
    username: payload.group.username, flowMode: payload.flowMode, status: 'draft', currentStage: null, requestedBy: payload.requestedBy,
    correlationId: uuid(), hubSellerId: null, lastErrorCode: null, lastErrorMessage: null, retryable: false,
    startedAt: null, finishedAt: null, activatedAt: null, activatedBy: null, createdAt: now, updatedAt: now,
    units: payload.units.map((unit) => makeUnit(id, unit)), assets: payload.flowMode === 'full' ? assetsFor(id) : [],
    events: [{ id: uuid(), deploymentId: id, unitId: null, eventType: 'deployment_created', fromStatus: null, toStatus: 'draft', createdBy: payload.requestedBy, createdAt: now }],
  };
  const deployments = readMocks();
  deployments.unshift(deployment);
  writeMocks(deployments);
  return deployment;
}

export async function addDeploymentUnit(id: string, payload: AddDeploymentUnitPayload): Promise<Deployment> {
  if (!CATALOG_DEMO_MODE) return request(`/api/v1/deployments/${id}/units`, { method: 'POST', body: JSON.stringify(payload) }, true);
  return mockUpdate(id, (deployment) => {
    if (deployment.units.some((unit) => unit.code.toLowerCase() === payload.codigo.trim().toLowerCase())) {
      throw new Error('Este código já está em uso por outra unidade do grupo.');
    }
    const now = new Date().toISOString();
    const unit = makeUnit(id, { ...payload, initial: false });
    const requeue = deployment.status !== 'draft';
    return {
      ...deployment,
      units: [...deployment.units, unit],
      status: requeue ? 'queued' : 'draft',
      currentStage: requeue ? 'queued' : deployment.currentStage,
      startedAt: requeue ? deployment.startedAt || now : deployment.startedAt,
      finishedAt: requeue ? null : deployment.finishedAt,
      lastErrorCode: requeue ? null : deployment.lastErrorCode,
      lastErrorMessage: requeue ? null : deployment.lastErrorMessage,
      updatedAt: now,
      events: [...deployment.events, {
        id: uuid(), deploymentId: id, unitId: unit.id, eventType: 'unit_added',
        fromStatus: null, toStatus: 'pending', createdBy: payload.requestedBy, createdAt: now,
      }],
    };
  });
}

export async function updateDeploymentUnit(id: string, unitId: string, payload: UpdateDeploymentUnitPayload): Promise<Deployment> {
  if (!CATALOG_DEMO_MODE) return request(`/api/v1/deployments/${id}/units/${unitId}`, { method: 'PATCH', body: JSON.stringify(payload) }, true);
  return mockUpdate(id, (deployment) => {
    const now = new Date().toISOString();
    const updatedUnits = deployment.units.map((unit) => {
      if (unit.id !== unitId) return unit;
      const hubConfigurationChanged = Boolean(payload.credentialRef || payload.vetorApiKey)
        || (payload.pageSize !== undefined && payload.pageSize !== unit.pageSize)
        || (payload.validEanDropThresholdBps !== undefined && payload.validEanDropThresholdBps !== unit.validEanDropThresholdBps);
      return {
        ...unit,
        code: payload.codigo ?? unit.code,
        name: payload.nome ?? unit.name,
        cnpj: payload.cnpj?.replace(/\D/g, '') ?? unit.cnpj,
        sourceUnitId: payload.sourceUnitId ?? unit.sourceUnitId,
        pageSize: payload.pageSize ?? unit.pageSize,
        validEanDropThresholdBps: payload.validEanDropThresholdBps ?? unit.validEanDropThresholdBps,
        hasCredential: payload.credentialRef || payload.vetorApiKey ? true : unit.hasCredential,
        hasOrderWebhookUrl: payload.orderWebhookUrl ? true : unit.hasOrderWebhookUrl,
        status: hubConfigurationChanged && unit.hubIntegrationId ? 'integration_created' as UnitStatus : unit.status === 'failed' ? (payload.orderWebhookUrl && unit.hubIntegrationId && (unit.unicommerceTenantId || Number(unit.latestValidRows || 0) > 0) ? 'catalog_active' : unit.hubIntegrationId ? 'scheduled' : unit.hubSellerUnitId ? 'hub_unit_created' : 'pending') : unit.status,
        latestRunId: hubConfigurationChanged ? null : unit.latestRunId,
        latestRunStatus: hubConfigurationChanged ? null : unit.latestRunStatus,
        latestValidRows: hubConfigurationChanged ? null : unit.latestValidRows,
        latestRunFinishedAt: hubConfigurationChanged ? null : unit.latestRunFinishedAt,
        lastErrorCode: null,
        lastErrorMessage: null,
        retryable: false,
      };
    });
    return {
      ...deployment,
      units: updatedUnits,
      retryable: true,
      updatedAt: now,
      events: [...deployment.events, { id: uuid(), deploymentId: id, unitId, eventType: 'unit_configuration_updated', fromStatus: deployment.units.find((unit) => unit.id === unitId)?.status ?? null, toStatus: updatedUnits.find((unit) => unit.id === unitId)?.status ?? null, safeMetadata: { valuesProtected: Boolean(payload.credentialRef || payload.vetorApiKey || payload.orderWebhookUrl) }, createdBy: payload.requestedBy, createdAt: now }],
    };
  });
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function uploadDeploymentAsset(deploymentId: string, type: AssetType, file: File): Promise<Deployment> {
  const checksumSha256 = await sha256(file);
  if (CATALOG_DEMO_MODE) {
    return mockUpdate(deploymentId, (deployment) => {
      if (deployment.flowMode !== 'full') throw new Error('O fluxo somente catálogo não utiliza imagens.');
      const current = deployment.assets.find((asset) => asset.type === type);
      const template = current ?? assetsFor(deploymentId).find((asset) => asset.type === type);
      if (!template) throw new Error('Tipo de imagem não reconhecido.');
      const confirmed: DeploymentAsset = { ...template, status: 'confirmed', uploadId: `upload-${uuid()}`, objectKey: `demo/${deploymentId}/${file.name}`, mimeType: file.type, sizeBytes: file.size, checksumSha256 };
      return {
        ...deployment,
        assets: current ? deployment.assets.map((asset) => asset.type === type ? confirmed : asset) : [...deployment.assets, confirmed],
        updatedAt: new Date().toISOString(),
      };
    });
  }
  const presigned = await request<{ assets: Array<{ type: AssetType; uploadId: string; objectKey: string; uploadUrl: string }> }>(`/api/v1/deployments/${deploymentId}/assets/presign`, { method: 'POST', body: JSON.stringify({ assets: [{ type, mimeType: file.type, sizeBytes: file.size }] }) }, true);
  const target = presigned.assets.find((asset) => asset.type === type);
  if (!target) throw new Error('O storage não retornou uma URL para este arquivo.');
  const upload = await fetch(target.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!upload.ok) throw new Error('O envio do arquivo para o storage falhou.');
  return request(`/api/v1/deployments/${deploymentId}/assets/confirm`, { method: 'POST', body: JSON.stringify({ type, uploadId: target.uploadId, checksumSha256 }) }, true);
}

export async function startDeployment(id: string, requestedBy: string) {
  if (!CATALOG_DEMO_MODE) return request<Deployment>(`/api/v1/deployments/${id}/start`, { method: 'POST', body: JSON.stringify({ requestedBy }) }, true);
  return mockUpdate(id, (deployment) => ({ ...deployment, status: 'queued', currentStage: 'queued', startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), events: [...deployment.events, { id: uuid(), deploymentId: id, unitId: null, eventType: 'deployment_queued', fromStatus: deployment.status, toStatus: 'queued', createdBy: requestedBy, createdAt: new Date().toISOString() }] }));
}

export async function refreshDeploymentRuns(id: string) {
  if (!CATALOG_DEMO_MODE) return request<Deployment>(`/api/v1/deployments/${id}/refresh-runs`, { method: 'POST', body: '{}' }, true);
  return mockUpdate(id, evolveMock);
}

async function simpleAction(id: string, path: string, requestedBy: string) {
  if (!CATALOG_DEMO_MODE) return request<Deployment>(`/api/v1/deployments/${id}${path}`, { method: 'POST', body: JSON.stringify({ requestedBy }) }, true);
  return mockUpdate(id, (deployment) => ({ ...deployment, status: 'queued', currentStage: 'queued', startedAt: new Date().toISOString(), lastErrorCode: null, lastErrorMessage: null, retryable: false, updatedAt: new Date().toISOString() }));
}

export const retryDeployment = (id: string, requestedBy: string) => simpleAction(id, '/retry', requestedBy);
export const retryUnit = (id: string, unitId: string, requestedBy: string) => simpleAction(id, `/units/${unitId}/retry`, requestedBy);
export const runUnit = (id: string, unitId: string, requestedBy: string) => simpleAction(id, `/units/${unitId}/run`, requestedBy);

export async function retryUnitShadowActivation(id: string, unitId: string) {
  if (!CATALOG_DEMO_MODE) return request<Deployment>(`/api/v1/deployments/${id}/units/${unitId}/activate-shadow`, { method: 'POST', body: '{}' }, true);
  return mockUpdate(id, (deployment) => ({
    ...deployment,
    status: 'validating_hub_catalog',
    currentStage: 'activating_shadow',
    units: deployment.units.map((unit) => unit.id === unitId ? { ...unit, status: 'activating_shadow', latestRunStatus: 'activation_requested' } : unit),
    updatedAt: new Date().toISOString(),
  }));
}

export async function activateTenants(id: string, requestedBy: string) {
  if (!CATALOG_DEMO_MODE) return request<Deployment>(`/api/v1/deployments/${id}/activate-tenants`, { method: 'POST', body: JSON.stringify({ requestedBy }) }, true);
  return mockUpdate(id, (deployment) => ({ ...deployment, status: 'completed', currentStage: 'completed', finishedAt: new Date().toISOString(), activatedAt: new Date().toISOString(), activatedBy: requestedBy, units: deployment.units.map((unit) => ({ ...unit, status: 'active' })), updatedAt: new Date().toISOString(), events: [...deployment.events, { id: uuid(), deploymentId: id, unitId: null, eventType: 'tenants_activated', fromStatus: 'awaiting_activation', toStatus: 'completed', createdBy: requestedBy, createdAt: new Date().toISOString() }] }));
}

export async function cancelDeployment(id: string, requestedBy: string) {
  if (!CATALOG_DEMO_MODE) return request<Deployment>(`/api/v1/deployments/${id}/cancel`, { method: 'POST', body: JSON.stringify({ requestedBy }) }, true);
  return mockUpdate(id, (deployment) => ({ ...deployment, status: 'cancelled', currentStage: 'cancelled', finishedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
}

export function subscribeToDeployment(id: string, onEvent: () => void) {
  if (CATALOG_DEMO_MODE) return () => undefined;
  const controller = new AbortController();
  void fetch(`${API_BASE}/api/v1/deployments/${id}/stream`, {
    credentials: 'include',
    headers: { ...jsonHeaders(), Accept: 'text/event-stream' },
    signal: controller.signal,
  }).then(async (response) => {
    if (!response.ok || !response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (!controller.signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const messages = buffer.split('\n\n');
      buffer = messages.pop() || '';
      messages.forEach((message) => {
        if (message.split('\n').some((line) => line.startsWith('data:'))) onEvent();
      });
    }
  }).catch((error: unknown) => {
    if (!(error instanceof DOMException && error.name === 'AbortError')) console.warn('Fluxo de eventos do catálogo indisponível; polling mantido.', error);
  });
  return () => controller.abort();
}

export async function createAtenderBemGroup(deploymentId: string, unitId: string, requestedBy: string): Promise<AtenderBemConfiguration> {
  if (CATALOG_DEMO_MODE) throw new Error('Para criar o grupo, use o Integra conectado ao backend.');
  return request(`/api/v1/deployments/${deploymentId}/units/${unitId}/atenderbem/group`, { method: 'POST', headers: atenderBemHeaders(), body: JSON.stringify({ requestedBy }) });
}

export async function createDeploymentAi(deploymentId: string, unitId: string, input: { modality: 'venda'; name: string; signatureName: string }, requestedBy: string): Promise<DeploymentAi> {
  if (CATALOG_DEMO_MODE) throw new Error('Use o Integra conectado ao backend para criar a IA.');
  return request(`/api/v1/deployments/${deploymentId}/units/${unitId}/ai`, { method: 'POST', headers: atenderBemHeaders(), body: JSON.stringify({ ...input, requestedBy }) });
}

export async function runAtenderBemImport(deploymentId: string, unitId: string, check = false): Promise<AtenderBemConfiguration> {
  if (CATALOG_DEMO_MODE) throw new Error('Use o Integra conectado ao backend para importar.');
  return request(`/api/v1/deployments/${deploymentId}/units/${unitId}/atenderbem/import${check ? '/status' : ''}`, { method: 'POST', headers: atenderBemHeaders(), body: JSON.stringify({}) });
}
