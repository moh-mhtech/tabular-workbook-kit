export type SqlQueryResult<T> = { rows: T[] };

export type SqlClient = {
  query<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SqlQueryResult<T>>;
  exec(sql: string): Promise<void>;
};
