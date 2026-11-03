export interface ReportPeriod { dateFrom: string; dateTo: string }
export interface ReportInput extends ReportPeriod { queueIds: number[]; comparison?: ReportPeriod }
export interface ReportRequest extends ReportPeriod {
  queueIds: number[];
  comparison?: ReportPeriod | null;
  preset?: string | null;
}
export interface ReportInstance {
  key: string;
  name: string;
  configured: boolean;
  units: { queueId: number; name: string }[];
}
export type ReportStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
export interface ReportDistribution {
  n: number;
  mean: number | null;
  median: number | null;
  p90: number | null;
}
export interface ReportSummary {
  chats: number | null;
  ai_entered: number | null;
  ai_response_without_human: number | null;
  human_messages: number | null;
  sale_reason: number | null;
  technical_error: number | null;
  request_response_s: ReportDistribution | null;
  survey: ReportDistribution | null;
}
export interface ReportCohort {
  name: string;
  before_dates: [string, string];
  after_dates: [string, string];
  before: ReportSummary;
  after: ReportSummary;
  changes: {
    humanMessagesPerChatBefore: number | null;
    humanMessagesPerChatAfter: number | null;
    humanMessagesReductionPct: number | null;
    sales: { differencePp: number | null; lower95Pp: number | null; upper95Pp: number | null };
  };
}
export interface ReportResult {
  methodologyVersion: string;
  timezone: string;
  period: ReportPeriod;
  comparisonPeriod: ReportPeriod | null;
  coverage: {
    sourceChats: number | null;
    expectedChats: number | null;
    processedChats: number | null;
    failedChats: number | null;
    complete: boolean;
    collectionStartedAt: string;
    messageCutoff: string;
    collectedAt: string;
  };
  explicit_test_chats: number | null;
  total: ReportSummary | null;
  observed_total?: ReportSummary | null;
  all_stores: Record<string, ReportSummary | null>;
  cohorts: Record<string, ReportCohort | null>;
  interpretation: string[];
}
export interface AttendanceReportRun {
  runId: string;
  instanceKey: string;
  status: ReportStatus;
  request: ReportRequest;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  statusUrl: string;
  progress: { phase?: string; listed?: number; expected?: number; processed?: number; failed?: number };
  errors: { source: string; code: string; queueId?: number; pipelineId?: number; chatId?: number }[];
  result: ReportResult | null;
}
