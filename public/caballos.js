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
  elegido: null,        // la clave de la jornada abierta
  buscando: false,      // el buscador de jornadas anteriores
  filtro: '',
  orden: 'chukkers',
  guardado: '',         // '' | 'guardando' | 'guardado' | el error
  altaTorneo: false,
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
