import type { ComponentType, ReactNode } from 'react';
import type { LinkProps } from '@tanstack/react-router';
import type { ToolUIPart } from 'ai';
import type { ConversationSummary, FormToolName, GenUIToolName, GenUITools } from '@gen-ui/shared';

export type GenUIToolPart = ToolUIPart<GenUITools>;

/** The tools that show things (a list, a chart, a calendar, a details card), each with its page's own component. */
export type ListToolName = Exclude<GenUIToolName, FormToolName>;

export type ToolInput<N extends GenUIToolName> = GenUITools[N]['input'];
export type ToolOutput<N extends GenUIToolName> = GenUITools[N]['output'];
/** A form tool's output once the user saved through it. */
export type SavedOutcome<N extends FormToolName> = Extract<NonNullable<ToolOutput<N>['outcome']>, { status: 'saved' }>;

export type ToolLink = Pick<LinkProps, 'to' | 'search'>;

/** What can be done to a chat; `useChatActions` brings the dialogs. */
export interface ChatActions {
  onRename: (chat: ConversationSummary) => void;
  onDelete: (id: string) => void;
}

/**
 * Which call a part is. Most views need only its input; a dashboard draft
 * also links back to the call (the page reads it from the saved conversation).
 */
export interface ToolCall {
  /** The conversation holding the call. */
  conversationId: string;
  toolCallId: string;
  /** The call has its output and the answer holding it has ended, so the conversation is saved with it. */
  done: boolean;
}

/** How one list tool's calls show in the chat. */
export interface ToolRenderer<N extends ListToolName> {
  /** Shown while the model is still writing the call. */
  pending: string;
  title: (input: ToolInput<N>) => string;
  /** The full page with the same query, for "Open in new tab". */
  link: (input: ToolInput<N>, call: ToolCall) => ToolLink;
  /**
   * The view inside the frame, once the call is complete — usually the
   * domain's own table. A view with its own filters reports them through
   * `onLinkChange`, so "Open in new tab" opens what the user now sees.
   * Without a frame, it gets that link as `action` to place itself.
   */
  Body: ComponentType<{
    input: ToolInput<N>;
    call: ToolCall;
    onLinkChange?: (link: ToolLink) => void;
    action?: ReactNode;
  }>;
  /** false: the view is a card of its own (as on its page), without the chat's frame and title. */
  framed?: false;
  /** The result in a few words, for text-only answers. */
  found: (output: ToolOutput<N>) => string;
}

/** What a form tool's body component receives. */
export interface FormProps<N extends FormToolName> {
  input: ToolInput<N>;
  output: ToolOutput<N>;
  /** Keeps the form's button off while the answer that opened it is still streaming. */
  disabled: boolean;
  /**
   * The save went through: the id of the record it saved, and for a form
   * that saves several (a repeating shift, a copied week), every one.
   */
  onSaved: (entityId: string, entityIds?: string[]) => void;
}

/** How one form tool's calls show in the chat. */
export interface FormRenderer<N extends FormToolName> {
  /** Shown while Claude writes the call and the server checks it. */
  pending: string;
  /** The form's name, for a closed form and a text-only answer. */
  label: string;
  /** The form itself: the page's own form component, pre-filled from the call. */
  Form: ComponentType<FormProps<N>>;
  /** The saved result in a few words. */
  saved: (outcome: SavedOutcome<N>, output: ToolOutput<N>) => string;
  /** The page that shows the saved record, for "Open in new tab". */
  link: (outcome: SavedOutcome<N>, output: ToolOutput<N>) => Pick<LinkProps, 'to' | 'search'>;
}
