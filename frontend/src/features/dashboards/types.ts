import type { DashboardSource, WidgetConfig, WidgetHeight, WidgetType, WidgetWidth } from '@gen-ui/shared';

/** A widget's settings while being edited: the page query with every field still a string. */
export type ConfigDraft = Record<string, unknown>;

/**
 * One widget of the dashboard being edited. `key` tells widgets apart before
 * they are saved; `id` is the saved widget's, kept when the dashboard is saved.
 */
export interface DraftWidget {
  key: string;
  id?: string;
  type: WidgetType;
  title: string;
  width: WidgetWidth;
  height: WidgetHeight;
  config: ConfigDraft;
}

/**
 * The dashboard on the page while it is edited: a local copy, saved in one
 * request. Without `id` it is new. `source` is the assistant draft it was
 * opened from.
 */
export interface DashboardDraft {
  id?: string;
  name: string;
  isShared: boolean;
  widgets: DraftWidget[];
  source?: DashboardSource;
}

/** One widget checked: what is wrong with it, or the config its view runs. */
export interface WidgetState {
  /** Present only when nothing is wrong. */
  config?: WidgetConfig;
  /** Field → message; empty when complete. */
  errors: Record<string, string>;
  /** The first problem, in a few words, for the widget's card. */
  reason?: string;
  /** Still checking that the tags or asset it names exist. */
  checking: boolean;
}
