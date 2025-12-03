<script setup>
import { onMounted, ref } from "vue";

const API_BASE = import.meta.env.VITE_PUBLIC_API_BASE_URL || "";

const token = ref("");
const user = ref(null);
const logging = ref(false);
const loginError = ref("");
const showRegister = ref(false);

const username = ref("");
const password = ref("");

const tasks = ref([]);
const showForm = ref(false);
const title = ref("");
const description = ref("");
const loading = ref(false);
const error = ref("");

const editingUuid = ref("");

function setToken(t, u) {
  token.value = t || "";
  user.value = u || null;
  if (typeof localStorage !== "undefined") {
    if (token.value) localStorage.setItem("token", token.value);
    else localStorage.removeItem("token");
    if (user.value) localStorage.setItem("user", JSON.stringify(user.value));
    else localStorage.removeItem("user");
  }
}

async function register() {
  loginError.value = "";
  if (!username.value || !password.value) {
    loginError.value = "Usuario y contraseña requeridos";
    return;
  }
  logging.value = true;

  try {
    const res = await fetch(`${API_BASE}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: username.value.trim(),
        password: password.value.trim(),
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || "Registro falló");
    }

    await login();
  } catch (e) {
    loginError.value = e?.message || String(e);
  } finally {
    logging.value = false;
  }
}

async function login() {
  loginError.value = "";
  if (!username.value || !password.value) {
    loginError.value = "Usuario y contraseña requeridos";
    return;
  }
  logging.value = true;

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: username.value.trim(),
        password: password.value.trim(),
      }),
    });

    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "Login failed");

    setToken(body.token, body.user);
    await fetchTasks();
  } catch (e) {
    loginError.value = e?.message || String(e);
  } finally {
    logging.value = false;
  }
}

function logout() {
  setToken("", null);
  tasks.value = [];
}

async function fetchTasks() {
  if (!token.value) return;
  loading.value = true;
  error.value = "";

  try {
    const res = await fetch(`${API_BASE}/tasks`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
    });

    if (!res.ok) throw new Error("No se pudieron cargar las tareas");
    tasks.value = await res.json();
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

async function addTask() {
  if (!title.value.trim()) return;
  loading.value = true;
  error.value = "";

  try {
    if (editingUuid.value) {
      const res = await fetch(`${API_BASE}/tasks/${editingUuid.value}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.value}`,
        },
        body: JSON.stringify({
          title: title.value.trim(),
          description: description.value.trim(),
        }),
      });

      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(
          b && (b.error || b.message)
            ? b.error || b.message
            : "Error actualizando tarea"
        );
      }

      const updated = await res.json();
      tasks.value = tasks.value.map((t) =>
        t.uuid === updated.uuid ? updated : t
      );
      editingUuid.value = "";
    } else {
      const res = await fetch(`${API_BASE}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.value}`,
        },
        body: JSON.stringify({
          title: title.value.trim(),
          description: description.value.trim(),
        }),
      });

      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(
          b && (b.error || b.message)
            ? b.error || b.message
            : "Error creando tarea"
        );
      }

      const created = await res.json();
      tasks.value = [created, ...tasks.value];
    }

    title.value = "";
    description.value = "";
    showForm.value = false;
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

function editTask(task) {
  editingUuid.value = task.uuid;
  title.value = task.title || "";
  description.value = task.description || "";
  showForm.value = true;
}

function resetForm() {
  editingUuid.value = "";
  title.value = "";
  description.value = "";
}

function closeForm() {
  resetForm();
  showForm.value = false;
}

function toggleForm() {
  if (showForm.value) {
    closeForm();
  } else {
    showForm.value = true;
  }
}

async function deleteTask(uuid) {
  if (!confirm("¿Eliminar este recordatorio?")) return;

  try {
    const res = await fetch(`${API_BASE}/tasks/${uuid}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
    });

    if (res.status === 204) {
      tasks.value = tasks.value.filter((t) => t.uuid !== uuid);
    } else {
      const body = await res.json().catch(() => null);
      throw new Error(
        body && (body.error || body.message)
          ? body.error || body.message
          : "Error eliminando"
      );
    }
  } catch (e) {
    error.value = e?.message || String(e);
  }
}

function formatDate(dateString) {
  if (!dateString) return "sin fecha";
  try {
    return new Date(dateString).toLocaleString("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch (e) {
    return dateString;
  }
}

onMounted(() => {
  document.title = "Recordatorios Ajolote";
  try {
    const t = localStorage.getItem("token");
    const u = localStorage.getItem("user");

    if (t) {
      const parsedUser = u ? JSON.parse(u) : null;
      setToken(t, parsedUser);
      fetchTasks();
    }
  } catch (e) {
    console.error("Failed to restore auth from localStorage", e);
  }
});
</script>

<template>
  <main class="page">
    <section class="card hero">
      <div>
        <p class="eyebrow">Ajolo-T</p>
        <h1>Recordatorios con AWS RDS</h1>
        <p class="lede">
          Registra un usuario, inicia sesión y guarda tareas en
          <code>ajolotedb.db</code> usando las rutas del backend Express.
        </p>
        <div class="badges">
          <span class="pill">API: {{ API_BASE }}</span>
          <span class="pill muted">
            {{ token ? "Sesión activa" : "Sin sesión" }}
          </span>
          <span class="pill muted">{{ tasks.length }} recordatorios</span>
        </div>
      </div>
      <div class="pulse" aria-hidden="true">
        <img
          src="https://png.pngtree.com/png-vector/20240717/ourmid/pngtree-axolotl-on-white-background-png-image_13135659.png"
          alt="Ajolote flotando"
        />
      </div>
    </section>

    <section class="card auth">
      <template v-if="token">
        <div class="session">
          <div>
            <p class="eyebrow">Sesión</p>
            <h2>{{ user?.username }}</h2>
            <p class="meta">UUID: {{ user?.uuid }}</p>
          </div>
          <div class="actions">
            <button type="button" class="ghost" @click="logout">Cerrar sesión</button>
            <button type="button" @click="fetchTasks" :disabled="loading">
              Actualizar
            </button>
          </div>
        </div>
        <p class="hint">
          Los recordatorios se guardan por usuario en la base de AWS.
        </p>
      </template>
      <template v-else>
        <div class="tabs">
          <button
            :class="{ active: !showRegister }"
            type="button"
            @click="showRegister = false"
          >
            Iniciar sesión
          </button>
          <button
            :class="{ active: showRegister }"
            type="button"
            @click="showRegister = true"
          >
            Crear cuenta
          </button>
        </div>

        <form class="form" @submit.prevent="showRegister ? register() : login()">
          <label>
            <span>Usuario</span>
            <input
              name="username"
              v-model="username"
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
              v-model="password"
              placeholder="••••••••"
              :autocomplete="showRegister ? 'new-password' : 'current-password'"
              required
            />
          </label>

          <p v-if="loginError" class="msg error">{{ loginError }}</p>

          <button type="submit" :disabled="logging">
            {{ logging ? "Procesando..." : showRegister ? "Registrarme" : "Entrar" }}
          </button>
          <p class="hint">
            Usa el mismo formulario para registrarte o entrar.
          </p>
        </form>
      </template>
    </section>

    <section class="card tasks">
      <header class="section-head">
        <div>
          <p class="eyebrow">Mis recordatorios</p>
          <h2>
            {{ tasks.length }} {{ tasks.length === 1 ? "tarea" : "tareas" }}
          </h2>
        </div>
        <div class="actions">
          <button
            v-if="token"
            type="button"
            class="ghost"
            @click="toggleForm"
          >
            {{ showForm ? "Cerrar formulario" : "Nuevo recordatorio" }}
          </button>
        </div>
      </header>

      <p v-if="!token" class="msg info">
        Inicia sesión para cargar y crear tareas.
      </p>
      <template v-else>
        <form v-if="showForm" class="form inline" @submit.prevent="addTask">
          <div class="double">
            <label>
              <span>Título</span>
              <input
                v-model="title"
                placeholder="Revisar pendientes"
                required
              />
            </label>
            <label>
              <span>Descripción</span>
              <input v-model="description" placeholder="Opcional" />
            </label>
          </div>
          <div class="actions">
            <button type="submit" :disabled="loading">
              {{ editingUuid ? "Guardar cambios" : "Crear recordatorio" }}
            </button>
          <button
            type="button"
            class="ghost"
            @click="closeForm"
          >
            Cancelar
          </button>
          </div>
        </form>

        <p v-if="loading && !showForm" class="msg info">Cargando...</p>
        <p v-if="error" class="msg error">{{ error }}</p>

        <p v-if="tasks.length === 0 && !loading" class="msg muted">
          No tienes recordatorios aún.
        </p>
        <ul v-else-if="tasks.length > 0" class="task-list">
          <li v-for="task in tasks" :key="task.uuid">
            <div>
              <p class="title">{{ task.title }}</p>
              <p class="body">
                {{ task.description || "Sin descripción" }}
              </p>
              <p class="meta">
                {{ formatDate(task.created_at) }} · {{ task.uuid?.slice(0, 8) }}
              </p>
            </div>
            <div class="actions">
              <button
                type="button"
                class="ghost"
                @click="editTask(task)"
              >
                Editar
              </button>
              <button
                type="button"
                class="ghost danger"
                @click="deleteTask(task.uuid)"
              >
                Eliminar
              </button>
            </div>
          </li>
        </ul>
      </template>
    </section>
  </main>
</template>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap");

:global(body) {
  margin: 0;
  min-height: 100vh;
  background: radial-gradient(
      circle at 10% 20%,
      rgba(14, 165, 233, 0.2),
      transparent 25%
    ),
    radial-gradient(
      circle at 80% 0%,
      rgba(45, 212, 191, 0.18),
      transparent 25%
    ),
    #0b1020;
  color: #e2e8f0;
  font-family: "Space Grotesk", "Segoe UI", sans-serif;
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
  background: linear-gradient(
    135deg,
    rgba(14, 165, 233, 0.12),
    rgba(45, 212, 191, 0.06)
  );
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
  transition:
    transform 0.1s ease,
    opacity 0.2s ease;
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
