export type AssetType =
  | 'banner_1'
  | 'banner_2'
  | 'banner_3'
  | 'logo_desktop'
  | 'logo_mobile';

export type DeploymentStatus =
  | 'draft'
  | 'queued'
  | 'provisioning_hub'
  | 'validating_hub_catalog'
  | 'provisioning_unicommerce'
  | 'validating_unicommerce'
  | 'importing_banco_unico'
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
  | 'catalog_active'
  | 'unicommerce_tenant_created'
  | 'unicommerce_ready'
  | 'banco_unico_importing'
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
  sourceUnitId: number;
  credentialRef: string;
  provider?: 'alpha7';
  pageSize?: number;
  validEanDropThresholdBps?: number;
  slug?: string;
  initial?: boolean;
}

export interface DeploymentUnit {
  id: string;
  deploymentId: string;
  code: string;
  name: string;
  cnpj: string;
  slug: string;
  isInitial: boolean;
  provider: 'alpha7';
  sourceUnitId: number;
  publicationMode: 'shadow';
  pageSize: number;
  validEanDropThresholdBps: number;
  status: UnitStatus;
  hubSellerUnitId: string | null;
  hubIntegrationId: string | null;
  latestRunId: string | null;
  latestRunStatus: string | null;
  latestValidRows: number | null;
  latestRunFinishedAt: string | null;
  unicommerceTenantId: string | null;
  clientId: number | null;
  bancoUnicoImportJobId: number | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  retryable: boolean;
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

export interface PaginatedDeployments {
  data: Deployment[];
  meta: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

export interface CreateDeploymentPayload {
  requestedBy: string;
  group: GroupForm;
  units: UnitForm[];
}

const ASSET_TYPES: AssetType[] = ['banner_1', 'banner_2', 'banner_3', 'logo_desktop', 'logo_mobile'];
const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
const MOCK_STORAGE_KEY = 'unico-catalog-deployments-v2';

export const CATALOG_DEMO_MODE = import.meta.env.VITE_CATALOG_MOCK === 'true'
  || (import.meta.env.DEV && !import.meta.env.VITE_API_URL);

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

function makeUnit(deploymentId: string, input: UnitForm): DeploymentUnit {
  const slugBase = input.slug || `${input.nome}-${input.codigo}`;
  return {
    id: uuid(), deploymentId, code: input.codigo, name: input.nome, cnpj: input.cnpj.replace(/\D/g, ''),
    slug: slugBase.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    isInitial: input.initial === true, provider: 'alpha7', sourceUnitId: input.sourceUnitId,
    publicationMode: 'shadow', pageSize: input.pageSize ?? 500,
    validEanDropThresholdBps: input.validEanDropThresholdBps ?? 1000, status: 'pending',
    hubSellerUnitId: null, hubIntegrationId: null, latestRunId: null, latestRunStatus: null,
    latestValidRows: null, latestRunFinishedAt: null, unicommerceTenantId: null, clientId: null,
    bancoUnicoImportJobId: null, lastErrorCode: null, lastErrorMessage: null, retryable: false,
  };
}

function assetsFor(deploymentId: string, confirmed = false): DeploymentAsset[] {
  return ASSET_TYPES.map((type) => ({
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
    sourceUnitId: index + 1, credentialRef: 'postgresql://demo:demo@localhost:5432/catalogo', initial: index === 0,
  }));
  units.forEach((unit) => {
    unit.status = input.status === 'completed' ? 'active'
      : input.status === 'awaiting_activation' ? 'awaiting_activation'
        : input.status === 'failed' ? 'failed' : 'running';
    unit.latestValidRows = input.status === 'awaiting_activation' || input.status === 'completed' ? 12840 + unit.sourceUnitId * 761 : null;
    unit.unicommerceTenantId = input.status === 'awaiting_activation' || input.status === 'completed' ? `tenant-${unit.sourceUnitId}` : null;
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
    id, idempotencyKey: uuid(), groupCnpj: input.cnpj, groupName: input.name, username: input.username,
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
  if (raw) return JSON.parse(raw) as Deployment[];
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
  const next: DeploymentStatus = elapsed < 2 ? 'queued' : elapsed < 5 ? 'provisioning_hub' : elapsed < 8 ? 'validating_hub_catalog' : elapsed < 11 ? 'provisioning_unicommerce' : elapsed < 14 ? 'importing_banco_unico' : 'awaiting_activation';
  if (next === deployment.status) return deployment;
  const updated = { ...deployment, status: next, currentStage: next, updatedAt: new Date().toISOString() };
  updated.units = deployment.units.map((unit) => ({ ...unit, status: next === 'awaiting_activation' ? 'awaiting_activation' : next === 'importing_banco_unico' ? 'banco_unico_importing' : next === 'provisioning_unicommerce' ? 'unicommerce_tenant_created' : 'running', latestValidRows: next === 'awaiting_activation' ? 13601 : unit.latestValidRows, unicommerceTenantId: next === 'awaiting_activation' ? `tenant-${unit.sourceUnitId}` : unit.unicommerceTenantId }));
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

export async function listDeployments(params: { page?: number; pageSize?: number; status?: string; cnpj?: string; search?: string } = {}): Promise<PaginatedDeployments> {
  if (!CATALOG_DEMO_MODE) {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== '').map(([key, value]) => [key, String(value)]));
    return request(`/api/v1/deployments?${query}`);
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
  return { data: data.slice((page - 1) * pageSize, page * pageSize), meta: { page, pageSize, totalItems: data.length, totalPages: Math.max(1, Math.ceil(data.length / pageSize)) } };
}

export async function getDeployment(id: string): Promise<Deployment> {
  if (!CATALOG_DEMO_MODE) return request(`/api/v1/deployments/${id}`);
  return mockUpdate(id, evolveMock);
}

export async function createDeployment(payload: CreateDeploymentPayload): Promise<Deployment> {
  if (!CATALOG_DEMO_MODE) return request('/api/v1/deployments', { method: 'POST', body: JSON.stringify(payload) }, true);
  const id = uuid();
  const now = new Date().toISOString();
  const deployment: Deployment = {
    id, idempotencyKey: uuid(), groupCnpj: payload.group.cnpj.replace(/\D/g, ''), groupName: payload.group.nome,
    username: payload.group.username, status: 'draft', currentStage: null, requestedBy: payload.requestedBy,
    correlationId: uuid(), hubSellerId: null, lastErrorCode: null, lastErrorMessage: null, retryable: false,
    startedAt: null, finishedAt: null, activatedAt: null, activatedBy: null, createdAt: now, updatedAt: now,
    units: payload.units.map((unit) => makeUnit(id, unit)), assets: assetsFor(id),
    events: [{ id: uuid(), deploymentId: id, unitId: null, eventType: 'deployment_created', fromStatus: null, toStatus: 'draft', createdBy: payload.requestedBy, createdAt: now }],
  };
  const deployments = readMocks();
  deployments.unshift(deployment);
  writeMocks(deployments);
  return deployment;
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function uploadDeploymentAsset(deploymentId: string, type: AssetType, file: File): Promise<Deployment> {
  const checksumSha256 = await sha256(file);
  if (CATALOG_DEMO_MODE) {
    return mockUpdate(deploymentId, (deployment) => ({
      ...deployment,
      assets: deployment.assets.map((asset) => asset.type === type ? { ...asset, status: 'confirmed', uploadId: `upload-${uuid()}`, objectKey: `demo/${deploymentId}/${file.name}`, mimeType: file.type, sizeBytes: file.size, checksumSha256 } : asset),
      updatedAt: new Date().toISOString(),
    }));
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

async function simpleAction(id: string, path: string, requestedBy: string) {
  if (!CATALOG_DEMO_MODE) return request<Deployment>(`/api/v1/deployments/${id}${path}`, { method: 'POST', body: JSON.stringify({ requestedBy }) }, true);
  return mockUpdate(id, (deployment) => ({ ...deployment, status: 'queued', currentStage: 'queued', startedAt: new Date().toISOString(), lastErrorCode: null, lastErrorMessage: null, retryable: false, updatedAt: new Date().toISOString() }));
}

export const retryDeployment = (id: string, requestedBy: string) => simpleAction(id, '/retry', requestedBy);
export const retryUnit = (id: string, unitId: string, requestedBy: string) => simpleAction(id, `/units/${unitId}/retry`, requestedBy);
export const runUnit = (id: string, unitId: string, requestedBy: string) => simpleAction(id, `/units/${unitId}/run`, requestedBy);
export const activateShadow = (id: string, unitId: string, requestedBy: string) => simpleAction(id, `/units/${unitId}/activate-shadow`, requestedBy);

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
