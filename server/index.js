import express from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

const app = express();
app.use(express.json());

// Simple CORS middleware for local development
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const dbPath = path.join(process.cwd(), 'ajolotedb.db');
const db = new Database(dbPath);

// Users table: id, uuid, username, password_hash, created_at
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE
);
`);

// Ensure columns exist for users table (add if missing)
try {
  const info = db.prepare("PRAGMA table_info(users)").all();
  const cols = info.map(c => c.name);
  if (!cols.includes('uuid')) db.prepare('ALTER TABLE users ADD COLUMN uuid TEXT').run();
  if (!cols.includes('password_hash')) db.prepare('ALTER TABLE users ADD COLUMN password_hash TEXT').run();
  if (!cols.includes('created_at')) db.prepare('ALTER TABLE users ADD COLUMN created_at TEXT').run();
} catch (e) {
  console.error('Error ensuring users columns', e);
}

// Tasks table: id (PK), user_uuid, uuid, title, description, created_at
db.exec(`
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  description TEXT
);
`);

// Ensure columns exist for tasks table (add if missing)
try {
  const infoTasks = db.prepare("PRAGMA table_info(tasks)").all();
  const tcols = infoTasks.map(c => c.name);
  if (!tcols.includes('user_uuid')) db.prepare('ALTER TABLE tasks ADD COLUMN user_uuid TEXT').run();
  if (!tcols.includes('uuid')) db.prepare('ALTER TABLE tasks ADD COLUMN uuid TEXT').run();
  if (!tcols.includes('created_at')) db.prepare('ALTER TABLE tasks ADD COLUMN created_at TEXT').run();
} catch (e) {
  console.error('Error ensuring tasks columns', e);
}

app.get('/', (req, res) => {
  res.send('Express server running');
});

// Register user
app.post('/register', (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: 'Username already exists' });

    const userUuid = uuidv4();
    const created_at = new Date().toISOString();
    const password_hash = bcrypt.hashSync(password, 10);

    const insert = db.prepare('INSERT INTO users (uuid, username, password_hash, created_at) VALUES (?, ?, ?, ?)');
    const info = insert.run(userUuid, username, password_hash, created_at);

    const user = { id: info.lastInsertRowid, uuid: userUuid, username, created_at };
    res.status(201).json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to register' });
  }
});

// Login
app.post('/login', (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const user = db.prepare('SELECT id, uuid, username, password_hash FROM users WHERE username = ?').get(username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    // For simplicity we return the user's uuid as a token. In production use JWT or sessions.
    res.json({ token: user.uuid, user: { uuid: user.uuid, username: user.username } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Simple auth middleware: expects Authorization: Bearer <user_uuid>
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace(/^Bearer\s+/, '').trim();
  if (!token) {
    console.log('auth: missing token; Authorization header:', req.headers.authorization);
    return res.status(401).json({ error: 'Missing token' });
  }
  // DEBUG: log received token (temporary)
  console.log('auth: received token=', token);
  const user = db.prepare('SELECT id, uuid, username FROM users WHERE uuid = ?').get(token);
  if (!user) {
    console.log('auth: token not matched to any user');
    return res.status(401).json({ error: 'Invalid token' });
  }
  req.user = user;
  next();
}

// List tasks for authenticated user
app.get('/tasks', auth, (req, res) => {
  try {
    const stmt = db.prepare('SELECT id, uuid, title, description, created_at FROM tasks WHERE user_uuid = ? ORDER BY id DESC');
    const rows = stmt.all(req.user.uuid);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Create a task for authenticated user
app.post('/tasks', auth, (req, res) => {
  try {
    const { title, description } = req.body || {};
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Title is required' });
    }

    const taskUuid = uuidv4();
    const created_at = new Date().toISOString();

    const insert = db.prepare('INSERT INTO tasks (user_uuid, uuid, title, description, created_at) VALUES (?, ?, ?, ?, ?)');
    const info = insert.run(req.user.uuid, taskUuid, title, description || '', created_at);

    const task = db.prepare('SELECT id, uuid, title, description, created_at FROM tasks WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update a task (by uuid) for authenticated user
app.put('/tasks/:uuid', auth, (req, res) => {
  try {
    const taskUuid = req.params.uuid;
    const { title, description } = req.body || {};
    if (!title || typeof title !== 'string') return res.status(400).json({ error: 'Title is required' });

    const existing = db.prepare('SELECT user_uuid FROM tasks WHERE uuid = ?').get(taskUuid);
    if (!existing) return res.status(404).json({ error: 'Task not found' });
    if (existing.user_uuid !== req.user.uuid) return res.status(403).json({ error: 'Not allowed' });

    db.prepare('UPDATE tasks SET title = ?, description = ? WHERE uuid = ?').run(title, description || '', taskUuid);
    const task = db.prepare('SELECT id, uuid, title, description, created_at FROM tasks WHERE uuid = ?').get(taskUuid);
    res.json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete a task (by uuid) for authenticated user
app.delete('/tasks/:uuid', auth, (req, res) => {
  try {
    const taskUuid = req.params.uuid;
    const existing = db.prepare('SELECT user_uuid FROM tasks WHERE uuid = ?').get(taskUuid);
    if (!existing) return res.status(404).json({ error: 'Task not found' });
    if (existing.user_uuid !== req.user.uuid) return res.status(403).json({ error: 'Not allowed' });

    db.prepare('DELETE FROM tasks WHERE uuid = ?').run(taskUuid);
    res.sendStatus(204);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
