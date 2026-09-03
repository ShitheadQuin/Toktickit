import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app';

describe('GET /api/requesters', () => {
  it('returns only the active seeded Requesters', async () => {
    const response = await request(app).get('/api/requesters');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(4);
    expect(response.body.map((requester: { name: string }) => requester.name)).toEqual([
      'Anong Srisai',
      'Kritsada Boonmee',
      'Suphachai Wattana',
      'Nalinee Chaiyaporn',
    ]);
    response.body.forEach((requester: { id: number }) => {
      expect(typeof requester.id).toBe('number');
    });
  });

  it('never includes the inactive seeded Requester', async () => {
    const response = await request(app).get('/api/requesters');

    const names = response.body.map((requester: { name: string }) => requester.name);
    expect(names).not.toContain('Ratchanee Somsak');
  });
});
