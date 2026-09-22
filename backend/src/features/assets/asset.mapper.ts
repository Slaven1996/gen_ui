import type { Asset, AssetDetail, AssetRef, Device, Tag } from '@gen-ui/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { iso, isoOrNull } from '../../common/list-query.js';

/** Compact references other modules embed (`{ id, code, name, type }`). */
export const assetRefSelect = {
  id: true,
  code: true,
  name: true,
  type: true,
} as const satisfies Prisma.AssetSelect;

export const deviceRefSelect = { id: true, name: true, serialNumber: true } as const satisfies Prisma.DeviceSelect;

export const tagRefSelect = { id: true, code: true, name: true, unit: true } as const satisfies Prisma.TagSelect;

// ─── Assets ─────────────────────────────────────────────────────────────────

export const assetSelect = {
  id: true,
  parentId: true,
  path: true,
  code: true,
  name: true,
  type: true,
  description: true,
  latitude: true,
  longitude: true,
  address: true,
  isActive: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  parent: { select: assetRefSelect },
  _count: { select: { children: true, devices: true } },
} as const satisfies Prisma.AssetSelect;

export type AssetRecord = Prisma.AssetGetPayload<{ select: typeof assetSelect }>;

export function toAsset(row: AssetRecord): Asset {
  return {
    id: row.id,
    parentId: row.parentId,
    parent: row.parent,
    code: row.code,
    name: row.name,
    type: row.type,
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address,
    isActive: row.isActive,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    childCount: row._count.children,
    deviceCount: row._count.devices,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toAssetDetail(row: AssetRecord, ancestors: AssetRef[]): AssetDetail {
  return { ...toAsset(row), ancestors };
}

/** Ids on a materialized path, root first: `/a/b/c/` → `['a', 'b', 'c']`. */
export const pathIds = (path: string): string[] => path.split('/').filter(Boolean);

// ─── Devices ────────────────────────────────────────────────────────────────

export const deviceSelect = {
  id: true,
  assetId: true,
  name: true,
  serialNumber: true,
  model: true,
  manufacturer: true,
  protocol: true,
  status: true,
  firmwareVersion: true,
  ipAddress: true,
  installedAt: true,
  lastSeenAt: true,
  createdAt: true,
  updatedAt: true,
  asset: { select: assetRefSelect },
  _count: { select: { tags: true } },
} as const satisfies Prisma.DeviceSelect;

export type DeviceRecord = Prisma.DeviceGetPayload<{ select: typeof deviceSelect }>;

export function toDevice(row: DeviceRecord): Device {
  return {
    id: row.id,
    assetId: row.assetId,
    asset: row.asset,
    name: row.name,
    serialNumber: row.serialNumber,
    model: row.model,
    manufacturer: row.manufacturer,
    protocol: row.protocol,
    status: row.status,
    firmwareVersion: row.firmwareVersion,
    ipAddress: row.ipAddress,
    installedAt: isoOrNull(row.installedAt),
    lastSeenAt: isoOrNull(row.lastSeenAt),
    tagCount: row._count.tags,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

// ─── Tags ───────────────────────────────────────────────────────────────────

export const tagSelect = {
  id: true,
  deviceId: true,
  code: true,
  name: true,
  description: true,
  unit: true,
  dataType: true,
  minValue: true,
  maxValue: true,
  logIntervalSeconds: true,
  lastValue: true,
  lastValueAt: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  device: { select: { ...deviceRefSelect, asset: { select: assetRefSelect } } },
} as const satisfies Prisma.TagSelect;

export type TagRecord = Prisma.TagGetPayload<{ select: typeof tagSelect }>;

export function toTag(row: TagRecord): Tag {
  const { asset, ...device } = row.device;
  return {
    id: row.id,
    deviceId: row.deviceId,
    device,
    asset,
    code: row.code,
    name: row.name,
    description: row.description,
    unit: row.unit,
    dataType: row.dataType,
    minValue: row.minValue,
    maxValue: row.maxValue,
    logIntervalSeconds: row.logIntervalSeconds,
    lastValue: row.lastValue,
    lastValueAt: isoOrNull(row.lastValueAt),
    isActive: row.isActive,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
