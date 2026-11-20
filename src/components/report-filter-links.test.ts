import { describe, expect, it } from 'vitest';
import {
  resolveCustomFieldFilters,
  type CustomFieldDefinition,
  type CustomFieldFilter,
} from '@/domain/custom-fields';
import { customFieldFilterHref } from './report-filter-links';

function field(id: string, name: string): CustomFieldDefinition {
  return {
    id,
    entityType: 'project',
    name,
    key: id,
    type: 'text',
    required: false,
    description: '',
    example: '',
    position: 0,
  };
}

const procurement = field('field-procurement', 'Procurement method');
const delivery = field('field-delivery', 'Delivery note');

function filter(fieldDefinition: CustomFieldDefinition, query: string): CustomFieldFilter {
  return { field: fieldDefinition, query };
}

describe('customFieldFilterHref (#74)', () => {
  it('renders no query string when there is nothing to carry', () => {
    expect(customFieldFilterHref('/reports/project-register', [])).toBe(
      '/reports/project-register',
    );
  });

  it('keeps one cf/cv pair per filter in order', () => {
    const filters = [filter(procurement, 'tender'), filter(delivery, 'phased')];
    const href = customFieldFilterHref('/reports/project-register', filters);

    expect(href).toBe(
      '/reports/project-register?cf=field-procurement&cv=tender&cf=field-delivery&cv=phased',
    );
  });

  it('drops exactly one filter for a remove link and keeps the others', () => {
    const filters = [filter(procurement, 'tender'), filter(delivery, 'phased')];

    expect(customFieldFilterHref('/reports/project-register', filters, undefined, 0)).toBe(
      '/reports/project-register?cf=field-delivery&cv=phased',
    );
    expect(customFieldFilterHref('/reports/project-register', filters, undefined, 1)).toBe(
      '/reports/project-register?cf=field-procurement&cv=tender',
    );
    expect(customFieldFilterHref('/reports/project-register', filters, undefined, 2)).toBe(
      '/reports/project-register?cf=field-procurement&cv=tender&cf=field-delivery&cv=phased',
    );
  });

  it('carries an explicit column selection through every link', () => {
    const filters = [filter(procurement, 'tender'), filter(delivery, 'phased')];

    expect(customFieldFilterHref('/reports/project-register', filters, ['f1', 'f2'], 0)).toBe(
      '/reports/project-register?cf=field-delivery&cv=phased&columns=f1&columns=f2',
    );
    // An explicit empty selection is the "no extra columns" choice, not "absent".
    expect(customFieldFilterHref('/reports/project-register', [], [])).toBe(
      '/reports/project-register?columns=',
    );
  });

  it('leaves the column parameter absent when the URL names no selection', () => {
    expect(customFieldFilterHref('/reports/project-register', [filter(procurement, 'tender')]))
      .toBe('/reports/project-register?cf=field-procurement&cv=tender');
  });

  it('encodes a value that contains spaces, ampersands or unicode', () => {
    const href = customFieldFilterHref('/reports/project-register', [
      filter(delivery, 'phased & delayed — 50%'),
    ]);
    const query = new URL(href, 'http://localhost').searchParams;

    expect(query.getAll('cf')).toEqual(['field-delivery']);
    expect(query.getAll('cv')).toEqual(['phased & delayed — 50%']);
  });

  it('round-trips through the page resolver so a reload rebuilds the same view', () => {
    const filters = [filter(procurement, 'tender'), filter(delivery, 'phased & delayed')];
    const href = customFieldFilterHref('/reports/project-register', filters, ['f1', 'f2']);
    const query = new URL(href, 'http://localhost').searchParams;

    const resolved = resolveCustomFieldFilters(
      [procurement, delivery],
      query.getAll('cf'),
      query.getAll('cv'),
    );

    expect(resolved.map((reloaded) => [reloaded.field.id, reloaded.query])).toEqual([
      ['field-procurement', 'tender'],
      ['field-delivery', 'phased & delayed'],
    ]);
    expect(query.getAll('columns')).toEqual(['f1', 'f2']);
  });
});
