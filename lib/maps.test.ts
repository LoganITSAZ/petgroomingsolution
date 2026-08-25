import { describe, it, expect } from 'vitest';
import { embedUrl, searchUrl, stripUnit } from './map-urls';

/**
 * The part of the map code that has no network in it.
 *
 * `stripUnit` is why the shop's own address resolves at all: Nominatim finds
 * nothing for "8911 N Central Ave #104" and finds the building for the same
 * line without the unit. Getting the strip wrong silently loses every map.
 */

describe('stripUnit', () => {
  it('drops a hash unit number', () => {
    expect(stripUnit('8911 N Central Ave #104 Phoenix, AZ 85020')).toBe(
      '8911 N Central Ave Phoenix, AZ 85020'
    );
  });

  it('drops the written-out forms', () => {
    expect(stripUnit('12 Oak St Apt 3, Springfield, IL')).toBe('12 Oak St, Springfield, IL');
    expect(stripUnit('12 Oak St Suite B, Springfield, IL')).toBe('12 Oak St, Springfield, IL');
    expect(stripUnit('12 Oak St Ste 200, Springfield, IL')).toBe('12 Oak St, Springfield, IL');
    expect(stripUnit('12 Oak St Unit 5, Springfield, IL')).toBe('12 Oak St, Springfield, IL');
  });

  it('leaves an address with no unit exactly as it was', () => {
    const plain = '8911 N Central Ave, Phoenix, AZ 85020';
    expect(stripUnit(plain)).toBe(plain);
  });

  it('does not eat a house number or a street name', () => {
    expect(stripUnit('104 Main St, Phoenix, AZ')).toBe('104 Main St, Phoenix, AZ');
    expect(stripUnit('5 Floral Way, Phoenix, AZ')).toBe('5 Floral Way, Phoenix, AZ');
  });

  it('tidies the punctuation it leaves behind', () => {
    expect(stripUnit('12 Oak St, #3, Springfield')).toBe('12 Oak St, Springfield');
  });
});

describe('embedUrl', () => {
  const point = { lat: 33.5661957, lon: -112.0737968, label: 'somewhere' };

  it('boxes the point and marks it', () => {
    const url = embedUrl(point);
    expect(url).toContain('bbox=-112.077797,33.562196,-112.069797,33.570196');
    expect(url).toContain('marker=33.566196,-112.073797');
    expect(url).toContain('layer=mapnik');
  });

  it('takes a tighter box for a compact frame', () => {
    expect(embedUrl(point, 0.002)).toContain('bbox=-112.075797,33.564196,-112.071797,33.568196');
  });
});

describe('searchUrl', () => {
  it('encodes the address', () => {
    expect(searchUrl('8911 N Central Ave #104')).toBe(
      'https://www.openstreetmap.org/search?query=8911%20N%20Central%20Ave%20%23104'
    );
  });
});
