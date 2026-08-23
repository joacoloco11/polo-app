/* Lo que usan todas las pantallas: crear elementos, hablar con el servidor y
   el estado de la sesión. */

const estado = {
  jugador: null,     // quién entró
  temporada: null,   // la temporada activa
  vista: 'practicas',
  plantel: [],       // el plantel completo (solo lo trae un administrador)
};

/**
 * Crea un elemento. `attrs` acepta `class`, `html`, cualquier atributo y
 * `onclick`/`oninput`/etc. como funciones.
 */
function el(tag, attrs, hijos) {
  const n = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach((k) => {
    const v = attrs[k];
    if (v === null || v === undefined || v === false) return;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    // `true` como texto: un atributo vacío no matchea [aria-pressed="true"].
    else n.setAttribute(k, v === true ? 'true' : String(v));
  });
  (hijos || []).forEach((h) => {
    if (h === null || h === undefined || h === false) return;
    n.appendChild(typeof h === 'string' || typeof h === 'number'
      ? document.createTextNode(String(h)) : h);
  });
  return n;
}

const vaciar = (nodo) => { nodo.textContent = ''; return nodo; };

async function pedir(ruta, opciones = {}) {
  const r = await fetch(ruta, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) },
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error || 'No se pudo conectar.');
  return datos;
}

const aviso = (clase, texto) => el('div', { class: 'aviso ' + clase }, [texto]);

/** Hoy en formato 2026-08-22, en hora local y no en UTC. */
function hoy() {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate());
}

function fechaLarga(iso) {
  const d = new Date(iso + 'T12:00:00');
  const txt = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

/** El handicap como lo escribe el club: 0, 2, -1. */
const hcp = (n) => (n > 0 ? '+' + n : String(n));
