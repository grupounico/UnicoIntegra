import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultReportPeriod, formatCollectedAt, formatReportNumber, formatReportPercent, formatReportPoints,
  formatReportSeconds, isActiveReport, localReportDay, previousReportPeriod, reportRate, safeRatio,
  sameReportFilters, summaryIndicators, UNAVAILABLE, validateReportInput,
} from '../src/pages/AiPage/attendanceReports.utils.ts';

const now = new Date('2026-11-03T15:00:00Z');
const input = { dateFrom: '2026-10-23', dateTo: '2026-10-29', queueIds: [33, 35] };

test('default window is the last seven full days in São Paulo, across month and year boundaries', () => {
  assert.deepEqual(defaultReportPeriod(now), { dateFrom: '2026-10-27', dateTo: '2026-11-02' });
  assert.equal(localReportDay(new Date('2026-11-04T02:59:59Z')), '2026-11-03');
  assert.deepEqual(defaultReportPeriod(new Date('2027-01-01T03:01:00Z')), { dateFrom: '2026-12-25', dateTo: '2026-12-31' });
  assert.deepEqual(previousReportPeriod(input), { dateFrom: '2026-10-16', dateTo: '2026-10-22' });
});
test('zero remains zero; absent, non-finite or unsampled values remain unavailable', () => {
  assert.equal(formatReportNumber(0), '0');
  assert.equal(formatReportSeconds(0), '0 s');
  for (const value of [null, undefined, NaN, Infinity, '0']) assert.equal(formatReportNumber(value), UNAVAILABLE);
  assert.equal(safeRatio(0, 10), 0);
  assert.equal(safeRatio(0, 0), null);
  assert.equal(safeRatio(null, 10), null);
  assert.equal(safeRatio(10, null), null);
  assert.equal(reportRate(0, 0), `0/0 · ${UNAVAILABLE}`);
  assert.equal(reportRate(0, 10), '0/10 · 0%');
});
test('summary preserves denominators and never averages store medians or invents missing totals', () => {
  const cards = summaryIndicators({ chats: 10, ai_entered: 8, ai_response_without_human: 3, human_messages: 25, sale_reason: 2, request_response_s: { median: 0, n: 4 } });
  assert.deepEqual(cards.map(card => card.value), ['10', '8', '3', '0 s', '2,5', '2']);
  assert.equal(cards[1].detail, '8/10 · 80%');
  assert.equal(cards[2].detail, '3/10 · 30%');
  assert.equal(cards[3].detail, 'Mediana · n=4');
  for (const card of summaryIndicators(null)) assert.equal(card.value, UNAVAILABLE);
});
test('comparison percentages and percentage points are presented using different units', () => {
  assert.equal(formatReportPercent(12.34), '12,34%');
  assert.equal(formatReportPoints(12.34), '+12,34 p.p.');
  assert.equal(formatReportPoints(-2), '-2 p.p.');
  assert.equal(formatReportPoints(0), '0 p.p.');
  assert.equal(formatReportPoints(null), UNAVAILABLE);
});
test('client filters validate real dates, tenant units, current day and inclusive combined range', () => {
  assert.equal(validateReportInput(input, [33, 35], now), null);
  assert.equal(validateReportInput({ ...input, dateTo: '2026-11-03' }, [33, 35], now), null);
  assert.equal(validateReportInput({ ...input, dateFrom: '2025-11-03', dateTo: '2026-11-03' }, [33, 35], now), null);
  for (const bad of [{ ...input, dateFrom: '' }, { ...input, dateFrom: '2026-02-30' }, { ...input, dateFrom: '2026-10-30' }, { ...input, dateTo: '2026-11-04' }, { ...input, queueIds: [] }, { ...input, queueIds: [99] }, { ...input, dateFrom: '2025-11-02', dateTo: '2026-11-03' }, { ...input, comparison: { dateFrom: '2025-01-01', dateTo: '2025-01-02' } }]) {
    assert.equal(typeof validateReportInput(bad, [33, 35], now), 'string');
  }
});
test('draft filter changes are detected independently from displayed result, ignoring queue order', () => {
  assert.equal(sameReportFilters(input, { ...input, queueIds: [35, 33], comparison: null }), true);
  assert.equal(sameReportFilters(input, { ...input, dateFrom: '2026-10-22' }), false);
  assert.equal(sameReportFilters(input, { ...input, queueIds: [33] }), false);
  assert.equal(sameReportFilters({ ...input, comparison: previousReportPeriod(input) }, input), false);
});
test('polling continues only for active states and collection times always use São Paulo', () => {
  for (const state of ['QUEUED', 'RUNNING']) assert.equal(isActiveReport(state), true);
  for (const state of ['COMPLETED', 'PARTIAL', 'FAILED']) assert.equal(isActiveReport(state), false);
  assert.match(formatCollectedAt('2026-11-03T15:00:00Z'), /03\/11\/2026.*12:00/);
  assert.equal(formatCollectedAt(null), UNAVAILABLE);
});
