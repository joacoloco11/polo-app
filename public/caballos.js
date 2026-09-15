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
  extras: [],           // los chukkers que la caballada jugó fuera del club
  /* --- la caballada compartida ------------------------------------------
     Un caballo prestado juega igual: los chukkers que le hizo el otro son
     patas del mismo animal. `ajenos` es eso —cuánto jugó cada caballo cada día
     con los demás del grupo— y es lo que hace que la carga sea la de verdad. */
  ajenos: [],
  grupo: null,          // el grupo donde estoy, si acepté alguno
  invitacion: null,     // la que me mandaron y todavía no contesté
  deQuien: 'mios',      // 'mios' | 'grupo': de quién es la caballada que se ve
  // Qué caballos están mostrando sus chukkers partidos al medio, en qué
  // jornada. Es cosa de la pantalla: lo que se guarda son los medios cargados.
  medios: new Set(),
  armandoGrupo: false,  // está abierta la pantalla del grupo
  nuevoGrupo: null,     // { nombre, invitados } mientras se arma
  plantelGrupo: [],     // a quién se puede invitar
  filtroGrupo: '',
  grupoError: null,
  // Qué caballo tiene abierta la casilla extra y lo que se está escribiendo.
  // Uno a la vez: son cuatro campos y no entran dos formularios en la pantalla.
  extra: { caballoId: null, fecha: '', jinete: '', chukkers: '', error: null },
  cargando: false,      // hay una consulta de jornadas en vuelo
  sueltos: false,       // la pantalla de cargar chukkers sin práctica
  elegido: null,        // la clave de la jornada abierta
  buscando: false,      // el buscador de jornadas anteriores
  filtro: '',
  orden: 'chukkers',
  guardado: '',         // '' | 'guardando' | 'guardado' | el error
  altaTorneo: false,
  detalle: '',           // lo último que se tocó en el gráfico
  torneo: null,        // el formulario del partido de torneo
  error: null,
};

/** El formulario del partido, vacío. */
const torneoEnBlanco = () => ({
  organizador: 'sd',
  organizadorNombre: '',
  nombre: '',
  fecha: hoy(),
  hcpTorneo: '',
  chukkers: 6,
  deLocal: true,
  cancha: 1,
  sede: '',
  golesAFavor: '',
  golesEnContra: '',
});

const claveDe = (e) => e.jornadaId || 'p:' + e.practicaId;
const CHUKKERS_TORNEO = 6;      // y se juegan de a medio: 12 lugares

/* ------------------------------------------------------------- los lugares
   El lugar de un caballo no es "el chukker 3": es "el 3 entero", "el primer
   medio del 3" o "el segundo medio del 3", porque un caballo puede hacer media
   cancha y salir, y ahí entra otro. Se escribe "3", "3a" y "3b", y así viaja
   al servidor. */

/** Los dos medios de un chukker: 3 → ["3a", "3b"]. */
const mediosDe = (chukker) => [chukker + 'a', chukker + 'b'];

const esMedio = (lugar) => /[ab]$/.test(String(lugar));

/** Cuánto pesa ese lugar en la carga del caballo. */
const pesoDeLugar = (lugar) => (esMedio(lugar) ? 0.5 : 1);

/** El chukker al que pertenece un lugar: "3b" → "3". */
const chukkerDe = (lugar) => String(lugar).replace(/[ab]$/, '');

/** Lo que se escribe adentro de la casilla. El lugar ya se llama así. */
const etiquetaLugar = (lugar) => String(lugar);

function nombreDelLugar(lugar) {
  const n = chukkerDe(lugar);
  if (!esMedio(lugar)) return 'Chukker ' + n;
  return 'Chukker ' + n + (String(lugar).endsWith('a') ? ', primer medio' : ', segundo medio');
}

/** ¿Ese chukker está partido, o sea tiene alguna mitad cargada? */
const chukkerPartido = (evento, chukker) =>
  !!(evento.uso[chukker + 'a'] || evento.uso[chukker + 'b']);

/** Cuánto suma en la carga lo cargado en esos lugares. */
const sumaDeLugares = (lugares) => lugares.reduce((a, l) => a + pesoDeLugar(l), 0);

/** 6 en vez de 6,0 — pero 3,5 cuando hay medios. */
function cantidad(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

const esperarUn = (ms) => new Promise((r) => { setTimeout(r, ms); });

/**
 * Trae las jornadas y la caballada.
 *
 * Reintenta una vez sola antes de darse por vencida. Esta consulta sale al
 * abrir la app, junto con otras dos, contra un servidor que en el plan gratis
 * puede estar recién despertándose: cada tanto una se cae por tiempo. Antes,
 * cuando eso pasaba, la solapa Caballos quedaba en "Cargando…" para siempre y
 * había que cerrar la app entera para que volviera a intentar.
 */
async function cargarJornadas() {
  if (caballos.cargando) return;      // dos llamadas juntas traen lo mismo
  caballos.cargando = true;
  for (let intento = 0; intento < 2; intento += 1) {
    try {
      const r = await pedir('/api/jornadas');
      caballos.eventos = r.eventos;
      caballos.caballada = r.caballos;
      caballos.lesiones = r.lesiones || [];
      caballos.extras = r.extras || [];
      caballos.ajenos = r.ajenos || [];
      caballos.grupo = r.grupo || null;
      caballos.invitacion = r.invitacion || null;
      // Sin grupo no hay nada que elegir: la caballada es la propia.
      if (!hayGrupo()) caballos.deQuien = 'mios';
      caballos.error = null;
      if (!caballos.eventos.some((e) => claveDe(e) === caballos.elegido)) {
        // Por defecto, la última donde figura: casi siempre es la que viene a cargar.
        caballos.elegido = caballos.eventos.length ? claveDe(caballos.eventos[0]) : null;
      }
      break;
    } catch (e) {
      caballos.error = e.message;
      if (intento === 0) await esperarUn(1200);
    }
  }
  caballos.cargando = false;
  render();
}

const eventoAbierto = () =>
  (caballos.eventos || []).find((e) => claveDe(e) === caballos.elegido) || null;

/** Cuántos chukkers de esa jornada tienen algo cargado, entero o partido. */
const cargadosDe = (e) => e.misChukkers
  .filter((c) => e.uso[c] || (!e.medios && chukkerPartido(e, c))).length;

/* ------------------------------------------------------- la caballada que se ve

   Con "Mis caballos" son los propios. Con el grupo son los de todos los que
   aceptaron compartir, y los que se llaman igual van en UNA sola tarjeta: es el
   mismo animal anotado dos veces, una por dueño.

   Cada entrada lleva `ids` —los caballos que representa— y `id`, que es con el
   que se carga: el mío si lo hay, porque es el que ya tiene mi historia. */

const hayGrupo = () => !!(caballos.grupo
  && caballos.grupo.miembros.filter((m) => m.estado === 'adentro').length > 1);

/** Los ids que cuentan como este caballo. Uno solo, salvo que esté agrupado. */
const idsDe = (caballo) => caballo.ids || [caballo.id];

const unoSolo = (c) => ({ ...c, ids: [c.id], duenios: c.duenio ? [c.duenio] : [] });

function laCaballada() {
  const vivos = caballos.caballada.filter((c) => c.activo && !c.fuera);

  if (caballos.deQuien !== 'grupo' || !hayGrupo()) {
    return vivos.filter((c) => c.mio !== false).map(unoSolo);
  }

  const porClave = new Map();
  vivos.forEach((c) => {
    const k = c.clave || c.id;
    const ya = porClave.get(k);
    if (!ya) {
      porClave.set(k, { ...unoSolo(c), duenios: c.duenio ? [c.duenio] : [] });
      return;
    }
    ya.ids.push(c.id);
    if (c.duenio && !ya.duenios.includes(c.duenio)) ya.duenios.push(c.duenio);
    // Cargar sobre el mío es lo que deja la historia donde ya estaba.
    if (c.mio) { ya.id = c.id; ya.mio = true; }
    // Un caballo lesionado lo está para los dos: es la misma pata.
    if (c.lesionado) { ya.lesionado = true; ya.lesionado_desde = c.lesionado_desde; }
  });
  return [...porClave.values()];
}

/** El caballo de la lista que ocupa ese lugar, si hay alguno. */
const quienEsta = (evento, lugar, lista) => {
  const id = evento.uso[lugar];
  return id ? lista.find((c) => idsDe(c).includes(id)) : null;
};

/* ------------------------------------------------------------ medio chukker */

const claveMedios = (evento, caballo) => claveDe(evento) + '|' + caballo.id;

/**
 * ¿Este caballo muestra sus chukkers partidos al medio? Porque se tocó el
 * botón, o porque ya tiene medios cargados: si no, al volver a abrir la jornada
 * el medio cargado no tendría dónde verse.
 */
function enMedios(evento, caballo) {
  if (evento.medios) return true;      // el torneo se juega así de entrada
  if (caballos.medios.has(claveMedios(evento, caballo))) return true;
  const ids = idsDe(caballo);
  return evento.misChukkers.some((c) =>
    mediosDe(c).some((m) => ids.includes(evento.uso[m])));
}

/** Los lugares que muestra la tarjeta de un caballo. */
const lugaresDe = (evento, partido) => (evento.medios
  ? evento.misChukkers
  : evento.misChukkers.flatMap((c) => (partido ? mediosDe(c) : [c])));

/**
 * Quién ocupa un lugar. Mirado de a medios, un chukker cargado entero es el
 * mismo caballo en las dos mitades: por eso un caballo puede tener el 1 entero
 * y medio 2 sin que el 1 se le desaparezca de la vista.
 */
const ocupanteDe = (evento, lugar) => evento.uso[lugar]
  || (esMedio(lugar) ? evento.uso[chukkerDe(lugar)] : undefined);

/**
 * Pone un caballo en un lugar. Si el lugar es medio y el chukker estaba
 * entero, lo parte y le deja la otra mitad al que lo tenía; si es entero, se
 * lleva puestas las mitades. Un chukker nunca queda cargado dos veces.
 */
function tomarLugar(evento, lugar, caballoId) {
  const c = chukkerDe(lugar);
  if (!esMedio(lugar)) {
    mediosDe(c).forEach((m) => delete evento.uso[m]);
  } else if (evento.uso[c]) {
    const antes = evento.uso[c];
    delete evento.uso[c];
    mediosDe(c).forEach((m) => { evento.uso[m] = antes; });
  }
  evento.uso[lugar] = caballoId;
}

/** Saca al caballo de ese lugar. Soltar medio de un entero deja la otra mitad. */
function soltarLugar(evento, lugar, ids) {
  const c = chukkerDe(lugar);
  if (esMedio(lugar) && ids.includes(evento.uso[c])) {
    const antes = evento.uso[c];
    delete evento.uso[c];
    evento.uso[mediosDe(c).find((m) => m !== lugar)] = antes;
    return;
  }
  delete evento.uso[lugar];
}

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
 * Dónde se jugó el partido y de cuánto fue, sin nombrar al organizador: en la
 * cabecera eso ya lo dice el sello de color que va al lado.
 */
function dondeYCuanto(e) {
  const donde = e.deLocal === null || e.deLocal === undefined
    ? null
    : (e.deLocal ? 'Cancha ' + (e.cancha || '—') : (e.sede || 'de visitante'));
  return [donde, e.chukkers + ' chukkers' + (e.medios ? ' de a medio' : '')]
    .filter(Boolean).join(' · ');
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
            ? Hoja.fechaCorta(evento.fecha) + ' · ' + dondeYCuanto(evento)
            : evento.detalle + ' · jugaste ' + evento.misChukkers.length
              + ' de los ' + evento.chukkers,
        ]),
      ]),
      // En una práctica el sello es el color del equipo; en un partido de
      // torneo, quién lo organiza —el mismo sello que se ve en la ficha—.
      evento.tipo === 'aap'
        ? selloDeOrganizador(evento.organizador, evento.organizadorNombre)
        : el('span', { class: 'sello ' + evento.color }, [Hoja.LABEL[evento.color]]),
    ].filter(Boolean)));
    raiz.appendChild(el('button', {
      class: 'link', type: 'button',
      onclick: () => { caballos.buscando = true; caballos.filtro = ''; render(); },
    }, ['Cargar otra práctica']));
    // Un día sin práctica no tiene jornada de dónde colgarse, así que tiene su
    // propia puerta: la misma caballada, sin los chukkers del club.
    raiz.appendChild(el('button', {
      class: 'link', type: 'button', style: 'display:block',
      onclick: () => { caballos.sueltos = true; caballos.extra.caballoId = null; render(); },
    }, ['Cargar chukkers sin práctica']));
    return;
  }

  raiz.appendChild(titulo('Qué jornada querés cargar'));

  const buscar = el('input', {
    type: 'text', placeholder: 'Buscar por fecha, cancha o torneo…', value: caballos.filtro,
    oninput: (e) => { caballos.filtro = e.target.value; dibujar(); },
  });
  raiz.appendChild(buscar);

  const lista = el('div', { class: 'lista tabla', style: 'margin-top:10px' });
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

/* ------------------------------------------ los chukkers jugados afuera */

/**
 * Un caballo puede haber jugado el mismo día en otro club, para otro jinete, o
 * en un día en el que ni hubo práctica. Eso no está en ninguna planilla pero sí
 * en las patas del caballo, así que cuenta igual para la carga.
 */

/**
 * Los chukkers de afuera de un caballo, del más nuevo al más viejo. Acepta el
 * id suelto o la tarjeta agrupada: del caballo que los dos anotaron con el
 * mismo nombre cuentan los dos lados.
 */
function extrasDe(caballo) {
  const ids = typeof caballo === 'string' ? [caballo] : idsDe(caballo);
  return (caballos.extras || []).filter((e) => ids.includes(e.caballo_id));
}

/** La casilla, al final de los chukkers de la práctica. */
function casillaExtra(caballo) {
  const abierta = caballos.extra.caballoId === caballo.id;
  const cuantos = extrasDe(caballo).length;
  return el('button', {
    type: 'button', class: 'chuk extra',
    'data-estado': abierta ? 'mio' : cuantos ? 'cargado' : 'libre',
    'aria-pressed': abierta ? 'true' : 'false',
    'aria-label': 'Chukkers de afuera de ' + caballo.nombre,
    onclick: () => {
      if (abierta) {
        caballos.extra.caballoId = null;
      } else {
        // Se abre en blanco y con la fecha de hoy: lo más común es cargar lo
        // de recién.
        Object.assign(caballos.extra, {
          // Uno por defecto: es lo más común y así se guarda sin escribir nada.
          caballoId: caballo.id, fecha: hoy(), jinete: '', chukkers: 1, error: null,
        });
      }
      render();
    },
  }, ['extra' + (cuantos ? ' · ' + cuantos : '')]);
}

/**
 * El botón que parte los chukkers de un caballo al medio.
 *
 * Es de la pantalla, no de los datos: prenderlo solo muestra las dos mitades de
 * cada chukker en lugar del entero. Lo que queda guardado es lo que se marque.
 * Apagarlo con medios cargados los devuelve al chukker entero, que es lo que el
 * jugador quiso decir si se arrepintió.
 */
function botonMedios(evento, caballo, mios) {
  const partido = enMedios(evento, caballo);
  const clave = claveMedios(evento, caballo);
  return el('button', {
    type: 'button', class: 'chuk ancho',
    'data-estado': partido ? 'mio' : 'libre',
    'aria-pressed': partido ? 'true' : 'false',
    title: partido
      ? 'Volver a los chukkers enteros'
      : 'Partir los chukkers al medio para ' + caballo.nombre,
    onclick: () => {
      const ids = idsDe(caballo);
      if (!partido) {
        caballos.medios.add(clave);
        // Lo que ya tenía entero pasa a sus dos mitades: el caballo hizo el
        // chukker completo y eso, partido, se dice con los dos medios. Si no,
        // el chukker quedaría cargado abajo y sin dónde verse.
        evento.misChukkers.forEach((c) => {
          if (!ids.includes(evento.uso[c])) return;
          delete evento.uso[c];
          mediosDe(c).forEach((m) => { evento.uso[m] = caballo.id; });
        });
        guardarPronto();
        return render();
      }
      caballos.medios.delete(clave);
      // Los medios que tenía cargados vuelven al chukker entero: si hacía 2a,
      // ahora hace el 2. Salvo que el otro medio lo tenga otro caballo: ahí no
      // hay nada que juntar —el chukker se jugó partido de verdad— y se deja
      // como está en vez de borrarle a alguien su medio.
      let sigueAbierto = false;
      evento.misChukkers.forEach((c) => {
        const mitades = mediosDe(c).filter((m) => ids.includes(evento.uso[m]));
        if (!mitades.length) return;
        if (mediosDe(c).some((m) => evento.uso[m] && !ids.includes(evento.uso[m]))) {
          sigueAbierto = true;
          return;
        }
        mitades.forEach((m) => delete evento.uso[m]);
        evento.uso[c] = caballo.id;
      });
      if (sigueAbierto) caballos.medios.add(clave);
      guardarPronto();
      render();
    },
  }, ['½ chk']);
}

/** El formulario, más lo que ya se cargó de ese caballo. */
function panelExtra(caballo) {
  const x = caballos.extra;
  const campo = (etiqueta, control) =>
    el('label', { class: 'campo' }, [el('span', {}, [etiqueta]), control]);

  const guardar = async (boton) => {
    x.error = null;
    boton.disabled = true;
    const original = boton.textContent;
    boton.textContent = 'Un segundo…';
    try {
      await pedir('/api/caballos', {
        method: 'POST',
        body: JSON.stringify({
          que: 'extra',
          caballo_id: caballo.id,
          fecha: x.fecha,
          jinete: x.jinete,
          chukkers: String(x.chukkers).replace(',', '.'),
        }),
      });
      await cargarJornadas();
      // Se deja abierto: cargar dos días seguidos del mismo caballo es lo
      // normal cuando uno se acuerda de golpe de toda la semana.
      Object.assign(x, { jinete: '', chukkers: 1, error: null });
    } catch (e) {
      x.error = e.message;
    }
    boton.disabled = false;
    boton.textContent = original;
    render();
  };

  const cargados = extrasDe(caballo);

  return el('div', { class: 'extra-panel' }, [
    el('p', { class: 'pista', style: 'margin:0 0 10px' }, [
      'Chukkers que jugó fuera de la práctica: en otro club, en un partido de otro, '
      + 'o prestado a otro jinete.',
    ]),
    campo('Fecha', el('input', {
      type: 'date', value: x.fecha,
      onchange: (e) => { x.fecha = e.target.value; },
    })),
    el('div', { class: 'grilla-2' }, [
      campo('Quién lo montó', el('input', {
        type: 'text', value: x.jinete, maxlength: 60, placeholder: 'Opcional',
        oninput: (e) => { x.jinete = e.target.value; },
      })),
      campo('Chukkers', el('input', {
        type: 'number', value: x.chukkers, min: 0.5, max: 12, step: 0.5,
        inputmode: 'decimal', placeholder: '2',
        oninput: (e) => { x.chukkers = e.target.value; },
      })),
    ]),
    x.error ? aviso('mal', x.error) : null,
    el('div', { class: 'acciones' }, [
      el('button', {
        class: 'primary', type: 'button',
        onclick: (e) => guardar(e.target),
      }, ['Sumar los chukkers']),
    ]),
    // Lo ya cargado va acá abajo: es donde uno lo busca cuando se equivocó.
    cargados.length
      ? el('div', { class: 'extras-lista' }, [
        el('p', { class: 'apartado', style: 'margin:14px 0 6px' }, ['Ya cargados']),
        ...cargados.map((e) => unExtra(e, caballo)),
      ])
      : null,
  ].filter(Boolean));
}

/** Un renglón de lo ya cargado, con su cruz para sacarlo. */
function unExtra(e, caballo) {
  return el('div', { class: 'extra-fila' }, [
    el('b', {}, [Hoja.fechaCorta(e.fecha)]),
    el('span', {}, [cantidad(e.chukkers) + (e.chukkers === 1 ? ' chukker' : ' chukkers')]),
    e.jinete ? el('em', {}, [e.jinete]) : null,
    el('button', {
      class: 'sacar', type: 'button',
      'aria-label': 'Borrar los chukkers del ' + Hoja.fechaCorta(e.fecha),
      onclick: async (ev) => {
        if (!window.confirm('¿Borrar los ' + cantidad(e.chukkers) + ' chukkers de '
          + caballo.nombre + ' del ' + Hoja.fechaCorta(e.fecha).toLowerCase() + '?')) return;
        ev.target.disabled = true;
        try {
          await pedir('/api/caballos?extra=' + encodeURIComponent(e.id), { method: 'DELETE' });
          await cargarJornadas();
        } catch (err) {
          caballos.extra.error = err.message;
          render();
        }
      },
    }, ['×']),
  ].filter(Boolean));
}

/**
 * Cargar chukkers de un día en el que no hubo práctica.
 *
 * Es la misma caballada de siempre, sin los chukkers del club: cada caballo con
 * su casilla extra nomás. Así no hay una pantalla nueva que aprender.
 */
function panelSueltos() {
  const caja = el('div', {});
  caja.appendChild(el('button', {
    class: 'link', type: 'button',
    onclick: () => { caballos.sueltos = false; caballos.extra.caballoId = null; render(); },
  }, ['← Volver a la práctica']));
  caja.appendChild(titulo('Chukkers sin práctica'));
  caja.appendChild(el('p', { class: 'pista', style: 'margin-bottom:14px' }, [
    'Para los días en que el caballo jugó y vos no: otro club, otro jinete, un partido '
    + 'al que lo prestaste. Tocá la casilla del caballo y poné la fecha.',
  ]));

  if (hayGrupo()) caja.appendChild(interruptorDeCaballada());

  const activos = laCaballada();
  if (!activos.length) {
    caja.appendChild(el('div', { class: 'vacio' }, ['Todavía no cargaste ningún caballo.']));
    return caja;
  }

  const lista = el('div', { class: 'lista' });
  activos.forEach((caballo) => {
    const cuantos = extrasDe(caballo).length;
    const tarjeta = el('div', {
      class: 'caballo' + (cuantos ? ' usado' : '') + (caballo.lesionado ? ' lesionado' : ''),
    }, [
      el('div', { class: 'cab-head' }, [
        caballo.lesionado ? icono('cruz', 13, 'cruz') : null,
        el('b', {}, [caballo.nombre]),
        cuantos
          ? el('i', {}, [cantidad(extrasDe(caballo).reduce((a, e) => a + e.chukkers, 0))
            + ' chukkers afuera'])
          : null,
      ].filter(Boolean)),
      el('div', { class: 'chuks' }, [casillaExtra(caballo)]),
    ]);
    if (caballos.extra.caballoId === caballo.id) tarjeta.appendChild(panelExtra(caballo));
    lista.appendChild(tarjeta);
  });
  caja.appendChild(lista);
  return caja;
}

/* --------------------------------------------------------------- la carga */

function panelCargar(raiz) {
  // La pantalla del grupo se lleva la pantalla entera: es una decisión aparte,
  // no algo que se toque mientras se cargan caballos.
  if (caballos.armandoGrupo) {
    pantallaDelGrupo(raiz);
    return;
  }

  // Lo primero, si hay: contestar la invitación. Cambia de qué caballada está
  // hablando todo lo que viene abajo.
  if (caballos.invitacion) raiz.appendChild(carteldeInvitacion());

  // Con el formulario del partido abierto no se muestra nada más: es una carga
  // aparte y si queda colgada abajo de la caballada hay que bajar media
  // pantalla para llegar.
  if (caballos.altaTorneo) {
    raiz.appendChild(altaDeTorneo());
    return;
  }

  if (caballos.sueltos) {
    raiz.appendChild(panelSueltos());
    return;
  }

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
  raiz.appendChild(el('h2', {}, [hayGrupo() ? 'Caballada' : 'Mi caballada']));
  if (hayGrupo()) raiz.appendChild(interruptorDeCaballada());

  // El botón de repetir aparece solo con la jornada en blanco: si ya cargaste
  // algo, pisarlo sin avisar sería peor que no tenerlo.
  const anterior = cargadosDe(evento) ? null : laVezAnterior(evento);
  if (anterior) {
    raiz.appendChild(el('button', {
      class: 'ghost', type: 'button', style: 'margin-bottom:10px',
      onclick: () => repetirLaVezAnterior(evento, anterior),
    }, [icono('repetir', 16), 'Repetir los caballos del ' + Hoja.fechaCorta(anterior.fecha).toLowerCase()]));
  }

  const lista = laCaballada();

  // En orden de cancha: el del primer chukker arriba de todo, y así. Los que
  // hoy no salen quedan abajo, por nombre. Es el orden en el que uno los
  // repasa antes de montar, y el mismo que sale en el texto de WhatsApp.
  const todosLosLugares = evento.misChukkers.flatMap((c) =>
    (evento.medios ? [c] : [c, ...mediosDe(c)]));
  const primerLugar = (caballo) => {
    const ids = idsDe(caballo);
    const i = todosLosLugares.findIndex((l) => ids.includes(evento.uso[l]));
    return i === -1 ? Infinity : i;
  };
  const activos = lista.slice().sort((a, b) =>
    (primerLugar(a) - primerLugar(b)) || a.nombre.localeCompare(b.nombre, 'es'));
  const caja = el('div', { class: 'lista' });

  activos.forEach((caballo) => {
    const ids = idsDe(caballo);
    const partido = enMedios(evento, caballo);
    const mios = lugaresDe(evento, partido)
      .filter((l) => ids.includes(ocupanteDe(evento, l)));
    const cuanto = sumaDeLugares(mios);

    const pastillas = el('div', { class: 'chuks' }, lugaresDe(evento, partido).map((l) => {
      const de = ocupanteDe(evento, l);
      // Mirado entero, un chukker al que ya le tomaron UN medio se ve a medio
      // pintar: dice que está ocupado sin mentir que lo está entero. Si le
      // tomaron los dos, está ocupado y punto.
      const tomadas = partido || evento.medios || de
        ? 0 : mediosDe(l).filter((m) => evento.uso[m]).length;
      return el('button', {
        type: 'button',
        class: 'chuk' + (partido || evento.medios ? ' medio' : '') + (tomadas === 1 ? ' a-medias' : ''),
        'data-estado': ids.includes(de) ? 'mio' : (de || tomadas === 2) ? 'otro' : 'libre',
        'aria-label': nombreDelLugar(l) + ' con ' + caballo.nombre,
        onclick: () => {
          // Tocar un chukker que ya está partido no puede tomarlo entero: eso
          // serían 1,5 chukkers donde se jugó 1. Se prende el medio solo y se
          // toma la mitad libre; si no quedó ninguna, la primera.
          if (tomadas) {
            caballos.medios.add(claveMedios(evento, caballo));
            tomarLugar(evento, mediosDe(l).find((m) => !evento.uso[m]) || mediosDe(l)[0], caballo.id);
          } else if (ids.includes(de)) {
            soltarLugar(evento, l, ids);
          } else {
            // Un lugar, un caballo: ponerlo acá se lo saca al otro.
            tomarLugar(evento, l, caballo.id);
          }
          guardarPronto();
          render();
        },
      }, [etiquetaLugar(l)]);
    }));

    // La casilla de los chukkers de afuera, al final y separada por una raya:
    // no es un lugar más de la práctica, es otra cosa. Y al lado, el botón que
    // parte los chukkers al medio para este caballo.
    pastillas.appendChild(el('span', { class: 'sep-chuk' }));
    if (!evento.medios) pastillas.appendChild(botonMedios(evento, caballo, mios));
    pastillas.appendChild(casillaExtra(caballo));

    const tarjeta = el('div', {
      class: 'caballo' + (mios.length ? ' usado' : '') + (caballo.lesionado ? ' lesionado' : ''),
    }, [
      el('div', { class: 'cab-head' }, [
        caballo.lesionado ? icono('cruz', 13, 'cruz') : null,
        el('b', {}, [
          caballo.nombre,
          caballo.duenios.length && hayGrupo() && caballos.deQuien === 'grupo'
            ? el('u', {}, [enTexto(caballo.duenios)])
            : null,
        ].filter(Boolean)),
        mios.length
          ? el('i', {}, [cantidad(cuanto) + (cuanto === 1 ? ' chukker' : ' chukkers')])
          : null,
        caballo.mio ? el('button', {
          class: 'sacar', type: 'button', 'aria-label': 'Sacar ' + caballo.nombre + ' de mi caballada',
          onclick: () => sacarCaballo(caballo),
        }, ['×']) : null,
      ].filter(Boolean)),
      // El interruptor con su palabra al lado: se aprieta cuando se lesiona y
      // se destilda cuando se recupera. Una cruz sola no decía eso.
      el('div', { class: 'fila-lesion' }, [
        caballo.lesionado
          ? el('span', { class: 'lesion' }, [
            'Lesionado' + (caballo.lesionado_desde
              ? ' desde el ' + Hoja.fechaCorta(caballo.lesionado_desde).toLowerCase()
              : ''),
          ])
          : el('span', { style: 'flex:1' }),
        el('button', {
          class: 'marcar' + (caballo.lesionado ? ' activa' : ''), type: 'button',
          role: 'switch', 'aria-checked': caballo.lesionado ? 'true' : 'false',
          'aria-label': 'Lesionado: ' + caballo.nombre,
          onclick: () => marcarLesion(caballo, !caballo.lesionado),
        }, [el('span', {}, ['Lesionado']), el('span', { class: 'palanca' })]),
      ]),
      pastillas,
    ]);

    if (mios.length) {
      const punt = el('select', { 'aria-label': 'Cómo anduvo ' + caballo.nombre });
      punt.appendChild(el('option', { value: '' }, ['—']));
      const puesto = ids.map((id) => evento.puntajes[id]).find((p) => p);
      for (let n = 10; n >= 1; n--) {
        const op = el('option', { value: String(n) }, [String(n)]);
        if (String(puesto) === String(n)) op.selected = true;
        punt.appendChild(op);
      }
      punt.addEventListener('change', (e) => {
        // El puntaje va contra el mismo caballo con el que se cargó el chukker.
        const sobre = evento.uso[mios[0]] || caballo.id;
        ids.forEach((id) => delete evento.puntajes[id]);
        if (e.target.value) evento.puntajes[sobre] = Number(e.target.value);
        guardarPronto();
        render();
      });
      tarjeta.appendChild(el('div', { class: 'puntaje' }, [
        el('span', {}, ['Cómo anduvo hoy']), punt,
      ]));
    }

    // El panel de los chukkers de afuera, con lo que ya se cargó de ese caballo.
    if (caballos.extra.caballoId === caballo.id) tarjeta.appendChild(panelExtra(caballo));

    caja.appendChild(tarjeta);
  });

  if (!activos.length) {
    caja.appendChild(el('div', { class: 'vacio' }, ['Todavía no cargaste ningún caballo.']));
  }
  raiz.appendChild(caja);

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
  // Falta un chukker cuando no tiene nada: ni entero ni ninguna de sus dos
  // mitades. Uno a medio llenar se avisa aparte, porque no es lo mismo.
  const faltan = evento.misChukkers.filter((c) =>
    !evento.uso[c] && !chukkerPartido(evento, c));
  const aMedias = evento.medios ? [] : evento.misChukkers.filter((c) =>
    !evento.uso[c] && mediosDe(c).filter((m) => evento.uso[m]).length === 1);

  raiz.appendChild(el('p', {
    class: 'pista', style: 'text-align:center;color:' + (faltan.length ? 'var(--gold)' : 'var(--teal)'),
  }, [
    faltan.length
      ? 'Te faltan ' + (evento.medios ? 'los medios ' : 'los chukkers ') + enTexto(faltan)
      : 'Tenés los ' + evento.misChukkers.length + ' lugares cargados',
  ]));
  if (aMedias.length) {
    raiz.appendChild(el('p', { class: 'pista', style: 'text-align:center' }, [
      (aMedias.length === 1 ? 'El chukker ' : 'Los chukkers ') + enTexto(aMedias)
      + (aMedias.length === 1 ? ' está' : ' están') + ' a medio cargar.',
    ]));
  }

  raiz.appendChild(el('div', { class: 'acciones' }, [
    el('button', {
      class: 'primary', type: 'button',
      onclick: (e) => compartirTexto(textoDeCaballos(evento), e.currentTarget),
    }, [icono('compartir', 16), 'Compartir por WhatsApp']),
  ]));

  raiz.appendChild(altaDeTorneo());

  // La puerta del grupo, abajo de todo: se toca una vez y no se vuelve.
  raiz.appendChild(el('div', { style: 'text-align:center' }, [
    el('button', {
      class: 'link', type: 'button', onclick: abrirGrupo,
    }, [caballos.grupo ? 'El grupo ' + caballos.grupo.nombre : 'Armar el grupo de caballada']),
  ]));
}

/**
 * Mis caballos o los de todo el grupo. El mismo interruptor sirve para cargar
 * y para las estadísticas: es la misma pregunta —de quién es esta caballada—.
 */
function interruptorDeCaballada() {
  const mios = caballos.caballada.filter((c) => c.activo && c.mio !== false).length;
  const todos = laCaballadaEntera().length;
  const boton = (clave, texto, cuantos) => el('button', {
    type: 'button', class: 'chip grande', 'aria-pressed': caballos.deQuien === clave,
    onclick: () => { caballos.deQuien = clave; render(); },
  }, [texto, el('em', {}, [String(cuantos)])]);

  return el('div', { class: 'chips dos', style: 'margin-bottom:10px' }, [
    boton('mios', 'Mis caballos', mios),
    boton('grupo', 'Caballos de ' + caballos.grupo.nombre, todos),
  ]);
}

/** Cuántas tarjetas hay con el grupo puesto, ya unificadas por nombre. */
function laCaballadaEntera() {
  const antes = caballos.deQuien;
  caballos.deQuien = 'grupo';
  const lista = laCaballada();
  caballos.deQuien = antes;
  return lista;
}

/**
 * La vez anterior con caballos cargados: la más reciente de las que quedaron
 * antes de la que está abierta. Casi siempre es la práctica pasada, pero puede
 * ser un torneo, y si estás cargando una vieja mira lo que había antes de esa.
 */
function laVezAnterior(evento) {
  return (caballos.eventos || [])
    .filter((e) => claveDe(e) !== claveDe(evento)
      && e.fecha < evento.fecha
      && e.misChukkers.some((c) => e.uso[c]))
    .sort((a, b) => (a.fecha < b.fecha ? 1 : (a.fecha > b.fecha ? -1 : 0)))[0] || null;
}

/**
 * Copia aquella carga sobre esta, lugar por lugar y en el mismo orden: lo que
 * estaba en el primer chukker va al primero de hoy. Los dos días no tienen por
 * qué tener la misma cantidad de lugares —una práctica de 8 y una de 12 no se
 * parecen—, así que lo que sobra se ignora y lo que falta queda vacío.
 *
 * El caballo lesionado o dado de baja no se copia: el botón está para ahorrar
 * toques, no para cargar algo que hoy no puede salir. Ese lugar queda libre y
 * el cartel de abajo lo canta.
 */
function repetirLaVezAnterior(evento, antes) {
  if (!antes) return;
  const puedeSalir = (id) => {
    const c = caballos.caballada.find((x) => x.id === id);
    return !!c && c.activo && !c.lesionado && !c.fuera;
  };
  evento.misChukkers.forEach((lugar, i) => {
    const deAntes = antes.misChukkers[i];
    if (deAntes === undefined) return;

    // El caso normal: aquel chukker lo hizo un caballo entero.
    if (antes.uso[deAntes]) {
      if (puedeSalir(antes.uso[deAntes])) evento.uso[lugar] = antes.uso[deAntes];
      return;
    }
    // Aquel día se partió al medio. Se copian las dos mitades, salvo que el
    // lugar de hoy ya sea una mitad —un partido de torneo— y no se pueda.
    if (esMedio(lugar)) return;
    mediosDe(deAntes).forEach((m, k) => {
      const id = antes.uso[m];
      if (id && puedeSalir(id)) evento.uso[mediosDe(lugar)[k]] = id;
    });
  });
  guardarPronto();
  render();
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

/* ==========================================================================
   El grupo de caballada.

   Dos jugadores que se prestan los caballos todo el tiempo terminan con la
   carga de cada animal partida en dos cuadernos. El grupo la junta: los
   caballos de todos los que están adentro se usan como propios y los que se
   llaman igual se muestran como uno.

   Nadie entra porque otro lo marque. Se invita, y el invitado acepta desde su
   app: es lo que hace que esto no sea una forma de mirarle la caballada al
   vecino.
   ========================================================================== */

async function accionDeGrupo(cuerpo) {
  const r = await pedir('/api/caballada', { method: 'POST', body: JSON.stringify(cuerpo) });
  caballos.grupo = r.grupo || null;
  caballos.invitacion = r.invitacion || null;
  caballos.plantelGrupo = r.plantel || [];
  caballos.grupoError = null;
  // Cambió quién comparte: la caballada y lo cargado son otros.
  await cargarJornadas();
}

async function abrirGrupo() {
  caballos.armandoGrupo = true;
  caballos.grupoError = null;
  try {
    const r = await pedir('/api/caballada');
    caballos.grupo = r.grupo || null;
    caballos.invitacion = r.invitacion || null;
    caballos.plantelGrupo = r.plantel || [];
  } catch (e) {
    caballos.grupoError = e.message;
  }
  render();
}

/** El cartel que ve el invitado. Va arriba de todo: es lo primero que contesta. */
function carteldeInvitacion() {
  const inv = caballos.invitacion;
  return el('div', { class: 'invita' }, [
    el('b', {}, [inv.de + ' te invitó a ' + inv.nombre]),
    el('p', {}, [
      'Si aceptás comparten la caballada: cada uno puede cargarle chukkers a los '
      + 'caballos del otro, y en las estadísticas cada caballo suma lo que jugó de los '
      + 'dos lados. Te podés salir cuando quieras.',
    ]),
    caballos.grupoError ? aviso('mal', caballos.grupoError) : null,
    el('div', { class: 'dos-botones' }, [
      el('button', {
        class: 'primary', type: 'button',
        onclick: (e) => conBoton(e.target, () => accionDeGrupo({ accion: 'aceptar' }), caballos),
      }, ['Acepto']),
      el('button', {
        class: 'ghost', type: 'button',
        onclick: (e) => conBoton(e.target, () => accionDeGrupo({ accion: 'rechazar' }), caballos),
      }, ['Ahora no']),
    ]),
  ].filter(Boolean));
}

function pantallaDelGrupo(raiz) {
  raiz.appendChild(el('button', {
    class: 'link', type: 'button',
    onclick: () => { caballos.armandoGrupo = false; caballos.nuevoGrupo = null; render(); },
  }, ['← Volver a la carga']));

  raiz.appendChild(titulo('El grupo de caballada'));
  raiz.appendChild(el('p', { class: 'pista', style: 'margin-top:0' }, [
    'Los caballos de los que estén adentro se usan como si fueran tuyos: para cargar '
    + 'chukkers y para las estadísticas.',
  ]));

  if (caballos.grupoError) raiz.appendChild(aviso('mal', caballos.grupoError));

  if (caballos.grupo) raiz.appendChild(panelGrupoArmado());
  else raiz.appendChild(panelGrupoNuevo());
}

/** Armar uno: el nombre y a quiénes invitar. */
function panelGrupoNuevo() {
  if (!caballos.nuevoGrupo) caballos.nuevoGrupo = { nombre: '', invitados: [] };
  const n = caballos.nuevoGrupo;
  const caja = el('div');

  caja.appendChild(el('label', { class: 'campo', style: 'margin-top:16px' }, [
    el('span', {}, ['Cómo se llama']),
    el('input', {
      type: 'text', value: n.nombre, maxlength: 40, placeholder: 'La O',
      oninput: (e) => { n.nombre = e.target.value; },
    }),
  ]));

  caja.appendChild(el('h2', {}, ['A quién invitás']));
  caja.appendChild(listaDelPlantel((j) => {
    const puesto = n.invitados.includes(j.id);
    return {
      puesto,
      alTocar: () => {
        n.invitados = puesto ? n.invitados.filter((x) => x !== j.id) : n.invitados.concat(j.id);
        render();
      },
    };
  }));

  caja.appendChild(el('p', { class: 'pista' }, [
    n.invitados.length
      ? 'Les va a aparecer un cartel en su app. Hasta que acepten, sus caballos no te '
        + 'aparecen y los tuyos no les aparecen a ellos.'
      : 'Marcá con quién compartís los caballos.',
  ]));

  caja.appendChild(el('div', { class: 'acciones' }, [
    el('button', {
      class: 'primary', type: 'button',
      disabled: n.nombre.trim().length < 2 || !n.invitados.length,
      onclick: (e) => conBoton(e.target, async () => {
        await accionDeGrupo({ accion: 'crear', nombre: n.nombre, invitados: n.invitados });
        caballos.nuevoGrupo = null;
      }, caballos),
    }, ['Mandar la invitación']),
  ]));
  return caja;
}

/** El que ya existe: quiénes están, quiénes faltan contestar, y la salida. */
function panelGrupoArmado() {
  const g = caballos.grupo;
  const caja = el('div');
  const esperando = g.miembros.filter((m) => m.estado === 'invitado');

  caja.appendChild(el('label', { class: 'campo', style: 'margin-top:16px' }, [
    el('span', {}, ['Cómo se llama']),
    g.soyElDuenio
      ? el('input', {
        type: 'text', value: g.nombre, maxlength: 40,
        onchange: (e) => conBoton(e.target, () =>
          accionDeGrupo({ accion: 'renombrar', nombre: e.target.value }), caballos),
      })
      : el('div', { class: 'falso-campo' }, [g.nombre]),
  ]));

  caja.appendChild(el('h2', {}, ['Quiénes lo comparten']));
  caja.appendChild(el('div', { class: 'lista tabla' }, g.miembros.map((m) => {
    const yo = m.jugadorId === estado.jugador.id;
    return el('div', { class: 'quien estatico compacto' }, [
      el('span', { class: 'casilla' + (m.estado === 'adentro' ? ' puesta' : ' esperando') },
        m.estado === 'adentro' ? [icono('listo', 13)] : []),
      el('span', { style: 'flex:1;min-width:0' }, [
        el('b', {}, [m.apodo]),
        el('span', {}, [(yo ? 'vos · ' : '') + m.caballos
          + (m.caballos === 1 ? ' caballo' : ' caballos')]),
      ]),
      el('span', { class: 'marca' + (m.estado === 'adentro' ? ' listo' : '') },
        [m.estado === 'adentro' ? 'ADENTRO' : 'INVITADO']),
      g.soyElDuenio && !yo
        ? el('button', {
          class: 'sacar', type: 'button', 'aria-label': 'Sacar a ' + m.apodo,
          onclick: (e) => conBoton(e.target, () =>
            accionDeGrupo({ accion: 'sacar', jugadorId: m.jugadorId }), caballos),
        }, ['×'])
        : null,
    ].filter(Boolean));
  })));

  if (esperando.length) {
    raizAviso(caja, esperando);
  }

  /* ---- sumar a alguien más */
  if (g.soyElDuenio && (caballos.plantelGrupo || []).length) {
    caja.appendChild(el('h2', {}, ['Sumar a alguien']));
    caja.appendChild(listaDelPlantel((j) => ({
      puesto: false,
      alTocar: (e) => conBoton(e.currentTarget, () =>
        accionDeGrupo({ accion: 'invitar', jugadorId: j.id }), caballos),
    })));
  }

  caja.appendChild(el('div', { style: 'text-align:center;margin-top:14px' }, [
    el('button', {
      class: 'link rojo', type: 'button',
      onclick: (e) => conBoton(e.target, () => accionDeGrupo({ accion: 'salir' }), caballos),
    }, [g.soyElDuenio ? 'Deshacer ' + g.nombre : 'Salirme de ' + g.nombre]),
  ]));
  caja.appendChild(el('p', { class: 'pista', style: 'text-align:center' }, [
    g.soyElDuenio
      ? 'El grupo se termina para todos. Los chukkers ya cargados quedan donde están.'
      : 'Tus caballos dejan de verse en el acto. Los chukkers ya cargados quedan donde están.',
  ]));

  return caja;
}

/**
 * El plantel para elegir a quién invitar, con buscador: son treinta y cinco
 * nombres y sin buscador la pantalla se vuelve un rollo.
 */
function listaDelPlantel(comoEs) {
  const caja = el('div');
  caja.appendChild(el('input', {
    type: 'text', placeholder: 'Buscar en el plantel…', value: caballos.filtroGrupo || '',
    'aria-label': 'Buscar en el plantel',
    oninput: (e) => { caballos.filtroGrupo = e.target.value; dibujar(); },
  }));
  const lista = el('div', { class: 'lista tabla', style: 'margin-top:8px' });
  caja.appendChild(lista);

  function dibujar() {
    vaciar(lista);
    const texto = (caballos.filtroGrupo || '').trim().toLowerCase();
    const visibles = (caballos.plantelGrupo || []).filter((j) => !texto
      || j.apodo.toLowerCase().includes(texto)
      || j.nombre.toLowerCase().includes(texto));

    if (!visibles.length) {
      lista.appendChild(el('div', { class: 'vacio' }, ['No hay nadie que coincida.']));
      return;
    }
    visibles.slice(0, 40).forEach((j) => {
      const { puesto, alTocar } = comoEs(j);
      lista.appendChild(el('button', {
        type: 'button', class: 'quien compacto' + (puesto ? ' puesto' : ''),
        onclick: alTocar,
      }, [
        el('span', { class: 'casilla' + (puesto ? ' puesta' : '') },
          puesto ? [icono('listo', 13)] : []),
        el('span', { style: 'flex:1;min-width:0' }, [
          el('b', {}, [j.apodo]),
          el('span', {}, [j.nombre + ' · ' + j.caballos
            + (j.caballos === 1 ? ' caballo' : ' caballos')]),
        ]),
      ]));
    });
  }
  dibujar();
  return caja;
}

/** El aviso de los que todavía no contestaron. */
function raizAviso(caja, esperando) {
  const quienes = esperando.map((m) => m.apodo);
  const cuantos = esperando.reduce((a, m) => a + m.caballos, 0);
  caja.appendChild(aviso('nota', esperando.length === 1
    ? quienes[0] + ' todavía no contestó. Si acepta, sus ' + cuantos
      + ' caballos se suman solos. El grupo anda igual con los que ya están.'
    : enTexto(quienes) + ' todavía no contestaron. El grupo anda igual con los que ya están.'));
}

/* --------------------------------------------------------- partidos de AAP */

/* Los tres organizadores posibles y cómo se ven. El sello de color viaja a la
   ficha del jugador: azul la AAP, verde el club, naranja cualquier otro. */
const ORGANIZADORES = [
  ['sd', 'San Diego'],
  ['aap', 'AAP'],
  ['otro', 'Otro'],
];

/**
 * Un partido de torneo. El club no sabe nada de estos partidos —los juega cada
 * uno por su cuenta—, así que se pregunta todo: quién lo organiza, cómo se
 * llama, de cuánto es, dónde se jugó y cómo salió.
 */
function altaDeTorneo() {
  if (!caballos.altaTorneo) {
    return el('div', { style: 'margin-top:22px' }, [
      el('button', {
        class: 'ghost', type: 'button',
        onclick: () => {
          caballos.altaTorneo = true;
          if (!caballos.torneo) caballos.torneo = torneoEnBlanco();
          render();
        },
      }, ['Sumar un partido de torneo']),
    ]);
  }

  const t = caballos.torneo;
  const corrigiendo = !!t.id;
  const campo = (etiqueta, control) =>
    el('label', { class: 'campo' }, [el('span', {}, [etiqueta]), control]);

  return el('div', { class: 'card p', style: 'margin-top:14px' }, [
    el('h2', { style: 'margin:0 0 12px' },
      [corrigiendo ? 'Corregir el partido' : 'Un partido de torneo']),

    campo('Quién lo organiza', el('div', { class: 'chips tres' }, ORGANIZADORES.map(([clave, texto]) =>
      el('button', {
        type: 'button', class: 'chip', 'aria-pressed': t.organizador === clave,
        onclick: () => { t.organizador = clave; render(); },
      }, [texto])))),

    t.organizador === 'otro'
      ? campo('Nombre del organizador', el('input', {
        type: 'text', value: t.organizadorNombre, placeholder: 'Ej.: Club Hípico Argentino',
        oninput: (e) => { t.organizadorNombre = e.target.value; },
      }))
      : null,

    campo('Nombre del torneo', el('input', {
      type: 'text', value: t.nombre, placeholder: 'Copa Ciudad de Buenos Aires',
      oninput: (e) => { t.nombre = e.target.value; },
    })),

    el('div', { class: 'grilla-2' }, [
      campo('Fecha', el('input', {
        type: 'date', value: t.fecha,
        onchange: (e) => { t.fecha = e.target.value; },
      })),
      campo('HCP del torneo', el('input', {
        type: 'number', value: t.hcpTorneo, min: 0, max: 40, step: 1, placeholder: '0 a 40',
        oninput: (e) => { t.hcpTorneo = e.target.value; },
      })),
    ]),

    campo('Chukkers', el('div', { class: 'chips' }, [4, 5, 6, 7, 8].map((n) =>
      el('button', {
        type: 'button', class: 'chip', 'aria-pressed': t.chukkers === n,
        onclick: () => { t.chukkers = n; render(); },
      }, [String(n)])))),

    campo('Dónde se jugó', el('div', { class: 'chips' }, [[true, 'De local'], [false, 'De visitante']].map(([valor, texto]) =>
      el('button', {
        type: 'button', class: 'chip', 'aria-pressed': t.deLocal === valor,
        onclick: () => { t.deLocal = valor; render(); },
      }, [texto])))),

    t.deLocal
      ? campo('Cancha', el('div', { class: 'chips tres' }, [1, 2, 3, 4, 5, 6].map((n) =>
        el('button', {
          type: 'button', class: 'chip', 'aria-pressed': t.cancha === n,
          onclick: () => { t.cancha = n; render(); },
        }, [String(n)]))))
      : campo('En qué cancha', el('input', {
        type: 'text', value: t.sede, placeholder: 'Ej.: Ellerstina, cancha 2',
        oninput: (e) => { t.sede = e.target.value; },
      })),

    campo('Resultado', el('div', { class: 'marcador-alta' }, [
      el('span', {}, ['Nosotros']),
      el('input', {
        type: 'number', value: t.golesAFavor, min: 0, max: 99, inputmode: 'numeric',
        'aria-label': 'Goles a favor',
        oninput: (e) => { t.golesAFavor = e.target.value; },
      }),
      el('i', { class: 'guion' }, ['–']),
      el('input', {
        type: 'number', value: t.golesEnContra, min: 0, max: 99, inputmode: 'numeric',
        'aria-label': 'Goles en contra',
        oninput: (e) => { t.golesEnContra = e.target.value; },
      }),
      el('span', {}, ['Ellos']),
    ])),

    el('p', { class: 'pista' }, [
      'Se juega de a medio chukker: van a quedar ' + t.chukkers * 2 + ' lugares para cargar. '
      + 'El resultado se puede dejar en blanco y cargarlo después.',
    ]),

    el('div', { class: 'acciones' }, [
      el('button', {
        class: 'primary', type: 'button',
        onclick: (e) => conBoton(e.target, async () => {
          const r = await pedir('/api/jornadas', {
            method: 'POST',
            body: JSON.stringify({
              id: t.id || undefined,
              nombre: t.nombre,
              fecha: t.fecha,
              chukkers: t.chukkers,
              organizador: t.organizador,
              organizadorNombre: t.organizadorNombre,
              hcpTorneo: t.hcpTorneo,
              deLocal: t.deLocal,
              cancha: t.cancha,
              sede: t.sede,
              golesAFavor: t.golesAFavor,
              golesEnContra: t.golesEnContra,
              medios: true,
            }),
          });
          caballos.altaTorneo = false;
          caballos.torneo = torneoEnBlanco();
          await cargarJornadas();
          caballos.elegido = r.jornada.id;   // se abre en el partido que se acaba de tocar
          refrescarFicha();
        }, caballos),
      }, [corrigiendo ? 'Guardar los cambios' : 'Guardar el partido']),
      el('button', {
        class: 'link', type: 'button',
        onclick: () => {
          caballos.altaTorneo = false;
          caballos.torneo = torneoEnBlanco();
          render();
        },
      }, ['Cancelar']),
    ]),

    // Borrar es la salida para el partido cargado dos veces o mal del todo.
    corrigiendo
      ? el('div', { style: 'text-align:center;margin-top:4px' }, [
        el('button', {
          class: 'link rojo', type: 'button',
          onclick: (e) => conBoton(e.target, async () => {
            if (!window.confirm('¿Borrar este partido? También se borran los caballos que le hayas cargado.')) return;
            await pedir('/api/jornadas', { method: 'DELETE', body: JSON.stringify({ id: t.id }) });
            caballos.altaTorneo = false;
            caballos.torneo = torneoEnBlanco();
            caballos.elegido = null;
            await cargarJornadas();
            refrescarFicha();
          }, caballos),
        }, ['Borrar el partido']),
      ])
      : null,
  ].filter(Boolean));
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
  // Las tarjetas de la caballada que se está mirando, más los que ya no están
  // activos pero tienen historia: sacar un caballo no borra lo que jugó.
  const vistas = laCaballada();
  const yaEstan = new Set(vistas.flatMap(idsDe));
  const viejos = caballos.caballada
    .filter((c) => !yaEstan.has(c.id) && (caballos.deQuien === 'grupo' || c.mio !== false))
    .map(unoSolo);

  const stats = vistas.concat(viejos).map((caballo) => ({
    caballo, chukkers: 0, practicas: 0, torneos: 0, jornadas: 0,
    puntajes: [], ultimo: null, chukkers7: 0, chukkers30: 0,
  }));

  // De cualquier id de caballo a su tarjeta: los que se llaman igual caen en
  // la misma, que es justamente lo que hace que la carga sea la del animal.
  const porId = new Map();
  stats.forEach((s) => idsDe(s.caballo).forEach((id) => porId.set(id, s)));

  const sumar = (s, cuanto, dias) => {
    s.chukkers += cuanto;
    if (dias <= 7) s.chukkers7 += cuanto;
    if (dias <= 30) s.chukkers30 += cuanto;
  };

  (caballos.eventos || []).forEach((ev) => {
    const dias = diasDesde(ev.fecha);
    const enEste = new Set();

    Object.keys(ev.uso).forEach((lugar) => {
      const s = porId.get(ev.uso[lugar]);
      if (!s) return;
      const peso = pesoDeLugar(lugar);
      sumar(s, peso, dias);
      if (ev.tipo === 'aap') s.torneos += peso;
      else s.practicas += peso;
      enEste.add(s);
    });

    enEste.forEach((s) => {
      s.jornadas++;
      if (!s.ultimo || ev.fecha > s.ultimo) s.ultimo = ev.fecha;
      const p = idsDe(s.caballo).map((id) => ev.puntajes[id]).find((x) => x);
      if (p) s.puntajes.push(p);
    });
  });

  /* Lo que los del grupo le cargaron a estos mismos caballos. Sin esto, un
     caballo prestado mostraría solo la mitad de lo que jugó: la que monté yo.
     Solo cuando se está mirando la caballada del grupo — con "Mis caballos"
     puesto, la cuenta es la de mi cuaderno. */
  if (caballos.deQuien === 'grupo') {
    (caballos.ajenos || []).forEach((a) => {
      const s = porId.get(a.caballo_id);
      if (!s) return;
      const dias = diasDesde(a.fecha);
      sumar(s, a.chukkers, dias);
      if (a.torneo) s.torneos += a.chukkers;
      else s.practicas += a.chukkers;
      s.jornadas++;
      if (a.puntaje) s.puntajes.push(a.puntaje);
      if (!s.ultimo || a.fecha > s.ultimo) s.ultimo = a.fecha;
    });
  }

  // Los chukkers de afuera pesan igual: son patas del caballo. No suman
  // jornada del club ni puntaje —nadie los vio— pero sí carga, que es
  // justamente el número que sirve para no pasarlo de rosca.
  (caballos.extras || []).forEach((e) => {
    const s = porId.get(e.caballo_id);
    if (!s) return;
    const dias = diasDesde(e.fecha);
    sumar(s, e.chukkers, dias);
    s.afuera = (s.afuera || 0) + e.chukkers;
    if (!s.ultimo || e.fecha > s.ultimo) s.ultimo = e.fecha;
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
  if (hayGrupo()) raiz.appendChild(interruptorDeCaballada());

  const stats = estadisticas().filter((s) => s.chukkers > 0);

  if (!stats.length) {
    raiz.appendChild(el('div', { class: 'vacio' }, [
      'Todavía no hay nada cargado. Cargá los caballos de una jornada y acá vas a ver cómo viene cada uno.',
    ]));
    return;
  }

  const suma = (campo) => stats.reduce((a, s) => a + s[campo], 0);
  const jornadas = (caballos.eventos || []).filter((e) => Object.keys(e.uso).length).length;

  raiz.appendChild(el('div', { class: 'card numeros' }, [
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

  /* La caballada en columnas alineadas: el renglón de antes era una oración
     que había que leer entera para encontrar el puntaje. Así entran doce
     caballos donde entraban seis. */
  const ordenados = ordenar(stats);
  const cuandoJugo = (s) => {
    const dias = s.ultimo === null ? null : diasDesde(s.ultimo);
    if (dias === null) return '—';
    if (dias <= 0) return 'hoy';
    if (dias === 1) return 'ayer';
    return dias + ' días';
  };

  raiz.appendChild(el('div', { class: 'lista tabla', style: 'margin-top:10px' }, [
    el('div', { class: 'cabeza-tabla' }, [
      el('span', { class: 'puesto-nro' }),
      el('span', { style: 'flex:1' }),
      el('span', { class: 'col-chico' }, ['CHK']),
      el('span', { class: 'col-chico' }, ['PTJE']),
      el('span', { class: 'col-chico ancha' }, ['ÚLTIMA']),
    ]),
    ...ordenados.map((s, i) => el('div', { class: 'quien estatico compacto' }, [
      el('span', { class: 'puesto-nro' }, [String(i + 1)]),
      el('span', { style: 'flex:1;min-width:0' }, [
        el('b', { style: s.caballo.lesionado ? 'color:var(--rojo)' : null }, [
          s.caballo.lesionado ? icono('cruz', 11, 'cruz-fila') : null,
          s.caballo.nombre,
        ].filter(Boolean)),
        caballos.deQuien === 'grupo' && (s.caballo.duenios || []).length
          ? el('span', {}, [enTexto(s.caballo.duenios)])
          : null,
      ].filter(Boolean)),
      el('span', { class: 'col-chico fuerte' }, [cantidad(s.chukkers)]),
      el('span', { class: 'col-chico' }, [s.promedio === null ? '—' : unDecimal(s.promedio)]),
      el('span', {
        class: 'col-chico ancha' + (s.chukkers7 >= 6 ? ' aviso-carga' : ''),
      }, [cuandoJugo(s)]),
    ])),
  ]));

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
      class: 'ghost', type: 'button',
      onclick: (e) => compartirTexto(textoDeEstadisticas(ordenados), e.currentTarget),
    }, [icono('compartir', 16), 'Compartir por WhatsApp']),
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
 *
 * En la práctica va también el color del equipo, en su propio renglón: el que
 * prepara los caballos necesita saber de qué juega, y es lo primero que se
 * pregunta. En un partido de torneo no hay color nuestro, así que no va nada.
 *
 * El puntaje va pegado al caballo en su renglón —"3: Malvina 7"— y no en una
 * lista aparte: el mismo caballo sale varios chukkers y repetirlo abajo obliga
 * a buscar. El "/10" no se escribe; se entiende.
 */
function textoDeCaballos(evento) {
  const nombreDe = (id) => (caballos.caballada.find((c) => c.id === id) || {}).nombre || '—';
  const conPuntaje = (id) => {
    const p = evento.puntajes[id];
    return nombreDe(id) + (p === undefined || p === null ? '' : ' ' + p);
  };
  const lineas = [
    evento.tipo === 'aap'
      ? evento.titulo + ' — ' + Hoja.fechaCorta(evento.fecha)
      : 'Caballos — ' + Hoja.fechaCorta(evento.fecha) + ' · ' + evento.detalle,
  ];

  if (evento.color && Hoja.LABEL[evento.color]) {
    lineas.push('Juego de ' + Hoja.LABEL[evento.color]);
  }
  lineas.push('');

  // Un renglón por chukker. El que se partió al medio va con los dos caballos
  // separados por una barra —"3: Rayo 8 / Negro"—, que es como se dice.
  const chukkers = evento.medios
    ? [...new Set(evento.misChukkers.map(chukkerDe))]
    : evento.misChukkers;

  chukkers.forEach((c) => {
    if (evento.uso[c]) return lineas.push(c + ': ' + conPuntaje(evento.uso[c]));
    const mitades = mediosDe(c);
    if (!mitades.some((m) => evento.uso[m])) {
      if (!evento.medios) lineas.push(c + ': ' + conPuntaje(undefined));
      return;
    }
    lineas.push(c + ': ' + mitades.map((m) => conPuntaje(evento.uso[m])).join(' / '));
  });

  if (evento.observaciones) {
    lineas.push('', evento.observaciones);
  }
  return lineas.join('\n');
}

function textoDeEstadisticas(ordenados) {
  const lineas = [caballos.deQuien === 'grupo' && caballos.grupo
    ? 'Caballos de ' + caballos.grupo.nombre
    : 'Caballos de ' + estado.jugador.apodo, ''];
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
          // Y se sueltan los formularios que hayan quedado abiertos: si no, al
          // volver de estadísticas la pantalla aparecía en el buscador de
          // jornadas y no en la caballada, y parecía trabada.
          caballos.buscando = false;
          caballos.filtro = '';
          caballos.altaTorneo = false;
          caballos.sueltos = false;
          caballos.armandoGrupo = false;
          caballos.extra.caballoId = null;
          caballos.sub = clave;
          // Lo mismo que al tocar la solapa: si la carga se cayó, reintenta.
          if (!caballos.eventos) cargarJornadas();
          render();
        },
      }, [texto]))));

  if (caballos.error && !caballos.cargando) raiz.appendChild(aviso('mal', caballos.error));
  if (!caballos.eventos) {
    // Con un error de por medio no está cargando: falló. Dejar "Cargando…"
    // eternamente es lo que hacía pensar que la app se había colgado.
    raiz.appendChild(caballos.error && !caballos.cargando
      ? el('div', { class: 'acciones' }, [
        el('button', {
          class: 'primary', type: 'button',
          onclick: (e) => conBoton(e.target, cargarJornadas, caballos),
        }, ['Volver a intentar']),
      ])
      : el('div', { class: 'vacio' }, ['Cargando…']));
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

   Una fila por caballo y una columna por día del calendario. Cada celda dice si
   ese día jugó y, cuando tiene puntaje, cuánto: más oscuro es mejor. La fila de
   cada caballo va desde la primera práctica que jugó hasta la última, y los días
   en los que no salió ninguno —haya habido práctica o no— quedan como una
   rayita: se cuentan con el ojo y casi no ocupan ancho.

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
  // El día que hubo práctica y además jugó afuera es un día jugado como
  // cualquiera: la diferencia la hace el punto, no el color. La diagonal del
  // torneo solo vale si lo del torneo fue todo lo que jugó.
  const soloAfuera = jugo && celda.afuera >= celda.chukkers;
  return {
    jugo,
    relleno: colorDeCelda(celda),
    diagonal: jugo && celda.torneo && !soloAfuera,
    medio: jugo && celda.torneo && !soloAfuera && celda.chukkers <= 0.5,
    punto: !!celda.afuera,
  };
}

/* El punto de los chukkers de afuera: negro con un halo blanco, porque sobre
   el verde más oscuro —un caballo de 9 o 10— el negro solo se pierde. */
const PUNTO_AFUERA = '#16202e';
const HALO_AFUERA = '#ffffff';

/**
 * Mete, entre las jornadas, un renglón vacío por cada día del calendario en el
 * que no se jugó. Dos prácticas el mismo día siguen siendo dos columnas.
 */
function diaPorDia(jornadas, extras) {
  const conFecha = {};
  jornadas.forEach((ev) => { (conFecha[ev.fecha] = conFecha[ev.fecha] || []).push(ev); });

  // El calendario también tiene que llegar a los días en que el caballo jugó
  // afuera: puede haber sido antes de la primera práctica o después de la
  // última, y si no se estira el rango esos días no existirían.
  const fechas = jornadas.map((e) => e.fecha)
    .concat((extras || []).map((e) => e.fecha))
    .sort();

  const columnas = [];
  const dia = new Date(fechas[0] + 'T12:00:00Z');
  const ultimo = fechas[fechas.length - 1];
  for (let vueltas = 0; vueltas < 800; vueltas += 1) {
    const fecha = dia.toISOString().slice(0, 10);
    if (conFecha[fecha]) columnas.push(...conFecha[fecha]);
    else columnas.push({ fecha, vacio: true, misChukkers: [], uso: {}, puntajes: {} });
    if (fecha >= ultimo) break;
    dia.setUTCDate(dia.getUTCDate() + 1);
  }
  return columnas;
}

/**
 * El plano del calendario: qué filas, qué columnas y dónde va cada cosa.
 * Lo arman una sola vez la pantalla y la exportación, así los dos dibujan
 * exactamente lo mismo.
 */
function planoDelCalendario(stats, medidas) {
  const jornadas = (caballos.eventos || [])
    .slice()
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

  // Las columnas son los días del calendario, no las jornadas: entre una
  // práctica y la siguiente pasan días en los que no se jugó, y esos días son
  // justamente lo que hay que ver —un caballo que descansó una semana no es lo
  // mismo que uno que descansó una tarde—. Cada día sin jornada entra como una
  // rayita de un píxel: se distinguen, y casi no ocupan.
  const extras = caballos.extras || [];
  const eventos = (jornadas.length || extras.length) ? diaPorDia(jornadas, extras) : [];

  // Los chukkers de afuera, listos para buscar por caballo y día. Y con ellos
  // lo que los del grupo cargaron: para el animal es el mismo día de trabajo.
  const afuera = {};
  const sumarAfuera = (id, fecha, cuanto) => {
    const k = id + '|' + fecha;
    afuera[k] = (afuera[k] || 0) + cuanto;
  };
  extras.forEach((e) => sumarAfuera(e.caballo_id, e.fecha, e.chukkers));
  if (caballos.deQuien === 'grupo') {
    (caballos.ajenos || []).forEach((a) => sumarAfuera(a.caballo_id, a.fecha, a.chukkers));
  }

  // Los que jugaron, y también los lesionados que no jugaron nada: que un
  // caballo esté parado es exactamente lo que este cuadro tiene que mostrar.
  const yaEstan = new Set(stats.flatMap((s) => idsDe(s.caballo)));
  const parados = laCaballada()
    .filter((c) => c.lesionado && !idsDe(c).some((id) => yaEstan.has(id)))
    .map((c) => ({ caballo: c }));

  const porCaballo = {};
  (caballos.lesiones || []).forEach((l) => {
    if (!porCaballo[l.caballo_id]) porCaballo[l.caballo_id] = [];
    porCaballo[l.caballo_id].push(l);
  });

  const filas = stats.concat(parados).map((s) => {
    const ids = idsDe(s.caballo);
    const celdas = eventos.map((ev) => {
      const mios = Object.keys(ev.uso).filter((l) => ids.includes(ev.uso[l]));
      const deAfuera = ids.reduce((a, id) => a + (afuera[id + '|' + ev.fecha] || 0), 0);
      return {
        fecha: ev.fecha,
        chukkers: sumaDeLugares(mios) + deAfuera,
        puntaje: ids.map((id) => ev.puntajes[id]).find((p) => p) || null,
        // El torneo exige distinto que la práctica: el cuadrito lo dice con
        // una diagonal, y si el caballo hizo medio chukker se llena la mitad.
        torneo: ev.tipo === 'aap',
        // Ese día jugó también afuera: lo dice un punto en el centro.
        afuera: deAfuera,
      };
    });
    const jugadas = celdas.map((c, i) => (c.chukkers > 0 ? i : -1)).filter((i) => i >= 0);

    // Si todavía no se cargó ningún período, vale el estado de hoy.
    let lesiones = ids.flatMap((id) => porCaballo[id] || []);
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

  // Un día en el que no salió ningún caballo —haya habido práctica o no— no
  // merece una columna entera: queda como una rayita y deja lugar para las que
  // sí cuentan.
  const conJuego = eventos.map((_, c) => filas.some((f) => f.celdas[c].chukkers > 0));

  const { etiqueta, celda, hueco, angosta, huecoRaya, fila, eje } = medidas;
  const x = [];
  let corre = 0;
  eventos.forEach((_, c) => {
    x.push(corre);
    corre += (conJuego[c] ? celda + hueco : angosta + huecoRaya);
  });

  return {
    eventos, filas, conJuego, x,
    jornadas: jornadas.length,
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

/* `angosta` y `huecoRaya` son el ancho de la rayita de un día sin jugar y lo que
   la separa de la siguiente: juntas dan el paso con el que corre el calendario
   en los tramos sin polo. Tres píxeles por día alcanzan para contarlos con el
   ojo y no le comen ancho a los cuadraditos. */
const MEDIDAS = { etiqueta: 74, celda: 14, hueco: 4, angosta: 1, huecoRaya: 2, fila: 24, eje: 20 };

function grafico(raiz, stats) {
  const plano = planoDelCalendario(stats, MEDIDAS);
  if (!plano.eventos.length || !plano.filas.length) return;

  const { eventos, filas, conJuego, x } = plano;
  const M = MEDIDAS;

  raiz.appendChild(el('h2', {}, ['Cómo viene cada caballo']));
  raiz.appendChild(el('p', { class: 'pista', style: 'margin-bottom:10px' }, [
    'La fila de cada caballo va desde la primera práctica que jugó hasta la última. '
    + 'Cada día que pasó sin que saliera ninguno queda como una rayita, para que se '
    + 'vea el descanso. Deslizá de costado para ver toda la temporada.',
  ]));

  // La referencia del punto, solo si hay alguno: si no, es una aclaración de
  // algo que no está en el dibujo.
  if ((caballos.extras || []).length) {
    const marca = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    marca.setAttribute('width', 15);
    marca.setAttribute('height', 15);
    marca.setAttribute('viewBox', '0 0 15 15');
    marca.innerHTML = '<rect x="0.5" y="0.5" width="14" height="14" rx="3" fill="' + RAMPA_PUNTAJE[2] + '"/>'
      + '<circle cx="7.5" cy="7.5" r="3.2" fill="' + HALO_AFUERA + '" opacity="0.92"/>'
      + '<circle cx="7.5" cy="7.5" r="2.5" fill="' + PUNTO_AFUERA + '"/>';
    raiz.appendChild(el('p', { class: 'ref-afuera' }, [
      marca, el('span', {}, ['el punto marca los chukkers que jugó fuera del club']),
    ]));
  }

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
    'aria-label': 'Calendario de ' + filas.length + ' caballos en ' + plano.jornadas + ' jornadas.',
  });

  // Las rayitas van primero, abajo de todo: son el fondo del calendario. Si se
  // dibujaran al final, le cortarían la barra roja de las lesiones y la
  // dejarían punteada.
  eventos.forEach((ev, c) => {
    if (conJuego[c]) return;
    const raya = nodo('rect', {
      x: x[c], y: 0,
      width: M.angosta, height: filas.length * M.fila - (M.fila - M.celda), fill: BORDE_VACIA,
    });
    raya.appendChild(nodo('title', {}, [])).textContent = Hoja.fechaCorta(ev.fecha) + ' · '
      + (ev.vacio ? 'no se jugó' : 'no salió ningún caballo');
    svg.appendChild(raya);
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

      // El punto de los chukkers de afuera, en el centro del cuadradito.
      if (f.punto) {
        const cx = x[c] + M.celda / 2;
        const cy = y + M.celda / 2;
        g.appendChild(nodo('circle', { cx, cy, r: 3.2, fill: HALO_AFUERA, opacity: 0.92 }));
        g.appendChild(nodo('circle', { cx, cy, r: 2.5, fill: PUNTO_AFUERA }));
      }

      const detalle = fila.caballo.nombre + ' · ' + Hoja.fechaCorta(celda.fecha) + ' · '
        + (f.jugo
          ? cantidad(celda.chukkers) + (celda.chukkers === 1 ? ' chukker' : ' chukkers')
            + (celda.torneo && !f.punto ? ' de torneo' : '')
            + (celda.afuera ? ' · ' + cantidad(celda.afuera) + ' afuera del club' : '')
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
    llave(BORDE_VACIA, 'día sin jugar', null, 'rayita'),
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
    }, [icono('compartir', 16), 'Compartir el calendario en JPG']),
  ]));
}

/* ------------------------------------------------------------------ en JPG */

/* Más grande que en pantalla: la temporada entera se manda por WhatsApp y se
   mira en el celular de otro, así que los cuadraditos tienen que aguantar la
   compresión y el zoom. El plano lo arma la misma función, con estas medidas:
   la pantalla y el JPG dibujan siempre lo mismo. */
const MEDIDAS_JPG = {
  etiqueta: 300, celda: 30, hueco: 10, angosta: 3, huecoRaya: 5, fila: 46, eje: 46,
};
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
    + '  ·  ' + plano.jornadas + (plano.jornadas === 1 ? ' jornada' : ' jornadas'),
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
    ctx.fillRect(Math.round(x0 + x[c]), y0, M.angosta, grillaAlto - (M.fila - M.celda));
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

      // El punto de los chukkers de afuera. Mismas proporciones que en
      // pantalla: el halo mide un tercio del cuadradito.
      if (f.punto) {
        const px = cx + M.celda / 2;
        const py = y + M.celda / 2;
        const r = M.celda * 0.18;
        ctx.beginPath();
        ctx.arc(px, py, r * 1.28, 0, Math.PI * 2);
        ctx.fillStyle = HALO_AFUERA;
        ctx.globalAlpha = 0.92;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = PUNTO_AFUERA;
        ctx.fill();
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
    { texto: 'día sin jugar', color: BORDE_VACIA, forma: 'rayita' },
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
