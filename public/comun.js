/* Lo que usan todas las pantallas: crear elementos, hablar con el servidor y
   el estado de la sesión. */

const estado = {
  jugador: null,     // quién entró
  temporada: null,   // la temporada activa
  vista: 'practicas',
  plantel: [],       // el plantel completo (solo lo trae un administrador)
  cumples: null,     // los cumpleaños del club (solo para un administrador)
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

/** El título de la pantalla. Uno solo por pantalla; el resto son `h2`. */
const titulo = (texto) => el('h1', { class: 'titulo' }, [texto]);

/* ---------------------------------------------------------------- íconos */

/**
 * Los emojis se dibujan distinto en cada celular y desentonan con el escudo.
 * Estos son de trazo, sobre una grilla de 20, y toman el color del texto.
 */
const TRAZOS = {
  armar: 'M3 6h3l8 8h3M3 14h3l8-8h3M15 3.5L17.5 6 15 8.5M15 11.5L17.5 14 15 16.5',
  practicas: 'M4 6a2 2 0 012-2h8a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V6z'
    + 'M8 4.2V3.4a1 1 0 011-1h2a1 1 0 011 1v.8M7.5 9.5h5M7.5 13h3.5',
  ranking: 'M6.2 3h7.6v4.6a3.8 3.8 0 01-7.6 0V3z'
    + 'M6.2 4.4H4.3a2 2 0 002 2.2M13.8 4.4h1.9a2 2 0 01-2 2.2M10 11.4V14M7 17h6',
  jugador: 'M13.1 7a3.1 3.1 0 11-6.2 0 3.1 3.1 0 016.2 0zM4.4 17a5.6 5.6 0 0111.2 0',
  canchas: 'M2.5 6.5A1.5 1.5 0 014 5h12a1.5 1.5 0 011.5 1.5v7A1.5 1.5 0 0116 15H4a1.5 1.5 0 01-1.5-1.5v-7z'
    + 'M10 5v10M2.5 8.5h1.6M2.5 11.5h1.6M17.5 8.5h-1.6M17.5 11.5h-1.6',
  caballos: 'M6.2 16.4c-1.7-1.5-2.8-3.7-2.8-6.2C3.4 6.2 6.3 3 10 3s6.6 3.2 6.6 7.2c0 2.5-1.1 4.7-2.8 6.2'
    + 'M5.1 16.9h2.4M12.5 16.9h2.4',
  plantel: 'M10.7 7a2.7 2.7 0 11-5.4 0 2.7 2.7 0 015.4 0zM2.8 16.6a5.2 5.2 0 0110.4 0'
    + 'M13.4 4.9a2.7 2.7 0 010 4.2M14.2 11.5a5.2 5.2 0 013 4.6',
  compartir: 'M10 13V3M6.5 6.5L10 3l3.5 3.5M4 12v4a1 1 0 001 1h10a1 1 0 001-1v-4',
  abajo: 'M6 8l4 4 4-4',
  arriba: 'M6 12l4-4 4 4',
  derecha: 'M8 5l5 5-5 5',
  izquierda: 'M12 5l-5 5 5 5',
  buscar: 'M14.5 9a5.5 5.5 0 11-11 0 5.5 5.5 0 0111 0zM13.2 13.2L17 17',
  listo: 'M4 10.5l4 4 8-9',
  cruz: 'M10 4v12M4 10h12',
  cumple: 'M3.5 11.5A1.5 1.5 0 015 10h10a1.5 1.5 0 011.5 1.5v4a1.5 1.5 0 01-1.5 1.5H5a1.5 1.5 0 01-1.5-1.5v-4z'
    + 'M10 10V6.8M10 4.2a1.3 1.3 0 01.9 2.2c-.3.3-.6.4-.9.4s-.6-.1-.9-.4A1.3 1.3 0 0110 4.2z'
    + 'M3.5 13.4c1.1.7 2.1.7 3.2 0s2.1-.7 3.3 0 2.1.7 3.2 0 2.2-.7 3.3 0',
};

/** Un ícono de trazo. `alto` en píxeles; hereda el color del texto. */
function icono(nombre, alto, clase) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const medida = alto || 18;
  svg.setAttribute('width', medida);
  svg.setAttribute('height', medida);
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', nombre === 'cruz' ? 2.6 : 1.6);
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (clase) svg.setAttribute('class', clase);
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', TRAZOS[nombre] || '');
  svg.appendChild(p);
  return svg;
}

/* --------------------------------------------------------------- la flecha */

/**
 * Cómo viene el jugador, en cinco posiciones: 2 arriba, 1 en 45° para arriba,
 * 0 horizontal, −1 en 45° para abajo, −2 abajo. Sale de sus últimos tres
 * partidos y la cuenta la hace el servidor.
 *
 * Verde para arriba, roja para abajo y los intermedios en el medio: el ángulo
 * dice cuánto y el color lo confirma, así que se lee sin tener que pensar.
 */
const FLECHA_COLOR = {
  2: '#0f8a4a',
  1: '#4f9a52',
  0: '#8b97ab',
  '-1': '#cc7a3d',
  '-2': '#c62828',
};
const FLECHA_DICE = {
  2: 'viene en alza',
  1: 'viene subiendo',
  0: 'se mantiene',
  '-1': 'viene bajando',
  '-2': 'viene en baja',
};
const FLECHA_GIRO = { 2: -90, 1: -45, 0: 0, '-1': 45, '-2': 90 };

function flecha(posicion, alto) {
  const p = String(Math.max(-2, Math.min(2, Number(posicion) || 0)));
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const medida = alto || 18;
  svg.setAttribute('width', medida);
  svg.setAttribute('height', medida);
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', FLECHA_COLOR[p]);
  svg.setAttribute('stroke-width', 2.1);
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', 'flecha');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', FLECHA_DICE[p]);

  const g = document.createElementNS(ns, 'g');
  g.setAttribute('transform', 'rotate(' + FLECHA_GIRO[p] + ' 10 10)');
  const linea = document.createElementNS(ns, 'path');
  linea.setAttribute('d', 'M4 10h10M9.8 5.8L14 10l-4.2 4.2');
  g.appendChild(linea);
  svg.appendChild(g);

  const titulo = document.createElementNS(ns, 'title');
  titulo.textContent = FLECHA_DICE[p];
  svg.appendChild(titulo);
  return svg;
}

/** La estrella del MVP, llena. */
function estrella(alto) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', alto || 13);
  svg.setAttribute('height', alto || 13);
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'estrella');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', 'M10 2.6l2.2 4.5 4.9.7-3.5 3.4.8 4.9L10 13.8l-4.4 2.3.8-4.9L2.9 7.8l4.9-.7L10 2.6z');
  svg.appendChild(p);
  return svg;
}

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

/**
 * Los goles de un partido, cada uno en el color del equipo que los metió.
 * Es la regla en toda la app: el número dice quién ganó sin que haya que leer
 * nada al lado. Devuelve los nodos sueltos para poder meterlos tanto en un
 * renglón de texto como en su propio bloque.
 */
const golesEnColor = (partido) => [
  el('b', { class: 'color ' + partido.equipoA }, [String(partido.golesA)]),
  el('i', { class: 'guion' }, ['–']),
  el('b', { class: 'color ' + partido.equipoB }, [String(partido.golesB)]),
];

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
