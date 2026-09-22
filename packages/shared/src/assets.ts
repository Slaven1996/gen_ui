import { z } from 'zod';
import {
  csvEnum,
  csvIds,
  itemsSchema,
  nullableText,
  pageParams,
  paginatedSchema,
  queryBoolean,
  searchParam,
  sortParam,
} from './common/query.js';

// ─── Enums ──────────────────────────────────────────────────────────────────

/** Levels of the asset tree, from coarse to fine. Any type may sit under any other. */
export const ASSET_TYPES = ['REGION', 'SITE', 'AREA', 'EQUIPMENT'] as const;
export const AssetTypeSchema = z.enum(ASSET_TYPES);
export type AssetType = z.infer<typeof AssetTypeSchema>;

export const DEVICE_STATUSES = ['ONLINE', 'OFFLINE', 'MAINTENANCE', 'FAULT'] as const;
export const DeviceStatusSchema = z.enum(DEVICE_STATUSES);
export type DeviceStatus = z.infer<typeof DeviceStatusSchema>;

export const DEVICE_PROTOCOLS = ['MODBUS_TCP', 'OPC_UA', 'MQTT', 'IEC_104', 'DNP3', 'OTHER'] as const;
export const DeviceProtocolSchema = z.enum(DEVICE_PROTOCOLS);
export type DeviceProtocol = z.infer<typeof DeviceProtocolSchema>;

/** ANALOG: continuous measurement. DIGITAL: 0/1 state. COUNTER: monotonically increasing total. */
export const TAG_DATA_TYPES = ['ANALOG', 'DIGITAL', 'COUNTER'] as const;
export const TagDataTypeSchema = z.enum(TAG_DATA_TYPES);
export type TagDataType = z.infer<typeof TagDataTypeSchema>;

// ─── References (compact shapes embedded in other records) ─────────────────

export const AssetRefSchema = z
  .object({ id: z.guid(), code: z.string(), name: z.string(), type: AssetTypeSchema })
  .meta({ id: 'AssetRef' });
export type AssetRef = z.infer<typeof AssetRefSchema>;

export const DeviceRefSchema = z
  .object({ id: z.guid(), name: z.string(), serialNumber: z.string() })
  .meta({ id: 'DeviceRef' });
export type DeviceRef = z.infer<typeof DeviceRefSchema>;

export const TagRefSchema = z
  .object({ id: z.guid(), code: z.string(), name: z.string(), unit: z.string().nullable() })
  .meta({ id: 'TagRef' });
export type TagRef = z.infer<typeof TagRefSchema>;

// ─── Assets ─────────────────────────────────────────────────────────────────

export const AssetSchema = z
  .object({
    id: z.guid(),
    parentId: z.guid().nullable(),
    parent: AssetRefSchema.nullable(),
    code: z.string(),
    name: z.string(),
    type: AssetTypeSchema,
    description: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    address: z.string().nullable(),
    isActive: z.boolean(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    childCount: z.int(),
    deviceCount: z.int(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Asset' });
export type Asset = z.infer<typeof AssetSchema>;

export const AssetDetailSchema = AssetSchema.extend({
  ancestors: z.array(AssetRefSchema).describe('Root first, parent last — for breadcrumbs.'),
}).meta({ id: 'AssetDetail' });
export type AssetDetail = z.infer<typeof AssetDetailSchema>;

export const AssetTreeNodeSchema = z
  .object({
    id: z.guid(),
    parentId: z.guid().nullable(),
    code: z.string(),
    name: z.string(),
    type: AssetTypeSchema,
    isActive: z.boolean(),
    depth: z.int().describe('0 for roots.'),
    openAlarmCount: z.int().describe('Open alarms on this asset and everything below it.'),
  })
  .meta({ id: 'AssetTreeNode' });
export type AssetTreeNode = z.infer<typeof AssetTreeNodeSchema>;

export const AssetTreeSchema = itemsSchema(AssetTreeNodeSchema)
  .describe('Every asset, depth-first, so parents always precede their children.')
  .meta({ id: 'AssetTree' });

export const ASSET_SORT_FIELDS = ['name', 'code', 'type', 'createdAt'] as const;

export const assetFilters = {
  search: searchParam('name or code'),
  type: csvEnum(ASSET_TYPES),
  parentId: z.guid().optional().describe('Direct children of this asset only.'),
  ancestorId: z.guid().optional().describe('This asset and everything below it.'),
  rootsOnly: queryBoolean().optional().describe('Only assets without a parent.'),
  isActive: queryBoolean().optional(),
};

export const ListAssetsQuerySchema = z.object({
  ...pageParams(),
  sort: sortParam(ASSET_SORT_FIELDS, 'name'),
  ...assetFilters,
});
export type ListAssetsQueryInput = z.input<typeof ListAssetsQuerySchema>;
export type ListAssetsQuery = z.output<typeof ListAssetsQuerySchema>;

export const PaginatedAssetsSchema = paginatedSchema(AssetSchema).meta({ id: 'PaginatedAssets' });

const code = z
  .string()
  .trim()
  .min(1, 'Code is required')
  .max(40)
  .regex(/^[A-Za-z0-9._-]+$/, 'Use letters, digits, dot, dash or underscore');

const assetFields = {
  parentId: z.guid().nullable(),
  code,
  name: z.string().trim().min(1, 'Name is required').max(120),
  type: AssetTypeSchema,
  description: nullableText(1000),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  address: nullableText(300),
  isActive: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
};

export const CreateAssetSchema = z
  .object({
    ...assetFields,
    parentId: assetFields.parentId.default(null),
    description: assetFields.description.default(null),
    latitude: assetFields.latitude.default(null),
    longitude: assetFields.longitude.default(null),
    address: assetFields.address.default(null),
    isActive: assetFields.isActive.default(true),
    metadata: assetFields.metadata.default(null),
  })
  .meta({ id: 'CreateAsset' });
export type CreateAssetInput = z.input<typeof CreateAssetSchema>;
export type CreateAssetDto = z.output<typeof CreateAssetSchema>;

export const UpdateAssetSchema = z
  .object(assetFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update')
  .describe('Setting `parentId` moves the asset together with everything below it.')
  .meta({ id: 'UpdateAsset' });
export type UpdateAssetDto = z.output<typeof UpdateAssetSchema>;

// ─── Devices ────────────────────────────────────────────────────────────────

export const DeviceSchema = z
  .object({
    id: z.guid(),
    assetId: z.guid(),
    asset: AssetRefSchema,
    name: z.string(),
    serialNumber: z.string(),
    model: z.string().nullable(),
    manufacturer: z.string().nullable(),
    protocol: DeviceProtocolSchema,
    status: DeviceStatusSchema,
    firmwareVersion: z.string().nullable(),
    ipAddress: z.string().nullable(),
    installedAt: z.iso.datetime().nullable(),
    lastSeenAt: z.iso.datetime().nullable(),
    tagCount: z.int(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Device' });
export type Device = z.infer<typeof DeviceSchema>;

export const DEVICE_SORT_FIELDS = ['name', 'serialNumber', 'status', 'lastSeenAt', 'createdAt'] as const;

export const deviceFilters = {
  search: searchParam('name, serial number, model or manufacturer'),
  status: csvEnum(DEVICE_STATUSES),
  protocol: csvEnum(DEVICE_PROTOCOLS),
  assetId: z.guid().optional().describe('Devices on this asset or anywhere below it.'),
};

export const ListDevicesQuerySchema = z.object({
  ...pageParams(),
  sort: sortParam(DEVICE_SORT_FIELDS, 'name'),
  ...deviceFilters,
});
export type ListDevicesQueryInput = z.input<typeof ListDevicesQuerySchema>;
export type ListDevicesQuery = z.output<typeof ListDevicesQuerySchema>;

export const PaginatedDevicesSchema = paginatedSchema(DeviceSchema).meta({ id: 'PaginatedDevices' });

const deviceFields = {
  assetId: z.guid(),
  name: z.string().trim().min(1, 'Name is required').max(120),
  serialNumber: z.string().trim().min(1, 'Serial number is required').max(80),
  model: nullableText(120),
  manufacturer: nullableText(120),
  protocol: DeviceProtocolSchema,
  status: DeviceStatusSchema,
  firmwareVersion: nullableText(40),
  ipAddress: z.union([z.ipv4(), z.ipv6()]).nullable(),
  installedAt: z.iso.datetime({ offset: true }).nullable(),
};

export const CreateDeviceSchema = z
  .object({
    ...deviceFields,
    model: deviceFields.model.default(null),
    manufacturer: deviceFields.manufacturer.default(null),
    protocol: deviceFields.protocol.default('MODBUS_TCP'),
    status: deviceFields.status.default('OFFLINE'),
    firmwareVersion: deviceFields.firmwareVersion.default(null),
    ipAddress: deviceFields.ipAddress.default(null),
    installedAt: deviceFields.installedAt.default(null),
  })
  .meta({ id: 'CreateDevice' });
export type CreateDeviceInput = z.input<typeof CreateDeviceSchema>;
export type CreateDeviceDto = z.output<typeof CreateDeviceSchema>;

export const UpdateDeviceSchema = z
  .object(deviceFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update')
  .meta({ id: 'UpdateDevice' });
export type UpdateDeviceDto = z.output<typeof UpdateDeviceSchema>;

// ─── Tags (datapoints) ──────────────────────────────────────────────────────

export const TagSchema = z
  .object({
    id: z.guid(),
    deviceId: z.guid(),
    device: DeviceRefSchema,
    asset: AssetRefSchema,
    code: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    unit: z.string().nullable(),
    dataType: TagDataTypeSchema,
    minValue: z.number().nullable().describe('Engineering range, used for gauges and chart axes.'),
    maxValue: z.number().nullable(),
    logIntervalSeconds: z.int(),
    lastValue: z.number().nullable(),
    lastValueAt: z.iso.datetime().nullable(),
    isActive: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Tag' });
export type Tag = z.infer<typeof TagSchema>;

export const TAG_SORT_FIELDS = ['name', 'code', 'lastValueAt', 'createdAt'] as const;

export const tagFilters = {
  search: searchParam('name, code or unit'),
  ids: csvIds('Only these tags.', 100),
  deviceId: z.guid().optional(),
  assetId: z.guid().optional().describe('Tags on this asset or anywhere below it.'),
  dataType: csvEnum(TAG_DATA_TYPES),
  isActive: queryBoolean().optional(),
};

export const ListTagsQuerySchema = z.object({
  ...pageParams(),
  sort: sortParam(TAG_SORT_FIELDS, 'name'),
  ...tagFilters,
});
export type ListTagsQueryInput = z.input<typeof ListTagsQuerySchema>;
export type ListTagsQuery = z.output<typeof ListTagsQuerySchema>;

export const PaginatedTagsSchema = paginatedSchema(TagSchema).meta({ id: 'PaginatedTags' });

const tagFields = {
  deviceId: z.guid(),
  code: z
    .string()
    .trim()
    .min(1, 'Code is required')
    .max(60)
    .regex(/^[A-Za-z0-9._-]+$/, 'Use letters, digits, dot, dash or underscore'),
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: nullableText(500),
  unit: nullableText(20),
  dataType: TagDataTypeSchema,
  minValue: z.number().nullable(),
  maxValue: z.number().nullable(),
  logIntervalSeconds: z.int().min(1).max(86_400),
  isActive: z.boolean(),
};

export const CreateTagSchema = z
  .object({
    ...tagFields,
    description: tagFields.description.default(null),
    unit: tagFields.unit.default(null),
    dataType: tagFields.dataType.default('ANALOG'),
    minValue: tagFields.minValue.default(null),
    maxValue: tagFields.maxValue.default(null),
    logIntervalSeconds: tagFields.logIntervalSeconds.default(60),
    isActive: tagFields.isActive.default(true),
  })
  .refine((tag) => tag.minValue === null || tag.maxValue === null || tag.minValue < tag.maxValue, {
    message: 'Minimum must be below maximum',
    path: ['maxValue'],
  })
  .meta({ id: 'CreateTag' });
export type CreateTagInput = z.input<typeof CreateTagSchema>;
export type CreateTagDto = z.output<typeof CreateTagSchema>;

export const UpdateTagSchema = z
  .object(tagFields)
  .omit({ deviceId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update')
  .meta({ id: 'UpdateTag' });
export type UpdateTagDto = z.output<typeof UpdateTagSchema>;
