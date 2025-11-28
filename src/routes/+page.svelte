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
		if (!username || !password) { loginError = 'Usuario y contraseña requeridos'; return; }
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
		} finally { logging = false; }
	}

	// -------------------------------------------
	// POST /login → Iniciar sesión
	// -------------------------------------------
	async function login() {
		loginError = '';
		if (!username || !password) { loginError = 'Usuario y contraseña requeridos'; return; }
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
		} finally { logging = false; }
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
		} finally { loading = false; }
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
					const b = await res.json().catch(()=>null);
					throw new Error((b && (b.error || b.message)) ? (b.error || b.message) : 'Error actualizando tarea');
				}

				const updated = await res.json();
				tasks = tasks.map(t => t.uuid === updated.uuid ? updated : t);
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
					const b = await res.json().catch(()=>null);
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
		} finally { loading = false; }
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
				tasks = tasks.filter(t => t.uuid !== uuid);
			} else {
				const body = await res.json().catch(()=>null);
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
</script>