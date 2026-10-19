import { useQuery } from '@tanstack/react-query';
import { widgetIssues } from '@gen-ui/shared';
import { assetTreeQueryOptions } from '@/features/assets/api/queries';
import { tagsListQueryOptions } from '@/features/tags/api/queries';
import type { DraftWidget, WidgetState } from '../types';

type CheckedWidget = Pick<DraftWidget, 'key' | 'type' | 'title' | 'config'>;

const tagIdsOf = (config: DraftWidget['config']) =>
  [config.tagId, ...(Array.isArray(config.tagIds) ? config.tagIds : [])].filter(
    (id): id is string => typeof id === 'string' && id !== '',
  );

const assetIdOf = (config: DraftWidget['config']) => (typeof config.assetId === 'string' ? config.assetId : undefined);

/**
 * Each widget checked, by key: `widgetIssues` (a title, and a config its type
 * accepts), plus whether the tags and asset it names still exist, since one
 * may have been deleted after the widget was set up (or after the assistant
 * proposed it). A widget is only drawn with a config that passed, so no view
 * calls the API with a bad query.
 */
export function useWidgetStates(widgets: CheckedWidget[]): Map<string, WidgetState> {
  const tagIds = [...new Set(widgets.flatMap((widget) => tagIdsOf(widget.config)))].sort();
  const hasAsset = widgets.some((widget) => assetIdOf(widget.config) !== undefined);

  // Whether the tags exist, not their live values: no need to poll like the Tags page.
  const tags = useQuery({
    ...tagsListQueryOptions({ ids: tagIds, pageSize: 100 }),
    enabled: tagIds.length > 0,
    refetchInterval: false,
  });
  const assets = useQuery({ ...assetTreeQueryOptions(), enabled: hasAsset });
  // The previous ids' page, shown while the new one loads, can't say whether a new tag exists.
  const tagsKnown = tags.isSuccess && !tags.isPlaceholderData;
  const existingTags = new Set(tagsKnown ? (tags.data?.items ?? []).map((tag) => tag.id) : []);
  const existingAssets = new Set(assets.data?.map((asset) => asset.id));

  return new Map(
    widgets.map((widget): [string, WidgetState] => {
      const { config, errors } = widgetIssues(widget);
      const ids = tagIdsOf(widget.config);
      const assetId = assetIdOf(widget.config);
      if (tagsKnown && ids.some((id) => !existingTags.has(id))) {
        errors[widget.type === 'TAG_VALUE' ? 'tagId' : 'tagIds'] ??= 'A tag it showed no longer exists. Choose another.';
      }
      if (assetId && assets.isSuccess && !existingAssets.has(assetId)) {
        errors.assetId ??= 'Its asset no longer exists. Choose another, or none.';
      }
      const checking = (ids.length > 0 && (tags.isLoading || tags.isPlaceholderData)) || (assetId !== undefined && assets.isLoading);
      const valid = Object.keys(errors).length === 0;
      return [widget.key, { config: valid ? config : undefined, errors, reason: Object.values(errors)[0], checking }];
    }),
  );
}
