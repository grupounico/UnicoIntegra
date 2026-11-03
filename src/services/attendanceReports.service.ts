import axios from 'axios';
import { requireAuthSession } from '../utils/authSession';
import { api } from './api';
import type { AttendanceReportRun, ReportInput, ReportInstance } from './attendanceReports.types';

const root = '/api/ia/attendance-reports';
const options = (signal?: AbortSignal) => ({
  signal, timeout: 45000,
  headers: { Authorization: `Bearer ${requireAuthSession().authToken}` },
});
const instancePath = (key: string) => `${root}/${encodeURIComponent(key)}`;

export function reportErrorCode(error: unknown): string | undefined {
  return axios.isAxiosError(error) ? error.response?.data?.code : undefined;
}
export function isReportRequestCanceled(error: unknown) {
  return axios.isCancel(error);
}
export async function fetchReportInstances(signal?: AbortSignal): Promise<ReportInstance[]> {
  return (await api.get<{ data: ReportInstance[] }>(`${root}/instances`, options(signal))).data.data;
}
export async function fetchLatestReport(key: string, signal?: AbortSignal): Promise<AttendanceReportRun | null> {
  try { return (await api.get<AttendanceReportRun>(`${instancePath(key)}/latest`, options(signal))).data; }
  catch (error) {
    if (reportErrorCode(error) === 'REPORT_LATEST_NOT_FOUND') return null;
    throw error;
  }
}
export async function fetchAttendanceReport(key: string, runId: string, signal?: AbortSignal): Promise<AttendanceReportRun> {
  return (await api.get<AttendanceReportRun>(`${instancePath(key)}/runs/${encodeURIComponent(runId)}`, options(signal))).data;
}
export async function createAttendanceReport(key: string, input: ReportInput, signal?: AbortSignal): Promise<AttendanceReportRun> {
  return (await api.post<AttendanceReportRun>(`${instancePath(key)}/runs`, input, options(signal))).data;
}
