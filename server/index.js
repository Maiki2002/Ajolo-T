// ------------------------------
// Importación de librerías
// ------------------------------
import express from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

// ------------------------------
// Configuración inicial de Express
// ------------------------------
const app = express();
app.use(express.json());

// ------------------------------
// Middleware CORS 
// ------------------------------
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ------------------------------
// Conexión a la base de datos SQLite
// ------------------------------
const dbPath = path.join(process.cwd(), 'server/data/ajolotedb.db');
const db = new Database(dbPath);

// ------------------------------
// Creación de tabla USERS 
// ------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE
);
`);

// ------------------------------
// Verificación y creación de columnas faltantes en USERS
// ------------------------------
try {
  const info = db.prepare("PRAGMA table_info(users)").all();
  const cols = info.map(c => c.name);

  if (!cols.includes('uuid')) db.prepare('ALTER TABLE users ADD COLUMN uuid TEXT').run();
  if (!cols.includes('password_hash')) db.prepare('ALTER TABLE users ADD COLUMN password_hash TEXT').run();
  if (!cols.includes('created_at')) db.prepare('ALTER TABLE users ADD COLUMN created_at TEXT').run();

} catch (e) {
  console.error('Error ensuring users columns', e);
}

// ------------------------------
// Creación de tabla TASKS 
// ------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  description TEXT
);
`);

// ------------------------------
// Verificación y creación de columnas faltantes en TASKS
// ------------------------------
try {
  const infoTasks = db.prepare("PRAGMA table_info(tasks)").all();
  const tcols = infoTasks.map(c => c.name);

  if (!tcols.includes('user_uuid')) db.prepare('ALTER TABLE tasks ADD COLUMN user_uuid TEXT').run();
  if (!tcols.includes('uuid')) db.prepare('ALTER TABLE tasks ADD COLUMN uuid TEXT').run();
  if (!tcols.includes('created_at')) db.prepare('ALTER TABLE tasks ADD COLUMN created_at TEXT').run();

} catch (e) {
  console.error('Error ensuring tasks columns', e);
}

// ------------------------------
// Ruta raíz
// ------------------------------
app.get('/', (req, res) => {
  res.send('Express server running');
});

// ------------------------------
// POST /register → Registrar usuario
// ------------------------------
app.post('/register', (req, res) => {
  try {
    const { username, password } = req.body || {};

    // Validación 
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing)
      return res.status(409).json({ error: 'Username already exists' });

    const userUuid = uuidv4();
    const created_at = new Date().toISOString();
    const password_hash = bcrypt.hashSync(password, 10);

    // Insertar nuevo usuario
    const insert = db.prepare('INSERT INTO users (uuid, username, password_hash, created_at) VALUES (?, ?, ?, ?)');
    const info = insert.run(userUuid, username, password_hash, created_at);

    const user = { id: info.lastInsertRowid, uuid: userUuid, username, created_at };
    res.status(201).json(user);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to register' });
  }
});

// ------------------------------
// POST /login → Iniciar sesión
// ------------------------------
app.post('/login', (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });

    const user = db.prepare('SELECT id, uuid, username, password_hash FROM users WHERE username = ?').get(username);
    if (!user)
      return res.status(401).json({ error: 'Invalid credentials' });

    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok)
      return res.status(401).json({ error: 'Invalid credentials' });

    // Aquí enviamos como token el UUID del usuario
    res.json({ token: user.uuid, user: { uuid: user.uuid, username: user.username } });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ------------------------------
// Middleware de autenticación
// Espera: Authorization: Bearer <uuid>
// ------------------------------
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace(/^Bearer\s+/, '').trim();

  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  const user = db.prepare('SELECT id, uuid, username FROM users WHERE uuid = ?').get(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  req.user = user; // Guardamos el usuario en la petición
  next();
}

// ------------------------------
// GET /tasks → Obtener tareas del usuario autenticado
// ------------------------------
app.get('/tasks', auth, (req, res) => {
  try {
    const stmt = db.prepare(
      'SELECT id, uuid, title, description, created_at FROM tasks WHERE user_uuid = ? ORDER BY id DESC'
    );
    const rows = stmt.all(req.user.uuid);
    res.json(rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// ------------------------------
// POST /tasks → Crear una nueva tarea
// ------------------------------
app.post('/tasks', auth, (req, res) => {
  try {
    const { title, description } = req.body || {};
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const taskUuid = uuidv4();
    const created_at = new Date().toISOString();

    const insert = db.prepare(
      'INSERT INTO tasks (user_uuid, uuid, title, description, created_at) VALUES (?, ?, ?, ?, ?)'
    );

    const info = insert.run(req.user.uuid, taskUuid, title, description || '', created_at);

    const task = db.prepare('SELECT id, uuid, title, description, created_at FROM tasks WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(task);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// ------------------------------
// PUT /tasks/:uuid → Actualizar tarea por UUID
// ------------------------------
app.put('/tasks/:uuid', auth, (req, res) => {
  try {
    const taskUuid = req.params.uuid;
    const { title, description } = req.body || {};

    if (!title) return res.status(400).json({ error: 'Title is required' });

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

// ------------------------------
// DELETE /tasks/:uuid → Eliminar tarea por UUID
// ------------------------------
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

// ------------------------------
// Inicio del servidor HTTP
// ------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});