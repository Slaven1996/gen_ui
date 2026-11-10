import type { TagOption } from '../assets/tags.service.js';
import { lookupText, tagLines } from './pick-list-lines.js';

const tag = (id: string, name: string, asset: string): TagOption => ({
  id,
  name,
  code: `${asset.slice(0, 3).toUpperCase()}.${name.toUpperCase().replaceAll(' ', '_')}`,
  unit: 'm',
  asset,
});

const RIVERSIDE = 'Riverside Pumping Station';
const HARBOR = 'Harbor Pumping Station';

describe('tagLines', () => {
  it('marks a name other tags share with where they are', () => {
    const tags = [
      tag('t1', 'Wet well level', HARBOR),
      tag('t2', 'Inlet pressure', RIVERSIDE),
      tag('t3', 'Wet well level', RIVERSIDE),
    ];
    expect(tagLines(tags)).toEqual([
      `Wet well level · HAR.WET_WELL_LEVEL · m · ${HARBOR} · same name at ${RIVERSIDE} · t1`,
      `Inlet pressure · RIV.INLET_PRESSURE · m · ${RIVERSIDE} · t2`,
      `Wet well level · RIV.WET_WELL_LEVEL · m · ${RIVERSIDE} · same name at ${HARBOR} · t3`,
    ]);
  });
});

describe('lookupText', () => {
  it("wraps the lines in the list's tag, with the asset it looked in", () => {
    expect(lookupText({ list: 'tags', scope: RIVERSIDE, lines: ['line 1', 'line 2'] })).toBe(
      `<tags at="${RIVERSIDE}">\nline 1\nline 2\n</tags>`,
    );
  });

  it('says (none) when nothing was found, and leaves out the asset when it looked everywhere', () => {
    expect(lookupText({ list: 'alarm-rules', scope: null, lines: [] })).toBe('<alarm-rules>\n(none)\n</alarm-rules>');
  });
});
