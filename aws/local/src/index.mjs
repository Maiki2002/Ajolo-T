import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

const dirsToTry = [
  process.env.DB_DIR,
  path.join(process.cwd(), 'tmp'),
  path.join('/tmp', 'ajolotedb')
].filter(Boolean);

function ensureDbDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch (err) {
    if (['EACCES', 'EROFS', 'ENOENT'].includes(err.code)) {
      console.warn(`Failed to create DB directory "${dir}", trying next option`, err.message);
      return null;
    }
    throw err;
  }
}

let dbDir = null;
for (const candidate of dirsToTry) {
  const created = ensureDbDir(candidate);
  if (created) {
    dbDir = created;
    break;
  }
}

if (!dbDir) {
  throw new Error('Unable to create a writable directory for the SQLite database');
}

const dbPath = path.join(dbDir, 'ajolotedb.db');
const db = new Database(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  description TEXT
);
`);

try {
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('uuid')) db.prepare('ALTER TABLE users ADD COLUMN uuid TEXT').run();
  if (!cols.includes('password_hash')) db.prepare('ALTER TABLE users ADD COLUMN password_hash TEXT').run();
  if (!cols.includes('created_at')) db.prepare('ALTER TABLE users ADD COLUMN created_at TEXT').run();
} catch (err) {
  console.error('Error ensuring users columns', err);
}

try {
  const cols = db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name);
  if (!cols.includes('user_uuid')) db.prepare('ALTER TABLE tasks ADD COLUMN user_uuid TEXT').run();
  if (!cols.includes('uuid')) db.prepare('ALTER TABLE tasks ADD COLUMN uuid TEXT').run();
  if (!cols.includes('created_at')) db.prepare('ALTER TABLE tasks ADD COLUMN created_at TEXT').run();
} catch (err) {
  console.error('Error ensuring tasks columns', err);
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

const jsonHeaders = { 'Content-Type': 'application/json' };
const textHeaders = { 'Content-Type': 'text/plain' };

function buildResponse(statusCode, body, headers = {}) {
  let responseBody = '';
  const finalHeaders = { ...corsHeaders, ...headers };

  if (typeof body === 'string') {
    responseBody = body;
    Object.assign(finalHeaders, textHeaders);
  } else if (body !== undefined) {
    responseBody = JSON.stringify(body);
    Object.assign(finalHeaders, jsonHeaders);
  }

  return { statusCode, headers: finalHeaders, body: responseBody };
}

function normalizePath(event) {
  let rawPath = event.rawPath || event.path || '/';
  const stage = event.requestContext?.stage;
  if (stage && rawPath.startsWith(`/${stage}`)) {
    rawPath = rawPath.slice(stage.length + 1) || '/';
  }
  if (!rawPath.startsWith('/')) rawPath = `/${rawPath}`;
  return rawPath;
}

function normalizeHeaders(headers = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key) normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

function getMethod(event) {
  return (event.requestContext?.http?.method || event.httpMethod || 'GET').toUpperCase();
}

function parseBody(event) {
  if (!event.body) return null;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return { __invalid: true };
  }
}

function getAuthUser(headers) {
  const header = headers.authorization || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { error: buildResponse(401, { error: 'Missing token' }) };

  const user = db.prepare('SELECT id, uuid, username FROM users WHERE uuid = ?').get(token);
  if (!user) return { error: buildResponse(401, { error: 'Invalid token' }) };

  return { user };
}

const handlers = {
  async root(method) {
    if (method !== 'GET') return buildResponse(405, { error: 'Method Not Allowed' });
    return buildResponse(200, 'Express server running');
  },

  async register(method, body) {
    if (method !== 'POST') return buildResponse(405, { error: 'Method Not Allowed' });
    if (!body || body.__invalid) return buildResponse(400, { error: 'Invalid JSON body' });

    const { username, password } = body || {};
    if (!username || !password) return buildResponse(400, { error: 'Username and password required' });

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
       if (existing) return buildResponse(409, { error: 'Username already exists' });

    const userUuid = uuidv4();
    const created_at = new Date().toISOString();
    const password_hash = bcrypt.hashSync(password, 10);

    const insert = db.prepare('INSERT INTO users (uuid, username, password_hash, created_at) VALUES (?, ?, ?, ?)');
    const info = insert.run(userUuid, username, password_hash, created_at);

    return buildResponse(201, { id: info.lastInsertRowid, uuid: userUuid, username, created_at });
  },

  async login(method, body) {
    if (method !== 'POST') return buildResponse(405, { error: 'Method Not Allowed' });
    if (!body || body.__invalid) return buildResponse(400, { error: 'Invalid JSON body' });

    const { username, password } = body || {};
    if (!username || !password) return buildResponse(400, { error: 'Username and password required' });

    const user = db
      .prepare('SELECT id, uuid, username, password_hash FROM users WHERE username = ?')
      .get(username);
    if (!user) return buildResponse(401, { error: 'Invalid credentials' });

    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) return buildResponse(401, { error: 'Invalid credentials' });

    return buildResponse(200, { token: user.uuid, user: { uuid: user.uuid, username: user.username } });
  },

  async getTasks(method, headers) {
    if (method !== 'GET') return buildResponse(405, { error: 'Method Not Allowed' });
    const { error, user } = getAuthUser(headers);
    if (error) return error;

    const stmt = db.prepare(
      'SELECT id, uuid, title, description, created_at FROM tasks WHERE user_uuid = ? ORDER BY id DESC'
    );
    const rows = stmt.all(user.uuid);
    return buildResponse(200, rows);
  },

  async createTask(method, headers, body) {
    if (method !== 'POST') return buildResponse(405, { error: 'Method Not Allowed' });
    if (!body || body.__invalid) return buildResponse(400, { error: 'Invalid JSON body' });
    const { error, user } = getAuthUser(headers);
    if (error) return error;

    const { title, description } = body || {};
    if (!title) return buildResponse(400, { error: 'Title is required' });

    const taskUuid = uuidv4();
       const created_at = new Date().toISOString();
    const insert = db.prepare(
      'INSERT INTO tasks (user_uuid, uuid, title, description, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    const info = insert.run(user.uuid, taskUuid, title, description || '', created_at);

    const task = db
      .prepare('SELECT id, uuid, title, description, created_at FROM tasks WHERE id = ?')
      .get(info.lastInsertRowid);
    return buildResponse(201, task);
  },

  async updateTask(method, headers, body, taskUuid) {
    if (method !== 'PUT') return buildResponse(405, { error: 'Method Not Allowed' });
    if (!body || body.__invalid) return buildResponse(400, { error: 'Invalid JSON body' });
    const { error, user } = getAuthUser(headers);
    if (error) return error;

    const { title, description } = body || {};
    if (!title) return buildResponse(400, { error: 'Title is required' });

    const existing = db.prepare('SELECT user_uuid FROM tasks WHERE uuid = ?').get(taskUuid);
    if (!existing) return buildResponse(404, { error: 'Task not found' });
    if (existing.user_uuid !== user.uuid) return buildResponse(403, { error: 'Not allowed' });

    db.prepare('UPDATE tasks SET title = ?, description = ? WHERE uuid = ?').run(title, description || '', taskUuid);
    const task = db.prepare('SELECT id, uuid, title, description, created_at FROM tasks WHERE uuid = ?').get(taskUuid);
    return buildResponse(200, task);
  },

  async deleteTask(method, headers, taskUuid) {
    if (method !== 'DELETE') return buildResponse(405, { error: 'Method Not Allowed' });
    const { error, user } = getAuthUser(headers);
    if (error) return error;

    const existing = db.prepare('SELECT user_uuid FROM tasks WHERE uuid = ?').get(taskUuid);
    if (!existing) return buildResponse(404, { error: 'Task not found' });
    if (existing.user_uuid !== user.uuid) return buildResponse(403, { error: 'Not allowed' });

    db.prepare('DELETE FROM tasks WHERE uuid = ?').run(taskUuid);
    return buildResponse(204);
  }
};

export const handler = async (event) => {
  const method = getMethod(event);
  const path = normalizePath(event);
  const headers = normalizeHeaders(event.headers || {});

  if (method === 'OPTIONS') {
    return buildResponse(204);
  }

  const body = parseBody(event);

  try {
    if (path === '/') {
      return await handlers.root(method);
    }

    if (path === '/register') {
      return await handlers.register(method, body);
    }

    if (path === '/login') {
      return await handlers.login(method, body);
    }

    if (path === '/tasks') {
      if (method === 'GET') {
        return await handlers.getTasks(method, headers);
      }
      if (method === 'POST') {
        return await handlers.createTask(method, headers, body);
      }
      return buildResponse(405, { error: 'Method Not Allowed' });
    }

    const match = path.match(/^\/tasks\/([^/]+)$/);
    if (match) {
      const taskUuid = match[1];
      if (method === 'PUT') {
        return await handlers.updateTask(method, headers, body, taskUuid);
      }
      if (method === 'DELETE') {
        return await handlers.deleteTask(method, headers, taskUuid);
      }
      return buildResponse(405, { error: 'Method Not Allowed' });
    }

    return buildResponse(404, { error: 'Not found' });
  } catch (err) {
    console.error('Lambda handler error', err);
    return buildResponse(500, { error: 'Internal Server Error' });
  }
};
