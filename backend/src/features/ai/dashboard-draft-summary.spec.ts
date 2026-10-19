import { summarizeDashboardDraft, type DraftLookups } from './dashboard-draft-summary.js';

const RESERVOIR_LEVEL = '30000000-0000-4000-8000-000000000015';
const RIVERSIDE = '10000000-0000-4000-8000-000000000003';
const UNKNOWN = '99999999-0000-4000-8000-000000000000';

const known: DraftLookups = {
  tag: (id) => {
    if (id !== RESERVOIR_LEVEL) throw new Error(`Unknown tag id ${id}`);
    return { name: 'Reservoir level' };
  },
  asset: (id) => {
    if (id !== RIVERSIDE) throw new Error(`Unknown asset id ${id}`);
    return { name: 'Riverside Pumping Station' };
  },
};

describe('summarizeDashboardDraft', () => {
  it('names what each widget shows and what it still lacks', () => {
    const summary = summarizeDashboardDraft(
      {
        name: ' Riverside ',
        widgets: [
          { type: 'ALARM_TABLE', title: 'Open critical alarms', config: { state: ['ACTIVE'], severity: ['CRITICAL'], assetId: RIVERSIDE } },
          { type: 'TIME_SERIES', config: { tagIds: [RESERVOIR_LEVEL], range: '7d' } },
          { type: 'TAG_VALUE', title: 'Level now' },
          { type: 'ON_DUTY' },
        ],
      },
      known,
    );
    expect(summary).toEqual({
      name: 'Riverside',
      widgets: [
        { title: 'Open critical alarms', type: 'ALARM_TABLE', shows: 'Riverside Pumping Station', missing: [] },
        { title: 'Trend', type: 'TIME_SERIES', shows: 'Reservoir level', missing: [] },
        { title: 'Level now', type: 'TAG_VALUE', shows: null, missing: ['a tag'] },
        { title: 'On duty now', type: 'ON_DUTY', shows: null, missing: [] },
      ],
    });
  });

  it('accepts a chart without tags and an unnamed dashboard', () => {
    const summary = summarizeDashboardDraft({ widgets: [{ type: 'TIME_SERIES', config: { tagIds: [] } }] }, known);
    expect(summary.name).toBeNull();
    expect(summary.widgets[0].missing).toEqual(['at least one tag']);
  });

  it('refuses a field the widget type does not take', () => {
    expect(() => summarizeDashboardDraft({ widgets: [{ type: 'TAG_VALUE', config: { tagIds: [RESERVOIR_LEVEL] } }] }, known)).toThrow(
      /doesn't take tagIds/,
    );
  });

  it('refuses a value the widget type does not accept', () => {
    expect(() => summarizeDashboardDraft({ widgets: [{ type: 'ALARM_TABLE', config: { severity: ['WARNING'] } }] }, known)).toThrow(
      /severity/,
    );
  });

  it('refuses an id that is not on the lists', () => {
    expect(() => summarizeDashboardDraft({ widgets: [{ type: 'TAG_VALUE', config: { tagId: UNKNOWN } }] }, known)).toThrow(/Unknown tag/);
  });
});
