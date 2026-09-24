import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
describe('external documentation boundary',()=>{
  it('does not disclose internal operations in either public deliverable',()=>{
    for(const path of ['openapi-public.yaml','README.md']){
      const text=readFileSync(new URL(`../../../docs/api/${path}`,import.meta.url),'utf8');
      // These two values describe a public employment category, not an operational route.
      const prose = text.replaceAll('office-admin', '').replaceAll('Office & Admin', '');
      expect(prose).not.toMatch(/admin|jsearch|rapidapi|refresh|budget|circuit[- ]breaker/i);
    }
  });
  it('keeps internal routes in the private specification only',()=>{
    const text=readFileSync(new URL('../../../docs/api/openapi-admin.yaml',import.meta.url),'utf8');
    for(const path of ['inventory','refresh','budget','audit'])expect(text).toContain(`/api/admin/jobs/${path}:`);
    expect(text).toContain('X-Admin-API-Key');
    expect(text).not.toContain('\n  /api/jobs:');
  });
});

describe('Swagger import portability', () => {
  it.each(['public', 'admin'])('exports %s without YAML anchors or aliases', (name) => {
    const text = readFileSync(new URL(`../../../docs/api/openapi-${name}.yaml`, import.meta.url), 'utf8');
    expect(text).not.toMatch(/(?:^|\s)[&*][A-Za-z_][\w-]*(?=\s|$)/m);
    expect(text).toMatch(/^\s*openapi: 3\.1\.0$/m);
  });
});
