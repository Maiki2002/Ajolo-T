import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { pool } from './sql.js';

// CORS y tipos de respuesta
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

  return {
    statusCode,
    headers: finalHeaders,
    body: responseBody
  };
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

// ------------------------------
// Inicialización y helpers de DB (MySQL)
// ------------------------------
async function ensureSchema() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      uuid VARCHAR(36) UNIQUE,
      username VARCHAR(191) UNIQUE,
      password_hash VARCHAR(255),
      created_at DATETIME
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_uuid VARCHAR(36),
      uuid VARCHAR(36) UNIQUE,
      title VARCHAR(255),
      description TEXT,
      created_at DATETIME,
      INDEX idx_tasks_user_uuid (user_uuid)
    )
  `);
}

const initPromise = ensureSchema().catch((err) => {
  console.error('Error ensuring schema', err);
  throw err;
});

async function getAuthUser(headers) {
  const header = headers.authorization || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { error: buildResponse(401, { error: 'Missing token' }) };

  const [rows] = await pool.execute('SELECT id, uuid, username FROM users WHERE uuid = ?', [token]);
  const user = rows[0];
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

    const [existingRows] = await pool.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (existingRows.length > 0) return buildResponse(409, { error: 'Username already exists' });

    const userUuid = uuidv4();
    const created_at = new Date().toISOString();
    const password_hash = bcrypt.hashSync(password, 10);

    const [result] = await pool.execute(
      'INSERT INTO users (uuid, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
      [userUuid, username, password_hash, created_at]
    );

    return buildResponse(201, {
      id: result.insertId,
      uuid: userUuid,
      username,
      created_at
    });
  },

  async login(method, body) {
    if (method !== 'POST') return buildResponse(405, { error: 'Method Not Allowed' });
    if (!body || body.__invalid) return buildResponse(400, { error: 'Invalid JSON body' });

    const { username, password } = body || {};
    if (!username || !password) return buildResponse(400, { error: 'Username and password required' });

    const [rows] = await pool.execute(
      'SELECT id, uuid, username, password_hash FROM users WHERE username = ?',
      [username]
    );
    const user = rows[0];
    if (!user) return buildResponse(401, { error: 'Invalid credentials' });

    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) return buildResponse(401, { error: 'Invalid credentials' });

    return buildResponse(200, { token: user.uuid, user: { uuid: user.uuid, username: user.username } });
  },

  async getTasks(method, headers) {
    if (method !== 'GET') return buildResponse(405, { error: 'Method Not Allowed' });
    const { error, user } = await getAuthUser(headers);
    if (error) return error;

    const [rows] = await pool.execute(
      'SELECT id, uuid, title, description, created_at FROM tasks WHERE user_uuid = ? ORDER BY id DESC',
      [user.uuid]
    );
    return buildResponse(200, rows);
  },

  async createTask(method, headers, body) {
    if (method !== 'POST') return buildResponse(405, { error: 'Method Not Allowed' });
    if (!body || body.__invalid) return buildResponse(400, { error: 'Invalid JSON body' });
    const { error, user } = await getAuthUser(headers);
    if (error) return error;

    const { title, description } = body || {};
    if (!title) return buildResponse(400, { error: 'Title is required' });

    const taskUuid = uuidv4();
    const created_at = new Date().toISOString();
    const [result] = await pool.execute(
      'INSERT INTO tasks (user_uuid, uuid, title, description, created_at) VALUES (?, ?, ?, ?, ?)',
      [user.uuid, taskUuid, title, description || '', created_at]
    );

    const [rows] = await pool.execute(
      'SELECT id, uuid, title, description, created_at FROM tasks WHERE id = ?',
      [result.insertId]
    );
    return buildResponse(201, rows[0]);
  },

  async updateTask(method, headers, body, taskUuid) {
    if (method !== 'PUT') return buildResponse(405, { error: 'Method Not Allowed' });
    if (!body || body.__invalid) return buildResponse(400, { error: 'Invalid JSON body' });
    const { error, user } = await getAuthUser(headers);
    if (error) return error;

    const { title, description } = body || {};
    if (!title) return buildResponse(400, { error: 'Title is required' });

    const [existingRows] = await pool.execute('SELECT user_uuid FROM tasks WHERE uuid = ?', [taskUuid]);
    const existing = existingRows[0];
    if (!existing) return buildResponse(404, { error: 'Task not found' });
    if (existing.user_uuid !== user.uuid) return buildResponse(403, { error: 'Not allowed' });

    await pool.execute('UPDATE tasks SET title = ?, description = ? WHERE uuid = ?', [
      title,
      description || '',
      taskUuid
    ]);

    const [rows] = await pool.execute(
      'SELECT id, uuid, title, description, created_at FROM tasks WHERE uuid = ?',
      [taskUuid]
    );
    return buildResponse(200, rows[0]);
  },

  async deleteTask(method, headers, taskUuid) {
    if (method !== 'DELETE') return buildResponse(405, { error: 'Method Not Allowed' });
    const { error, user } = await getAuthUser(headers);
    if (error) return error;

    const [existingRows] = await pool.execute('SELECT user_uuid FROM tasks WHERE uuid = ?', [taskUuid]);
    const existing = existingRows[0];
    if (!existing) return buildResponse(404, { error: 'Task not found' });
    if (existing.user_uuid !== user.uuid) return buildResponse(403, { error: 'Not allowed' });

    await pool.execute('DELETE FROM tasks WHERE uuid = ?', [taskUuid]);
    return buildResponse(204);
  }
};

export const handler = async (event) => {
  await initPromise;

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
