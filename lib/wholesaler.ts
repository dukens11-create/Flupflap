import { prisma } from '@/lib/db';
import type { Prisma, SupplierImportRun, SupplierProfile, SupplierSyncRun } from '@prisma/client';

type SupplierProductPayload = {
  title: string;
  description: string;
  sku: string;
  wholesalePriceCents: number;
  retailPriceCents: number;
  quantity: number;
  images: string[];
  shippingWeightOz: number | null;
  dimensionLengthIn: number | null;
  dimensionWidthIn: number | null;
  dimensionHeightIn: number | null;
  brand: string | null;
  category: string | null;
};

type ImportRowError = {
  rowNumber: number;
  sku: string | null;
  code: string;
  message: string;
};

export type SupplierImportSummary = {
  runId: string;
  created: number;
  updated: number;
  failed: number;
  totalRows: number;
  errors: ImportRowError[];
};

export type SupplierSyncSummary = {
  runId: string;
  created: number;
  updated: number;
  failed: number;
  errorMessage: string | null;
};

export interface SupplierSyncAdapter {
  provider: string;
  fetchCatalog(input: { supplier: SupplierProfile }): Promise<Array<Record<string, string | number | null | undefined>>>;
}

export class BaselineSupplierSyncAdapter implements SupplierSyncAdapter {
  provider = 'baseline_stub';

  async fetchCatalog(): Promise<Array<Record<string, string>>> {
    return [];
  }
}

const HEADER_ALIASES: Record<string, string[]> = {
  title: ['title', 'product title', 'name'],
  description: ['description', 'details'],
  sku: ['sku', 'product sku'],
  wholesale_price: ['wholesale price', 'wholesale_price', 'wholesaleprice'],
  retail_price: ['retail price', 'retail_price', 'retailprice', 'price'],
  quantity: ['quantity', 'qty', 'stock'],
  images: ['images', 'image', 'image urls', 'image_urls'],
  shipping_weight: ['shipping weight', 'shipping_weight', 'weight'],
  dimensions: ['dimensions', 'dimension', 'size'],
  brand: ['brand'],
  category: ['category'],
};

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function detectDelimiter(raw: string) {
  const firstLine = raw.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
  const candidates: Array<{ delimiter: ',' | ';' | '\t'; score: number }> = [
    { delimiter: ',', score: (firstLine.match(/,/g) ?? []).length },
    { delimiter: ';', score: (firstLine.match(/;/g) ?? []).length },
    { delimiter: '\t', score: (firstLine.match(/\t/g) ?? []).length },
  ];
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].score > 0 ? candidates[0].delimiter : ',';
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
}

function parseCsvRows(raw: string): { headers: string[]; rows: string[][] } {
  const normalized = raw.replace(/^\uFEFF/, '').trim();
  if (!normalized) {
    return { headers: [], rows: [] };
  }

  const delimiter = detectDelimiter(normalized);
  const lines = normalized.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = splitCsvLine(lines[0], delimiter).map((header) => normalizeHeader(header));
  const rows = lines.slice(1).map((line) => splitCsvLine(line, delimiter));
  return { headers, rows };
}

export function parseSupplierCsv(raw: string) {
  return parseCsvRows(raw);
}

function resolveHeaderIndex(headers: string[], key: keyof typeof HEADER_ALIASES): number {
  const aliases = HEADER_ALIASES[key];
  for (const alias of aliases) {
    const index = headers.findIndex((header) => header === normalizeHeader(alias));
    if (index >= 0) return index;
  }
  return -1;
}

function centsFromCurrency(value: string): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[$,\s]/g, '');
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function parseNumber(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function parseImages(value: string): string[] {
  if (!value) return [];
  const normalized = value.includes('|') ? value.split('|') : value.split(',');
  return normalized.map((item) => item.trim()).filter(Boolean);
}

function parseDimensions(value: string): { length: number | null; width: number | null; height: number | null } {
  if (!value) return { length: null, width: null, height: null };
  const parts = value
    .toLowerCase()
    .replace(/inches?|inch|in/gi, '')
    .split(/[x×]/)
    .map((piece) => parseNumber(piece.trim()));

  return {
    length: parts[0] ?? null,
    width: parts[1] ?? null,
    height: parts[2] ?? null,
  };
}

function rowToPayload(headers: string[], row: string[], rowNumber: number): { payload: SupplierProductPayload | null; errors: ImportRowError[] } {
  const errors: ImportRowError[] = [];

  const get = (key: keyof typeof HEADER_ALIASES) => {
    const index = resolveHeaderIndex(headers, key);
    if (index < 0) return '';
    return (row[index] ?? '').trim();
  };

  const title = get('title');
  const description = get('description');
  const sku = get('sku').toUpperCase();
  const wholesalePriceCents = centsFromCurrency(get('wholesale_price'));
  const retailPriceCents = centsFromCurrency(get('retail_price'));
  const quantityRaw = parseNumber(get('quantity'));
  const quantity = quantityRaw !== null ? Math.max(0, Math.floor(quantityRaw)) : null;
  const images = parseImages(get('images'));
  const shippingWeight = parseNumber(get('shipping_weight'));
  const { length, width, height } = parseDimensions(get('dimensions'));
  const brand = get('brand') || null;
  const category = get('category') || null;

  if (!title) errors.push({ rowNumber, sku: sku || null, code: 'MISSING_TITLE', message: 'Title is required.' });
  if (!description) errors.push({ rowNumber, sku: sku || null, code: 'MISSING_DESCRIPTION', message: 'Description is required.' });
  if (!sku) errors.push({ rowNumber, sku: null, code: 'MISSING_SKU', message: 'SKU is required.' });
  if (wholesalePriceCents === null) errors.push({ rowNumber, sku: sku || null, code: 'INVALID_WHOLESALE_PRICE', message: 'Wholesale price must be a valid non-negative number.' });
  if (retailPriceCents === null) errors.push({ rowNumber, sku: sku || null, code: 'INVALID_RETAIL_PRICE', message: 'Retail price must be a valid non-negative number.' });
  if (quantity === null) errors.push({ rowNumber, sku: sku || null, code: 'INVALID_QUANTITY', message: 'Quantity must be a valid non-negative number.' });

  if (errors.length > 0 || wholesalePriceCents === null || retailPriceCents === null || quantity === null) {
    return { payload: null, errors };
  }

  return {
    payload: {
      title,
      description,
      sku,
      wholesalePriceCents,
      retailPriceCents,
      quantity,
      images,
      shippingWeightOz: shippingWeight,
      dimensionLengthIn: length,
      dimensionWidthIn: width,
      dimensionHeightIn: height,
      brand,
      category,
    },
    errors,
  };
}

export function parseSupplierCsvRow(headers: string[], row: string[], rowNumber: number) {
  return rowToPayload(headers, row, rowNumber);
}

function supplierListingPublicUpdate(payload: SupplierProductPayload, supplierApproved: boolean) {
  const available = supplierApproved && payload.quantity > 0;
  return {
    inventory: payload.quantity,
    delistedAt: available ? null : new Date(),
    updatedAt: new Date(),
  } as Prisma.ProductUpdateInput;
}

async function logImportErrors(input: {
  supplierId: string;
  importRunId?: string;
  syncRunId?: string;
  errors: ImportRowError[];
}) {
  if (input.errors.length === 0) return;
  await prisma.supplierOperationLog.createMany({
    data: input.errors.map((error) => ({
      supplierId: input.supplierId,
      importRunId: input.importRunId,
      syncRunId: input.syncRunId,
      sku: error.sku,
      rowNumber: error.rowNumber,
      errorCode: error.code,
      errorMessage: error.message,
    })),
  });
}

async function upsertSupplierRows(input: {
  supplier: SupplierProfile;
  rows: string[][];
  headers: string[];
  importRun?: SupplierImportRun;
  syncRun?: SupplierSyncRun;
}): Promise<{ created: number; updated: number; failed: number; errors: ImportRowError[] }> {
  let created = 0;
  let updated = 0;
  let failed = 0;
  const errors: ImportRowError[] = [];

  for (let index = 0; index < input.rows.length; index += 1) {
    const row = input.rows[index];
    const rowNumber = index + 2;
    const parsed = rowToPayload(input.headers, row, rowNumber);

    if (!parsed.payload) {
      failed += 1;
      errors.push(...parsed.errors);
      continue;
    }

    const payload = parsed.payload;
    const existing = await prisma.supplierProduct.findUnique({
      where: { supplierId_sku: { supplierId: input.supplier.id, sku: payload.sku } },
      select: { id: true },
    });

    const supplierProduct = await prisma.supplierProduct.upsert({
      where: { supplierId_sku: { supplierId: input.supplier.id, sku: payload.sku } },
      create: {
        supplierId: input.supplier.id,
        sku: payload.sku,
        title: payload.title,
        description: payload.description,
        wholesalePriceCents: payload.wholesalePriceCents,
        retailPriceCents: payload.retailPriceCents,
        quantity: payload.quantity,
        images: payload.images,
        shippingWeightOz: payload.shippingWeightOz,
        dimensionLengthIn: payload.dimensionLengthIn,
        dimensionWidthIn: payload.dimensionWidthIn,
        dimensionHeightIn: payload.dimensionHeightIn,
        brand: payload.brand,
        category: payload.category,
        isAvailable: payload.quantity > 0,
        lastSyncedAt: new Date(),
      },
      update: {
        title: payload.title,
        description: payload.description,
        wholesalePriceCents: payload.wholesalePriceCents,
        retailPriceCents: payload.retailPriceCents,
        quantity: payload.quantity,
        images: payload.images,
        shippingWeightOz: payload.shippingWeightOz,
        dimensionLengthIn: payload.dimensionLengthIn,
        dimensionWidthIn: payload.dimensionWidthIn,
        dimensionHeightIn: payload.dimensionHeightIn,
        brand: payload.brand,
        category: payload.category,
        isAvailable: payload.quantity > 0,
        lastSyncedAt: new Date(),
      },
      select: { id: true },
    });

    await prisma.product.updateMany({
      where: { sourceSupplierProductId: supplierProduct.id },
      data: supplierListingPublicUpdate(payload, input.supplier.status === 'APPROVED'),
    });
    const shouldBeAvailable = input.supplier.status === 'APPROVED' && payload.quantity > 0;
    if (shouldBeAvailable) {
      await prisma.product.updateMany({
        where: { sourceSupplierProductId: supplierProduct.id, status: 'HIDDEN' },
        data: { status: 'APPROVED', delistedAt: null, updatedAt: new Date() },
      });
    } else {
      await prisma.product.updateMany({
        where: { sourceSupplierProductId: supplierProduct.id },
        data: { status: 'HIDDEN', delistedAt: new Date(), updatedAt: new Date() },
      });
    }

    if (existing) updated += 1;
    else created += 1;
  }

  await logImportErrors({
    supplierId: input.supplier.id,
    importRunId: input.importRun?.id,
    syncRunId: input.syncRun?.id,
    errors,
  });

  return { created, updated, failed, errors };
}

export async function importSupplierCatalogCsv(input: {
  supplierUserId: string;
  csvContent: string;
  fileName?: string;
}): Promise<SupplierImportSummary> {
  const supplier = await prisma.supplierProfile.findUnique({ where: { userId: input.supplierUserId } });
  if (!supplier) throw new Error('Supplier profile not found.');

  const run = await prisma.supplierImportRun.create({
    data: {
      supplierId: supplier.id,
      sourceType: 'CSV_IMPORT',
      status: 'RUNNING',
      fileName: input.fileName ?? null,
    },
  });

  try {
    const { headers, rows } = parseCsvRows(input.csvContent);
    const result = await upsertSupplierRows({ supplier, headers, rows, importRun: run });

    const completed = await prisma.supplierImportRun.update({
      where: { id: run.id },
      data: {
        status: result.failed > 0 ? 'FAILED' : 'COMPLETED',
        createdCount: result.created,
        updatedCount: result.updated,
        failedCount: result.failed,
        totalRows: rows.length,
        completedAt: new Date(),
        rowErrors: result.errors as unknown as Prisma.JsonArray,
      },
    });

    return {
      runId: completed.id,
      created: result.created,
      updated: result.updated,
      failed: result.failed,
      totalRows: rows.length,
      errors: result.errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'CSV import failed.';
    await prisma.supplierImportRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        errorMessage: message,
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

export async function runSupplierSync(input: {
  supplierUserId: string;
  adapter?: SupplierSyncAdapter;
  trigger?: 'MANUAL' | 'SCHEDULED';
}): Promise<SupplierSyncSummary> {
  const supplier = await prisma.supplierProfile.findUnique({ where: { userId: input.supplierUserId } });
  if (!supplier) throw new Error('Supplier profile not found.');

  const adapter = input.adapter ?? new BaselineSupplierSyncAdapter();

  const run = await prisma.supplierSyncRun.create({
    data: {
      supplierId: supplier.id,
      provider: adapter.provider,
      trigger: input.trigger ?? 'MANUAL',
      status: 'RUNNING',
    },
  });

  try {
    const records = await adapter.fetchCatalog({ supplier });
    const { headers, rows } = recordsToRows(records);
    const result = await upsertSupplierRows({ supplier, headers, rows, syncRun: run });

    const completed = await prisma.supplierSyncRun.update({
      where: { id: run.id },
      data: {
        status: result.failed > 0 ? 'FAILED' : 'COMPLETED',
        createdCount: result.created,
        updatedCount: result.updated,
        failedCount: result.failed,
        completedAt: new Date(),
      },
    });

    return {
      runId: completed.id,
      created: completed.createdCount,
      updated: completed.updatedCount,
      failed: completed.failedCount,
      errorMessage: completed.errorMessage,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Supplier sync failed.';
    await prisma.supplierSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage,
      },
    });

    await logImportErrors({
      supplierId: supplier.id,
      syncRunId: run.id,
      errors: [{ rowNumber: 0, sku: null, code: 'SYNC_FAILED', message: errorMessage }],
    });

    return {
      runId: run.id,
      created: 0,
      updated: 0,
      failed: 1,
      errorMessage,
    };
  }
}

function recordsToRows(records: Array<Record<string, string | number | null | undefined>>) {
  const headers = Object.keys(HEADER_ALIASES);
  const rows = records.map((record) => [
    String(record.title ?? ''),
    String(record.description ?? ''),
    String(record.sku ?? ''),
    String(record.wholesale_price ?? ''),
    String(record.retail_price ?? ''),
    String(record.quantity ?? ''),
    String(record.images ?? ''),
    String(record.shipping_weight ?? ''),
    String(record.dimensions ?? ''),
    String(record.brand ?? ''),
    String(record.category ?? ''),
  ]);

  return { headers, rows };
}

export function supplierPublicVisibilityWhere(): Prisma.ProductWhereInput {
  return {
    OR: [
      { sourceSupplierProductId: null },
      {
        sourceSupplierProduct: {
          is: {
            quantity: { gt: 0 },
            supplier: {
              status: 'APPROVED' as const,
            },
          },
        },
      },
    ],
  };
}

export function supplierCanBeListedWhere(): Prisma.SupplierProductWhereInput {
  return {
    quantity: { gt: 0 },
    isAvailable: true,
    supplier: { status: 'APPROVED' },
  };
}
