/* ===========================================================================
   Ranking, la ficha del jugador y las canchas.

   El ranking se ordena por prácticas, después por puntos y después por MVP —
   ese es el criterio del club—, y se puede tocar el encabezado para ordenar
   por cualquiera de los tres.

   La ficha es la misma pantalla en dos lugares: en la solapa "Jugador" cada
   uno ve la suya, y desde el ranking un administrador puede abrir la de
   cualquiera. Un jugador común solo llega a la propia.

   Las canchas replican la vista de la v1 —cuánto se usó cada una— sumándole
   los partidos de torneo, que carga un administrador porque no salen de la app.
   =========================================================================== */

const ranking = {
  lista: null,
  temporada: null,
  orden: 'practicas',   // practicas | puntos | mvps
  abierta: null,        // la ficha que se abrió desde el ranking
  error: null,
};

const miFicha = { datos: null, error: null };

// Un mismo camión de arena se reparte entre varias canchas el mismo día: por eso
// el trabajo se carga sobre una o varias, igual que la observación.
const trabajoEnBlanco = () => ({
  canchas: [], tipo: 'arena', cantidad: '', nombre: '', unidad: '', fecha: hoy(),
});
const observacionEnBlanco = () => ({ canchas: [], fecha: hoy(), texto: '' });

const canchas = {
  datos: null,
  error: null,
  alta: false,
  abierta: null,          // qué cancha está desplegada
  nuevo: { nombre: '', tipo: 'copa', fecha: hoy(), hora: '11:00', cancha: 1, chukkers: 6 },
  carga: {
    abierta: null,        // lluvia | trabajo | observacion
    lluvia: { fecha: hoy(), mm: '' },
    trabajo: trabajoEnBlanco(),
    observacion: observacionEnBlanco(),
  },
};

/** Cuando se carga un resultado, lo que está en pantalla queda viejo. */
let rankingSucio = false;

/** Cuál de las dos listas de "con quiénes juega" está a la vista. */
let conQuien = 'companeros';   // companeros | cancha

/** Qué se muestra en "Lo que jugó". */
let queMuestro = 'todo';       // todo | practicas | torneos

/** 3 en vez de 3,0 — pero 1,5 cuando hay medios. */
const puntos = (n) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(1).replace('.', ','));

const conMayuscula = (t) => String(t).charAt(0).toUpperCase() + String(t).slice(1);

/** Las dos iniciales, para el redondel de la ficha. */
function iniciales(nombre) {
  const partes = String(nombre).trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '—';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

function insignia(texto, color) {
  return el('span', {
    class: 'insignia',
    style: 'background:' + color + '22;color:' + color,
  }, [texto]);
}

/* ------------------------------------------------------------- el ranking */

async function cargarRanking() {
  try {
    const r = await pedir('/api/ranking');
    ranking.lista = r.ranking;
    ranking.temporada = r.temporada;
    ranking.error = null;
    rankingSucio = false;
  } catch (e) {
    ranking.error = e.message;
  }
  render();
}

async function abrirJugador(id, donde) {
  try {
    const datos = await pedir('/api/jugador?id=' + encodeURIComponent(id));
    if (donde === 'mi') { miFicha.datos = datos; miFicha.error = null; }
    else { ranking.abierta = datos; ranking.error = null; }
  } catch (e) {
    if (donde === 'mi') miFicha.error = e.message;
    else ranking.error = e.message;
  }
  render();
}

/**
 * Después de tocar un partido de torneo la ficha quedó vieja: los números de
 * arriba y la lista salen del servidor, así que se vuelven a pedir.
 */
function refrescarFicha() {
  if (miFicha.datos) abrirJugador(miFicha.datos.jugador.id, 'mi');
  if (ranking.abierta) abrirJugador(ranking.abierta.jugador.id, 'ranking');
}

function vistaRanking(raiz) {
  if (ranking.abierta) {
    return dibujarFicha(raiz, ranking.abierta, {
      texto: '‹ Volver al ranking',
      volver: () => { ranking.abierta = null; render(); },
    });
  }

  raiz.appendChild(titulo(
    ranking.temporada ? 'Ranking · ' + ranking.temporada.nombre : 'Ranking',
  ));

  if (ranking.error) { raiz.appendChild(aviso('mal', ranking.error)); return; }
  if (!ranking.lista) { raiz.appendChild(el('div', { class: 'vacio' }, ['Cargando…'])); return; }
  if (!ranking.lista.length) {
    raiz.appendChild(el('div', { class: 'vacio' }, [
      'Todavía no hay prácticas cargadas en esta temporada.',
    ]));
    return;
  }

  // El encabezado es el que manda: tocás una columna y ordena por eso.
  const cabecera = el('div', { class: 'cabecera-ranking' }, [
    el('span', { class: 'hueco' }),
    ...[['practicas', 'Prác.'], ['puntos', 'Pts'], ['mvps', 'MVP']].map(([clave, texto]) =>
      el('button', {
        type: 'button', class: 'col', 'aria-pressed': ranking.orden === clave,
        onclick: () => { ranking.orden = clave; render(); },
      }, [texto])),
  ]);

  const orden = ranking.orden;
  const otros = ['practicas', 'puntos', 'mvps'].filter((c) => c !== orden);
  const ordenada = ranking.lista.slice().sort((a, b) =>
    b[orden] - a[orden]
    || b[otros[0]] - a[otros[0]]
    || b[otros[1]] - a[otros[1]]
    || a.apodo.localeCompare(b.apodo));

  // Un jugador común solo entra a su propia ficha; el resto del ranking lo ve
  // pero no lo abre.
  const puedeAbrir = (j) => estado.jugador.admin || j.jugador_id === estado.jugador.id;

  raiz.appendChild(el('div', { class: 'lista tabla' }, [cabecera, ...ordenada.map((j, i) =>
    el(puedeAbrir(j) ? 'button' : 'div', {
      type: puedeAbrir(j) ? 'button' : null,
      class: 'quien fila-ranking' + (puedeAbrir(j) ? '' : ' estatico')
        + (j.jugador_id === estado.jugador.id ? ' yo' : ''),
      onclick: puedeAbrir(j) ? () => abrirJugador(j.jugador_id) : null,
    }, [
      // El podio en dorado, sin medallas: los emojis se dibujan distinto en
      // cada teléfono y acá al lado están los números de verdad.
      el('span', { class: 'puesto-nro' + (i < 3 ? ' podio' : '') }, [String(i + 1)]),
      flecha(j.flecha, 17),
      el('span', { style: 'flex:1;min-width:0' }, [
        el('b', {}, [j.apodo]),
        el('span', { class: 'meta' }, [
          el('span', { class: 'categoria' }, [conMayuscula(j.categoria)]),
          el('span', {}, ['HCP ' + hcp(j.handicap)]),
          j.jugador_id === estado.jugador.id
            ? el('span', { class: 'categoria', style: 'color:var(--teal)' }, ['Vos'])
            : null,
        ].filter(Boolean)),
      ]),
      el('span', { class: 'num' + (orden === 'practicas' ? ' fuerte' : '') }, [String(j.practicas)]),
      el('span', { class: 'num' + (orden === 'puntos' ? ' fuerte' : '') }, [puntos(j.puntos)]),
      el('span', { class: 'num' + (orden === 'mvps' ? ' fuerte' : '') }, [String(j.mvps)]),
    ]))]));

  raiz.appendChild(el('p', { class: 'pista' }, [
    'Ganar suma 3 puntos y empatar 1. En las prácticas de 12 los enfrentamientos '
    + 'valen la mitad, porque cada uno juega dos de los tres.',
  ]));
}

/* -------------------------------------------------------- la solapa Jugador */

function vistaJugador(raiz) {
  if (miFicha.error) { raiz.appendChild(aviso('mal', miFicha.error)); return; }
  if (!miFicha.datos) {
    raiz.appendChild(el('div', { class: 'vacio' }, ['Cargando…']));
    return;
  }
  dibujarFicha(raiz, miFicha.datos, null);
}

/* -------------------------------------------------------------- la ficha */

function dibujarFicha(raiz, datos, volver) {
  const { jugador, practicas: jugadas, resumen } = datos;

  if (volver) {
    raiz.appendChild(el('button', {
      class: 'link', type: 'button', onclick: volver.volver,
    }, [volver.texto]));
  }

  const como = datos.como || null;

  raiz.appendChild(el('div', { class: 'ficha' }, [
    el('div', { class: 'inicial' }, [iniciales(jugador.nombre || jugador.apodo)]),
    el('div', { style: 'flex:1;min-width:0' }, [
      el('b', {}, [jugador.apodo]),
      el('span', {}, [
        jugador.nombre + ' · ' + conMayuscula(jugador.categoria) + ' · HCP ' + hcp(jugador.handicap)
        + (jugador.invitado_por ? ' · invitado por ' + jugador.invitado_por : ''),
      ]),
    ]),
    como ? el('div', { class: 'como-viene' }, [
      flecha(como.flecha, 26),
      el('span', {}, [FLECHA_DICE[String(como.flecha)]]),
    ]) : null,
  ].filter(Boolean)));

  // El handicap interno y lo que le movieron los resultados: solo el admin.
  if (como && como.hcpEfectivo !== undefined) {
    raiz.appendChild(el('div', { class: 'card p hcp-interno' }, [
      el('span', { class: 'campo-chico' }, ['HCP interno']),
      el('b', {}, [hcp(como.hcpEfectivo)]),
      el('em', {}, [
        'base ' + hcp(como.hcpBase)
        + (como.ajuste ? ' · ' + (como.ajuste > 0 ? '+' : '') + como.ajuste + ' por resultados' : ' · sin cambios'),
      ]),
    ]));
  }

  /* ---- los números */
  const conHcp = jugadas.filter((p) => p.hcpPractica !== null);
  const promedioHcp = conHcp.length
    ? conHcp.reduce((a, p) => a + p.hcpPractica, 0) / conHcp.length
    : null;

  // Qué porcentaje de los partidos que jugó terminó ganando. Sale de los
  // enfrentamientos donde estuvo, que es lo mismo que reparte los puntos.
  let jugados = 0;
  let ganados = 0;
  jugadas.forEach((p) => {
    p.partidos.forEach((x) => {
      if (x.golesA === null || x.golesA === undefined) return;
      const mio = p.miEquipo === 'bicolor'
        ? 'ambos'
        : (x.equipoA === p.miEquipo ? 'a' : x.equipoB === p.miEquipo ? 'b' : null);
      if (!mio) return;            // su equipo descansaba esa franja
      jugados++;
      if (mio === 'a' && x.golesA > x.golesB) ganados++;
      if (mio === 'b' && x.golesB > x.golesA) ganados++;
      // El bicolor juega para los dos: siempre hay un lado que gana.
      if (mio === 'ambos' && x.golesA !== x.golesB) ganados += 0.5;
    });
  });
  const porcentaje = jugados ? Math.round(ganados / jugados * 100) : null;

  // Todo en un solo bloque de seis: dos tarjetas apiladas con el mismo aspecto
  // se leían como dos cosas distintas cuando son la misma.
  raiz.appendChild(el('div', { class: 'card numeros seis' }, [
    el('div', {}, [el('b', { class: 'teal' }, [String(resumen.practicas)]), el('span', {}, ['Prácticas'])]),
    el('div', {}, [el('b', {}, [puntos(resumen.puntos)]), el('span', {}, ['Puntos'])]),
    el('div', {}, [el('b', { class: 'oro' }, [String(resumen.mvps)]), el('span', {}, ['MVP'])]),
    el('div', {}, [
      el('b', {}, [porcentaje === null ? '—' : porcentaje + '%']),
      el('span', {}, ['Ganados']),
    ]),
    el('div', {}, [el('b', {}, [String(resumen.chukkers)]), el('span', {}, ['Chukkers'])]),
    el('div', {}, [
      el('b', {}, [promedioHcp === null ? '—' : puntos(Math.round(promedioHcp * 10) / 10)]),
      el('span', {}, ['HCP de la práctica']),
    ]),
  ]));

  // Los partidos de torneo van en su propio renglón: son otra exigencia y no
  // tienen nada que ver con el ranking del club.
  const rt = datos.resumenTorneos;
  if (rt && rt.partidos) {
    raiz.appendChild(el('p', { class: 'apartado' }, ['En torneos']));
    raiz.appendChild(el('div', { class: 'card numeros' }, [
      el('div', {}, [el('b', {}, [String(rt.partidos)]), el('span', {}, ['Partidos'])]),
      el('div', {}, [
        el('b', { class: 'teal' }, [String(rt.ganados)]),
        el('span', {}, [rt.conResultado ? 'Ganados de ' + rt.conResultado : 'Ganados']),
      ]),
      el('div', {}, [
        el('b', { class: 'oro' }, [rt.hcp === null ? '—' : puntos(rt.hcp)]),
        el('span', {}, ['HCP del torneo']),
      ]),
    ]));
  }

  /* ---- con quién jugó */
  const conmigo = {};   // mismo equipo
  const cruzado = {};   // misma práctica, cualquier equipo

  jugadas.forEach((p) => {
    const mios = p.equipos[p.miEquipo] || [];
    mios.forEach((o) => {
      if (o.id !== jugador.id) conmigo[o.apodo] = (conmigo[o.apodo] || 0) + 1;
    });
    Object.values(p.equipos).flat().forEach((o) => {
      if (o.id !== jugador.id) cruzado[o.apodo] = (cruzado[o.apodo] || 0) + 1;
    });
  });

  const losDiez = (cuenta) => Object.entries(cuenta)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10);

  /* Antes eran dos listas de diez, una abajo de la otra, casi iguales: veinte
     renglones para decir con quiénes juega. Ahora es una sola lista con un
     interruptor arriba. */
  const filas = losDiez(conQuien === 'companeros' ? conmigo : cruzado);
  if (filas.length) {
    raiz.appendChild(el('h2', {}, ['Con quiénes juega']));
    raiz.appendChild(el('div', { class: 'chips' }, [
      ['companeros', 'De compañero'], ['cancha', 'Compartió cancha'],
    ].map(([clave, texto]) => el('button', {
      type: 'button', class: 'chip', 'aria-pressed': conQuien === clave,
      onclick: () => { conQuien = clave; render(); },
    }, [texto]))));

    raiz.appendChild(el('div', { class: 'lista tabla', style: 'margin-top:8px' },
      filas.map(([apodo, veces], i) => el('div', { class: 'quien estatico compacto' }, [
        el('span', { class: 'puesto-nro' }, [String(i + 1)]),
        el('b', { style: 'flex:1;min-width:0' }, [apodo]),
        el('span', { class: 'veces' }, [String(veces)]),
      ]))));
    raiz.appendChild(el('p', { class: 'pista' }, [
      'El número es cuántas prácticas jugaron juntos.',
    ]));
  }

  const torneos = datos.torneos || [];

  /* ---- canchas: las prácticas y también los torneos jugados de local, que se
     jugaron en una cancha del club igual que cualquier práctica */
  const suyas = {};
  jugadas.forEach((p) => { suyas[p.cancha] = (suyas[p.cancha] || 0) + 1; });
  torneos.forEach((t) => {
    if (!t.deLocal || !t.cancha) return;
    suyas[t.cancha] = (suyas[t.cancha] || 0) + 1;
  });
  const porCancha = Object.entries(suyas).sort((a, b) => b[1] - a[1]);
  const enCancha = porCancha.reduce((a, [, veces]) => a + veces, 0);

  if (porCancha.length) {
    raiz.appendChild(el('h2', {}, ['Canchas']));
    raiz.appendChild(el('div', { class: 'canchas' }, porCancha.map(([cancha, veces]) =>
      el('div', { class: 'cancha' }, [
        el('b', {}, ['C' + cancha]),
        el('span', {}, [veces + 'x']),
        el('em', {}, [Math.round(veces / enCancha * 100) + '%']),
      ]))));
  }

  /* ---- lo que jugó: prácticas y partidos de torneo, mezclados por fecha */
  const todo = [
    ...jugadas.map((p) => ({ tipo: 'practica', fecha: p.fecha, dato: p })),
    ...torneos.map((t) => ({ tipo: 'torneo', fecha: t.fecha, dato: t })),
  ].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));

  // Con muchas prácticas la lista es larga; el interruptor deja ver una cosa
  // por vez sin tener que bajar buscando.
  const visibles = todo.filter((x) => queMuestro === 'todo'
    || (queMuestro === 'practicas' ? x.tipo === 'practica' : x.tipo === 'torneo'));

  raiz.appendChild(el('h2', {}, ['Lo que jugó (' + visibles.length + ')']));
  if (torneos.length) {
    raiz.appendChild(el('div', { class: 'chips', style: 'margin-bottom:8px' }, [
      ['todo', 'Todo'], ['practicas', 'Prácticas'], ['torneos', 'Torneos'],
    ].map(([clave, texto]) => el('button', {
      type: 'button', class: 'chip', 'aria-pressed': queMuestro === clave,
      onclick: () => { queMuestro = clave; render(); },
    }, [texto]))));
  }

  raiz.appendChild(el('div', { class: 'lista tabla' }, visibles.map((x) =>
    (x.tipo === 'practica' ? renglonDePractica(x.dato, jugador) : renglonDeTorneo(x.dato, datos)))));
}

/** Una práctica del club en la lista de la ficha. */
function renglonDePractica(p, jugador) {
  const jugados = p.partidos.filter((x) =>
    x.golesA !== null && (x.equipoA === p.miEquipo || x.equipoB === p.miEquipo || p.miEquipo === 'bicolor'));

  // Los goles van en el color del equipo que los metió, igual que en la lista
  // de prácticas y en la planilla.
  const detalle = [
    'Cancha ' + p.cancha + ' · ' + p.formato + ' jug.'
    + (p.hcpPractica === null ? '' : ' · HCP ' + puntos(p.hcpPractica)),
  ];
  jugados.forEach((x) => { detalle.push(' · ', ...golesEnColor(x)); });

  return el('button', {
    type: 'button', class: 'quien practica-jugada',
    onclick: () => irALaPlanilla(p.id),
  }, [
    el('span', { style: 'flex:1;min-width:0' }, [
      el('b', {}, [Hoja.fechaCorta(p.fecha)]),
      el('span', {}, detalle),
    ]),
    p.mvpId === jugador.id ? insignia('MVP', 'var(--gold)') : null,
    el('span', { class: 'sello ' + p.miEquipo }, [Hoja.LABEL[p.miEquipo]]),
  ].filter(Boolean));
}

/**
 * La lista de torneos no se corta por temporada —un jugador puede tener
 * partidos de años distintos—, así que a los de otro año se les pone el año.
 */
function fechaDeTorneo(iso) {
  const corta = Hoja.fechaCorta(iso);
  const ano = iso.slice(0, 4);
  return ano === String(new Date().getFullYear()) ? corta : corta + '/' + ano.slice(2);
}

/**
 * Un partido de torneo en la misma lista, con el sello de su organizador. Es
 * un botón: los carga el jugador a mano, así que tiene que poder corregirlos
 * —una fecha mal, un resultado que se cargó después—.
 */
function renglonDeTorneo(t, datos) {
  // Los partidos viejos —los que se cargaron antes de que el formulario pidiera
  // todo esto— vienen con campos vacíos: cada dato entra solo si está.
  const donde = t.deLocal === null || t.deLocal === undefined
    ? null
    : (t.deLocal ? 'Cancha ' + (t.cancha || '—') : (t.sede || 'de visitante'));
  const detalle = [
    donde,
    t.chukkers ? t.chukkers + ' chukkers' : null,
    t.hcpTorneo === null || t.hcpTorneo === undefined ? null : 'HCP ' + t.hcpTorneo,
  ].filter(Boolean).join(' · ');

  const hayResultado = t.golesAFavor !== null && t.golesAFavor !== undefined;
  const gano = hayResultado && t.golesAFavor > t.golesEnContra;
  const empato = hayResultado && t.golesAFavor === t.golesEnContra;

  // Solo el dueño del partido —o un admin— lo puede corregir.
  const mio = datos && (datos.jugador.id === estado.jugador.id || estado.jugador.admin);

  return el(mio ? 'button' : 'div', {
    type: mio ? 'button' : null,
    class: 'quien torneo-fila' + (mio ? '' : ' estatico'),
    onclick: mio ? () => irACorregirTorneo(t) : null,
  }, [
    el('span', { style: 'flex:1;min-width:0' }, [
      el('b', {}, [t.nombre]),
      el('span', {}, [fechaDeTorneo(t.fecha) + (detalle ? ' · ' + detalle : '')]),
    ]),
    hayResultado
      ? el('span', {
        class: 'resultado-torneo ' + (gano ? 'gano' : empato ? 'empato' : 'perdio'),
      }, [t.golesAFavor + '–' + t.golesEnContra])
      : el('span', { class: 'marca pendiente' }, ['sin resultado']),
    selloDeOrganizador(t.organizador, t.organizadorNombre),
  ].filter(Boolean));
}

/** Desde la ficha se salta a la planilla de esa práctica. */
function irALaPlanilla(id) {
  estado.vista = 'practicas';
  abrirPractica(id);
}

/**
 * Corregir un partido se hace en el mismo formulario donde se carga, que ya
 * sabe pedir todo: se salta a Caballos con los datos puestos.
 */
function irACorregirTorneo(t) {
  caballos.torneo = {
    id: t.id,
    organizador: t.organizador || 'sd',
    organizadorNombre: t.organizadorNombre || '',
    nombre: t.nombre || '',
    fecha: t.fecha,
    hcpTorneo: t.hcpTorneo === null || t.hcpTorneo === undefined ? '' : String(t.hcpTorneo),
    chukkers: t.chukkers || 6,
    deLocal: t.deLocal !== false,
    cancha: t.cancha || 1,
    sede: t.sede || '',
    golesAFavor: t.golesAFavor === null || t.golesAFavor === undefined ? '' : String(t.golesAFavor),
    golesEnContra: t.golesEnContra === null || t.golesEnContra === undefined ? '' : String(t.golesEnContra),
  };
  caballos.altaTorneo = true;
  caballos.sub = 'cargar';
  caballos.buscando = false;
  estado.vista = 'caballos';
  render();
}

/* ------------------------------------------------------------- las canchas */

async function cargarCanchas() {
  try {
    canchas.datos = await pedir('/api/canchas');
    canchas.error = null;
  } catch (e) {
    canchas.error = e.message;
  }
  render();
}

function vistaCanchas(raiz) {
  raiz.appendChild(titulo('Canchas'));

  if (canchas.error) raiz.appendChild(aviso('mal', canchas.error));
  if (!canchas.datos) {
    raiz.appendChild(el('div', { class: 'vacio' }, ['Cargando…']));
    return;
  }

  const { canchas: uso, torneos, trabajos, observaciones } = canchas.datos;

  if (!uso.length) {
    raiz.appendChild(el('div', { class: 'vacio' }, ['Todavía no se jugó en ninguna cancha.']));
  }

  /**
   * Cada cancha es un renglón igual, y la temporada entera es el mismo renglón
   * arriba de todo: así se compara una cancha contra el total sin cambiar de
   * forma de leer. El número grande son las veces que se usó —prácticas más
   * partidos— y abajo, los chukkers que se jugaron encima.
   *
   * Las canchas se tocan y se abren: adentro está lo que se le echó y lo que se
   * anotó de ella.
   */
  const renglon = ({ marca, titulo, practicas, partidos, total, chukkers, destacado, cancha }) => {
    const abierta = canchas.abierta === cancha;
    const cuerpo = [
      el('div', { class: 'redondel' + (destacado ? ' rotulo' : '') }, [marca]),
      el('div', { style: 'flex:1;min-width:0' }, [
        el('b', {}, [titulo]),
        el('div', { class: 'insignias' }, [
          practicas ? insignia(practicas + (practicas === 1 ? ' práctica' : ' prácticas'), 'var(--azul)') : null,
          partidos ? insignia(partidos + (partidos === 1 ? ' partido' : ' partidos'), 'var(--gold)') : null,
        ].filter(Boolean)),
      ]),
      el('div', { style: 'text-align:right' }, [
        el('b', { class: 'grande' }, [String(total)]),
        el('em', {}, ['total']),
        el('div', { class: 'chico' }, [chukkers + ' chukkers']),
      ]),
    ];
    if (!cancha) return el('div', { class: 'card cancha-fila total' }, cuerpo);

    cuerpo.push(icono(abierta ? 'arriba' : 'abajo', 15, 'flechita'));
    return el('div', {}, [
      el('button', {
        type: 'button', class: 'card cancha-fila' + (abierta ? ' abierta' : ''),
        onclick: () => { canchas.abierta = abierta ? null : cancha; render(); },
      }, cuerpo),
      abierta ? detalleDeCancha(cancha, trabajos, observaciones) : null,
    ].filter(Boolean));
  };

  if (uso.length) {
    raiz.appendChild(renglon({
      marca: 'TOTAL',
      titulo: 'Total temporada',
      practicas: uso.reduce((a, c) => a + c.practicas, 0),
      partidos: uso.reduce((a, c) => a + c.partidos, 0),
      total: uso.reduce((a, c) => a + c.total, 0),
      chukkers: uso.reduce((a, c) => a + c.chukkers, 0),
      destacado: true,
    }));
  }

  // De la más usada a la menos: la pregunta es cuál se está gastando.
  // Las canchas que nunca se usaron no salen en `uso`, pero pueden tener
  // trabajos: una cancha parada porque la están arreglando merece su renglón.
  const conTrabajo = [...new Set((trabajos || []).map((t) => Number(t.cancha)))]
    .filter((c) => !uso.some((u) => Number(u.cancha) === c))
    .map((cancha) => ({ cancha, practicas: 0, partidos: 0, total: 0, chukkers: 0 }));

  uso.concat(conTrabajo)
    .sort((a, b) => b.total - a.total || b.chukkers - a.chukkers || a.cancha - b.cancha)
    .forEach((c) => raiz.appendChild(renglon({
      marca: String(c.cancha),
      titulo: 'Cancha ' + c.cancha,
      practicas: c.practicas,
      partidos: c.partidos,
      total: c.total,
      chukkers: c.chukkers,
      cancha: Number(c.cancha),
    })));

  /* ---- cómo se repartió el uso a lo largo de la temporada */
  graficoDeCanchas(raiz, canchas.datos);

  /* ---- los partidos de torneo */
  raiz.appendChild(el('h2', {}, ['Partidos de torneo']));

  if (!torneos.length) {
    raiz.appendChild(el('div', { class: 'vacio' }, [
      estado.jugador.admin
        ? 'Todavía no cargaste ninguno. Sumá los de copa y los de la AAP para que cuenten en las canchas.'
        : 'Todavía no hay partidos de torneo cargados.',
    ]));
  }

  raiz.appendChild(el('div', { class: 'lista tabla' }, torneos.map((t) =>
    el('div', { class: 'quien estatico torneo-fila' }, [
      el('span', { style: 'flex:1;min-width:0' }, [
        el('b', {}, [t.nombre]),
        el('span', {}, [
          Hoja.fechaCorta(t.fecha) + ' · Cancha ' + t.cancha
          + (t.hora ? ' · ' + t.hora + ' hs' : '')
          + ' · ' + t.chukkers + ' chukkers',
        ]),
      ]),
      insignia(t.tipo === 'aap' ? 'AAP' : 'COPA', t.tipo === 'aap' ? '#a855f7' : 'var(--gold)'),
      estado.jugador.admin
        ? el('button', {
          class: 'sacar', type: 'button', 'aria-label': 'Borrar ' + t.nombre,
          onclick: (e) => conBoton(e.target, async () => {
            await pedir('/api/canchas?id=' + encodeURIComponent(t.id), { method: 'DELETE' });
            await cargarCanchas();
          }, canchas),
        }, ['×'])
        : null,
    ]))));

  /* ---- las observaciones, abajo de todo */
  if (observaciones && observaciones.length) {
    raiz.appendChild(el('h2', {}, ['Observaciones']));
    raiz.appendChild(el('div', {}, observaciones.map(unaObservacion)));
  }

  /* ---- y lo que se puede cargar, solo para administradores */
  if (!estado.jugador.admin) return;
  if (canchas.alta) {
    raiz.appendChild(altaDeTorneoDelClub());
    return;
  }
  raiz.appendChild(cargasDeCancha());
}

function altaDeTorneoDelClub() {
  const nuevo = canchas.nuevo;
  const campo = (etiqueta, control) =>
    el('label', { class: 'campo' }, [el('span', {}, [etiqueta]), control]);

  return el('div', { class: 'card p', style: 'margin-top:18px' }, [
    campo('Torneo', el('input', {
      type: 'text', value: nuevo.nombre, placeholder: 'Copa San Diego',
      oninput: (e) => { nuevo.nombre = e.target.value; },
    })),
    campo('Qué es', el('div', { class: 'chips' }, [['copa', 'Copa'], ['aap', 'AAP']].map(([clave, texto]) =>
      el('button', {
        type: 'button', class: 'chip', 'aria-pressed': nuevo.tipo === clave,
        onclick: () => { nuevo.tipo = clave; render(); },
      }, [texto])))),
    el('div', { class: 'grilla-2' }, [
      campo('Fecha', el('input', {
        type: 'date', value: nuevo.fecha,
        onchange: (e) => { nuevo.fecha = e.target.value; },
      })),
      campo('Hora', el('input', {
        type: 'time', value: nuevo.hora,
        onchange: (e) => { nuevo.hora = e.target.value; },
      })),
    ]),
    campo('Cancha', el('div', { class: 'chips tres' }, [1, 2, 3, 4, 5, 6].map((n) =>
      el('button', {
        type: 'button', class: 'chip', 'aria-pressed': nuevo.cancha === n,
        onclick: () => { nuevo.cancha = n; render(); },
      }, [String(n)])))),
    campo('Chukkers', el('div', { class: 'chips tres' }, [4, 6, 8, 9, 10, 12].map((n) =>
      el('button', {
        type: 'button', class: 'chip', 'aria-pressed': nuevo.chukkers === n,
        onclick: () => { nuevo.chukkers = n; render(); },
      }, [String(n)])))),
    el('div', { class: 'acciones' }, [
      el('button', {
        class: 'primary', type: 'button',
        onclick: (e) => conBoton(e.target, async () => {
          await pedir('/api/canchas', { method: 'POST', body: JSON.stringify(nuevo) });
          canchas.alta = false;
          canchas.nuevo = { nombre: '', tipo: 'copa', fecha: hoy(), hora: '11:00', cancha: 1, chukkers: 6 };
          await cargarCanchas();
        }, canchas),
      }, ['Guardar el partido']),
      el('button', {
        class: 'link', type: 'button',
        onclick: () => { canchas.alta = false; render(); },
      }, ['Cancelar']),
    ]),
  ]);
}

/* ------------------------------------------- el estado de cada cancha */

/**
 * Lo que se despliega al tocar una cancha: cuánta arena y cuánto fertilizante
 * se le echó en la temporada, cada trabajo con su fecha, y las observaciones
 * que la mencionan.
 */
function detalleDeCancha(cancha, trabajos, observaciones) {
  const suyos = (trabajos || []).filter((t) => Number(t.cancha) === cancha);
  const suyas = (observaciones || []).filter((o) => (o.canchas || []).includes(cancha));
  const arena = suyos.filter((t) => t.tipo === 'arena').reduce((a, t) => a + Number(t.cantidad), 0);
  const fert = suyos.filter((t) => t.tipo === 'fertilizante').reduce((a, t) => a + Number(t.cantidad), 0);

  const partes = [
    el('div', { class: 'totales-trabajo' }, [
      el('div', {}, [el('b', { class: 'arena' }, [enNumero(arena)]), el('span', {}, ['m³ de arena'])]),
      el('div', {}, [el('b', { class: 'fert' }, [enNumero(fert)]), el('span', {}, ['kg de fertilizante'])]),
    ]),
  ];

  if (suyos.length) {
    partes.push(...suyos.map((t) => el('div', { class: 'trabajo' }, [
      el('span', { class: 'cuando' }, [Hoja.fechaCorta(t.fecha)]),
      el('span', { class: 'que ' + CLASE_TRABAJO[t.tipo] },
        [t.tipo === 'otro' ? t.nombre : conMayuscula(t.tipo)]),
      el('span', { class: 'cuanto ' + CLASE_TRABAJO[t.tipo] }, [enNumero(t.cantidad) + ' ' + t.unidad]),
      estado.jugador.admin ? botonDeBorrar('trabajo', t.id, 'Borrar el trabajo') : null,
    ].filter(Boolean))));
  } else {
    partes.push(el('p', { class: 'pista' }, ['Todavía no se le cargó ningún trabajo.']));
  }

  if (suyas.length) {
    partes.push(el('p', { class: 'apartado', style: 'margin:14px 0 6px' }, ['Observaciones']));
    partes.push(...suyas.map(unaObservacion));
  }

  return el('div', { class: 'desplegado' }, partes);
}

/** La cruz para sacar algo, con su confirmación. */
function botonDeBorrar(que, id, cartel) {
  return el('button', {
    class: 'sacar', type: 'button', 'aria-label': cartel,
    onclick: (e) => conBoton(e.target, async () => {
      if (!window.confirm('¿' + cartel + '?')) return;
      await pedir('/api/canchas?que=' + que + '&id=' + encodeURIComponent(id), { method: 'DELETE' });
      await cargarCanchas();
    }, canchas),
  }, ['×']);
}

/** Una observación: de qué canchas habla, quién la escribió y qué dice. */
function unaObservacion(o) {
  return el('div', { class: 'obs' }, [
    el('div', { class: 'obs-cabeza' }, [
      el('span', { class: 'obs-canchas' }, (o.canchas || []).map((c) => el('span', {
        style: 'background:' + COLOR_CANCHA[c] + ';color:' + tintaSobre(COLOR_CANCHA[c]),
      }, ['C' + c]))),
      el('b', {}, [o.autor]),
      el('span', { class: 'cuando' }, [Hoja.fechaCorta(o.fecha)]),
      estado.jugador.admin ? botonDeBorrar('observacion', o.id, 'Borrar la observación') : null,
    ].filter(Boolean)),
    el('p', {}, [o.texto]),
  ]);
}

/** Lo que se carga en Canchas, cada cosa con su formulario. */
function cargasDeCancha() {
  const c = canchas.carga;

  if (!c.abierta) {
    return el('div', { class: 'acciones', style: 'margin-top:18px' }, [
      el('button', {
        class: 'primary', type: 'button',
        onclick: () => { canchas.alta = true; render(); },
      }, ['Sumar un partido de torneo']),
      el('button', {
        class: 'ghost', type: 'button',
        onclick: () => { c.abierta = 'lluvia'; render(); },
      }, ['Sumar un día de lluvia']),
      el('button', {
        class: 'ghost', type: 'button',
        onclick: () => { c.abierta = 'trabajo'; render(); },
      }, ['Sumar un trabajo de cancha']),
      el('button', {
        class: 'ghost', type: 'button',
        onclick: () => { c.abierta = 'observacion'; render(); },
      }, ['Escribir una observación']),
    ]);
  }

  const campo = (etiqueta, control) =>
    el('label', { class: 'campo' }, [el('span', {}, [etiqueta]), control]);
  const cerrar = () => { c.abierta = null; render(); };
  const guardar = (cuerpo, alGuardar) => el('div', { class: 'acciones' }, [
    el('button', {
      class: 'primary', type: 'button',
      onclick: (e) => conBoton(e.target, async () => {
        await pedir('/api/canchas', { method: 'POST', body: JSON.stringify(cuerpo()) });
        alGuardar();
        c.abierta = null;
        await cargarCanchas();
      }, canchas),
    }, ['Guardar']),
    el('button', { class: 'link', type: 'button', onclick: cerrar }, ['Cancelar']),
  ]);

  if (c.abierta === 'lluvia') {
    return el('div', { class: 'card p', style: 'margin-top:18px' }, [
      el('h2', { style: 'margin:0 0 12px' }, ['Un día de lluvia']),
      campo('Fecha', el('input', {
        type: 'date', value: c.lluvia.fecha,
        onchange: (e) => { c.lluvia.fecha = e.target.value; },
      })),
      campo('Cuánto llovió', el('div', { class: 'con-unidad' }, [
        el('input', {
          type: 'number', value: c.lluvia.mm, min: 0, max: 500, inputmode: 'numeric',
          oninput: (e) => { c.lluvia.mm = e.target.value; },
        }),
        el('em', {}, ['mm']),
      ])),
      el('p', { class: 'pista' }, [
        'La lluvia es del club, no de una cancha: llueve sobre las seis. Si ese día '
        + 'ya estaba cargado, se corrige.',
      ]),
      guardar(
        () => ({ que: 'lluvia', fecha: c.lluvia.fecha, mm: c.lluvia.mm }),
        () => { c.lluvia = { fecha: hoy(), mm: '' }; },
      ),
    ]);
  }

  if (c.abierta === 'trabajo') {
    const t = c.trabajo;
    return el('div', { class: 'card p', style: 'margin-top:18px' }, [
      el('h2', { style: 'margin:0 0 12px' }, ['Un trabajo de cancha']),
      campo('En qué canchas', el('div', { class: 'chips tres' }, [1, 2, 3, 4, 5, 6].map((n) =>
        el('button', {
          type: 'button', class: 'chip', 'aria-pressed': t.canchas.includes(n),
          onclick: () => {
            t.canchas = t.canchas.includes(n) ? t.canchas.filter((x) => x !== n) : t.canchas.concat(n);
            render();
          },
        }, [String(n)])))),
      campo('Qué se hizo', el('div', { class: 'chips tres' },
        [['arena', 'Arena'], ['fertilizante', 'Fertilizante'], ['otro', 'Otro']].map(([clave, texto]) =>
          el('button', {
            type: 'button', class: 'chip', 'aria-pressed': t.tipo === clave,
            onclick: () => { t.tipo = clave; render(); },
          }, [texto])))),
      // Arena y fertilizante ya saben en qué se miden. "Otro" no puede saberlo
      // —lo mismo entra cal que horas de rolo— y por eso pide dos cosas más.
      t.tipo === 'otro'
        ? campo('Cómo se llama', el('input', {
          type: 'text', value: t.nombre, placeholder: 'Ej.: Resembrado, cal, rolo',
          oninput: (e) => { t.nombre = e.target.value; },
        }))
        : null,
      campo(t.tipo === 'otro' ? 'Cuánto y en qué unidad' : 'Cuánto', el('div', { class: 'con-unidad' }, [
        el('input', {
          type: 'number', value: t.cantidad, min: 0, step: 'any', inputmode: 'decimal',
          oninput: (e) => { t.cantidad = e.target.value; },
        }),
        t.tipo === 'otro'
          ? el('input', {
            type: 'text', value: t.unidad, placeholder: 'kg', maxlength: 8,
            style: 'max-width:84px',
            oninput: (e) => { t.unidad = e.target.value; },
          })
          : el('em', {}, [UNIDAD_FIJA[t.tipo]]),
      ])),
      campo('Fecha', el('input', {
        type: 'date', value: t.fecha,
        onchange: (e) => { t.fecha = e.target.value; },
      })),
      // Con más de una cancha marcada la cantidad se anota entera en cada una:
      // conviene decirlo antes de guardar y no después.
      t.canchas.length > 1
        ? el('p', { class: 'pista' }, [
          'Esa cantidad se anota entera en cada una de las ' + t.canchas.length
          + ' canchas marcadas: quedan ' + t.canchas.length + ' cargas, una por cancha.',
        ])
        : null,
      guardar(
        () => ({ que: 'trabajo', ...t }),
        () => { c.trabajo = trabajoEnBlanco(); },
      ),
    ].filter(Boolean));
  }

  const o = c.observacion;
  return el('div', { class: 'card p', style: 'margin-top:18px' }, [
    el('h2', { style: 'margin:0 0 12px' }, ['Una observación']),
    campo('Sobre qué canchas', el('div', { class: 'chips tres' }, [1, 2, 3, 4, 5, 6].map((n) =>
      el('button', {
        type: 'button', class: 'chip', 'aria-pressed': o.canchas.includes(n),
        onclick: () => {
          o.canchas = o.canchas.includes(n) ? o.canchas.filter((x) => x !== n) : o.canchas.concat(n);
          render();
        },
      }, [String(n)])))),
    campo('Fecha', el('input', {
      type: 'date', value: o.fecha,
      onchange: (e) => { o.fecha = e.target.value; },
    })),
    // El texto de un `textarea` va adentro, no en un atributo `value`.
    campo('Qué pasó', el('textarea', {
      rows: 4, maxlength: 1200,
      placeholder: 'Después de los 140 mm quedaron dos lagunas en el sector de palenques…',
      oninput: (e) => { o.texto = e.target.value; },
    }, [o.texto])),
    el('p', { class: 'pista' }, ['Firma ' + estado.jugador.apodo + ', que sos vos.']),
    guardar(
      () => ({ que: 'observacion', fecha: o.fecha, texto: o.texto, canchas: o.canchas }),
      () => { c.observacion = observacionEnBlanco(); },
    ),
  ]);
}
