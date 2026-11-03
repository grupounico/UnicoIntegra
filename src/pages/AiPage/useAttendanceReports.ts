import { useEffect, useReducer, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  createAttendanceReport, fetchAttendanceReport, fetchLatestReport, fetchReportInstances,
  isReportRequestCanceled, reportErrorCode,
} from '../../services/attendanceReports.service';
import type { AttendanceReportRun, ReportInput, ReportInstance } from '../../services/attendanceReports.types';
import { extractErrorMessage } from '../../utils/error';
import { defaultReportPeriod, isActiveReport } from './attendanceReports.utils';

interface State {
  instances: ReportInstance[];
  instancesLoaded: boolean;
  run: AttendanceReportRun | null;
  displayed: AttendanceReportRun | null;
  input: ReportInput;
  loading: boolean;
  submitting: boolean;
  paused: boolean;
  error: string;
  errorCode: string;
  reload: number;
}
type Action = { type: 'patch'; patch: Partial<State> } | { type: 'received'; run: AttendanceReportRun; fillInput?: boolean };
function reducer(state: State, action: Action): State {
  if (action.type === 'patch') return { ...state, ...action.patch };
  const run = action.run;
  return {
    ...state, run,
    displayed: run.result ? run : state.displayed,
    ...(action.fillInput ? { input: {
      dateFrom: run.request.dateFrom, dateTo: run.request.dateTo, queueIds: run.request.queueIds,
      ...(run.request.comparison ? { comparison: run.request.comparison } : {}),
    } } : {}),
  };
}

export function useAttendanceReports() {
  const [params, setParams] = useSearchParams();
  const [state, dispatch] = useReducer(reducer, {
    instances: [], instancesLoaded: false, run: null, displayed: null,
    input: { ...defaultReportPeriod(), queueIds: [] },
    loading: true, submitting: false, paused: false, error: '', errorCode: '', reload: 0,
  });
  const key = params.get('instanceKey') ?? state.instances[0]?.key ?? '';
  const runId = params.get('runId');
  const instance = state.instances.find(item => item.key === key);
  const mutation = useRef<AbortController | null>(null);
  const patch = (value: Partial<State>) => dispatch({ type: 'patch', patch: value });

  useEffect(() => {
    const controller = new AbortController();
    fetchReportInstances(controller.signal).then(instances => {
      dispatch({ type: 'patch', patch: { instances, instancesLoaded: true, loading: false, error: '', errorCode: '' } });
    }).catch(error => {
      if (!isReportRequestCanceled(error)) dispatch({ type: 'patch', patch: {
        instancesLoaded: true, loading: false, error: extractErrorMessage(error), errorCode: reportErrorCode(error) ?? '',
      } });
    });
    return () => controller.abort();
  }, [state.reload]);

  useEffect(() => {
    if (!instance) return;
    const controller = new AbortController();
    dispatch({ type: 'patch', patch: { loading: true, paused: false, error: '', errorCode: '' } });
    const load = runId ? fetchAttendanceReport(key, runId, controller.signal) : fetchLatestReport(key, controller.signal);
    load.then(run => {
      if (controller.signal.aborted) return;
      if (run) {
        dispatch({ type: 'received', run, fillInput: true });
        if (!runId) setParams({ instanceKey: key, runId: run.runId }, { replace: true });
      } else dispatch({ type: 'patch', patch: {
        run: null, displayed: null,
        input: { ...defaultReportPeriod(), queueIds: instance.units.map(unit => unit.queueId) },
      } });
      dispatch({ type: 'patch', patch: { loading: false } });
    }).catch(error => {
      if (!isReportRequestCanceled(error)) dispatch({ type: 'patch', patch: {
        loading: false, paused: true, error: extractErrorMessage(error), errorCode: reportErrorCode(error) ?? '',
      } });
    });
    return () => controller.abort();
  }, [instance, key, runId, setParams]);

  const activeRun = state.run?.instanceKey === key && (!runId || state.run.runId === runId) ? state.run : null;
  const activeId = activeRun?.runId;
  const activeStatus = activeRun?.status;
  useEffect(() => {
    if (!activeId || !activeStatus || !isActiveReport(activeStatus) || state.paused || state.loading) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const run = await fetchAttendanceReport(key, activeId, controller.signal);
        if (controller.signal.aborted) return;
        dispatch({ type: 'received', run });
        if (isActiveReport(run.status)) timer = setTimeout(poll, 5000);
      } catch (error) {
        if (!isReportRequestCanceled(error)) dispatch({ type: 'patch', patch: {
          paused: true, error: extractErrorMessage(error), errorCode: reportErrorCode(error) ?? '',
        } });
      }
    };
    timer = setTimeout(poll, 5000);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, activeId, activeStatus, state.paused, state.loading]);

  useEffect(() => () => { mutation.current?.abort(); }, [key]);

  async function generate() {
    if (!instance || state.submitting || mutation.current) return;
    const controller = new AbortController();
    mutation.current = controller;
    patch({ submitting: true, error: '', errorCode: '' });
    try {
      const run = await createAttendanceReport(key, state.input, controller.signal);
      if (controller.signal.aborted) return;
      dispatch({ type: 'received', run });
      patch({ paused: false });
      setParams({ instanceKey: key, runId: run.runId });
    } catch (error) {
      if (!isReportRequestCanceled(error)) patch({ error: extractErrorMessage(error), errorCode: reportErrorCode(error) ?? '' });
    } finally {
      if (mutation.current === controller) mutation.current = null;
      patch({ submitting: false });
    }
  }

  function selectInstance(next: string) {
    patch({ run: null, displayed: null, error: '', errorCode: '',
      input: { ...defaultReportPeriod(), queueIds: state.instances.find(item => item.key === next)?.units.map(unit => unit.queueId) ?? [] },
    });
    setParams({ instanceKey: next });
  }
  return {
    ...state, instance, key, activeRun,
    displayed: state.displayed?.instanceKey === key ? state.displayed : null,
    setInput: (input: ReportInput) => patch({ input }),
    generate, selectInstance,
    retry: () => patch({ reload: state.reload + 1 }),
    showLatest: () => {
      patch({ error: '', errorCode: '', ...(!runId ? { reload: state.reload + 1 } : {}) });
      setParams({ instanceKey: key });
    },
  };
}
