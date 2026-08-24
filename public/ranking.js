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

const canchas = {
  datos: null,
  error: null,
  alta: false,
  nuevo: { nombre: '', tipo: 'copa', fecha: hoy(), hora: '11:00', cancha: 1, chukkers: 6 },
};

/** Cuando se carga un resultado, lo que está en pantalla queda viejo. */
let rankingSucio = false;

const COLOR_CATEGORIA = {
  socio: 'var(--teal)',
  temporario: '#3b82f6',
  bonificado: 'var(--gold)',
  invitado: '#a855f7',
};

const MEDALLA = ['🥇', '🥈', '🥉'];

/** 3 en vez de 3,0 — pero 1,5 cuando hay medios. */
const puntos = (n) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(1).replace('.', ','));

const conMayuscula = (t) => String(t).charAt(0).toUpperCase() + String(t).slice(1);

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

function vistaRanking(raiz) {
  if (ranking.abierta) {
    return dibujarFicha(raiz, ranking.abierta, {
      texto: '‹ Volver al ranking',
      volver: () => { ranking.abierta = null; render(); },
    });
  }

  raiz.appendChild(el('h2', {}, [
    ranking.temporada ? 'Ranking · ' + ranking.temporada.nombre : 'Ranking',
  ]));

  if (ranking.error) { raiz.appendChild(aviso('mal', ranking.error)); return; }
  if (!ranking.lista) { raiz.appendChild(el('div', { class: 'vacio' }, ['Cargando…'])); return; }
  if (!ranking.lista.length) {
    raiz.appendChild(el('div', { class: 'vacio' }, [
      'Todavía no hay prácticas cargadas en esta temporada.',
    ]));
    return;
  }

  // El encabezado es el que manda: tocás una columna y ordena por eso.
  raiz.appendChild(el('div', { class: 'cabecera-ranking' }, [
    el('span', { class: 'hueco' }),
    ...[['practicas', 'Prác.'], ['puntos', 'Pts'], ['mvps', 'MVP']].map(([clave, texto]) =>
      el('button', {
        type: 'button', class: 'col', 'aria-pressed': ranking.orden === clave,
        onclick: () => { ranking.orden = clave; render(); },
      }, [texto])),
  ]));

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

  raiz.appendChild(el('div', { class: 'lista' }, ordenada.map((j, i) =>
    el(puedeAbrir(j) ? 'button' : 'div', {
      type: puedeAbrir(j) ? 'button' : null,
      class: 'quien fila-ranking' + (puedeAbrir(j) ? '' : ' estatico'),
      onclick: puedeAbrir(j) ? () => abrirJugador(j.jugador_id) : null,
    }, [
      el('span', { class: 'puesto-nro' + (i < 3 ? ' podio' : '') }, [MEDALLA[i] || String(i + 1)]),
      el('span', { style: 'flex:1;min-width:0' }, [
        el('b', {}, [j.apodo]),
        el('span', { class: 'meta' }, [
          insignia(conMayuscula(j.categoria), COLOR_CATEGORIA[j.categoria] || 'var(--muted)'),
          'HCP ' + hcp(j.handicap),
        ]),
      ]),
      el('span', { class: 'num' + (orden === 'practicas' ? ' fuerte' : '') }, [String(j.practicas)]),
      el('span', { class: 'num' + (orden === 'puntos' ? ' fuerte' : '') }, [puntos(j.puntos)]),
      el('span', { class: 'num' + (orden === 'mvps' ? ' fuerte' : '') }, [String(j.mvps)]),
    ]))));

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

  raiz.appendChild(el('div', { class: 'card p ficha' }, [
    el('b', {}, [jugador.apodo]),
    el('span', { class: 'meta' }, [
      insignia(conMayuscula(jugador.categoria), COLOR_CATEGORIA[jugador.categoria] || 'var(--muted)'),
      'HCP ' + hcp(jugador.handicap),
      jugador.invitado_por ? 'invitado por ' + jugador.invitado_por : null,
    ].filter(Boolean)),
    el('span', {}, [jugador.nombre]),
  ]));

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

  raiz.appendChild(el('div', { class: 'card p numeros' }, [
    el('div', {}, [el('b', { class: 'teal' }, [String(resumen.practicas)]), el('span', {}, ['prácticas'])]),
    el('div', {}, [
      el('b', {}, [puntos(resumen.puntos)]),
      el('span', {}, [porcentaje === null ? 'puntos' : 'puntos · ' + porcentaje + '% ganados']),
    ]),
    el('div', {}, [el('b', { class: 'oro' }, [String(resumen.mvps)]), el('span', {}, ['MVP'])]),
  ]));
  raiz.appendChild(el('div', { class: 'card p numeros', style: 'margin-top:8px' }, [
    el('div', {}, [el('b', {}, [String(resumen.chukkers)]), el('span', {}, ['chukkers jugados'])]),
    el('div', {}, [
      el('b', { class: 'oro' }, [promedioHcp === null ? '—' : promedioHcp.toFixed(2).replace('.', ',')]),
      el('span', {}, ['HCP promedio de la práctica']),
    ]),
  ]));

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

  const tabla = (titulo, filas, color) => {
    if (!filas.length) return null;
    raiz.appendChild(el('h2', {}, [titulo]));
    raiz.appendChild(el('div', { class: 'card p' }, filas.map(([apodo, veces], i) =>
      el('div', { class: 'renglon-dato' }, [
        el('span', { class: 'puesto-nro' + (i < 3 ? ' podio' : '') }, [String(i + 1)]),
        el('b', { style: 'flex:1' }, [apodo]),
        insignia(veces + (veces === 1 ? ' práctica' : ' prácticas'), color),
      ]))));
    return true;
  };

  tabla('Con quién jugó de compañero', losDiez(conmigo), 'var(--teal)');
  tabla('Con quién compartió cancha', losDiez(cruzado), 'var(--gold)');

  /* ---- canchas */
  const suyas = {};
  jugadas.forEach((p) => { suyas[p.cancha] = (suyas[p.cancha] || 0) + 1; });
  const porCancha = Object.entries(suyas).sort((a, b) => b[1] - a[1]);

  if (porCancha.length) {
    raiz.appendChild(el('h2', {}, ['Canchas']));
    raiz.appendChild(el('div', { class: 'canchas' }, porCancha.map(([cancha, veces]) =>
      el('div', { class: 'cancha' }, [
        el('b', {}, ['C' + cancha]),
        el('span', {}, [veces + 'x']),
        el('em', {}, [Math.round(veces / jugadas.length * 100) + '%']),
      ]))));
  }

  /* ---- historial: cada práctica lleva a su planilla */
  raiz.appendChild(el('h2', {}, ['Historial (' + jugadas.length + ')']));
  raiz.appendChild(el('div', { class: 'lista' }, jugadas.map((p) => {
    const jugados = p.partidos.filter((x) =>
      x.golesA !== null && (x.equipoA === p.miEquipo || x.equipoB === p.miEquipo || p.miEquipo === 'bicolor'));

    // Los goles van en el color del equipo que los metió, igual que en la
    // lista de prácticas y en la planilla.
    const detalle = [
      'Cancha ' + p.cancha + ' · ' + p.formato + ' jug.'
      + (p.hcpPractica === null ? '' : ' · HCP ' + puntos(p.hcpPractica)),
    ];
    jugados.forEach((x) => { detalle.push(' · ', ...golesEnColor(x)); });

    return el('button', {
      type: 'button', class: 'quien',
      onclick: () => irALaPlanilla(p.id),
    }, [
      el('span', { style: 'flex:1;min-width:0' }, [
        el('b', {}, [Hoja.fechaCorta(p.fecha)]),
        el('span', {}, detalle),
      ]),
      p.mvpId === jugador.id ? insignia('MVP', 'var(--gold)') : null,
      el('span', { class: 'sello ' + p.miEquipo }, [Hoja.LABEL[p.miEquipo]]),
    ]);
  })));
}

/** Desde la ficha se salta a la planilla de esa práctica. */
function irALaPlanilla(id) {
  estado.vista = 'practicas';
  abrirPractica(id);
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
  raiz.appendChild(el('h2', {}, ['Canchas']));

  if (canchas.error) raiz.appendChild(aviso('mal', canchas.error));
  if (!canchas.datos) {
    raiz.appendChild(el('div', { class: 'vacio' }, ['Cargando…']));
    return;
  }

  const { canchas: uso, torneos } = canchas.datos;

  if (!uso.length) {
    raiz.appendChild(el('div', { class: 'vacio' }, ['Todavía no se jugó en ninguna cancha.']));
  }

  // Lo que mide una cancha es cuánto se jugó encima: los chukkers.
  const totalChukkers = uso.reduce((a, c) => a + c.chukkers, 0);
  const totalJornadas = uso.reduce((a, c) => a + c.total, 0);
  if (uso.length) {
    raiz.appendChild(el('div', { class: 'card p numeros' }, [
      el('div', {}, [el('b', { class: 'teal' }, [String(totalChukkers)]), el('span', {}, ['chukkers en total'])]),
      el('div', {}, [el('b', {}, [String(totalJornadas)]), el('span', {}, ['prácticas y partidos'])]),
    ]));
  }

  uso.forEach((c) => {
    raiz.appendChild(el('div', { class: 'card cancha-fila' }, [
      el('div', { class: 'redondel' }, [String(c.cancha)]),
      el('div', { style: 'flex:1;min-width:0' }, [
        el('b', {}, ['Cancha ' + c.cancha]),
        el('div', { class: 'insignias' }, [
          c.practicas ? insignia(c.practicas + (c.practicas === 1 ? ' práctica' : ' prácticas'), 'var(--azul)') : null,
          c.partidos ? insignia(c.partidos + (c.partidos === 1 ? ' partido' : ' partidos'), 'var(--gold)') : null,
        ].filter(Boolean)),
      ]),
      el('div', { style: 'text-align:right' }, [
        el('b', { class: 'grande' }, [String(c.chukkers)]),
        el('em', {}, ['chukkers']),
      ]),
    ]));
  });

  /* ---- los partidos de torneo */
  raiz.appendChild(el('h2', {}, ['Partidos de torneo']));

  if (!torneos.length) {
    raiz.appendChild(el('div', { class: 'vacio' }, [
      estado.jugador.admin
        ? 'Todavía no cargaste ninguno. Sumá los de copa y los de la AAP para que cuenten en las canchas.'
        : 'Todavía no hay partidos de torneo cargados.',
    ]));
  }

  raiz.appendChild(el('div', { class: 'lista' }, torneos.map((t) =>
    el('div', { class: 'quien estatico' }, [
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

  if (estado.jugador.admin) raiz.appendChild(altaDeTorneoDelClub());
}

function altaDeTorneoDelClub() {
  if (!canchas.alta) {
    return el('div', { style: 'margin-top:18px' }, [
      el('button', {
        class: 'primary', type: 'button',
        onclick: () => { canchas.alta = true; render(); },
      }, ['Sumar un partido de torneo']),
    ]);
  }

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
