/* ===========================================================================
   Mis caballos: qué monté en cada chukker, cómo anduvo cada uno, y cómo viene
   repartida la carga.

   Dos secciones. "Cargar" es la de todos los días: se abre en la última
   jornada donde el jugador figura y muestra solo los chukkers que le tocaron.
   "Estadísticas" es la que contesta la pregunta que hoy nadie puede contestar:
   cuánto viene jugando cada caballo.

   En el torneo se juega de a medio chukker —cada caballo hace la mitad y
   sale—, así que un partido de 6 chukkers son 12 lugares para llenar y cada
   uno pesa medio chukker en la cuenta del animal.

   Lo que se toca se guarda solo, un segundo después. Nadie va a apretar
   "guardar" con el caballo de las riendas en la mano.
   =========================================================================== */

const caballos = {
  sub: 'cargar',        // cargar | stats
  eventos: null,        // mis prácticas y partidos, con lo cargado
  caballada: [],
  lesiones: [],         // los períodos de lesión, para pintarlos en el calendario
  elegido: null,        // la clave de la jornada abierta
  buscando: false,      // el buscador de jornadas anteriores
  filtro: '',
  orden: 'chukkers',
  guardado: '',         // '' | 'guardando' | 'guardado' | el error
  altaTorneo: false,
  detalle: '',           // lo último que se tocó en el gráfico
  torneo: { nombre: '', fecha: hoy(), chukkers: 6 },
  error: null,
};

const claveDe = (e) => e.jornadaId || 'p:' + e.practicaId;
const CHUKKERS_TORNEO = 6;      // y se juegan de a medio: 12 lugares

/** Cuánto pesa un lugar en la carga del caballo. */
const pesoDe = (evento) => (evento.medios ? 0.5 : 1);

/** Cómo se llama el lugar: "3" en la práctica, "3a" y "3b" en el torneo. */
function etiquetaLugar(evento, n) {
  if (!evento.medios) return String(n);
  return Math.ceil(n / 2) + (n % 2 === 1 ? 'a' : 'b');
}

function nombreDelLugar(evento, n) {
  if (!evento.medios) return 'Chukker ' + n;
  return 'Chukker ' + Math.ceil(n / 2) + (n % 2 === 1 ? ', primer medio' : ', segundo medio');
}

/** 6 en vez de 6,0 — pero 3,5 cuando hay medios. */
function cantidad(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

async function cargarJornadas() {
  try {
    const r = await pedir('/api/jornadas');
    caballos.eventos = r.eventos;
    caballos.caballada = r.caballos;
    caballos.lesiones = r.lesiones || [];
    caballos.error = null;
    if (!caballos.eventos.some((e) => claveDe(e) === caballos.elegido)) {
      // Por defecto, la última donde figura: es casi siempre la que viene a cargar.
      caballos.elegido = caballos.eventos.length ? claveDe(caballos.eventos[0]) : null;
    }
  } catch (e) {
    caballos.error = e.message;
  }
  render();
}

const eventoAbierto = () =>
  (caballos.eventos || []).find((e) => claveDe(e) === caballos.elegido) || null;

const cargadosDe = (e) => e.misChukkers.filter((c) => e.uso[c]).length;

/* ------------------------------------------------------------- guardar solo */

let temporizador = null;

const loQueHayQueGuardar = (evento) => ({
  practicaId: evento.practicaId,
  jornadaId: evento.jornadaId,
  uso: evento.uso,
  puntajes: evento.puntajes,
  observaciones: evento.observaciones,
});

/** Guarda un segundo después del último toque, para no llamar en cada chukker. */
function guardarPronto() {
  caballos.guardado = 'guardando';
  clearTimeout(temporizador);
  temporizador = setTimeout(guardarAhora, 900);
}

/**
 * Al cerrar la app no da tiempo de esperar una respuesta: el navegador corta
 * el fetch. `sendBeacon` lo manda igual, en segundo plano.
 */
function guardarAlSalir() {
  const evento = eventoAbierto();
  if (!evento || !temporizador || !navigator.sendBeacon) return;
  clearTimeout(temporizador);
  temporizador = null;
  navigator.sendBeacon('/api/jornada', new Blob(
    [JSON.stringify(loQueHayQueGuardar(evento))],
    { type: 'application/json' },
  ));
}

async function guardarAhora() {
  const evento = eventoAbierto();
  if (!evento) return;
  clearTimeout(temporizador);
  temporizador = null;
  try {
    const r = await pedir('/api/jornada', {
      method: 'POST',
      body: JSON.stringify(loQueHayQueGuardar(evento)),
    });
    // Una práctica no tiene jornada hasta que se carga algo: acá nace.
    evento.jornadaId = r.jornadaId;
    caballos.guardado = 'guardado';
  } catch (e) {
    caballos.guardado = e.message;
  }
  render();
}

/* ------------------------------------------------- elegir de qué jornada */

function tituloDe(e) {
  return e.tipo === 'aap' ? e.titulo : fechaLarga(e.fecha);
}

/**
 * El buscador. Sirve para lo de siempre —la práctica de ayer— y para lo que
 * pidió el club: encontrar una vieja que quedó sin cargar. Por eso cada
 * renglón dice cuántos lugares tiene puestos.
 */
function selectorDeJornada(raiz) {
  const evento = eventoAbierto();

  if (!caballos.buscando) {
    raiz.appendChild(el('div', { class: 'card p cabecera-jornada' }, [
      el('div', { style: 'flex:1' }, [
        el('b', {}, [tituloDe(evento)]),
        el('span', {}, [
          evento.tipo === 'aap'
            ? Hoja.fechaCorta(evento.fecha) + ' · ' + evento.chukkers + ' chukkers'
              + (evento.medios ? ' de a medio' : '')
            : evento.detalle + ' · jugaste ' + evento.misChukkers.length
              + ' de los ' + evento.chukkers,
        ]),
      ]),
      el('span', { class: 'sello ' + (evento.color || 'aap') },
        [evento.color ? Hoja.LABEL[evento.color] : 'AAP']),
    ]));
    raiz.appendChild(el('button', {
      class: 'link', type: 'button',
      onclick: () => { caballos.buscando = true; caballos.filtro = ''; render(); },
    }, ['Cargar otra práctica']));
    return;
  }

  raiz.appendChild(el('h2', {}, ['Qué jornada querés cargar']));

  const buscar = el('input', {
    type: 'text', placeholder: 'Buscar por fecha, cancha o torneo…', value: caballos.filtro,
    oninput: (e) => { caballos.filtro = e.target.value; dibujar(); },
  });
  raiz.appendChild(buscar);

  const lista = el('div', { class: 'lista', style: 'margin-top:10px' });
  raiz.appendChild(lista);
  raiz.appendChild(el('div', { style: 'text-align:center' }, [
    el('button', {
      class: 'link', type: 'button',
      onclick: () => { caballos.buscando = false; render(); },
    }, ['Cancelar']),
  ]));

  function dibujar() {
    vaciar(lista);
    const texto = caballos.filtro.trim().toLowerCase();
    const visibles = caballos.eventos.filter((e) => !texto
      || tituloDe(e).toLowerCase().includes(texto)
      || e.detalle.toLowerCase().includes(texto)
      || e.fecha.includes(texto));

    if (!visibles.length) {
      lista.appendChild(el('div', { class: 'vacio' }, ['No hay ninguna que coincida.']));
      return;
    }

    visibles.forEach((e) => {
      const puestos = cargadosDe(e);
      const completa = puestos === e.misChukkers.length;
      lista.appendChild(el('button', {
        type: 'button', class: 'quien' + (claveDe(e) === caballos.elegido ? ' puesto' : ''),
        onclick: () => {
          guardarAhora();
          caballos.elegido = claveDe(e);
          caballos.buscando = false;
          caballos.guardado = '';
          render();
        },
      }, [
        el('span', { style: 'flex:1' }, [
          el('b', {}, [tituloDe(e)]),
          el('span', {}, [Hoja.fechaCorta(e.fecha) + ' · ' + e.detalle]),
        ]),
        el('span', { class: 'marca' + (completa ? ' listo' : puestos ? '' : ' pendiente') }, [
          completa ? 'COMPLETA' : puestos + ' de ' + e.misChukkers.length,
        ]),
      ]));
    });
  }
  dibujar();
}

/* --------------------------------------------------------------- la carga */

function panelCargar(raiz) {
  const eventos = caballos.eventos || [];
  if (!eventos.length) {
    raiz.appendChild(el('div', { class: 'vacio' }, [
      'Todavía no figurás en ninguna práctica. Cuando el organizador arme una con vos, va a aparecer acá.',
    ]));
    raiz.appendChild(altaDeTorneo());
    return;
  }

  selectorDeJornada(raiz);
  if (caballos.buscando) return;

  const evento = eventoAbierto();
  if (!evento) return;

  if (evento.tipo === 'practica') {
    raiz.appendChild(el('p', { class: 'pista' }, [
      'Te tocaron los chukkers ' + enTexto(evento.misChukkers) + '.',
    ]));
  } else if (evento.medios) {
    raiz.appendChild(el('p', { class: 'pista' }, [
      'Se juega de a medio chukker: ' + evento.misChukkers.length + ' lugares. '
      + 'La "a" es el primer medio y la "b" el segundo.',
    ]));
  }

  /* ---- la caballada, con los chukkers de cada uno */
  raiz.appendChild(el('h2', {}, ['Mi caballada']));

  const activos = caballos.caballada.filter((c) => c.activo);
  const lista = el('div', { class: 'lista' });

  activos.forEach((caballo) => {
    const suyos = evento.misChukkers.filter((c) => evento.uso[c] === caballo.id);
    const cuanto = suyos.length * pesoDe(evento);

    const pastillas = el('div', { class: 'chuks' }, evento.misChukkers.map((c) => {
      const de = evento.uso[c];
      return el('button', {
        type: 'button', class: 'chuk' + (evento.medios ? ' medio' : ''),
        'data-estado': de === caballo.id ? 'mio' : de ? 'otro' : 'libre',
        'aria-label': nombreDelLugar(evento, c) + ' con ' + caballo.nombre,
        onclick: () => {
          // Un lugar, un caballo: ponerlo acá se lo saca al otro.
          if (evento.uso[c] === caballo.id) delete evento.uso[c];
          else evento.uso[c] = caballo.id;
          guardarPronto();
          render();
        },
      }, [etiquetaLugar(evento, c)]);
    }));

    const tarjeta = el('div', {
      class: 'caballo' + (suyos.length ? ' usado' : '') + (caballo.lesionado ? ' lesionado' : ''),
    }, [
      el('div', { class: 'cab-head' }, [
        caballo.lesionado ? el('span', { class: 'cruz', title: 'Lesionado' }, ['✚']) : null,
        el('b', {}, [caballo.nombre]),
        suyos.length
          ? el('i', {}, [cantidad(cuanto) + (cuanto === 1 ? ' chukker' : ' chukkers')])
          : null,
        el('button', {
          class: 'marcar' + (caballo.lesionado ? ' activa' : ''), type: 'button',
          title: caballo.lesionado ? 'Darle el alta' : 'Marcarlo lesionado',
          'aria-label': (caballo.lesionado ? 'Darle el alta a ' : 'Marcar lesionado a ') + caballo.nombre,
          onclick: () => marcarLesion(caballo, !caballo.lesionado),
        }, ['✚']),
        el('button', {
          class: 'sacar', type: 'button', 'aria-label': 'Sacar ' + caballo.nombre + ' de mi caballada',
          onclick: () => sacarCaballo(caballo),
        }, ['×']),
      ]),
      caballo.lesionado
        ? el('div', { class: 'lesion' }, [
          'Lesionado' + (caballo.lesionado_desde
            ? ' desde el ' + Hoja.fechaCorta(caballo.lesionado_desde).toLowerCase()
            : ''),
        ])
        : null,
      pastillas,
    ]);

    if (suyos.length) {
      const punt = el('select', { 'aria-label': 'Cómo anduvo ' + caballo.nombre });
      punt.appendChild(el('option', { value: '' }, ['—']));
      for (let n = 10; n >= 1; n--) {
        const op = el('option', { value: String(n) }, [String(n)]);
        if (String(evento.puntajes[caballo.id]) === String(n)) op.selected = true;
        punt.appendChild(op);
      }
      punt.addEventListener('change', (e) => {
        if (e.target.value) evento.puntajes[caballo.id] = Number(e.target.value);
        else delete evento.puntajes[caballo.id];
        guardarPronto();
        render();
      });
      tarjeta.appendChild(el('div', { class: 'puntaje' }, [
        el('span', {}, ['Cómo anduvo hoy']), punt,
      ]));
    }

    lista.appendChild(tarjeta);
  });

  if (!activos.length) {
    lista.appendChild(el('div', { class: 'vacio' }, ['Todavía no cargaste ningún caballo.']));
  }
  raiz.appendChild(lista);

  /* ---- sumar un caballo */
  const nombre = el('input', { type: 'text', placeholder: 'Nombre del caballo', 'aria-label': 'Caballo nuevo' });
  const sumar = async () => {
    const texto = nombre.value.trim();
    if (!texto) { nombre.focus(); return; }
    try {
      const r = await pedir('/api/caballos', { method: 'POST', body: JSON.stringify({ nombre: texto }) });
      guardarEnLaCaballada(r.caballo);
    } catch (e) {
      caballos.error = e.message;
    }
    render();
  };
  nombre.addEventListener('keydown', (e) => { if (e.key === 'Enter') sumar(); });
  raiz.appendChild(el('div', { class: 'fila', style: 'margin-top:10px' }, [
    nombre,
    el('button', { class: 'ghost', type: 'button', style: 'width:auto;padding:12px 18px', onclick: sumar }, ['Agregar']),
  ]));

  /* ---- observaciones */
  raiz.appendChild(el('h2', {}, ['Observaciones']));
  const obs = el('textarea', {
    rows: 3, maxlength: 400,
    placeholder: 'Cómo anduvo la cancha, si algún caballo quedó sentido, lo que quieras dejar anotado.',
    // Sin redibujar en cada tecla: si no, se cierra el teclado.
    oninput: (e) => { evento.observaciones = e.target.value; caballos.guardado = 'guardando'; },
    onchange: () => guardarAhora(),
  });
  obs.value = evento.observaciones || '';
  raiz.appendChild(obs);

  /* ---- estado y compartir */
  const faltan = evento.misChukkers.filter((c) => !evento.uso[c]);
  raiz.appendChild(el('p', {
    class: 'pista', style: 'text-align:center;color:' + (faltan.length ? 'var(--gold)' : 'var(--teal)'),
  }, [
    faltan.length
      ? 'Te faltan ' + (evento.medios ? 'los medios ' : 'los chukkers ')
        + enTexto(faltan.map((c) => etiquetaLugar(evento, c)))
      : 'Tenés los ' + evento.misChukkers.length + ' lugares cargados',
  ]));

  raiz.appendChild(el('div', { class: 'acciones' }, [
    el('button', {
      class: 'primary', type: 'button',
      onclick: (e) => compartirTexto(textoDeCaballos(evento), e.currentTarget),
    }, ['Compartir por WhatsApp']),
  ]));

  raiz.appendChild(altaDeTorneo());
}

function guardarEnLaCaballada(caballo) {
  const ya = caballos.caballada.find((c) => c.id === caballo.id);
  if (ya) Object.assign(ya, caballo);
  else caballos.caballada.push(caballo);
  caballos.caballada.sort((a, b) => (b.activo - a.activo) || a.nombre.localeCompare(b.nombre));
}

async function marcarLesion(caballo, lesionado) {
  try {
    const r = await pedir('/api/caballos', {
      method: 'POST',
      body: JSON.stringify({ id: caballo.id, lesionado }),
    });
    guardarEnLaCaballada(r.caballo);
    // El período recién abierto —o el que se acaba de cerrar— va derecho al
    // calendario, sin volver a pedir todo.
    if (r.lesiones) caballos.lesiones = r.lesiones;
  } catch (e) {
    caballos.error = e.message;
  }
  render();
}

async function sacarCaballo(caballo) {
  try {
    await pedir('/api/caballos', { method: 'POST', body: JSON.stringify({ id: caballo.id, activo: false }) });
    caballo.activo = false;
    // Y sale de la jornada abierta, si estaba puesto.
    const evento = eventoAbierto();
    if (evento) {
      Object.keys(evento.uso).forEach((c) => { if (evento.uso[c] === caballo.id) delete evento.uso[c]; });
      delete evento.puntajes[caballo.id];
      guardarPronto();
    }
  } catch (e) {
    caballos.error = e.message;
  }
  render();
}

/* --------------------------------------------------------- partidos de AAP */

function altaDeTorneo() {
  if (!caballos.altaTorneo) {
    return el('div', { style: 'margin-top:22px' }, [
      el('button', {
        class: 'ghost', type: 'button',
        onclick: () => { caballos.altaTorneo = true; render(); },
      }, ['Sumar un partido de torneo']),
    ]);
  }

  const campo = (etiqueta, control) =>
    el('label', { class: 'campo' }, [el('span', {}, [etiqueta]), control]);

  return el('div', { class: 'card p', style: 'margin-top:22px' }, [
    campo('Torneo', el('input', {
      type: 'text', value: caballos.torneo.nombre, placeholder: 'Copa Ciudad de Buenos Aires',
      oninput: (e) => { caballos.torneo.nombre = e.target.value; },
    })),
    campo('Fecha', el('input', {
      type: 'date', value: caballos.torneo.fecha,
      onchange: (e) => { caballos.torneo.fecha = e.target.value; },
    })),
    campo('Chukkers', el('div', { class: 'chips' }, [4, 6, 8].map((n) =>
      el('button', {
        type: 'button', class: 'chip', 'aria-pressed': caballos.torneo.chukkers === n,
        onclick: () => { caballos.torneo.chukkers = n; render(); },
      }, [String(n)])))),
    el('p', { class: 'pista' }, [
      'Se juega de a medio chukker: van a quedar ' + caballos.torneo.chukkers * 2
      + ' lugares para cargar.',
    ]),
    el('div', { class: 'acciones' }, [
      el('button', {
        class: 'primary', type: 'button',
        onclick: (e) => conBoton(e.target, async () => {
          const r = await pedir('/api/jornadas', {
            method: 'POST',
            body: JSON.stringify({
              nombre: caballos.torneo.nombre,
              fecha: caballos.torneo.fecha,
              chukkers: caballos.torneo.chukkers,
              medios: true,
            }),
          });
          caballos.altaTorneo = false;
          caballos.torneo = { nombre: '', fecha: hoy(), chukkers: CHUKKERS_TORNEO };
          await cargarJornadas();
          caballos.elegido = r.jornada.id;   // se abre en el partido recién cargado
        }, caballos),
      }, ['Guardar el partido']),
      el('button', {
        class: 'link', type: 'button',
        onclick: () => { caballos.altaTorneo = false; render(); },
      }, ['Cancelar']),
    ]),
  ]);
}

/* ------------------------------------------------------------ estadísticas */

function diasDesde(iso) {
  const d = new Date(iso + 'T12:00:00');
  return Math.round((new Date() - d) / 86400000);
}

/**
 * Todo lo que se sabe de cada caballo, a partir de lo cargado jornada a
 * jornada. Las prácticas y los torneos se cuentan aparte y también juntos:
 * son dos exigencias distintas para el mismo animal.
 */
function estadisticas() {
  const stats = caballos.caballada.map((caballo) => ({
    caballo, chukkers: 0, practicas: 0, torneos: 0, jornadas: 0,
    puntajes: [], ultimo: null, chukkers7: 0, chukkers30: 0,
  }));
  const porId = new Map(stats.map((s) => [s.caballo.id, s]));

  (caballos.eventos || []).forEach((ev) => {
    const dias = diasDesde(ev.fecha);
    const peso = pesoDe(ev);
    const enEste = new Set();

    ev.misChukkers.forEach((ch) => {
      const s = porId.get(ev.uso[ch]);
      if (!s) return;
      s.chukkers += peso;
      if (ev.tipo === 'aap') s.torneos += peso;
      else s.practicas += peso;
      if (dias <= 7) s.chukkers7 += peso;
      if (dias <= 30) s.chukkers30 += peso;
      enEste.add(s.caballo.id);
    });

    enEste.forEach((id) => {
      const s = porId.get(id);
      s.jornadas++;
      if (!s.ultimo || ev.fecha > s.ultimo) s.ultimo = ev.fecha;
      if (ev.puntajes[id]) s.puntajes.push(ev.puntajes[id]);
    });
  });

  stats.forEach((s) => {
    s.promedio = s.puntajes.length
      ? s.puntajes.reduce((a, b) => a + b, 0) / s.puntajes.length
      : null;
  });
  return stats;
}

const unDecimal = (n) => n.toFixed(1).replace('.', ',');

function ordenar(stats) {
  return stats.slice().sort((a, b) => {
    if (caballos.orden === 'promedio') {
      if (a.promedio === null && b.promedio === null) return b.chukkers - a.chukkers;
      if (a.promedio === null) return 1;
      if (b.promedio === null) return -1;
      return b.promedio - a.promedio || b.chukkers - a.chukkers;
    }
    if (caballos.orden === 'carga') return b.chukkers7 - a.chukkers7 || b.chukkers - a.chukkers;
    return b.chukkers - a.chukkers || a.caballo.nombre.localeCompare(b.caballo.nombre);
  });
}

function panelEstadisticas(raiz) {
  const stats = estadisticas().filter((s) => s.chukkers > 0);

  if (!stats.length) {
    raiz.appendChild(el('div', { class: 'vacio' }, [
      'Todavía no hay nada cargado. Cargá los caballos de una jornada y acá vas a ver cómo viene cada uno.',
    ]));
    return;
  }

  const suma = (campo) => stats.reduce((a, s) => a + s[campo], 0);
  const jornadas = (caballos.eventos || []).filter((e) => Object.keys(e.uso).length).length;

  raiz.appendChild(el('div', { class: 'card p numeros' }, [
    el('div', {}, [el('b', {}, [cantidad(suma('practicas'))]), el('span', {}, ['en prácticas'])]),
    el('div', {}, [el('b', { class: 'oro' }, [cantidad(suma('torneos'))]), el('span', {}, ['en torneos'])]),
    el('div', {}, [el('b', { class: 'teal' }, [cantidad(suma('chukkers'))]), el('span', {}, ['chukkers en total'])]),
  ]));
  raiz.appendChild(el('p', { class: 'pista', style: 'text-align:center' }, [
    stats.length + (stats.length === 1 ? ' caballo · ' : ' caballos · ')
    + jornadas + (jornadas === 1 ? ' jornada' : ' jornadas'),
  ]));

  raiz.appendChild(el('div', { class: 'chips', style: 'margin-top:14px' },
    [['chukkers', 'Chukkers'], ['promedio', 'Puntaje'], ['carga', 'Últimos 7 días']].map(([clave, texto]) =>
      el('button', {
        type: 'button', class: 'chip', 'aria-pressed': caballos.orden === clave,
        onclick: () => { caballos.orden = clave; render(); },
      }, [texto]))));

  const ordenados = ordenar(stats);
  raiz.appendChild(el('div', { class: 'lista', style: 'margin-top:10px' }, ordenados.map((s, i) => {
    const dias = s.ultimo === null ? null : diasDesde(s.ultimo);
    const detalle = [
      'prácticas ' + cantidad(s.practicas),
      'torneos ' + cantidad(s.torneos),
      s.promedio !== null ? 'puntaje ' + unDecimal(s.promedio) : 'sin puntaje',
      dias === null ? null : dias <= 0 ? 'jugó hoy' : dias === 1 ? 'ayer' : 'hace ' + dias + ' días',
    ].filter(Boolean).join('  ·  ');

    return el('div', { class: 'quien estatico' }, [
      el('span', { class: 'puesto-nro' + (i < 3 ? ' podio' : '') }, [String(i + 1)]),
      el('span', { style: 'flex:1' }, [
        el('b', {}, [
          s.caballo.lesionado ? el('span', { class: 'cruz' }, ['✚ ']) : null,
          s.caballo.nombre,
        ]),
        el('span', {}, [detalle]),
      ]),
      s.chukkers7 >= 6 ? el('span', { class: 'marca' }, [cantidad(s.chukkers7) + ' en 7d']) : null,
      // El número grande es aquello por lo que se está ordenando.
      el('span', { class: 'hcp teal' }, [
        caballos.orden === 'promedio'
          ? (s.promedio === null ? '—' : unDecimal(s.promedio))
          : cantidad(s.chukkers),
      ]),
    ]);
  })));

  // El dato que el club hoy no tiene: qué caballo viene jugando de más.
  const cargados = stats.filter((s) => s.chukkers7 >= 6);
  if (cargados.length) {
    raiz.appendChild(aviso('nota', cargados.length === 1
      ? cargados[0].caballo.nombre + ' lleva ' + cantidad(cargados[0].chukkers7)
        + ' chukkers en los últimos 7 días.'
      : 'Hay ' + cargados.length + ' caballos con 6 o más chukkers en los últimos 7 días.'));
  }

  const lesionados = stats.filter((s) => s.caballo.lesionado);
  if (lesionados.length) {
    raiz.appendChild(aviso('nota', 'Lesionados: '
      + lesionados.map((s) => s.caballo.nombre).join(', ') + '.'));
  }

  raiz.appendChild(el('div', { class: 'acciones' }, [
    el('button', {
      class: 'primary', type: 'button',
      onclick: (e) => compartirTexto(textoDeEstadisticas(ordenados), e.currentTarget),
    }, ['Compartir por WhatsApp']),
  ]));

  grafico(raiz, ordenados);
}

/* ----------------------------------------------------------------- textos */

function enTexto(cosas) {
  if (!cosas.length) return '';
  if (cosas.length === 1) return String(cosas[0]);
  return cosas.slice(0, -1).join(', ') + ' y ' + cosas[cosas.length - 1];
}

/**
 * Como se manda al grupo: el número del chukker y el caballo, sin más palabras.
 * En el torneo los dos medios van en el mismo renglón — "3: Malvina / Pampa" —
 * que es como se lee de un vistazo.
 */
function textoDeCaballos(evento) {
  const nombreDe = (id) => (caballos.caballada.find((c) => c.id === id) || {}).nombre || '—';
  const lineas = [
    evento.tipo === 'aap'
      ? evento.titulo + ' — ' + Hoja.fechaCorta(evento.fecha)
      : 'Caballos — ' + Hoja.fechaCorta(evento.fecha) + ' · ' + evento.detalle,
    '',
  ];

  if (evento.medios) {
    for (let c = 1; c <= evento.chukkers; c++) {
      const primero = evento.uso[c * 2 - 1];
      const segundo = evento.uso[c * 2];
      if (!primero && !segundo) continue;
      lineas.push(c + ': ' + nombreDe(primero) + ' / ' + nombreDe(segundo));
    }
  } else {
    evento.misChukkers.forEach((c) => {
      lineas.push(c + ': ' + nombreDe(evento.uso[c]));
    });
  }

  const puntuados = Object.keys(evento.puntajes);
  if (puntuados.length) {
    lineas.push('');
    puntuados.forEach((id) => lineas.push(nombreDe(id) + ': ' + evento.puntajes[id] + '/10'));
  }
  if (evento.observaciones) {
    lineas.push('', evento.observaciones);
  }
  return lineas.join('\n');
}

function textoDeEstadisticas(ordenados) {
  const lineas = ['Caballos de ' + estado.jugador.apodo, ''];
  ordenados.forEach((s, i) => {
    const partes = [
      cantidad(s.chukkers) + ' chk',
      'prácticas ' + cantidad(s.practicas),
      'torneos ' + cantidad(s.torneos),
    ];
    if (s.promedio !== null) partes.push('puntaje ' + unDecimal(s.promedio));
    lineas.push((i + 1) + '. ' + s.caballo.nombre + (s.caballo.lesionado ? ' (lesionado)' : '')
      + '  —  ' + partes.join(' · '));
  });
  return lineas.join('\n');
}

/** Manda el texto al menú de compartir; si no hay, lo deja en el portapapeles. */
async function compartirTexto(texto, boton) {
  const original = boton.dataset.original || boton.textContent;
  boton.dataset.original = original;
  if (navigator.share) {
    try {
      await navigator.share({ text: texto });
      boton.textContent = 'Compartido';
      setTimeout(() => { boton.textContent = original; }, 3000);
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(texto);
    boton.textContent = 'Copiado — pegalo en WhatsApp';
  } catch (e) {
    boton.textContent = 'No se pudo copiar';
  }
  setTimeout(() => { boton.textContent = original; }, 3000);
}

/* ------------------------------------------------------------------ vista */

function vistaCaballos(raiz) {
  raiz.appendChild(el('div', { class: 'chips', style: 'margin-top:16px' },
    [['cargar', 'Cargar'], ['stats', 'Estadísticas']].map(([clave, texto]) =>
      el('button', {
        type: 'button', class: 'chip', 'aria-pressed': caballos.sub === clave,
        onclick: () => {
          if (caballos.sub === 'cargar') guardarAhora();
          caballos.sub = clave;
          render();
        },
      }, [texto]))));

  if (caballos.error) raiz.appendChild(aviso('mal', caballos.error));
  if (!caballos.eventos) {
    raiz.appendChild(el('div', { class: 'vacio' }, ['Cargando…']));
    return;
  }

  if (caballos.guardado) {
    const bien = caballos.guardado === 'guardando' || caballos.guardado === 'guardado';
    raiz.appendChild(el('p', { class: 'guardado' + (bien ? '' : ' mal') }, [
      caballos.guardado === 'guardando' ? 'Guardando…'
        : caballos.guardado === 'guardado' ? 'Guardado' : caballos.guardado,
    ]));
  }

  if (caballos.sub === 'stats') panelEstadisticas(raiz);
  else panelCargar(raiz);
}


/* ===========================================================================
   El calendario de la caballada.

   Una fila por caballo y una columna por jornada. Cada celda dice si ese día
   jugó y, cuando tiene puntaje, cuánto: más oscuro es mejor. La fila de cada
   caballo va desde la primera práctica que jugó hasta la última, y las jornadas
   en las que no salió ninguno quedan como una rayita, que ocupan menos.

   La línea roja cruza los cuadraditos por el medio y marca cada período en que
   estuvo lesionado.

   El mismo dibujo sale por dos lados: en pantalla como SVG —los nombres
   quedan fijos y la grilla se desliza— y en JPG para mandar por WhatsApp, con
   la temporada entera en grande.
   =========================================================================== */

/* Un solo tono, de claro a oscuro, para el puntaje: 1-4, 5-6, 7-8, 9-10.
   Verificado sobre fondo blanco: el más claro se despega y los cuatro escalones
   se distinguen entre sí. */
const RAMPA_PUNTAJE = ['#5cbfb2', '#1a9b8b', '#00786b', '#0a5148'];
const SIN_PUNTAJE = '#8b97ab';     // jugó, pero nadie lo puntuó
const CELDA_VACIA = '#ffffff';     // no jugó
const BORDE_VACIA = '#dde3ec';
const COLOR_LESION = '#c62828';
const TINTA_NOMBRE = '#16202e';
const TINTA_EJE = '#6b7891';
// La diagonal que marca el torneo. Blanca se despega de los verdes oscuros;
// negra se lee mejor sobre los claros. Se cambia acá y cambia en los dos lados.
const COLOR_DIAGONAL = '#ffffff';

const escalon = (puntaje) => (puntaje >= 9 ? 3 : puntaje >= 7 ? 2 : puntaje >= 5 ? 1 : 0);

const colorDeCelda = (celda) => (celda.chukkers <= 0 ? CELDA_VACIA
  : celda.puntaje ? RAMPA_PUNTAJE[escalon(celda.puntaje)]
    : SIN_PUNTAJE);

/**
 * Qué forma toma un cuadrito. La práctica es un cuadrado lleno; el torneo
 * lleva una diagonal encima, y si ahí el caballo hizo nada más que medio
 * chukker se llena solo el triángulo de abajo.
 */
function formaDeCelda(celda) {
  const jugo = celda.chukkers > 0;
  return {
    jugo,
    relleno: colorDeCelda(celda),
    diagonal: jugo && celda.torneo,
    medio: jugo && celda.torneo && celda.chukkers <= 0.5,
  };
}

/**
 * El plano del calendario: qué filas, qué columnas y dónde va cada cosa.
 * Lo arman una sola vez la pantalla y la exportación, así los dos dibujan
 * exactamente lo mismo.
 */
function planoDelCalendario(stats, medidas) {
  const eventos = (caballos.eventos || [])
    .slice()
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

  // Los que jugaron, y también los lesionados que no jugaron nada: que un
  // caballo esté parado es exactamente lo que este cuadro tiene que mostrar.
  const yaEstan = new Set(stats.map((s) => s.caballo.id));
  const parados = caballos.caballada
    .filter((c) => c.lesionado && !yaEstan.has(c.id))
    .map((c) => ({ caballo: c }));

  const porCaballo = {};
  (caballos.lesiones || []).forEach((l) => {
    if (!porCaballo[l.caballo_id]) porCaballo[l.caballo_id] = [];
    porCaballo[l.caballo_id].push(l);
  });

  const filas = stats.concat(parados).map((s) => {
    const celdas = eventos.map((ev) => {
      const lugares = ev.misChukkers.filter((c) => ev.uso[c] === s.caballo.id).length;
      return {
        fecha: ev.fecha,
        chukkers: lugares * pesoDe(ev),
        puntaje: ev.puntajes[s.caballo.id] || null,
        // El torneo exige distinto que la práctica: el cuadrito lo dice con
        // una diagonal, y si el caballo hizo medio chukker se llena la mitad.
        torneo: ev.tipo === 'aap',
      };
    });
    const jugadas = celdas.map((c, i) => (c.chukkers > 0 ? i : -1)).filter((i) => i >= 0);

    // Si todavía no se cargó ningún período, vale el estado de hoy.
    let lesiones = porCaballo[s.caballo.id] || [];
    if (!lesiones.length && s.caballo.lesionado && s.caballo.lesionado_desde) {
      lesiones = [{ desde: s.caballo.lesionado_desde, hasta: null }];
    }

    return {
      caballo: s.caballo,
      celdas,
      desde: jugadas.length ? jugadas[0] : -1,
      hasta: jugadas.length ? jugadas[jugadas.length - 1] : -1,
      lesiones,
    };
  });

  // Una jornada en la que no salió ningún caballo no merece una columna entera:
  // queda como una rayita y deja lugar para las que sí cuentan.
  const conJuego = eventos.map((_, c) => filas.some((f) => f.celdas[c].chukkers > 0));

  const { etiqueta, celda, hueco, angosta, fila, eje } = medidas;
  const x = [];
  let corre = 0;
  eventos.forEach((_, c) => {
    x.push(corre);
    corre += (conJuego[c] ? celda + hueco : angosta + hueco);
  });

  return {
    eventos, filas, conJuego, x,
    anchoGrilla: corre,
    ancho: etiqueta + corre,
    alto: filas.length * fila + eje,
  };
}

/** Los tramos de columnas que abarca cada período de lesión. */
function tramosDeLesion(fila, eventos) {
  return fila.lesiones.map((l) => {
    let desde = eventos.findIndex((ev) => ev.fecha >= l.desde);
    if (desde === -1) desde = eventos.length - 1;   // se lesionó después de todo
    let hasta = l.hasta
      ? eventos.reduce((ultimo, ev, i) => (ev.fecha <= l.hasta ? i : ultimo), -1)
      : eventos.length - 1;
    if (hasta < desde) hasta = desde;               // duró menos que una jornada
    return { desde, hasta };
  }).filter((t) => t.desde >= 0);
}

/** El cuadradito de torneo, para la referencia: entero o por la mitad. */
function muestraDeTorneo(medio) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', 13);
  svg.setAttribute('height', 13);
  svg.setAttribute('viewBox', '0 0 14 14');
  const poner = (tag, attrs) => {
    const n = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v)));
    svg.appendChild(n);
  };
  if (medio) {
    poner('rect', { x: 0.5, y: 0.5, width: 13, height: 13, rx: 3, fill: CELDA_VACIA, stroke: BORDE_VACIA });
    poner('path', { d: 'M1 1 L1 13.5 L13 13.5 Z', fill: RAMPA_PUNTAJE[2] });
    poner('rect', { x: 0.5, y: 0.5, width: 13, height: 13, rx: 3, fill: 'none', stroke: BORDE_VACIA });
  } else {
    poner('rect', { x: 0.5, y: 0.5, width: 13, height: 13, rx: 3, fill: RAMPA_PUNTAJE[2] });
  }
  poner('line', {
    x1: 1.5, y1: 1.5, x2: 12.5, y2: 12.5,
    stroke: COLOR_DIAGONAL, 'stroke-width': 1.5, 'stroke-linecap': 'round',
  });
  return svg;
}

/* ------------------------------------------------------------- en pantalla */

const MEDIDAS = { etiqueta: 74, celda: 14, hueco: 4, angosta: 6, fila: 24, eje: 20 };

function grafico(raiz, stats) {
  const plano = planoDelCalendario(stats, MEDIDAS);
  if (!plano.eventos.length || !plano.filas.length) return;

  const { eventos, filas, conJuego, x } = plano;
  const M = MEDIDAS;

  raiz.appendChild(el('h2', {}, ['Cómo viene cada caballo']));
  raiz.appendChild(el('p', { class: 'pista', style: 'margin-bottom:10px' }, [
    'La fila de cada caballo va desde la primera práctica que jugó hasta la última. '
    + 'Las jornadas en las que no salió ninguno quedan como una rayita. '
    + 'Deslizá de costado para ver toda la temporada.',
  ]));

  const nodo = (tag, attrs, hijos) => {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, String(v)));
    (hijos || []).forEach((h) => n.appendChild(h));
    return n;
  };

  /* ---- los nombres, quietos a la izquierda */
  const nombres = el('div', { class: 'calendario-nombres' }, filas.map((f) =>
    el('div', { class: 'nombre-fila' + (f.caballo.lesionado ? ' lesionado' : '') }, [f.caballo.nombre])));

  /* ---- la grilla, que se desliza */
  const svg = nodo('svg', {
    width: plano.anchoGrilla, height: plano.alto,
    viewBox: '0 0 ' + plano.anchoGrilla + ' ' + plano.alto,
    role: 'img', class: 'grilla',
    'aria-label': 'Calendario de ' + filas.length + ' caballos en ' + eventos.length + ' jornadas.',
  });

  filas.forEach((fila, i) => {
    const y = i * M.fila;

    fila.celdas.forEach((celda, c) => {
      if (fila.desde === -1 || c < fila.desde || c > fila.hasta) return;
      if (!conJuego[c]) return;

      const f = formaDeCelda(celda);
      const g = nodo('g', { class: 'celda' + (f.jugo ? ' clicable' : '') });
      const marco = (relleno, borde) => nodo('rect', {
        x: x[c], y, width: M.celda, height: M.celda, rx: 3,
        fill: relleno, stroke: borde || 'none', 'stroke-width': borde ? 1 : 0,
      });

      if (f.medio) {
        // El cuadrado queda vacío y se llena solo el triángulo de abajo.
        g.appendChild(marco(CELDA_VACIA, BORDE_VACIA));
        g.appendChild(nodo('path', {
          d: 'M' + x[c] + ' ' + (y + 1) + ' L' + x[c] + ' ' + (y + M.celda)
            + ' L' + (x[c] + M.celda - 1) + ' ' + (y + M.celda) + ' Z',
          fill: f.relleno,
        }));
        g.appendChild(marco('none', BORDE_VACIA));   // el borde, prolijo, encima
      } else {
        g.appendChild(marco(f.relleno, f.jugo ? null : BORDE_VACIA));
      }

      if (f.diagonal) {
        g.appendChild(nodo('line', {
          x1: x[c] + 1, y1: y + 1, x2: x[c] + M.celda - 1, y2: y + M.celda - 1,
          stroke: COLOR_DIAGONAL, 'stroke-width': 1.5, 'stroke-linecap': 'round',
        }));
      }

      const detalle = fila.caballo.nombre + ' · ' + Hoja.fechaCorta(celda.fecha) + ' · '
        + (f.jugo
          ? cantidad(celda.chukkers) + (celda.chukkers === 1 ? ' chukker' : ' chukkers')
            + (celda.torneo ? ' de torneo' : '')
            + (celda.puntaje ? ' · puntaje ' + celda.puntaje : ' · sin puntaje')
          : 'no jugó');
      g.appendChild(nodo('title', {}, [])).textContent = detalle;
      if (f.jugo) g.addEventListener('click', () => { caballos.detalle = detalle; render(); });
      svg.appendChild(g);
    });

    // La lesión cruza los cuadraditos por el medio, con un borde blanco para
    // que se lea igual arriba de un cuadrito lleno que de uno vacío.
    tramosDeLesion(fila, eventos).forEach((t) => {
      const ancho = x[t.hasta] + (conJuego[t.hasta] ? M.celda : M.angosta) - x[t.desde];
      svg.appendChild(nodo('rect', {
        x: x[t.desde], y: y + M.celda / 2 - 1.5, width: ancho, height: 3, rx: 1.5,
        fill: COLOR_LESION, stroke: '#ffffff', 'stroke-width': 1,
      }));
    });
  });

  // Las rayitas de los días que pasaron sin que jugara ninguno.
  eventos.forEach((ev, c) => {
    if (conJuego[c]) return;
    const raya = nodo('rect', {
      x: x[c] + M.angosta / 2 - 0.5, y: 0,
      width: 1, height: filas.length * M.fila - (M.fila - M.celda), fill: BORDE_VACIA,
    });
    raya.appendChild(nodo('title', {}, [])).textContent =
      Hoja.fechaCorta(ev.fecha) + ' · no salió ningún caballo';
    svg.appendChild(raya);
  });

  // El eje: una fecha cada tanto, sin repetir ni encimarse.
  const ejeY = filas.length * M.fila + 13;
  let ultima = null;
  let ultimaX = -999;
  eventos.forEach((ev, c) => {
    const centro = x[c] + (conJuego[c] ? M.celda : M.angosta) / 2;
    const d = new Date(ev.fecha + 'T12:00:00');
    const etiqueta = d.getDate() + '/' + (d.getMonth() + 1);
    if (etiqueta === ultima || centro - ultimaX < 40) return;
    ultima = etiqueta;
    ultimaX = centro;
    const t = nodo('text', { x: centro, y: ejeY, 'text-anchor': 'middle', class: 'eje' });
    t.textContent = etiqueta;
    svg.appendChild(t);
  });

  const desliza = el('div', { class: 'calendario-grilla' });
  desliza.appendChild(svg);
  raiz.appendChild(el('div', { class: 'calendario' }, [nombres, desliza]));

  // El detalle de lo último que se tocó.
  raiz.appendChild(el('p', { class: 'detalle-grafico' }, [
    caballos.detalle || 'Tocá un cuadrito para ver de qué jornada es.',
  ]));

  /* ---- la referencia */
  const llave = (color, texto, borde, clase) => el('span', { class: 'llave' }, [
    el('i', { class: clase || '', style: 'background:' + color + (borde ? ';border:1px solid ' + borde : '') }),
    texto,
  ]);

  raiz.appendChild(el('div', { class: 'referencia' }, [
    el('span', { class: 'titulo-ref' }, ['Puntaje']),
    llave(RAMPA_PUNTAJE[0], '1 a 4'),
    llave(RAMPA_PUNTAJE[1], '5 y 6'),
    llave(RAMPA_PUNTAJE[2], '7 y 8'),
    llave(RAMPA_PUNTAJE[3], '9 y 10'),
  ]));
  raiz.appendChild(el('div', { class: 'referencia' }, [
    llave(SIN_PUNTAJE, 'jugó sin puntaje'),
    llave(CELDA_VACIA, 'no jugó', BORDE_VACIA),
    llave(BORDE_VACIA, 'no salió ninguno', null, 'rayita'),
    llave(COLOR_LESION, 'lesionado', null, 'barra'),
  ]));
  raiz.appendChild(el('div', { class: 'referencia' }, [
    el('span', { class: 'titulo-ref' }, ['Torneo']),
    el('span', { class: 'llave' }, [muestraDeTorneo(false), 'chukker entero']),
    el('span', { class: 'llave' }, [muestraDeTorneo(true), 'medio chukker']),
  ]));

  raiz.appendChild(el('div', { class: 'acciones' }, [
    el('button', {
      class: 'ghost', type: 'button',
      onclick: (e) => Hoja.compartirCanvas(
        calendarioEnCanvas(stats),
        'caballos-' + hoy() + '.jpg',
        e.currentTarget,
      ),
    }, ['Compartir el calendario en JPG']),
  ]));
}

/* ------------------------------------------------------------------ en JPG */

/* Más grande que en pantalla: la temporada entera se manda por WhatsApp y se
   mira en el celular de otro, así que los cuadraditos tienen que aguantar la
   compresión y el zoom. El plano lo arma la misma función, con estas medidas:
   la pantalla y el JPG dibujan siempre lo mismo. */
const MEDIDAS_JPG = { etiqueta: 300, celda: 30, hueco: 10, angosta: 12, fila: 46, eje: 46 };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const enDia = (iso) => Number(iso.slice(8)) + ' de ' + MESES[Number(iso.slice(5, 7)) - 1];

/** El año solo cuando hace falta: adentro de una temporada sobra. */
function rangoDeFechas(desde, hasta) {
  const ano = (iso) => ' de ' + iso.slice(0, 4);
  const mismo = desde.slice(0, 4) === hasta.slice(0, 4);
  return 'Del ' + enDia(desde) + (mismo ? '' : ano(desde))
    + ' al ' + enDia(hasta) + (mismo ? '' : ano(hasta));
}

function calendarioEnCanvas(stats) {
  const M = MEDIDAS_JPG;
  const plano = planoDelCalendario(stats, M);
  const { eventos, filas, conJuego, x } = plano;

  const margen = 60;
  const cabecera = 200;
  const pieAlto = 190;
  const grillaAlto = filas.length * M.fila;
  const ancho = Math.max(1100, margen * 2 + M.etiqueta + plano.anchoGrilla);
  const alto = cabecera + grillaAlto + M.eje + pieAlto;

  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  if (!eventos.length || !filas.length) return canvas;

  const x0 = margen + M.etiqueta;
  const y0 = cabecera;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ancho, alto);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  /* ---- la cabecera, con el logo del club */
  if (Hoja.LOGO.complete && Hoja.LOGO.naturalWidth) {
    const altoLogo = 120;
    const anchoLogo = Hoja.LOGO.naturalWidth * altoLogo / Hoja.LOGO.naturalHeight;
    ctx.drawImage(Hoja.LOGO, ancho - margen - anchoLogo, 30, anchoLogo, altoLogo);
  }

  ctx.fillStyle = TINTA_NOMBRE;
  ctx.font = Hoja.fuente(46, 'bold');
  ctx.fillText('Caballos de ' + estado.jugador.apodo, margen, 96);

  ctx.font = Hoja.fuente(26);
  ctx.fillStyle = TINTA_EJE;
  ctx.fillText(
    rangoDeFechas(eventos[0].fecha, eventos[eventos.length - 1].fecha)
    + '  ·  ' + filas.length + (filas.length === 1 ? ' caballo' : ' caballos')
    + '  ·  ' + eventos.length + (eventos.length === 1 ? ' jornada' : ' jornadas'),
    margen, 140,
  );

  /* ---- el fondo de las filas: sirve para seguir un renglón largo con el ojo */
  filas.forEach((_, i) => {
    if (i % 2 === 0) return;
    ctx.fillStyle = '#f6f8fb';
    ctx.fillRect(margen, y0 + i * M.fila - 8, ancho - margen * 2, M.fila);
  });

  /* ---- los meses, para ubicarse en la temporada de un vistazo */
  ctx.font = Hoja.fuente(22, 'bold');
  let mesAnterior = null;
  let finDelRotulo = -999;
  eventos.forEach((ev, c) => {
    const mes = Number(ev.fecha.slice(5, 7)) - 1;
    if (mes === mesAnterior) return;
    const corte = Math.round(x0 + x[c] - M.hueco / 2);
    if (mesAnterior !== null) {
      ctx.fillStyle = '#e6ebf2';
      ctx.fillRect(corte, y0 - 14, 1, grillaAlto + 4);
    }
    mesAnterior = mes;
    // Un mes de dos jornadas no entra: mejor sin rótulo que encimado.
    const largo = ctx.measureText(MESES[mes]).width;
    if (corte + 8 < finDelRotulo + 18 || corte + 8 + largo > ancho - margen) return;
    finDelRotulo = corte + 8 + largo;
    ctx.fillStyle = TINTA_EJE;
    ctx.fillText(MESES[mes], corte + 8, y0 - 26);
  });

  /* ---- las rayitas de los días en que no salió ningún caballo */
  eventos.forEach((_, c) => {
    if (conJuego[c]) return;
    ctx.fillStyle = BORDE_VACIA;
    ctx.fillRect(Math.round(x0 + x[c] + M.angosta / 2), y0, 2, grillaAlto - (M.fila - M.celda));
  });

  /* ---- cada caballo: su nombre, sus cuadraditos y sus lesiones */
  filas.forEach((fila, i) => {
    const y = y0 + i * M.fila;
    const total = fila.celdas.reduce((a, c) => a + c.chukkers, 0);

    ctx.textAlign = 'right';
    ctx.font = Hoja.fuente(25, fila.caballo.lesionado ? 'bold' : '');
    ctx.fillStyle = fila.caballo.lesionado ? COLOR_LESION : TINTA_NOMBRE;
    ctx.fillText(
      (fila.caballo.lesionado ? '✚ ' : '') + fila.caballo.nombre,
      margen + M.etiqueta - 76, y + M.celda - 8,
    );
    ctx.font = Hoja.fuente(23, 'bold');
    ctx.fillStyle = RAMPA_PUNTAJE[2];
    ctx.fillText(cantidad(total), margen + M.etiqueta - 22, y + M.celda - 8);
    ctx.textAlign = 'left';

    fila.celdas.forEach((celda, c) => {
      if (fila.desde === -1 || c < fila.desde || c > fila.hasta) return;
      if (!conJuego[c]) return;

      const f = formaDeCelda(celda);
      const cx = x0 + x[c];

      if (f.medio) {
        // Vacío el cuadrado, lleno el triángulo de abajo y le repaso el borde.
        redondeado(ctx, cx, y, M.celda, M.celda, 5);
        ctx.fillStyle = CELDA_VACIA;
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.beginPath();
        ctx.moveTo(cx, y);
        ctx.lineTo(cx, y + M.celda);
        ctx.lineTo(cx + M.celda, y + M.celda);
        ctx.closePath();
        ctx.fillStyle = f.relleno;
        ctx.fill();
        ctx.restore();
        redondeado(ctx, cx, y, M.celda, M.celda, 5);
        ctx.strokeStyle = BORDE_VACIA;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        redondeado(ctx, cx, y, M.celda, M.celda, 5);
        ctx.fillStyle = f.relleno;
        ctx.fill();
        if (!f.jugo) {
          ctx.strokeStyle = BORDE_VACIA;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      if (f.diagonal) {
        ctx.beginPath();
        ctx.moveTo(cx + 2, y + 2);
        ctx.lineTo(cx + M.celda - 2, y + M.celda - 2);
        ctx.strokeStyle = COLOR_DIAGONAL;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.lineCap = 'butt';
      }
    });

    // La lesión cruza los cuadraditos por el medio, con el filete blanco que la
    // hace legible tanto arriba de uno lleno como de uno vacío.
    tramosDeLesion(fila, eventos).forEach((t) => {
      const desde = x0 + x[t.desde];
      const ancho = x[t.hasta] + (conJuego[t.hasta] ? M.celda : M.angosta) - x[t.desde];
      redondeado(ctx, desde, y + M.celda / 2 - 3, ancho, 6, 3);
      ctx.fillStyle = COLOR_LESION;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  });

  /* ---- el eje: una fecha cada tanto, sin encimarse */
  ctx.textAlign = 'center';
  ctx.font = Hoja.fuente(21);
  ctx.fillStyle = TINTA_EJE;
  let ultimaX = -999;
  let ultimoRotulo = null;
  eventos.forEach((ev, c) => {
    const centro = x0 + x[c] + (conJuego[c] ? M.celda : M.angosta) / 2;
    // Dos canchas el mismo día son dos columnas, pero una sola fecha.
    const rotulo = Number(ev.fecha.slice(8)) + '/' + Number(ev.fecha.slice(5, 7));
    if (rotulo === ultimoRotulo || centro - ultimaX < 86) return;
    ultimaX = centro;
    ultimoRotulo = rotulo;
    ctx.fillText(rotulo, centro, y0 + grillaAlto + 30);
  });
  ctx.textAlign = 'left';

  /* ---- la referencia y el pie */
  referenciaEnCanvas(ctx, margen, y0 + grillaAlto + M.eje + 46, ancho - margen * 2);

  ctx.font = Hoja.fuente(21);
  ctx.fillStyle = TINTA_EJE;
  ctx.fillText('Club de Campo San Diego · ' + enDia(hoy()), margen, alto - 42);

  return canvas;
}

/** Un rectángulo con las puntas redondeadas, que no todos los navegadores traen. */
function redondeado(ctx, x, y, ancho, alto, r) {
  const radio = Math.min(r, ancho / 2, alto / 2);
  ctx.beginPath();
  ctx.moveTo(x + radio, y);
  ctx.arcTo(x + ancho, y, x + ancho, y + alto, radio);
  ctx.arcTo(x + ancho, y + alto, x, y + alto, radio);
  ctx.arcTo(x, y + alto, x, y, radio);
  ctx.arcTo(x, y, x + ancho, y, radio);
  ctx.closePath();
}

/** La misma referencia que en pantalla, acomodada en renglones. */
function referenciaEnCanvas(ctx, x, y, ancho) {
  const llaves = [
    { texto: 'puntaje 1 a 4', color: RAMPA_PUNTAJE[0] },
    { texto: '5 y 6', color: RAMPA_PUNTAJE[1] },
    { texto: '7 y 8', color: RAMPA_PUNTAJE[2] },
    { texto: '9 y 10', color: RAMPA_PUNTAJE[3] },
    { texto: 'jugó sin puntaje', color: SIN_PUNTAJE },
    { texto: 'no jugó', color: CELDA_VACIA, borde: BORDE_VACIA },
    { texto: 'no salió ninguno', color: BORDE_VACIA, forma: 'rayita' },
    { texto: 'lesionado', color: COLOR_LESION, forma: 'barra' },
    { texto: 'torneo', color: RAMPA_PUNTAJE[2], forma: 'torneo' },
    { texto: 'medio chukker', color: RAMPA_PUNTAJE[2], forma: 'medio' },
  ];

  ctx.font = Hoja.fuente(21);
  ctx.textAlign = 'left';
  let cx = x;
  let cy = y;

  llaves.forEach((llave) => {
    const largo = 34 + ctx.measureText(llave.texto).width + 30;
    if (cx > x && cx + largo > x + ancho) { cx = x; cy += 40; }

    if (llave.forma === 'rayita') {
      ctx.fillStyle = llave.color;
      ctx.fillRect(cx + 9, cy - 15, 3, 20);
    } else if (llave.forma === 'barra') {
      redondeado(ctx, cx, cy - 8, 22, 6, 3);
      ctx.fillStyle = llave.color;
      ctx.fill();
    } else if (llave.forma === 'torneo' || llave.forma === 'medio') {
      const t = cy - 17;
      if (llave.forma === 'medio') {
        redondeado(ctx, cx, t, 22, 22, 4);
        ctx.fillStyle = CELDA_VACIA;
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.beginPath();
        ctx.moveTo(cx, t);
        ctx.lineTo(cx, t + 22);
        ctx.lineTo(cx + 22, t + 22);
        ctx.closePath();
        ctx.fillStyle = llave.color;
        ctx.fill();
        ctx.restore();
        redondeado(ctx, cx, t, 22, 22, 4);
        ctx.strokeStyle = BORDE_VACIA;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        redondeado(ctx, cx, t, 22, 22, 4);
        ctx.fillStyle = llave.color;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(cx + 2, t + 2);
      ctx.lineTo(cx + 20, t + 20);
      ctx.strokeStyle = COLOR_DIAGONAL;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.lineCap = 'butt';
    } else {
      redondeado(ctx, cx, cy - 17, 22, 22, 4);
      ctx.fillStyle = llave.color;
      ctx.fill();
      if (llave.borde) {
        ctx.strokeStyle = llave.borde;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    ctx.fillStyle = TINTA_EJE;
    ctx.fillText(llave.texto, cx + 34, cy);
    cx += largo;
  });
}
