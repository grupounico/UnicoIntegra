import type { ReportInput, ReportPeriod, ReportRequest, ReportSummary, ReportStatus } from '../../services/attendanceReports.types';

export const REPORT_TIMEZONE = 'America/Sao_Paulo';
export const UNAVAILABLE = 'Indisponível';
export const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export const isActiveReport = (status: ReportStatus) => status === 'QUEUED' || status === 'RUNNING';

export function localReportDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key)!.value).join('-');
}
function shiftDay(day: string, days: number) {
  return new Date(Date.parse(day) + days * 86400000).toISOString().slice(0, 10);
}
export function defaultReportPeriod(now = new Date()): ReportPeriod {
  const today = localReportDay(now);
  return { dateFrom: shiftDay(today, -7), dateTo: shiftDay(today, -1) };
}
export function previousReportPeriod(period: ReportPeriod): ReportPeriod {
  if (!validDate(period.dateFrom) || !validDate(period.dateTo) || period.dateFrom > period.dateTo) return period;
  const duration = (Date.parse(period.dateTo) - Date.parse(period.dateFrom)) / 86400000 + 1;
  return { dateFrom: shiftDay(period.dateFrom, -duration), dateTo: shiftDay(period.dateFrom, -1) };
}
export function formatReportNumber(value: unknown, digits = 0): string {
  return isNumber(value) ? value.toLocaleString('pt-BR', { maximumFractionDigits: digits }) : UNAVAILABLE;
}
export function safeRatio(numerator: unknown, denominator: unknown): number | null {
  return isNumber(numerator) && isNumber(denominator) && denominator > 0 ? numerator / denominator : null;
}
export function formatReportPercent(value: unknown): string {
  return isNumber(value) ? `${formatReportNumber(value, 2)}%` : UNAVAILABLE;
}
export function formatReportPoints(value: unknown): string {
  return isNumber(value) ? `${value > 0 ? '+' : ''}${formatReportNumber(value, 2)} p.p.` : UNAVAILABLE;
}
export function reportRate(count: unknown, chats: unknown): string {
  const rate = safeRatio(count, chats);
  return `${formatReportNumber(count)}/${formatReportNumber(chats)} · ${formatReportPercent(rate === null ? null : rate * 100)}`;
}
export function formatReportSeconds(value: unknown): string {
  return isNumber(value) ? `${formatReportNumber(value, 2)} s` : UNAVAILABLE;
}
export function formatReportDate(day: string): string {
  return validDate(day) ? day.split('-').reverse().join('/') : UNAVAILABLE;
}
export function formatReportPeriod(period: ReportPeriod): string {
  return `${formatReportDate(period.dateFrom)} a ${formatReportDate(period.dateTo)}`;
}
export function formatCollectedAt(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return UNAVAILABLE;
  return new Date(value).toLocaleString('pt-BR', { timeZone: REPORT_TIMEZONE, dateStyle: 'short', timeStyle: 'short' });
}
export function summaryIndicators(summary: ReportSummary | null | undefined) {
  return [
    { label: 'Atendimentos reais', value: formatReportNumber(summary?.chats), detail: 'Chats do período, excluindo testes identificados' },
    { label: 'Passagem pela IA', value: formatReportNumber(summary?.ai_entered), detail: reportRate(summary?.ai_entered, summary?.chats) },
    { label: 'IA sem mensagem humana', value: formatReportNumber(summary?.ai_response_without_human), detail: reportRate(summary?.ai_response_without_human, summary?.chats) },
    { label: 'Resposta à solicitação', value: formatReportSeconds(summary?.request_response_s?.median), detail: `Mediana · n=${formatReportNumber(summary?.request_response_s?.n)}` },
    { label: 'Mensagens humanas/chat', value: formatReportNumber(safeRatio(summary?.human_messages, summary?.chats), 3), detail: `${formatReportNumber(summary?.human_messages)} mensagens / ${formatReportNumber(summary?.chats)} chats` },
    { label: 'Encerrados como venda', value: formatReportNumber(summary?.sale_reason), detail: reportRate(summary?.sale_reason, summary?.chats) },
  ];
}
function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
}
export function validateReportInput(input: ReportInput, availableIds: number[], now = new Date()): string | null {
  const today = localReportDay(now);
  const periods = [input, ...(input.comparison ? [input.comparison] : [])];
  if (periods.some(p => !validDate(p.dateFrom) || !validDate(p.dateTo) || p.dateFrom > p.dateTo || p.dateTo > today)) {
    return 'Informe datas válidas, em ordem e sem dias futuros.';
  }
  if (!input.queueIds.length || input.queueIds.some(id => !availableIds.includes(id))) return 'Selecione pelo menos uma unidade desta rede.';
  const dates = periods.flatMap(p => [p.dateFrom, p.dateTo]).sort();
  if ((Date.parse(dates.at(-1)!) - Date.parse(dates[0])) / 86400000 >= 366) return 'O intervalo total, incluindo a comparação, não pode ultrapassar 366 dias.';
  return null;
}
export function sameReportFilters(input: ReportInput, request: ReportRequest) {
  return input.dateFrom === request.dateFrom && input.dateTo === request.dateTo
    && JSON.stringify([...input.queueIds].sort((a, b) => a - b)) === JSON.stringify([...request.queueIds].sort((a, b) => a - b))
    && (input.comparison?.dateFrom ?? null) === (request.comparison?.dateFrom ?? null)
    && (input.comparison?.dateTo ?? null) === (request.comparison?.dateTo ?? null);
}
