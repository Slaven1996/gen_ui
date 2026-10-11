import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { getStaticToolName } from 'ai';
import {
  isFormToolPart,
  normalizeCoverage,
  type FormOutcome,
  type FormOutcomeRequest,
  type FormToolName,
  type FormToolOutput,
  type FormToolUIPart,
  type GenUIMessage,
  type GenUITools,
} from '@gen-ui/shared';
import { AlarmDefinitionsService } from '../alarms/alarm-definitions.service.js';
import { AssetsService } from '../assets/assets.service.js';
import { DevicesService } from '../assets/devices.service.js';
import { TagsService } from '../assets/tags.service.js';
import { diff } from '../audit/audit.service.js';
import { LogbookService } from '../logbook/logbook.service.js';
import { ShiftsService } from '../shifts/shifts.service.js';
import type { AuthUser } from '../users/user.mapper.js';
import { UsersService } from '../users/users.service.js';
import {
  mayUse,
  toAssetSnapshot,
  toDeviceSnapshot,
  toEntrySnapshot,
  toRuleSnapshot,
  toShiftSnapshot,
  toShiftTemplateSnapshot,
  toTagSnapshot,
} from './ai.tools.js';
import { ConversationsService } from './conversations.service.js';

type Output<N extends FormToolName> = GenUITools[N]['output'];
type Saved<N extends FormToolName> = Extract<NonNullable<Output<N>['outcome']>, { status: 'saved' }>;

/**
 * For each form tool: the outcome of a save, read from the record it saved.
 * A form that saves several records (a repeating shift, a copied week) also
 * gets `entityIds`, every one of them.
 */
type SavedOutcomes = {
  [N in FormToolName]: (call: {
    input: GenUITools[N]['input'];
    output: Output<N>;
    entityId: string;
    entityIds?: string[];
  }) => Promise<Saved<N>>;
};

/**
 * What became of the forms the assistant opened. A form tool's call ends
 * when the form opens (`{ status: 'opened' }`); the user saves later through
 * the page's own REST endpoint, which the chat never sees. The browser then
 * reports it here, and the outcome is written into that call's output in the
 * saved conversation. So a reloaded chat shows the result instead of the
 * form, and Claude reads it on its next turn. No model call is involved.
 */
@Injectable()
export class AiFormsService {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly users: UsersService,
    private readonly alarmRules: AlarmDefinitionsService,
    private readonly devices: DevicesService,
    private readonly tags: TagsService,
    private readonly assets: AssetsService,
    private readonly logbook: LogbookService,
    private readonly shifts: ShiftsService,
  ) {}

  /**
   * The browser sends only the saved record's id; the facts Claude will read
   * (names, what changed) come from the database, not from the browser.
   * TypeScript requires an entry for every form tool.
   */
  private readonly saved: SavedOutcomes = {
    createUser: async ({ entityId }) => {
      const { name, email, role } = await this.users.get(entityId);
      return { status: 'saved', user: { name, email, role } };
    },
    createAlarmRule: async ({ entityId }) => {
      const rule = await this.alarmRules.get(entityId);
      return { status: 'saved', rule: { name: rule.name, tag: rule.tag.name, asset: rule.asset.name } };
    },
    editAlarmRule: async ({ input, output, entityId }) => {
      if (entityId !== input.ruleId) throw new BadRequestException('That is not the rule this form edits.');
      const rule = await this.alarmRules.get(entityId);
      return { status: 'saved', changed: diff(output.rule, toRuleSnapshot(rule)) };
    },
    createDevice: async ({ entityId }) => {
      const device = await this.devices.get(entityId);
      return {
        status: 'saved',
        device: { name: device.name, serialNumber: device.serialNumber, asset: device.asset.name },
      };
    },
    editDevice: async ({ input, output, entityId }) => {
      if (entityId !== input.deviceId) throw new BadRequestException('That is not the device this form edits.');
      const device = await this.devices.get(entityId);
      return { status: 'saved', changed: diff(output.device, toDeviceSnapshot(device)) };
    },
    createTag: async ({ entityId }) => {
      const tag = await this.tags.get(entityId);
      return {
        status: 'saved',
        tag: { name: tag.name, code: tag.code, device: tag.device.name, asset: tag.asset.name },
      };
    },
    editTag: async ({ input, output, entityId }) => {
      if (entityId !== input.tagId) throw new BadRequestException('That is not the tag this form edits.');
      const tag = await this.tags.get(entityId);
      return { status: 'saved', changed: diff(output.tag, toTagSnapshot(tag)) };
    },
    createAsset: async ({ entityId }) => {
      const asset = await this.assets.get(entityId);
      return {
        status: 'saved',
        asset: { name: asset.name, code: asset.code, type: asset.type, parent: asset.parent?.name ?? null },
      };
    },
    editAsset: async ({ input, output, entityId }) => {
      if (entityId !== input.assetId) throw new BadRequestException('That is not the asset this form edits.');
      const asset = await this.assets.get(entityId);
      return { status: 'saved', changed: diff(output.asset, toAssetSnapshot(asset)) };
    },
    createLogbookEntry: async ({ entityId }) => {
      const entry = await this.logbook.get(entityId);
      return {
        status: 'saved',
        entry: {
          category: entry.category,
          title: entry.title,
          occurredAt: entry.occurredAt,
          asset: entry.asset?.name ?? null,
        },
      };
    },
    editLogbookEntry: async ({ input, output, entityId }) => {
      if (entityId !== input.entryId) throw new BadRequestException('That is not the entry this form edits.');
      const entry = await this.logbook.get(entityId);
      return { status: 'saved', changed: diff(output.entry, toEntrySnapshot(entry)) };
    },
    scheduleShift: async ({ entityId, entityIds }) => {
      const shifts = await this.shifts.getAssignments(entityIds ?? [entityId]);
      const first = shifts[0];
      const last = shifts.at(-1);
      if (!first || !last) throw new NotFoundException('The scheduled shifts no longer exist.');
      return {
        status: 'saved',
        scheduled: {
          person: first.user.name,
          shift: first.template.name,
          role: first.role,
          shifts: shifts.length,
          from: first.date,
          to: last.date,
        },
      };
    },
    editShift: async ({ output, entityId, entityIds }) => {
      if (entityId !== output.shiftId) throw new BadRequestException('That is not the shift this form edits.');
      const ids = entityIds ?? [entityId];
      if (ids.includes(output.shiftId)) {
        const shift = await this.shifts.getAssignment(output.shiftId);
        return { status: 'saved', changed: diff(output.shift, toShiftSnapshot(shift, output.timeZone)), shifts: ids.length };
      }
      // The shift itself had already started, so a change to the rest of its series left it as it
      // was. Only the person, role and notes change across a series: read them off a changed one.
      const [other] = await this.shifts.getAssignments(ids);
      if (!other) return { status: 'saved', changed: null, shifts: 0 };
      const { person, role, notes } = output.shift;
      return {
        status: 'saved',
        changed: diff({ person, role, notes }, { person: other.user.name, role: other.role, notes: other.notes }),
        shifts: ids.length,
      };
    },
    copyShiftWeek: async ({ entityId, entityIds }) => {
      const shifts = await this.shifts.getAssignments(entityIds ?? [entityId]);
      const first = shifts[0];
      const last = shifts.at(-1);
      if (!first || !last) throw new NotFoundException('The copied shifts no longer exist.');
      return { status: 'saved', copied: { shifts: shifts.length, from: first.date, to: last.date } };
    },
    createShiftTemplate: async ({ entityId }) => {
      const { name, startTime, durationMinutes } = await this.shifts.getTemplate(entityId);
      return { status: 'saved', template: { name, startTime, durationMinutes } };
    },
    editShiftTemplate: async ({ input, output, entityId }) => {
      if (entityId !== input.templateId) throw new BadRequestException('That is not the template this form edits.');
      const template = await this.shifts.getTemplate(entityId);
      // The copy the form opened on comes back from JSONB, which reorders keys: normalise it again.
      const before = { ...output.template, coverage: normalizeCoverage(output.template.coverage) };
      return { status: 'saved', changed: diff(before, toShiftTemplateSnapshot(template)) };
    },
  };

  /**
   * Records that the user saved or closed the form opened by `toolCallId` in
   * conversation `id`, once. Returns the tool's output with its outcome.
   */
  async recordOutcome(
    id: string,
    toolCallId: string,
    request: FormOutcomeRequest,
    user: AuthUser,
  ): Promise<FormToolOutput> {
    return this.conversations.update(id, user.id, async (messages) => {
      const part = findFormPart(messages, toolCallId);
      const name = getStaticToolName<Pick<GenUITools, FormToolName>>(part);
      if (!mayUse(user, name)) throw new ForbiddenException('Signed in, but not allowed to use this form.');
      if (part.state !== 'output-available') throw new ConflictException('This form never opened.');
      if (part.output.outcome) throw new ConflictException('This form is already saved or closed.');

      const savedOutcome = this.saved[name] as unknown as (call: {
        input: unknown;
        output: unknown;
        entityId: string;
        entityIds?: string[];
      }) => Promise<FormOutcome>;
      const outcome: FormOutcome =
        request.status === 'closed'
          ? { status: 'closed' }
          : await savedOutcome({
              input: part.input,
              output: part.output,
              entityId: request.entityId,
              entityIds: request.entityIds,
            });
      const output = { ...part.output, outcome } as FormToolOutput;

      const next = messages.map((message) => ({
        ...message,
        parts: message.parts.map((each) =>
          each === part ? ({ ...part, output } as GenUIMessage['parts'][number]) : each,
        ),
      }));
      return { messages: next, result: output };
    });
  }
}

function findFormPart(messages: GenUIMessage[], toolCallId: string): FormToolUIPart {
  for (const message of messages) {
    for (const part of message.parts) {
      if (isFormToolPart(part) && part.toolCallId === toolCallId) return part;
    }
  }
  throw new NotFoundException('No such form in this conversation.');
}
