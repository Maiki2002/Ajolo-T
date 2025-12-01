<script>
// @ts-nocheck
import { onMount } from 'svelte';

const API_BASE = 'http://localhost:3000';

let token = '';
let user = null;
let logging = false;
let loginError = '';
let showRegister = false;

// Login form
let username = '';
let password = '';

// Estado de tareas
let tasks = [];
let showForm = false;
let title = '';
let description = '';
let loading = false;
let error = '';

// Editing
let editingUuid = '';

// Guardar o limpiar token/usuario de localStorage
function setToken(t, u) {
  token = t || '';
  user = u || null;
  if (typeof localStorage !== 'undefined') {
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
    if (user) localStorage.setItem('user', JSON.stringify(user));
    else localStorage.removeItem('user');
  }
}

// -------------------------------------------
// POST /register → Registrar usuario
// -------------------------------------------
async function register() {
  loginError = '';
  if (!username || !password) {
    loginError = 'Usuario y contraseña requeridos';
    return;
  }
  logging = true;

  try {
    const res = await fetch(`${API_BASE}/register`, {
      method: 'POST', // PETICIÓN POST PARA REGISTRARSE
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) {
      const body = await res.json();
      throw new Error(body.error || 'Registro falló');
    }

    // Login
    await login();
  } catch (e) {
    loginError = (e && e.message) ? e.message : String(e);
  } finally {
    logging = false;
  }
}

// -------------------------------------------
// POST /login → Iniciar sesión
// -------------------------------------------
async function login() {
  loginError = '';
  if (!username || !password) {
    loginError = 'Usuario y contraseña requeridos';
    return;
  }
  logging = true;

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST', // PETICIÓN POST PARA LOGIN
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Login failed');

    setToken(body.token, body.user);

    // Cargar tareas después de iniciar sesión
    await fetchTasks();
  } catch (e) {
    loginError = (e && e.message) ? e.message : String(e);
  } finally {
    logging = false;
  }
}

// Cerrar sesión
function logout() {
  setToken('', null);
  tasks = [];
}

// -------------------------------------------
// GET /tasks → Obtener todas las tareas del usuario
// -------------------------------------------
async function fetchTasks() {
  if (!token) return;
  loading = true;
  error = '';

  try {
    const res = await fetch(`${API_BASE}/tasks`, {
      method: 'GET', // PETICIÓN GET PARA CARGAR TAREAS
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('No se pudieron cargar las tareas');
    tasks = await res.json();
  } catch (e) {
    error = (e && e.message) ? e.message : String(e);
  } finally {
    loading = false;
  }
}

// -------------------------------------------
// POST /tasks → Crear tarea
// PUT /tasks/:uuid → Editar tarea
// -------------------------------------------
async function addTask() {
  if (!title.trim()) return;
  loading = true;
  error = '';

  try {
    // Si estamos editando una tarea
    if (editingUuid) {
      const res = await fetch(`${API_BASE}/tasks/${editingUuid}`, {
        method: 'PUT', // PETICIÓN PUT PARA ACTUALIZAR TAREA
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim()
        })
      });

      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error((b && (b.error || b.message)) ? (b.error || b.message) : 'Error actualizando tarea');
      }

      const updated = await res.json();
      tasks = tasks.map((t) => t.uuid === updated.uuid ? updated : t);
      editingUuid = '';
    } else {
      // Crear nueva tarea
      const res = await fetch(`${API_BASE}/tasks`, {
        method: 'POST', // PETICIÓN POST PARA CREAR TAREA
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim()
        })
      });

      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error((b && (b.error || b.message)) ? (b.error || b.message) : 'Error creando tarea');
      }

      const created = await res.json();
      tasks = [created, ...tasks];
    }

    title = '';
    description = '';
    showForm = false;
  } catch (e) {
    error = (e && e.message) ? e.message : String(e);
  } finally {
    loading = false;
  }
}

// Cargar datos de tarea en el formulario
function editTask(task) {
  editingUuid = task.uuid;
  title = task.title || '';
  description = task.description || '';
  showForm = true;
}

// -------------------------------------------
// DELETE /tasks/:uuid → Eliminar tarea
// -------------------------------------------
async function deleteTask(uuid) {
  if (!confirm('¿Eliminar este recordatorio?')) return;

  try {
    const res = await fetch(`${API_BASE}/tasks/${uuid}`, {
      method: 'DELETE', // PETICIÓN DELETE PARA ELIMINAR TAREA
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.status === 204) {
      tasks = tasks.filter((t) => t.uuid !== uuid);
    } else {
      const body = await res.json().catch(() => null);
      throw new Error((body && (body.error || body.message)) ? (body.error || body.message) : 'Error eliminando');
    }
  } catch (e) {
    error = (e && e.message) ? e.message : String(e);
  }
}

// Restaurar sesión del localStorage al cargar la página
onMount(() => {
  try {
    const t = localStorage.getItem('token');
    const u = localStorage.getItem('user');

    if (t) {
      const parsedUser = u ? JSON.parse(u) : null;
      setToken(t, parsedUser);
      fetchTasks();
    }
  } catch (e) {
    console.error('Failed to restore auth from localStorage', e);
  }
});

function formatDate(dateString) {
  if (!dateString) return 'sin fecha';
  try {
    return new Date(dateString).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
  } catch (e) {
    return dateString;
  }
}
</script>

<svelte:head>
  <title>Recordatorios Ajolote</title>
</svelte:head>

<main class="page">
  <section class="card hero">
    <div>
      <p class="eyebrow">Ajolo-T</p>
      <h1>Recordatorios con SQLite local</h1>
      <p class="lede">
        Registra un usuario, inicia sesión y guarda tareas en <code>ajolotedb.db</code> usando las rutas del
        backend Express en el puerto 3000.
      </p>
      <div class="badges">
        <span class="pill">API: {API_BASE}</span>
        <span class="pill muted">{token ? 'Sesión activa' : 'Sin sesión'}</span>
        <span class="pill muted">{tasks.length} recordatorios</span>
      </div>
    </div>
    <!-- svelte-ignore a11y_missing_attribute -->
    <div class="pulse" aria-hidden="true"><img src="https://png.pngtree.com/png-vector/20240717/ourmid/pngtree-axolotl-on-white-background-png-image_13135659.png"></div>
  </section>

  <section class="card auth">
    {#if token}
      <div class="session">
        <div>
          <p class="eyebrow">Sesión</p>
          <h2>{user?.username}</h2>
          <p class="meta">UUID: {user?.uuid}</p>
        </div>
        <div class="actions">
          <button type="button" class="ghost" on:click={logout}>Cerrar sesión</button>
          <button type="button" on:click={fetchTasks} disabled={loading}>Actualizar</button>
        </div>
      </div>
      <p class="hint">Los recordatorios se guardan por usuario en la base local.</p>
    {:else}
      <div class="tabs">
        <button class:active={!showRegister} type="button" on:click={() => (showRegister = false)}>
          Iniciar sesión
        </button>
        <button class:active={showRegister} type="button" on:click={() => (showRegister = true)}>
          Crear cuenta
        </button>
      </div>

      <form class="form" on:submit|preventDefault={showRegister ? register : login}>
        <label>
          <span>Usuario</span>
          <input
            name="username"
            bind:value={username}
            placeholder="ajolote"
            autocomplete="username"
            required
          />
        </label>
        <label>
          <span>Contraseña</span>
          <input
            name="password"
            type="password"
            bind:value={password}
            placeholder="••••••••"
            autocomplete={showRegister ? 'new-password' : 'current-password'}
            required
          />
        </label>

        {#if loginError}
          <p class="msg error">{loginError}</p>
        {/if}

        <button type="submit" disabled={logging}>
          {#if logging}Procesando...{:else}{showRegister ? 'Registrarme' : 'Entrar'}{/if}
        </button>
        <p class="hint">Usa el mismo formulario para registrarte o entrar.</p>
      </form>
    {/if}
  </section>

  <section class="card tasks">
    <header class="section-head">
      <div>
        <p class="eyebrow">Mis recordatorios</p>
        <h2>{tasks.length} {tasks.length === 1 ? 'tarea' : 'tareas'}</h2>
      </div>
      <div class="actions">
        {#if token}
          <button
            type="button"
            class="ghost"
            on:click={() => {
              showForm = !showForm;
              if (!showForm) {
                editingUuid = '';
                title = '';
                description = '';
              }
            }}
          >
            {showForm ? 'Cerrar formulario' : 'Nuevo recordatorio'}
          </button>
        {/if}
      </div>
    </header>

    {#if !token}
      <p class="msg info">Inicia sesión para cargar y crear tareas.</p>
    {:else}
      {#if showForm}
        <form class="form inline" on:submit|preventDefault={addTask}>
          <div class="double">
            <label>
              <span>Título</span>
              <input bind:value={title} placeholder="Revisar pendientes" required />
            </label>
            <label>
              <span>Descripción</span>
              <input bind:value={description} placeholder="Opcional" />
            </label>
          </div>
          <div class="actions">
            <button type="submit" disabled={loading}>
              {editingUuid ? 'Guardar cambios' : 'Crear recordatorio'}
            </button>
            <button
              type="button"
              class="ghost"
              on:click={() => {
                editingUuid = '';
                title = '';
                description = '';
                showForm = false;
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      {/if}

      {#if loading && !showForm}
        <p class="msg info">Cargando...</p>
      {/if}
      {#if error}
        <p class="msg error">{error}</p>
      {/if}

      {#if tasks.length === 0 && !loading}
        <p class="msg muted">No tienes recordatorios aún.</p>
      {:else if tasks.length > 0}
        <ul class="task-list">
          {#each tasks as task}
            <li>
              <div>
                <p class="title">{task.title}</p>
                <p class="body">{task.description || 'Sin descripción'}</p>
                <p class="meta">{formatDate(task.created_at)} · {task.uuid?.slice(0, 8)}</p>
              </div>
              <div class="actions">
                <button type="button" class="ghost" on:click={() => editTask(task)}>Editar</button>
                <button type="button" class="ghost danger" on:click={() => deleteTask(task.uuid)}>Eliminar</button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </section>
</main>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');

  :global(body) {
    margin: 0;
    min-height: 100vh;
    background: radial-gradient(circle at 10% 20%, rgba(14, 165, 233, 0.2), transparent 25%),
      radial-gradient(circle at 80% 0%, rgba(45, 212, 191, 0.18), transparent 25%),
      #0b1020;
    color: #e2e8f0;
    font-family: 'Space Grotesk', 'Segoe UI', sans-serif;
  }

  main.page {
    padding: 2rem;
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    max-width: 1100px;
    margin: 0 auto 2rem;
  }

  .card {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 18px;
    padding: 1.5rem;
    box-shadow: 0 20px 80px rgba(0, 0, 0, 0.35);
  }

  .hero {
    grid-column: 1 / -1;
    display: flex;
    gap: 1rem;
    align-items: center;
    justify-content: space-between;
    background: linear-gradient(135deg, rgba(14, 165, 233, 0.12), rgba(45, 212, 191, 0.06));
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  h1 {
    margin: 0.25rem 0;
    font-size: 2rem;
    letter-spacing: -0.02em;
  }

  h2 {
    margin: 0.2rem 0;
    letter-spacing: -0.01em;
  }

  .eyebrow {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 0.75rem;
    color: #7dd3fc;
  }

  .lede {
    margin: 0.5rem 0 1rem 0;
    color: #cbd5e1;
    max-width: 60ch;
  }

  .badges {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.75rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    font-size: 0.9rem;
  }

  .pill.muted {
    opacity: 0.7;
  }

  .pulse {
    width: 82px;
    height: 82px;
    display: grid;
    place-items: center;
    border-radius: 18px;
    background: none;
    color: #e2e8f0;
    font-size: 2.2rem;
    box-shadow: none;
    animation: float 3s ease-in-out infinite;
  }

  .auth .tabs {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    margin-bottom: 1rem;
    gap: 0.5rem;
  }

  .tabs button {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #e2e8f0;
    padding: 0.7rem;
    border-radius: 12px;
    cursor: pointer;
  }

  .tabs button.active {
    background: linear-gradient(135deg, #0ea5e9, #22c55e);
    color: #0b1020;
    border: none;
  }

  .session {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }

  .meta {
    margin: 0.15rem 0;
    color: #94a3b8;
    font-size: 0.9rem;
  }

  .form {
    display: grid;
    gap: 0.9rem;
  }

  .form.inline {
    margin: 0.6rem 0 1rem 0;
  }

  .form label {
    display: grid;
    gap: 0.35rem;
    color: #cbd5e1;
    font-size: 0.95rem;
  }

  .form input {
    padding: 0.75rem;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    color: #e2e8f0;
  }

  .double {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 0.75rem;
  }

  button {
    border: none;
    padding: 0.75rem 1rem;
    border-radius: 12px;
    background: linear-gradient(135deg, #0ea5e9, #22c55e);
    color: #0b1020;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.1s ease, opacity 0.2s ease;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  button:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  button.ghost {
    background: rgba(255, 255, 255, 0.06);
    color: #e2e8f0;
  }

  button.ghost.danger {
    border: 1px solid rgba(248, 113, 113, 0.5);
    color: #fca5a5;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .hint {
    margin: 0.4rem 0 0;
    color: #94a3b8;
    font-size: 0.9rem;
  }

  .section-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .task-list {
    list-style: none;
    padding: 0;
    margin: 1rem 0 0 0;
    display: grid;
    gap: 0.8rem;
  }

  .task-list li {
    padding: 1rem;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: flex-start;
  }

  .task-list .title {
    margin: 0 0 0.2rem 0;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .task-list .body {
    margin: 0 0 0.25rem 0;
    color: #cbd5e1;
  }

  .msg {
    padding: 0.75rem 1rem;
    border-radius: 12px;
    margin: 0.3rem 0;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .msg.info {
    border-color: rgba(14, 165, 233, 0.4);
    color: #7dd3fc;
  }

  .msg.error {
    border-color: rgba(248, 113, 113, 0.5);
    color: #fca5a5;
  }

  .msg.muted {
    color: #94a3b8;
  }

  @keyframes float {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-6px);
    }
  }

  @media (max-width: 640px) {
    main.page {
      padding: 1.25rem;
    }
    .session,
    .section-head,
    .task-list li {
      flex-direction: column;
      align-items: flex-start;
    }
    .actions {
      width: 100%;
    }
    button,
    .actions button {
      width: fit-content;
    }
  }
</style>
