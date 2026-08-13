import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app';

describe('GET /api/categories', () => {
  it('returns the four seeded categories', async () => {
    const response = await request(app).get('/api/categories');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(4);
    expect(response.body.map((category: { name: string }) => category.name)).toEqual([
      'Account and Access',
      'Hardware',
      'Software',
      'Network',
    ]);
    response.body.forEach((category: { id: number }) => {
      expect(typeof category.id).toBe('number');
    });
  });
});
