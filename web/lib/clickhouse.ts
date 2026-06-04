// Server-only ClickHouse client for the dashboard. Reads the SAME instance the
// ingestion pipeline writes to (same env vars, same defaults). Never import this
// from a client component.
import 'server-only';
import { createClient, type ClickHouseClient } from '@clickhouse/client';

let client: ClickHouseClient | null = null;

export function ch(): ClickHouseClient {
  if (!client) {
    client = createClient({
      url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
      username: process.env.CLICKHOUSE_USER || 'default',
      password: process.env.CLICKHOUSE_PASSWORD || '',
      database: process.env.CLICKHOUSE_DATABASE || 'er_oracle',
      request_timeout: 8000,
    });
  }
  return client;
}

// Run a query and return typed rows; never throws — returns [] on any failure so
// the dashboard degrades gracefully instead of 500-ing during a live demo.
export async function safeQuery<T>(query: string, query_params?: Record<string, unknown>): Promise<T[]> {
  try {
    const rs = await ch().query({ query, query_params, format: 'JSONEachRow' });
    return (await rs.json()) as T[];
  } catch (err) {
    console.error('[clickhouse] query failed:', (err as Error).message);
    return [];
  }
}
