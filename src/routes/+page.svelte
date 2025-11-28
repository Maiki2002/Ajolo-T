<script>
// @ts-nocheck
	import { onMount } from 'svelte';

	const API_BASE = 'http://localhost:3000';

	// Auth state (don't access localStorage during SSR)
	let token = '';
	let user = null;
	let logging = false;
	let loginError = '';
	let showRegister = false;

	// Login form
	let username = '';
	let password = '';

	// Tasks state
	let tasks = [];
	let showForm = false;
	let title = '';
	let description = '';
	let loading = false;
	let error = '';

	// Editing
	let editingUuid = '';

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

	async function register() {
		loginError = '';
		if (!username || !password) { loginError = 'Usuario y contraseña requeridos'; return; }
		logging = true;
		try {
			const res = await fetch(`${API_BASE}/register`, {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username, password })
			});
			if (!res.ok) {
				const body = await res.json();
				throw new Error(body.error || 'Registro falló');
			}
			await login();
		} catch (e) {
			loginError = (e && e.message) ? e.message : String(e);
		} finally { logging = false; }
	}

	async function login() {
		loginError = '';
		if (!username || !password) { loginError = 'Usuario y contraseña requeridos'; return; }
		logging = true;
		try {
			const res = await fetch(`${API_BASE}/login`, {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username, password })
			});
			const body = await res.json();
			if (!res.ok) throw new Error(body.error || 'Login failed');
			setToken(body.token, body.user);
			await fetchTasks();
		} catch (e) {
			loginError = (e && e.message) ? e.message : String(e);
		} finally { logging = false; }
	}

	function logout() {
		setToken('', null);
		tasks = [];
	}

	async function fetchTasks() {
		if (!token) return;
		loading = true; error = '';
		try {
			const res = await fetch(`${API_BASE}/tasks`, { headers: { Authorization: `Bearer ${token}` } });
			if (!res.ok) throw new Error('No se pudieron cargar las tareas');
			tasks = await res.json();
		} catch (e) { error = (e && e.message) ? e.message : String(e); }
		finally { loading = false; }
	}

	async function addTask() {
		if (!title.trim()) return;
		loading = true; error = '';
		try {
			// If editing, call PUT /tasks/:uuid
			if (editingUuid) {
				const res = await fetch(`${API_BASE}/tasks/${editingUuid}`, {
					method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
					body: JSON.stringify({ title: title.trim(), description: description.trim() })
				});
				if (!res.ok) {
					const b = await res.json().catch(()=>null);
					throw new Error((b && (b.error || b.message)) ? (b.error || b.message) : 'Error actualizando tarea');
				}
				const updated = await res.json();
				tasks = tasks.map(t => t.uuid === updated.uuid ? updated : t);
				editingUuid = '';
			} else {
				const res = await fetch(`${API_BASE}/tasks`, {
					method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
					body: JSON.stringify({ title: title.trim(), description: description.trim() })
				});
				if (!res.ok) {
					const b = await res.json().catch(()=>null);
					throw new Error((b && (b.error || b.message)) ? (b.error || b.message) : 'Error creando tarea');
				}
				const created = await res.json();
				tasks = [created, ...tasks];
			}
			title = ''; description = ''; showForm = false;
		} catch (e) { error = (e && e.message) ? e.message : String(e); }
		finally { loading = false; }
	}

	function editTask(task) {
		editingUuid = task.uuid;
		title = task.title || '';
		description = task.description || '';
		showForm = true;
	}

	async function deleteTask(uuid) {
		if (!confirm('¿Eliminar este recordatorio?')) return;
		try {
			const res = await fetch(`${API_BASE}/tasks/${uuid}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
			if (res.status === 204) {
				tasks = tasks.filter(t => t.uuid !== uuid);
			} else {
				const body = await res.json().catch(()=>null);
				throw new Error((body && (body.error || body.message)) ? (body.error || body.message) : 'Error eliminando');
			}
		} catch (e) {
			error = (e && e.message) ? e.message : String(e);
		}
	}

	// Icons as inline SVG snippets
	const IconLogo = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><rect x="3" y="4" width="6" height="16" rx="1.5" fill="#0f172a"/><rect x="9" y="4" width="12" height="4" rx="1" fill="#0ea5a4"/><rect x="9" y="10" width="12" height="10" rx="1" fill="#e6fffa"/></svg>`;
	const IconPlus = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
	const IconEdit = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M3 21l3-1 11-11a2.828 2.828 0 10-4-4L6 16l-3 1v4z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
	const IconTrash = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M3 6h18M8 6v12a2 2 0 002 2h4a2 2 0 002-2V6M10 6V4a2 2 0 012-2h0a2 2 0 012 2v2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
	const IconUser = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

	// On mount (client only), restore token/user from localStorage and fetch tasks
	onMount(() => {
		try {
			const t = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
			const u = typeof localStorage !== 'undefined' ? localStorage.getItem('user') : null;
			if (t) {
				const parsedUser = u ? JSON.parse(u) : null;
				setToken(t, parsedUser);
				fetchTasks();
			}
		} catch (e) {
			console.error('Failed to restore auth from localStorage', e);
		}
	});
</script>

<style>
	:global(body) { background: #f8fafc; color: #0f172a; font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; }
	.app-wrap { display:flex; max-width:1200px; margin:28px auto; gap:20px; padding:0 20px; }
	.sidebar { width:220px; background:#fff; border-radius:12px; padding:16px; box-shadow: 0 6px 18px rgba(2,6,23,0.06); min-height:160px }
	.brand { display:flex; align-items:center; gap:10px; margin-bottom:14px }
	.brand h1 { font-size:1.05rem; margin:0 }
	.nav { display:flex; flex-direction:column; gap:8px; margin-top:12px }
	.nav button { display:flex; gap:10px; align-items:center; padding:8px 10px; border-radius:8px; border:none; background:transparent; color:#0f172a; cursor:pointer; text-align:left }
	.nav button.active { background:linear-gradient(90deg, rgba(14,165,164,0.08), rgba(14,165,164,0.03)); }

	.main { flex:1 }
	.top { display:flex; justify-content:space-between; align-items:center; margin-bottom:18px }
	.controls { display:flex; gap:10px; align-items:center }
	.btn-ghost { background:transparent; border:1px solid #e6eef0; padding:8px 12px; border-radius:8px; cursor:pointer }
	.btn-primary { background:#0ea5a4; color:white; padding:8px 12px; border-radius:10px; border:none; cursor:pointer; display:flex; gap:8px; align-items:center }

	.card { background:#fff; border-radius:10px; padding:14px; margin-bottom:12px; box-shadow: 0 4px 12px rgba(2,6,23,0.04); }
	.task-header { display:flex; justify-content:space-between; gap:12px; align-items:flex-start }
	.meta { color:#6b7280; font-size:0.85rem }
	.muted { color:#94a3b8 }

	form input, form textarea { width:100%; padding:8px; border-radius:8px; border:1px solid #e6eef0; background:#fbfeff; box-sizing:border-box }
	.card.form-card { max-width:720px }
	.form-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:8px }

	.task-actions button { background:transparent; border:none; color:#475569; padding:6px; border-radius:6px; cursor:pointer }
	.task-actions button:hover { background:#f1f5f9 }

	.user-pill { display:flex; gap:8px; align-items:center; padding:6px 8px; border-radius:999px; background:#f1f5f9 }
	.small-muted { font-size:0.85rem; color:#64748b }

	@media (max-width:900px){ .app-wrap{ flex-direction:column } .sidebar{ width:100%; height:auto; position:static } }
</style>

<div class="app-wrap">
	<aside class="sidebar">
		<div class="brand">
			<div>{@html IconLogo}</div>
			<div>
				<h1>Ajolo-T</h1>
				<div class="small-muted">Recordatorios estilo Notion</div>
			</div>
		</div>

		<div class="nav">
			<button class="active"><span>{@html IconPlus}</span> Mis recordatorios</button>
		</div>

		<div style="margin-top:18px">
			<div class="small-muted">Sesión</div>
			<div style="margin-top:8px; display:flex; gap:8px; align-items:center">
				{#if user}
					<div class="user-pill"><div>{@html IconUser}</div><div class="small-muted">{user.username}</div></div>
					<button class="btn-ghost" on:click={logout}>Cerrar</button>
				{:else}
					<div class="small-muted">No conectado</div>
				{/if}
			</div>
		</div>
	</aside>

	<main class="main">
		<div class="top">
			<div>
				<h2 style="margin:0">Recordatorios</h2>
				<div class="muted">Organiza, recuerda y actúa — rápido y bonito</div>
			</div>

			<div class="controls">
				{#if token}
					<button class="btn-primary" on:click={() => { showForm = !showForm; }}>{@html IconPlus} <span>{showForm ? 'Cancelar' : 'Agregar'}</span></button>
				{/if}
			</div>
		</div>

		{#if !token}
			<div class="card" style="max-width:520px">
				<h3 style="margin-top:0">{showRegister ? 'Crear cuenta' : 'Iniciar sesión'}</h3>
				{#if loginError}
					<div style="color:#b91c1c;margin-bottom:8px">{loginError}</div>
				{/if}
				<form on:submit|preventDefault={showRegister ? register : login}>
					<input placeholder="Usuario" bind:value={username} />
					<input placeholder="Contraseña" type="password" bind:value={password} style="margin-top:8px" />
					<div class="form-actions">
						<button type="button" class="btn-ghost" on:click={() => { showRegister = !showRegister; loginError=''; }}>{showRegister ? 'Ya tengo cuenta' : 'Crear cuenta'}</button>
						<button class="btn-primary" type="submit">{logging ? 'Procesando...' : (showRegister ? 'Registrar' : 'Entrar')}</button>
					</div>
				</form>
			</div>
		{:else}
			{#if showForm}
				<div class="card">
					<form on:submit|preventDefault={addTask}>
						<input bind:value={title} placeholder="Título" />
						<textarea rows="4" bind:value={description} placeholder="Descripción (opcional)" style="margin-top:8px"></textarea>
						<div class="form-actions">
							<button type="button" class="btn-ghost" on:click={() => { showForm = false; title=''; description=''; editingUuid=''; }}>Cancelar</button>
							<button class="btn-primary" type="submit">{loading ? 'Guardando...' : (editingUuid ? 'Actualizar' : 'Guardar')}</button>
						</div>
					</form>
				</div>
			{/if}

			{#if error}
				<div class="card" style="background:#fff1f2;color:#b91c1c">{error}</div>
			{/if}

			{#if loading && tasks.length === 0}
				<div class="card">Cargando...</div>
			{/if}

			{#each tasks as task}
				<div class="card">
					<div class="task-header">
						<div>
							<div style="display:flex;gap:10px;align-items:center"><strong>{task.title}</strong> <div class="muted">• {new Date(task.created_at).toLocaleString()}</div></div>
							{#if task.description}
								<div style="margin-top:8px; color:#334155">{task.description}</div>
							{/if}
						</div>

						<div style="display:flex;flex-direction:column;align-items:flex-end">
							<div class="meta">{task.uuid}</div>
							<div class="task-actions" style="margin-top:8px; display:flex; gap:6px">
								<button title="Editar" on:click={() => editTask(task)}>{@html IconEdit}</button>
								<button title="Eliminar" on:click={() => deleteTask(task.uuid)}>{@html IconTrash}</button>
							</div>
						</div>
					</div>
				</div>
			{/each}
		{/if}
	</main>
</div>