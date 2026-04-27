// Global test setup
import { vi } from 'vitest';

// Prevent real Convex / DB connections unless DATABASE_URL is explicitly set
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/boop_test';
}

// Stub croner so no cron loops fire during tests
vi.mock('croner', () => ({ Cron: vi.fn().mockImplementation(() => ({ stop: vi.fn() })) }));
