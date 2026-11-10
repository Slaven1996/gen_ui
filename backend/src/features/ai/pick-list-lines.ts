import type { GenUITools } from '@gen-ui/shared';
import type { AlarmRuleOption } from '../alarms/alarm-definitions.service.js';
import type { DeviceOption } from '../assets/devices.service.js';
import type { TagOption } from '../assets/tags.service.js';

/*
 * How tags, devices and alarm rules are written for Claude, one line each.
 * The system prompt lists them this way while a list is short
 * (system-prompt.ts), and the lookup tool returns them this way once it is
 * too long for the prompt (ai.tools.ts), so Claude reads the same lines
 * either way.
 */

/**
 * "Inlet pressure · PS01.INLET_PRESSURE · bar · Riverside Pumping Station · <id>".
 *
 * Unlike device and rule names, tag names repeat: both pumping stations have a
 * "Wet well level". So a tag whose name other tags have too also says where
 * they are: "Wet well level · … · Riverside Pumping Station · same name at
 * Harbor Pumping Station · <id>". Without it, Claude took the first "Wet well
 * level" it read as the only one. The prompt's instructions and the dashboard
 * tool's descriptions refer to this "same name at …" mark.
 */
export function tagLines(tags: TagOption[]): string[] {
  return tags.map((tag) => {
    const sameName = tags.filter((other) => other.name === tag.name && other.id !== tag.id);
    const mark = sameName.length > 0 && `same name at ${sameName.map((other) => other.asset).join(', ')}`;
    return [tag.name, tag.code, tag.unit, tag.asset, mark, tag.id].filter(Boolean).join(' · ');
  });
}

/** "PS-01 RTU · RTU-PS01-001 · Riverside Pumping Station · <id>" */
export function deviceLines(devices: DeviceOption[]): string[] {
  return devices.map((device) => `${device.name} · ${device.serialNumber} · ${device.asset} · ${device.id}`);
}

/** "Wet well high level · tag Wet well level (PS01.WET_WELL_LEVEL) · Riverside Pumping Station · <id>" */
export function ruleLines(rules: AlarmRuleOption[]): string[] {
  return rules.map((rule) => `${rule.name} · tag ${rule.tag.name} (${rule.tag.code}) · ${rule.asset} · ${rule.id}`);
}

/**
 * A lookup's result as Claude reads it: the lines inside the list's tag, like
 * the prompt's own lists, with the asset it looked in, e.g.
 * `<tags at="Riverside Pumping Station">`.
 */
export function lookupText({ list, scope, lines }: GenUITools['lookup']['output']): string {
  const at = scope === null ? '' : ` at="${scope}"`;
  return `<${list}${at}>\n${lines.join('\n') || '(none)'}\n</${list}>`;
}
