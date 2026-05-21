import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSupplierCsv, parseSupplierCsvRow, supplierPublicVisibilityWhere } from '@/lib/wholesaler';

test('parseSupplierCsv detects delimiter, trims headers, and parses rows', () => {
  const csv = [
    ' title ; description ; SKU ; wholesale price ; retail price ; quantity ; images ; shipping weight ; dimensions ; brand ; category ',
    'Sample Product;Example desc;sku-1;10.50;20.99;5;https://example.com/a.jpg|https://example.com/b.jpg;12;10x5x2;Brand X;Beauty',
  ].join('\n');

  const parsed = parseSupplierCsv(csv);

  assert.equal(parsed.headers[0], 'title');
  assert.equal(parsed.headers[2], 'sku');
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0][0], 'Sample Product');
  assert.equal(parsed.rows[0][2], 'sku-1');
});

test('parseSupplierCsvRow validates missing required fields', () => {
  const headers = ['title', 'description', 'sku', 'wholesale price', 'retail price', 'quantity', 'images', 'shipping weight', 'dimensions', 'brand', 'category'];
  const row = ['', '', '', 'abc', '', '-1', '', '', '', '', ''];

  const parsed = parseSupplierCsvRow(headers, row, 2);

  assert.equal(parsed.payload, null);
  assert.ok(parsed.errors.length >= 4);
  assert.ok(parsed.errors.some((error) => error.code === 'MISSING_TITLE'));
  assert.ok(parsed.errors.some((error) => error.code === 'MISSING_SKU'));
  assert.ok(parsed.errors.some((error) => error.code === 'INVALID_WHOLESALE_PRICE'));
});

test('supplierPublicVisibilityWhere keeps non-supplier listings public and gates supplier listings', () => {
  const where = supplierPublicVisibilityWhere() as {
    OR: Array<Record<string, unknown>>;
  };

  assert.equal(Array.isArray(where.OR), true);
  assert.equal(where.OR.length, 2);
  assert.deepEqual(where.OR[0], { sourceSupplierProductId: null });
  assert.ok(typeof where.OR[1] === 'object');
});
