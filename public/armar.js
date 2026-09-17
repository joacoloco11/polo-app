/* ===========================================================================
   Lo que se ve después de entrar: armar la práctica, las prácticas cargadas y
   el plantel.

   Acá no se calcula la rotación. Se eligen los jugadores, se los manda al
   servidor y vuelve la planilla resuelta. Es a propósito: el motor vive en un
   solo lugar y lo que se ve en pantalla es exactamente lo que quedó guardado.
   =========================================================================== */

/* Cuántos entran de cada color. Es lo único del formato que necesita la
   pantalla —para saber cuándo un equipo se llenó—; el reparto de chukkers lo
   resuelve el servidor. */
const CUPOS = {
  8: { azul: 4, blanco: 4 },
  9: { azul: 4, blanco: 4, bicolor: 1 },
  10: { azul: 5, blanco: 5 },
  12: { azul: 4, blanco: 4, colorado: 4 },
};
const CANTIDADES = [8, 9, 10, 12];
const RESUMEN = {
  8: '4 y 4 · 6 chukkers',
  9: '4, 4 y un bicolor · 7 chukkers',
  10: '5 y 5 · 8 chukkers',
  12: '4, 4 y 4 · 9 chukkers',
};

const armado = {
  fecha: hoy(),
  hora: '17:00',
  cancha: 1,
  cantidad: 10,
  notas: '',
  elegidos: [],        // [{ id, color }] en el orden en que se los eligió
  colorActivo: 'azul',
  filtro: '',          // el buscador del plantel
  planilla: null,      // lo que devolvió el servidor
  cabecera: null,      // la cabecera con la que se armó esa planilla
  guardada: null,      // la práctica ya publicada
  error: null,
  /* --- de dónde salen los que se pueden elegir ---------------------------
     Desde que existe Anotación, la lista de arriba son los anotados de ese
     día en orden de llegada. El plantel entero queda a un toque, para el día
     que haya que armar algo sin lista. */
  desde: 'anotados',   // 'anotados' | 'plantel'
  orden: 'llegada',    // cómo se ordenan los anotados: 'llegada' | 'handicap'
  auto: null,          // qué botón automático propuso lo que se ve
  cambiados: [],       // a quiénes metiste a mano después del automático
  cambiando: false,    // está abierta la pantalla de cambiar jugadores
};

const coloresDe = (cantidad) => Object.keys(CUPOS[cantidad]);
const cuantos = (color) => armado.elegidos.filter((e) => e.color === color).length;
const elegido = (id) => armado.elegidos.find((e) => e.id === id);

/** El primer color con lugar, empezando por el activo. */
function colorConLugar() {
  const colores = coloresDe(armado.cantidad);
  const desde = Math.max(0, colores.indexOf(armado.colorActivo));
  for (let i = 0; i < colores.length; i++) {
    const color = colores[(desde + i) % colores.length];
    if (cuantos(color) < CUPOS[armado.cantidad][color]) return color;
  }
  return null;
}

function alternar(id, aMano) {
  const ya = elegido(id);
  if (ya) {
    armado.elegidos = armado.elegidos.filter((e) => e.id !== id);
    armado.cambiados = armado.cambiados.filter((x) => x !== id);
  } else {
    const color = colorConLugar();
    if (!color) return;
    armado.elegidos.push({ id, color });
    // El que entra se queda con el color del que salió —es el único que tenía
    // lugar— y queda marcado, para que en la propuesta se vea qué tocaste.
    if (aMano && !armado.cambiados.includes(id)) armado.cambiados.push(id);
  }
  armado.planilla = null;
  armado.guardada = null;
  armado.auto = null;
  const siguiente = colorConLugar();
  if (siguiente) armado.colorActivo = siguiente;
  render();
}

/* --------------------------------------------- quiénes se pueden elegir */

/** ¿La lista de anotados es de este día y tiene gente? */
const hayAnotados = () => !!(estado.conAnotacion
  && anotacion.datos && anotacion.datos.convocatoria
  && anotacion.datos.convocatoria.fecha === armado.fecha
  && anotacion.datos.anotados.length);

/**
 * Los que ya tienen práctica ese día. De una lista de veinte salen dos
 * prácticas, y la segunda no puede volver a elegir a los de la primera.
 */
function yaEnUnaPractica(fecha) {
  const ids = new Set();
  (practicas.lista || []).filter((p) => p.fecha === fecha).forEach((p) => {
    Object.keys(p.equipos || {}).forEach((color) => {
      p.equipos[color].forEach((j) => ids.add(j.id));
    });
  });
  return ids;
}

/**
 * Si hay una lista abierta, Armar arranca en ese día y a esa hora. Solo con el
 * armado en blanco: si ya había algo empezado, no se le toca nada.
 */
function copiarElDiaDeLaLista() {
  // La lista cerrada también cuenta: cerrarla es justo lo que se hace antes
  // de venir a armar.
  const c = anotacion.datos && anotacion.datos.convocatoria;
  if (!c) return;
  if (armado.elegidos.length || armado.planilla) return;
  armado.fecha = c.fecha;
  armado.hora = c.hora;
}

/** El handicap con el que se arman los equipos. Lo tiene el plantel cargado. */
function hcpDe(id) {
  const j = estado.plantel.find((x) => x.id === id);
  return j ? Number(j.hcp_efectivo) || 0 : 0;
}

/**
 * De quiénes se puede elegir, en el orden en que se van a ver. Los anotados
 * vienen del servidor ya en orden de llegada; ese orden es el que manda y por
 * eso se guarda aparte, aunque la lista se esté mirando por handicap.
 */
function disponibles() {
  const ya = yaEnUnaPractica(armado.fecha);

  if (armado.desde === 'anotados' && hayAnotados()) {
    const lista = anotacion.datos.anotados.map((a, i) => ({
      id: a.jugadorId,
      apodo: a.apodo,
      nombre: a.nombre || a.apodo,
      handicap: a.handicap,
      cuando: a.cuando,
      llegada: i + 1,
      aMano: a.aMano,
    })).filter((j) => !ya.has(j.id) || elegido(j.id));

    if (armado.orden === 'handicap') {
      // Empatados en handicap, primero el que se anotó antes: el reloj
      // desempata, igual que en el armado automático del servidor.
      lista.sort((a, b) => b.handicap - a.handicap || a.llegada - b.llegada);
    }
    return lista;
  }

  return estado.plantel
    .filter((j) => j.activo && (!ya.has(j.id) || elegido(j.id)))
    .map((j) => ({
      id: j.id, apodo: j.apodo, nombre: j.nombre, handicap: Number(j.hcp_efectivo) || 0,
    }));
}

/** Al cambiar de formato hay que soltar lo que ya no entra en los cupos. */
function acomodarAlFormato() {
  const cupos = CUPOS[armado.cantidad];
  const cuenta = {};
  armado.elegidos = armado.elegidos.filter((e) => {
    const color = cupos[e.color] ? e.color : null;
    if (!color) return false;
    cuenta[color] = (cuenta[color] || 0) + 1;
    return cuenta[color] <= cupos[color];
  });
  armado.colorActivo = colorConLugar() || coloresDe(armado.cantidad)[0];
  armado.planilla = null;
  armado.guardada = null;
  armado.auto = null;
  armado.cambiados = [];
}

const cabeceraActual = () => ({
  fecha: armado.fecha, hora: armado.hora, cancha: armado.cancha, notas: armado.notas,
});

/* --------------------------------------------------------------- servidor */

async function pedirPlanilla({ balancear, guardar, auto }) {
  armado.error = null;
  const cuerpo = {
    ...cabeceraActual(),
    formato: armado.cantidad,
    guardar: !!guardar,
  };
  // `auto` no manda jugadores: los elige el servidor de entre los anotados de
  // ese día, que es el único lugar donde esa lista es la verdadera.
  if (auto) cuerpo.auto = auto;
  else if (balancear) cuerpo.seleccion = armado.elegidos.map((e) => e.id);
  else cuerpo.jugadores = armado.elegidos.map((e) => ({ id: e.id, color: e.color }));

  const r = await pedir('/api/practicas', { method: 'POST', body: JSON.stringify(cuerpo) });
  armado.planilla = r.planilla;
  armado.cabecera = cabeceraActual();
  armado.guardada = guardar ? r.practica : null;

  // Si balanceó el servidor, la pantalla se queda con los colores que eligió.
  if (balancear) {
    const porId = new Map(r.planilla.jugadores.map((j) => [j.id, j.color]));
    armado.elegidos = armado.elegidos.map((e) => ({ ...e, color: porId.get(e.id) || e.color }));
  }
  // Si eligió el servidor, la propuesta pasa a ser la selección de la pantalla:
  // así se la puede retocar antes de publicar sin perder nada.
  if (auto) {
    armado.elegidos = r.planilla.jugadores.map((j) => ({ id: j.id, color: j.color }));
    armado.colorActivo = coloresDe(armado.cantidad)[0];
  }
  // La imagen se prepara ya, para que compartir salga en un solo toque.
  Hoja.preparar(r.planilla, armado.cabecera).catch(() => {});
  return r;
}

/**
 * Los dos automáticos. El que elige es el servidor —ahí vive el motor— y acá
 * solo se dice cuál de los dos y con cuántos.
 */
async function armadoAutomatico(modo) {
  armado.cambiados = [];
  await pedirPlanilla({ auto: modo, guardar: false });
  armado.auto = modo;
}

/**
 * Corre algo mientras el botón dice que está trabajando. Si falla, el mensaje
 * queda en `donde.error` — cada pantalla lo muestra en su lugar.
 */
async function conBoton(boton, trabajo, donde = armado) {
  const original = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Un segundo…';
  try {
    donde.error = null;
    await trabajo();
  } catch (e) {
    donde.error = e.message;
  }
  boton.disabled = false;
  boton.textContent = original;
  render();
}

/**
 * Lo mismo, pero sin tocar el contenido del botón: los que tienen dos
 * renglones adentro perderían el de abajo si se les cambia el texto.
 */
async function conEspera(boton, trabajo, donde = armado) {
  boton.disabled = true;
  boton.classList.add('esperando');
  try {
    donde.error = null;
    await trabajo();
  } catch (e) {
    donde.error = e.message;
  }
  boton.disabled = false;
  boton.classList.remove('esperando');
  render();
}

/* ------------------------------------------------------------ vista armar */

function vistaArmar(raiz) {
  raiz.appendChild(titulo('La práctica'));

  const campo = (etiqueta, control) =>
    el('label', { class: 'campo' }, [el('span', {}, [etiqueta]), control]);

  raiz.appendChild(el('div', { class: 'card p' }, [
    el('div', { class: 'grilla-2' }, [
      campo('Fecha', el('input', {
        type: 'date', value: armado.fecha,
        onchange: (e) => { armado.fecha = e.target.value || hoy(); armado.planilla = null; render(); },
      })),
      campo('Hora', el('input', {
        type: 'time', value: armado.hora,
        onchange: (e) => { armado.hora = e.target.value || '17:00'; armado.planilla = null; render(); },
      })),
    ]),
    campo('Cancha', el('div', { class: 'chips tres' }, [1, 2, 3, 4, 5, 6].map((n) =>
      el('button', {
        type: 'button', class: 'chip', 'aria-pressed': armado.cancha === n,
        onclick: () => { armado.cancha = n; armado.planilla = null; render(); },
      }, [String(n)])))),
    campo('Cuántos juegan', el('div', { class: 'chips' }, CANTIDADES.map((n) =>
      el('button', {
        type: 'button', class: 'chip', 'aria-pressed': armado.cantidad === n,
        onclick: () => { armado.cantidad = n; acomodarAlFormato(); render(); },
      }, [String(n)])))),
    el('p', { class: 'pista' }, [RESUMEN[armado.cantidad]]),
    campo('Nota para el grupo (opcional)', el('textarea', {
      rows: 2, maxlength: 600, placeholder: 'Ej.: se juega con casco sí o sí.',
      oninput: (e) => { armado.notas = e.target.value; armado.planilla = null; },
      // Se redibuja recién al salir del campo: si fuera en cada tecla, se
      // cerraría el teclado en cada letra.
      onchange: () => { armado.guardada = null; render(); },
    }, [armado.notas])),
  ]));

  /* ---- los dos automáticos */

  if (hayAnotados()) raiz.appendChild(panelAutomatico());

  /* ---- equipos */

  const colores = coloresDe(armado.cantidad);
  raiz.appendChild(el('h2', {}, ['Los equipos']));
  raiz.appendChild(el('div', { class: 'chips equipos' }, colores.map((color) =>
    el('button', {
      type: 'button', class: 'chip color ' + color, 'aria-pressed': armado.colorActivo === color,
      onclick: () => { armado.colorActivo = color; render(); },
    }, [
      Hoja.LABEL[color],
      el('em', {}, [cuantos(color) + '/' + CUPOS[armado.cantidad][color]]),
    ]))));

  const faltan = armado.cantidad - armado.elegidos.length;
  raiz.appendChild(el('p', { class: 'pista' }, [
    faltan > 0
      ? 'Tocá un jugador para sumarlo a ' + Hoja.LABEL[armado.colorActivo]
        + '. Faltan ' + faltan + (faltan === 1 ? ' jugador.' : ' jugadores.')
      : 'Están los ' + armado.cantidad + '. El primero de cada equipo es el que juega de más.',
  ]));

  /* ---- de quiénes elegir: los anotados de ese día, o el plantel entero */

  raiz.appendChild(cabezaDeLaLista());

  const gente = disponibles();
  if (!gente.length) {
    raiz.appendChild(el('div', { class: 'vacio' }, [
      armado.desde === 'anotados' && hayAnotados()
        ? 'Los anotados ya están todos en una práctica de este día.'
        : 'No hay nadie en el plantel todavía.',
    ]));
    return dibujarBotones(raiz);
  }

  const buscador = el('input', {
    type: 'text', placeholder: 'Buscar…', value: armado.filtro || '',
    'aria-label': 'Buscar un jugador',
    oninput: (e) => { armado.filtro = e.target.value; dibujarLaLista(); },
  });
  raiz.appendChild(el('div', { style: 'margin-top:10px' }, [buscador]));

  const caja = el('div', { class: 'lista tabla', style: 'margin-top:8px' });
  raiz.appendChild(caja);

  function dibujarLaLista() {
    vaciar(caja);
    const texto = (armado.filtro || '').trim().toLowerCase();
    const visibles = gente.filter((j) => !texto
      || j.apodo.toLowerCase().includes(texto)
      || String(j.nombre || '').toLowerCase().includes(texto));

    if (!visibles.length) {
      caja.appendChild(el('div', { class: 'vacio' }, ['No hay nadie que coincida.']));
      return;
    }

    // Con los anotados la lista va de corrido: el orden ya dice algo —cómo
    // llegaron, o cómo pegan— y cortarla en bandas lo taparía. Con el plantel
    // entero sí, agrupado por handicap, que es como el club piensa un equipo.
    const porBandas = armado.desde !== 'anotados' || !hayAnotados();
    let ultimo = null;

    visibles.forEach((j) => {
      if (porBandas && j.handicap !== ultimo) {
        ultimo = j.handicap;
        caja.appendChild(el('div', { class: 'banda' }, ['Handicap ' + hcp(j.handicap)]));
      }
      caja.appendChild(renglonElegible(j));
    });
  }
  dibujarLaLista();

  dibujarBotones(raiz);
}

/** Un jugador de la lista de arriba: se toca y entra o sale del armado. */
function renglonElegible(j) {
  const marca = elegido(j.id);
  const posicion = marca ? armado.elegidos.indexOf(marca) + 1 : null;
  return el('button', {
    type: 'button', class: 'quien compacto' + (marca ? ' puesto ' + marca.color : ''),
    onclick: () => alternar(j.id),
  }, [
    el('span', { class: 'orden' }, [marca ? String(posicion) : '+']),
    el('span', { style: 'flex:1;min-width:0' }, [el('b', {}, [j.apodo])]),
    // El puesto de llegada solo cuando la lista está ordenada por handicap:
    // mirándola por llegada ya lo dice el renglón de arriba.
    j.llegada && armado.orden === 'handicap'
      ? el('span', { class: 'col-chico ancha' }, [String(j.llegada) + 'º'])
      : null,
    j.cuando ? el('span', { class: 'col-chico ancha' }, [cuandoSeAnoto(j.cuando)]) : null,
    el('span', { class: 'hcp' }, [hcp(j.handicap)]),
  ].filter(Boolean));
}

/**
 * El encabezado de la lista: cuántos hay, de dónde salen y en qué orden.
 * El orden no es decorativo —el de llegada es el que decide quién queda
 * afuera cuando sobra gente— así que se elige a la vista.
 */
function cabezaDeLaLista() {
  const caja = el('div');
  // Sin la solapa Anotación prendida no hay dos listas entre las que elegir:
  // la de siempre es el plantel, y no hace falta decirlo.
  if (!estado.conAnotacion) return caja;

  const conAnotados = hayAnotados();
  const cuantos = disponibles().length;

  caja.appendChild(el('h2', {}, [
    armado.desde === 'anotados' && conAnotados
      ? 'Anotados · ' + cuantos
      : 'Plantel · ' + cuantos,
  ]));

  if (!conAnotados) {
    caja.appendChild(el('p', { class: 'pista', style: 'margin-top:0' }, [
      anotacion.datos && anotacion.datos.convocatoria
        ? 'La lista de anotados es del ' + Hoja.fechaCorta(anotacion.datos.convocatoria.fecha)
          + ', no de este día: elegís del plantel.'
        : 'No hay lista de anotados para este día: elegís del plantel.',
    ]));
    return caja;
  }

  if (armado.desde === 'anotados') {
    caja.appendChild(el('div', { class: 'chips', style: 'margin-bottom:8px' }, [
      ['llegada', 'Orden de llegada'], ['handicap', 'Por handicap'],
    ].map(([id, texto]) => el('button', {
      type: 'button', class: 'chip', 'aria-pressed': armado.orden === id,
      onclick: () => { armado.orden = id; render(); },
    }, [texto]))));
  }

  caja.appendChild(el('button', {
    class: 'link', type: 'button',
    onclick: () => {
      armado.desde = armado.desde === 'anotados' ? 'plantel' : 'anotados';
      armado.filtro = '';
      render();
    },
  }, [armado.desde === 'anotados' ? 'Ver el plantel entero' : 'Volver a los anotados']));

  return caja;
}

/** Los dos botones que arman solos, una vez decidido de cuántos es. */
function panelAutomatico() {
  const boton = (modo, encabeza, pie) => el('button', {
    type: 'button', class: 'auto' + (armado.auto === modo ? ' puesto' : ''),
    // `currentTarget` y no `target`: el toque cae en el `<b>` de adentro.
    onclick: (e) => conEspera(e.currentTarget, () => armadoAutomatico(modo)),
  }, [
    el('b', {}, [encabeza]),
    el('em', {}, [pie]),
  ]);

  return el('div', {}, [
    el('h2', {}, ['Armar solo']),
    el('div', { class: 'dos-autos' }, [
      boton('nivel', 'Armado por nivel', 'los ' + armado.cantidad + ' de más handicap'),
      boton('parejo', 'Armado parejo', 'los que dejan los equipos más parejos'),
    ]),
    el('p', { class: 'pista' }, [
      'Eligen de entre los anotados y reparten los equipos. Después lo podés tocar.',
    ]),
  ]);
}

function dibujarBotones(raiz) {
  /* ---- botones */

  const completo = armado.elegidos.length === armado.cantidad;
  raiz.appendChild(el('div', { class: 'acciones' }, [
    el('button', {
      class: 'primary', type: 'button', disabled: !completo,
      onclick: (e) => conBoton(e.target, () => pedirPlanilla({ balancear: false, guardar: false })),
    }, ['Armar la planilla']),
    el('button', {
      class: 'ghost', type: 'button', disabled: !completo,
      onclick: (e) => conBoton(e.target, () => pedirPlanilla({ balancear: true, guardar: false })),
    }, ['Repartir por HCP interno']),
    armado.elegidos.length
      ? el('button', {
        class: 'link', type: 'button',
        onclick: () => {
          armado.elegidos = [];
          armado.planilla = null;
          armado.guardada = null;
          armado.cambiados = [];
          armado.auto = null;
          render();
        },
      }, ['Empezar de nuevo'])
      : null,
  ]));

  if (armado.error) raiz.appendChild(aviso('mal', armado.error));

  if (armado.planilla) {
    raiz.appendChild(el('h2', {}, [armado.guardada ? 'Publicada' : 'Así queda']));
    if (!armado.guardada && armado.cambiados.length) {
      raiz.appendChild(aviso('ok', armado.cambiados.length === 1
        ? 'Cambiaste un jugador de la propuesta. Va marcado abajo.'
        : 'Cambiaste ' + armado.cambiados.length + ' jugadores de la propuesta.'));
    }
    raiz.appendChild(panelPlanilla(
      armado.planilla, armado.cabecera, !armado.guardada, !!armado.guardada,
      armado.guardada ? [] : armado.cambiados,
      // Cambiar va arriba de publicar: es el paso de antes, no el de después.
      !armado.guardada && hayAnotados()
        ? el('button', {
          class: 'ghost', type: 'button',
          onclick: () => { armado.cambiando = true; armado.filtro = ''; render(); },
        }, ['Cambiar jugadores'])
        : null,
    ));
  }
}

/* ------------------------------------------------- cambiar jugadores */

/**
 * Sacar a uno y meter a otro, con las dos listas a la vista: los que juegan y
 * los anotados que quedaron afuera. El que entra se queda con el color del que
 * salió —es el único lugar que queda libre— así que la propuesta no se
 * desarma: solo cambia un nombre.
 */
function vistaCambiar(raiz) {
  raiz.appendChild(el('button', {
    class: 'link', type: 'button',
    onclick: () => { armado.cambiando = false; armado.filtro = ''; render(); },
  }, ['‹ Volver al armado']));

  raiz.appendChild(titulo('Cambiar jugadores'));
  raiz.appendChild(el('p', { class: 'pista', style: 'margin-top:0' }, [
    'Sacá con − y metés con +. El que entra se queda con el color del que salió.',
  ]));

  raiz.appendChild(marcadorDeEquipos());

  const gente = disponibles();
  const adentro = armado.elegidos
    .map((e) => ({ ...gente.find((j) => j.id === e.id), color: e.color }))
    .filter((j) => j.id);
  const afuera = gente.filter((j) => !elegido(j.id));

  raiz.appendChild(el('h2', {}, [
    'Juegan', el('em', {}, [armado.elegidos.length + ' de ' + armado.cantidad]),
  ]));
  raiz.appendChild(el('div', { class: 'lista tabla' }, adentro.map((j) =>
    el('button', {
      type: 'button', class: 'quien compacto puesto ' + j.color,
      onclick: () => alternar(j.id, true),
    }, [
      el('span', { class: 'orden saca' }, ['−']),
      el('span', { style: 'flex:1;min-width:0' }, [el('b', {}, [j.apodo])]),
      el('span', { class: 'marca ' + j.color }, [Hoja.LABEL[j.color].slice(0, 4)]),
      el('span', { class: 'hcp' }, [hcp(j.handicap)]),
    ]))));

  raiz.appendChild(el('h2', {}, [
    'Anotados sin entrar', el('em', {}, [String(afuera.length)]),
  ]));

  if (!afuera.length) {
    raiz.appendChild(el('div', { class: 'vacio' }, ['Están todos adentro.']));
  } else {
    raiz.appendChild(el('div', { class: 'lista tabla' }, afuera.map((j) =>
      el('button', {
        type: 'button', class: 'quien compacto',
        disabled: armado.elegidos.length >= armado.cantidad,
        onclick: () => alternar(j.id, true),
      }, [
        el('span', { class: 'orden' }, ['+']),
        el('span', { style: 'flex:1;min-width:0' }, [el('b', {}, [j.apodo])]),
        j.cuando ? el('span', { class: 'col-chico ancha' }, [cuandoSeAnoto(j.cuando)]) : null,
        el('span', { class: 'hcp' }, [hcp(j.handicap)]),
      ].filter(Boolean)))));
    raiz.appendChild(el('p', { class: 'pista' }, [
      armado.elegidos.length >= armado.cantidad
        ? 'Están los ' + armado.cantidad + ': primero sacá a alguien con −.'
        : 'Siguen en orden de llegada, con la hora en que se anotaron.',
    ]));
  }

  if (armado.error) raiz.appendChild(aviso('mal', armado.error));

  raiz.appendChild(el('div', { class: 'acciones' }, [
    el('button', {
      class: 'primary', type: 'button',
      disabled: armado.elegidos.length !== armado.cantidad,
      onclick: (e) => conBoton(e.target, async () => {
        await pedirPlanilla({ balancear: false, guardar: false });
        armado.cambiando = false;
      }),
    }, ['Ver cómo queda']),
  ]));
}

/**
 * El handicap de cada equipo mientras se cambia gente. Se calcula acá y no en
 * el servidor a propósito: tiene que moverse en el mismo toque, y el número
 * sale del plantel, que ya está cargado.
 */
function marcadorDeEquipos() {
  const colores = coloresDe(armado.cantidad);
  const suma = (color) => armado.elegidos
    .filter((e) => e.color === color)
    .reduce((a, e) => a + hcpDe(e.id), 0);
  const bicolor = colores.includes('bicolor') ? suma('bicolor') : 0;

  return el('div', { class: 'marcador-hcp' }, colores
    .filter((c) => c !== 'bicolor')
    .map((color) => el('div', { class: 'color ' + color }, [
      el('span', {}, [Hoja.LABEL[color]]),
      // El bicolor juega para los dos, así que suma en los dos.
      el('b', {}, [String(suma(color) + (color === 'colorado' ? 0 : bicolor)), el('i', {}, ['hcp'])]),
    ])));
}

/* ----------------------------------------------------------- la planilla */

function panelPlanilla(planilla, cabecera, sinPublicar, recienGuardada, nuevos, antesDePublicar) {
  const caja = el('div', { class: 'card p' });
  const cambiados = nuevos || [];

  caja.appendChild(el('div', { class: 'cabecera-hoja' }, [
    el('b', {}, [Hoja.fechaCorta(cabecera.fecha)]),
    el('span', {}, ['Cancha ' + cabecera.cancha + ' · ' + cabecera.hora + ' hs · '
      + planilla.chukkers + ' chukkers']),
  ]));

  /* Un equipo por columna: dos, o tres en las de 12. Puestos al lado se leen
     como en la planilla de papel, en vez de uno abajo del otro. */
  const renglonDe = (j) => el('div', {
    class: 'renglon' + (j.todos ? ' de-mas' : '') + (cambiados.includes(j.id) ? ' nuevo' : ''),
  }, [
    el('span', { class: 'nm' }, [j.apodo]),
    j.nota ? el('em', {}, [j.nota]) : null,
    planilla.hcpConocido ? el('i', { class: 'h' }, [hcp(j.handicap)]) : null,
  ].filter(Boolean));

  const columnas = el('div', {
    class: 'equipos-tabla ' + (planilla.equipos.length > 2 ? 'tres' : 'dos'),
  });
  planilla.equipos.forEach((color) => {
    columnas.appendChild(el('div', { class: 'equipo ' + color }, [
      el('div', { class: 'cab' }, [
        el('span', {}, [Hoja.LABEL[color]]),
        planilla.hcpConocido
          ? el('b', {}, [String(planilla.hcpPorEquipo[color]), el('i', {}, ['hcp'])])
          : null,
      ].filter(Boolean)),
      ...planilla.jugadores.filter((j) => j.color === color).map(renglonDe),
    ]));
  });
  caja.appendChild(columnas);

  const bicolor = planilla.jugadores.find((j) => j.color === 'bicolor');
  if (bicolor) {
    caja.appendChild(el('div', { class: 'equipo bicolor bicolor-caja' }, [
      el('div', { class: 'cab' }, [el('span', {}, ['BICOLOR'])]),
      renglonDe(bicolor),
      el('div', { class: 'al-pie' }, ['Juega para los dos equipos. Suma en los dos handicaps.']),
    ]));
  }

  if (planilla.franjas) {
    caja.appendChild(el('div', { class: 'franjas' }, planilla.franjas.map((f) =>
      el('div', {}, ['Chukkers ' + f.desde + ' a ' + f.hasta + ': '
        + Hoja.LABEL[f.juegan[0]] + ' vs ' + Hoja.LABEL[f.juegan[1]]]))));
  }

  if (String(cabecera.notas || '').trim()) {
    caja.appendChild(el('div', { class: 'nota-hoja' }, [String(cabecera.notas).trim()]));
  }

  if (planilla.hcpConocido && planilla.desbalance > 2) {
    caja.appendChild(aviso('nota', 'Hay ' + planilla.desbalance
      + ' goles de diferencia entre los equipos. Probá "Repartir por HCP interno".'));
  }

  const acciones = el('div', { class: 'acciones' });
  if (antesDePublicar) acciones.appendChild(antesDePublicar);
  if (sinPublicar) {
    acciones.appendChild(el('button', {
      class: 'primary', type: 'button',
      onclick: (e) => conBoton(e.target, async () => {
        await pedirPlanilla({ balancear: false, guardar: true });
        armado.elegidos = [];   // lista para cargar la próxima
        armado.colorActivo = coloresDe(armado.cantidad)[0];
        armado.cambiados = [];
        armado.auto = null;
        practicas.lista = null;
        cargarPracticas();      // para que aparezca en la otra pestaña
      }),
    }, ['Publicar la práctica']));
  }
  acciones.appendChild(el('button', {
    class: sinPublicar ? 'ghost' : 'primary', type: 'button',
    onclick: (e) => Hoja.compartir(planilla, cabecera, e.target),
  }, [icono('compartir', 16), 'Compartir la imagen']));
  acciones.appendChild(el('button', {
    class: 'ghost', type: 'button',
    onclick: (e) => Hoja.copiar(planilla, cabecera, e.target),
  }, ['Copiar en texto']));
  caja.appendChild(acciones);

  if (recienGuardada) {
    caja.appendChild(aviso('ok', 'Quedó guardada. Ya la podés mandar al grupo.'));
  }

  return caja;
}

/* ------------------------------------------------------------- prácticas */

const practicas = {
  lista: null, abierta: null, error: null, borrando: false,
  // Cuáles están desplegadas en la lista. Arranca con la última, que es la
  // que uno viene a mirar; el resto quedan en un renglón.
  desplegadas: null,
  resultado: { partidos: {}, mvpId: '' },
};

async function cargarPracticas() {
  try {
    practicas.lista = (await pedir('/api/practicas')).practicas;
  } catch (e) {
    practicas.error = e.message;
  }
  render();
}

async function abrirPractica(id) {
  try {
    practicas.abierta = await pedir('/api/practica?id=' + encodeURIComponent(id));
    practicas.borrando = false;
    practicas.error = null;
    // El formulario del resultado arranca con lo que ya estaba cargado.
    practicas.resultado = {
      partidos: Object.fromEntries(practicas.abierta.partidos.map((p) => [
        p.orden, { golesA: p.golesA, golesB: p.golesB },
      ])),
      mvpId: practicas.abierta.practica.mvp_id || '',
    };
  } catch (e) {
    practicas.error = e.message;
  }
  render();
}

/* ------------------------------------------------------- el resultado */

const hayResultado = (partidos) =>
  partidos.some((p) => p.golesA !== null && p.golesA !== undefined);

/** El marcador, como lo lee cualquiera. */
function panelMarcador(abierta) {
  const { partidos, mvp, practica } = abierta;
  if (!hayResultado(partidos) && !mvp) return null;

  const caja = el('div', { class: 'card p', style: 'margin-top:14px' }, [
    el('h3', { style: 'color:var(--muted);letter-spacing:2px' }, ['RESULTADO']),
  ]);

  partidos.forEach((p) => {
    if (p.golesA === null || p.golesA === undefined) return;
    const gana = (a, b) => (a > b ? ' ganador' : '');
    caja.appendChild(el('div', { class: 'marcador' }, [
      practica.formato === 12
        ? el('span', { class: 'franja' }, ['Ch. ' + (p.orden * 3 - 2) + '-' + p.orden * 3])
        : null,
      el('span', { class: 'lado color ' + p.equipoA + gana(p.golesA, p.golesB) }, [Hoja.LABEL[p.equipoA]]),
      // Cada número del color del que lo metió.
      el('b', { class: 'color ' + p.equipoA }, [String(p.golesA)]),
      el('span', { class: 'guion' }, ['–']),
      el('b', { class: 'color ' + p.equipoB }, [String(p.golesB)]),
      el('span', { class: 'lado color ' + p.equipoB + gana(p.golesB, p.golesA) }, [Hoja.LABEL[p.equipoB]]),
    ]));
  });

  if (mvp) {
    caja.appendChild(el('div', { class: 'mvp' }, [
      el('span', {}, ['MVP']), el('b', {}, [mvp.apodo]),
    ]));
  }
  return caja;
}

/** El formulario, solo para administradores. */
function panelCargarResultado(abierta) {
  const { partidos, practica, planilla } = abierta;
  const estado = practicas.resultado;

  const caja = el('div', { class: 'card p', style: 'margin-top:14px' }, [
    el('h3', { style: 'color:var(--muted);letter-spacing:2px' }, [
      hayResultado(partidos) ? 'CORREGIR EL RESULTADO' : 'CARGAR EL RESULTADO',
    ]),
  ]);

  partidos.forEach((p) => {
    const mio = estado.partidos[p.orden] || (estado.partidos[p.orden] = { golesA: null, golesB: null });
    const gol = (lado) => {
      const campo = el('input', {
        type: 'number', min: 0, max: 99, inputmode: 'numeric',
        value: mio[lado] === null || mio[lado] === undefined ? '' : String(mio[lado]),
        'aria-label': 'Goles de ' + Hoja.LABEL[lado === 'golesA' ? p.equipoA : p.equipoB],
      });
      campo.addEventListener('input', (e) => {
        mio[lado] = e.target.value === '' ? null : Number(e.target.value);
      });
      return campo;
    };

    caja.appendChild(el('div', { class: 'cargar-gol' }, [
      practica.formato === 12
        ? el('div', { class: 'franja' }, ['Chukkers ' + (p.orden * 3 - 2) + ' a ' + p.orden * 3])
        : null,
      el('div', { class: 'fila' }, [
        el('span', { class: 'lado color ' + p.equipoA }, [Hoja.LABEL[p.equipoA]]),
        gol('golesA'),
        el('span', { class: 'guion' }, ['–']),
        gol('golesB'),
        el('span', { class: 'lado color ' + p.equipoB }, [Hoja.LABEL[p.equipoB]]),
      ]),
    ]));
  });

  const mvp = el('select', { 'aria-label': 'MVP de la práctica' });
  mvp.appendChild(el('option', { value: '' }, ['— sin MVP —']));
  planilla.jugadores.forEach((j) => {
    const op = el('option', { value: j.id }, [j.apodo]);
    if (estado.mvpId === j.id) op.selected = true;
    mvp.appendChild(op);
  });
  mvp.addEventListener('change', (e) => { estado.mvpId = e.target.value; });
  caja.appendChild(el('label', { class: 'campo', style: 'margin-top:12px' }, [
    el('span', {}, ['MVP']), mvp,
  ]));

  caja.appendChild(el('p', { class: 'pista' }, [
    practica.formato === 12
      ? 'Cada enfrentamiento ganado suma 1,5 puntos y el empate 0,5: en las de 12 valen la mitad, porque cada uno juega dos.'
      : 'Ganar suma 3 puntos a los del equipo y empatar 1.',
  ]));

  caja.appendChild(el('div', { class: 'acciones' }, [
    el('button', {
      class: 'primary', type: 'button',
      onclick: (e) => conBoton(e.target, async () => {
        await pedir('/api/resultado', {
          method: 'POST',
          body: JSON.stringify({
            practicaId: practica.id,
            partidos: Object.entries(estado.partidos).map(([orden, g]) => ({ orden: Number(orden), ...g })),
            mvpId: estado.mvpId || null,
          }),
        });
        await abrirPractica(practica.id);
        practicas.lista = null;
        cargarPracticas();
        rankingSucio = true;   // cambió el ranking
      }, practicas),
    }, ['Guardar el resultado']),
  ]));

  return caja;
}

/**
 * Borrar pide confirmación en la misma pantalla, no con un cartel del
 * navegador: dice qué se va a perder antes de preguntar.
 */
function panelBorrar(practica) {
  if (!practicas.borrando) {
    return el('div', { style: 'text-align:center;margin-top:8px' }, [
      el('button', {
        class: 'link', type: 'button',
        onclick: () => { practicas.borrando = true; render(); },
      }, ['Borrar esta práctica']),
    ]);
  }

  const cuantas = Number(practica.jornadas || 0);
  return el('div', { class: 'card p', style: 'margin-top:12px;border-color:var(--rojo)' }, [
    el('div', { style: 'font-size:13px' }, [
      '¿Borrar la práctica del ' + fechaLarga(practica.fecha) + '?',
    ]),
    el('div', { class: 'pista' }, [
      cuantas
        ? 'Se van a perder también los caballos que ya cargaron '
          + cuantas + (cuantas === 1 ? ' jugador' : ' jugadores') + '. No se puede deshacer.'
        : 'No se puede deshacer.',
    ]),
    el('div', { class: 'acciones' }, [
      el('button', {
        class: 'peligro', type: 'button',
        onclick: (e) => conBoton(e.target, async () => {
          await pedir('/api/practica?id=' + encodeURIComponent(practica.id), { method: 'DELETE' });
          practicas.abierta = null;
          practicas.borrando = false;
          practicas.lista = null;
          await cargarPracticas();
          cargarJornadas();   // las jornadas de esa práctica ya no están
        }, practicas),
      }, ['Sí, borrarla']),
      el('button', {
        class: 'ghost', type: 'button',
        onclick: () => { practicas.borrando = false; render(); },
      }, ['No, dejarla']),
    ]),
  ]);
}

/* =========================================================================
   Editar una práctica ya publicada.

   Editar no es volver a armar. La práctica ya se jugó: lo que se arregla acá
   es la planilla —el que faltó, el que entró en su lugar, de cuántos se
   terminó jugando— sin perder el resultado, el MVP ni los caballos que cada
   uno cargó.

   La pantalla no decide nada de eso: junta los cambios, se los manda al
   servidor con `guardar: false` y muestra el balance que vuelve. Recién
   cuando el que edita lo leyó y toca Guardar, se escribe.
   ========================================================================= */

const edicion = {
  abierta: false,
  practicaId: null,
  fecha: '', hora: '', cancha: 1, cantidad: 10, formatoOriginal: 10,
  // [{ id, apodo, handicap, color, fuera, entro }] en el orden de la planilla.
  filas: [],
  sumando: false,      // está abierta la lista para meter a alguien
  filtro: '',
  previa: null,        // lo que devolvió el servidor: planilla y balance
  clavePrevia: null,   // de qué cambio es esa vista previa
  pidiendo: false,
  error: null,
  listo: false,        // se guardó
};

const CUPOS_EDICION = (n) => CUPOS[n];
const activos = () => edicion.filas.filter((f) => !f.fuera);
const cuantosDe = (color) => activos().filter((f) => f.color === color).length;

/** ¿La cuenta cierra? Tiene que haber exactamente los cupos de cada color. */
function cuentaCierra() {
  const cupos = CUPOS_EDICION(edicion.cantidad);
  return activos().length === edicion.cantidad
    && Object.keys(cupos).every((c) => cuantosDe(c) === cupos[c]);
}

/** Con qué cambio se pidió la última vista previa. */
const claveDeLaEdicion = () => JSON.stringify([
  edicion.fecha, edicion.hora, edicion.cancha, edicion.cantidad,
  activos().map((f) => [f.id, f.color]),
]);

function abrirEdicion(abierta) {
  const { practica, planilla } = abierta;
  edicion.abierta = true;
  edicion.practicaId = practica.id;
  edicion.fecha = String(practica.fecha).slice(0, 10);
  edicion.hora = String(practica.hora).slice(0, 5);
  edicion.cancha = Number(practica.cancha);
  edicion.cantidad = Number(practica.formato);
  edicion.formatoOriginal = Number(practica.formato);
  edicion.filas = planilla.jugadores.map((j) => ({
    id: j.id, apodo: j.apodo, handicap: j.handicap, color: j.color, fuera: false, entro: false,
  }));
  edicion.sumando = false;
  edicion.filtro = '';
  edicion.previa = null;
  edicion.clavePrevia = null;
  edicion.error = null;
  edicion.listo = false;
  render();
}

function cerrarEdicion() {
  edicion.abierta = false;
  edicion.filas = [];
  edicion.previa = null;
  render();
}

/**
 * Al cambiar de formato los colores se reacomodan solos: el que entra en el
 * cupo se queda donde está, y el que sobra pasa al primer color con lugar. De
 * 10 a 9 es lo que hace que el quinto del blanco pase a bicolor.
 */
function acomodarLaEdicion() {
  const cupos = CUPOS_EDICION(edicion.cantidad);
  const cuenta = {};
  const sueltos = [];

  activos().forEach((f) => {
    if (!cupos[f.color]) { sueltos.push(f); return; }
    cuenta[f.color] = (cuenta[f.color] || 0) + 1;
    if (cuenta[f.color] > cupos[f.color]) { cuenta[f.color]--; sueltos.push(f); }
  });

  sueltos.forEach((f) => {
    const libre = Object.keys(cupos).find((c) => (cuenta[c] || 0) < cupos[c]);
    if (!libre) { f.color = Object.keys(cupos)[0]; return; }
    cuenta[libre] = (cuenta[libre] || 0) + 1;
    f.color = libre;
  });
}

/** El color de al lado, dando la vuelta. Es lo que pasa al tocar el chip. */
function rotarColor(fila) {
  const colores = Object.keys(CUPOS_EDICION(edicion.cantidad));
  const i = colores.indexOf(fila.color);
  fila.color = colores[(i + 1) % colores.length];
  tocarLaEdicion();
}

/** Cualquier cambio invalida la vista previa y, si la cuenta cierra, pide otra. */
function tocarLaEdicion() {
  edicion.previa = null;
  edicion.error = null;
  render();
  if (cuentaCierra()) pedirVistaPrevia();
}

async function pedirVistaPrevia() {
  const clave = claveDeLaEdicion();
  if (edicion.pidiendo || edicion.clavePrevia === clave) return;
  edicion.pidiendo = true;
  // La clave se marca pase lo que pase: si el servidor dijo que no, la pantalla
  // muestra el motivo y espera otro cambio, en vez de volver a preguntar lo
  // mismo una y otra vez.
  edicion.clavePrevia = clave;
  try {
    const r = await pedir('/api/practica?id=' + encodeURIComponent(edicion.practicaId), {
      method: 'PUT',
      body: JSON.stringify({ ...datosDeLaEdicion(), guardar: false }),
    });
    edicion.previa = r;
    edicion.error = null;
  } catch (e) {
    edicion.previa = null;
    edicion.error = e.message;
  }
  edicion.pidiendo = false;
  render();
}

const datosDeLaEdicion = () => ({
  fecha: edicion.fecha,
  hora: edicion.hora,
  cancha: edicion.cancha,
  formato: edicion.cantidad,
  jugadores: activos().map((f) => ({ id: f.id, color: f.color })),
});

/* --------------------------------------------------------- la pantalla */

function vistaEditar(raiz) {
  raiz.appendChild(el('button', {
    class: 'link', type: 'button', onclick: cerrarEdicion,
  }, ['‹ Cancelar']));

  raiz.appendChild(titulo('Editar la práctica'));
  raiz.appendChild(el('p', { class: 'pista', style: 'margin-top:0' }, [
    fechaLarga(edicion.fecha) + ' · lo que cambies se guarda recién al final.',
  ]));

  if (edicion.sumando) return listaParaSumar(raiz);

  const campo = (etiqueta, control) =>
    el('label', { class: 'campo' }, [el('span', {}, [etiqueta]), control]);

  raiz.appendChild(el('div', { class: 'card p' }, [
    el('div', { class: 'grilla-2' }, [
      campo('Fecha', el('input', {
        type: 'date', value: edicion.fecha,
        onchange: (e) => { edicion.fecha = e.target.value || edicion.fecha; tocarLaEdicion(); },
      })),
      campo('Hora', el('input', {
        type: 'time', value: edicion.hora,
        onchange: (e) => { edicion.hora = e.target.value || edicion.hora; tocarLaEdicion(); },
      })),
    ]),
    campo('Cancha', el('div', { class: 'chips tres' }, [1, 2, 3, 4, 5, 6].map((n) =>
      el('button', {
        type: 'button', class: 'chip', 'aria-pressed': edicion.cancha === n,
        onclick: () => { edicion.cancha = n; tocarLaEdicion(); },
      }, [String(n)])))),
  ]));

  /* ---- de cuántos se terminó jugando */

  raiz.appendChild(el('h2', {}, ['Cuántos jugaron']));

  if (edicion.formatoOriginal === 12) {
    // Las de 12 son otra cosa: tres equipos, tres partidos y la mitad de
    // puntos por partido. Cambiarles el formato sería rehacer la práctica.
    raiz.appendChild(aviso('nota',
      'En las de 12 no se cambia de cuántos es: son tres equipos y tres partidos, '
      + 'y la cuenta de puntos es otra. Lo que sí se puede es cambiar un jugador por otro.'));
  } else {
    raiz.appendChild(el('div', { class: 'chips tres' }, [8, 9, 10].map((n) =>
      el('button', {
        type: 'button', class: 'chip', 'aria-pressed': edicion.cantidad === n,
        onclick: () => { edicion.cantidad = n; acomodarLaEdicion(); tocarLaEdicion(); },
      }, [String(n), el('em', {}, [CHUKKERS_DE[n] + ' chk'])]))));
    raiz.appendChild(el('p', { class: 'pista' }, [
      edicion.cantidad === edicion.formatoOriginal
        ? 'Era de ' + edicion.formatoOriginal + '. Las de 12 se arman aparte.'
        : 'Era de ' + edicion.formatoOriginal + ': pasa a ' + edicion.cantidad
          + ' y a ' + CHUKKERS_DE[edicion.cantidad] + ' chukkers.',
    ]));
  }

  /* ---- los jugadores */

  raiz.appendChild(el('h2', {}, [
    'Los jugadores', el('em', {}, [activos().length + ' de ' + edicion.cantidad]),
  ]));

  const cupos = CUPOS_EDICION(edicion.cantidad);
  raiz.appendChild(el('div', { class: 'cupos' }, Object.keys(cupos).map((color) =>
    el('div', { class: color + (cuantosDe(color) === cupos[color] ? '' : ' mal') }, [
      el('span', {}, [Hoja.LABEL[color]]),
      el('b', {}, [cuantosDe(color) + '/' + cupos[color]]),
    ]))));

  if (!cuentaCierra()) {
    raiz.appendChild(aviso('mal', activos().length === edicion.cantidad
      ? 'Los colores no cierran: tocá el color de alguno para moverlo de equipo.'
      : 'Quedaron ' + activos().length + ' en una práctica marcada de ' + edicion.cantidad
        + '. O ponés a alguien en su lugar, o ' + (edicion.formatoOriginal === 12
          ? 'volvés a meter al que sacaste.'
          : 'la pasás a ' + activos().length + '.')));
  }

  raiz.appendChild(el('div', { class: 'lista tabla' }, edicion.filas.map(renglonDeEdicion)));

  raiz.appendChild(el('p', { class: 'pista' }, [
    'Sacá con − al que no vino. Tocá el color para cambiarlo de equipo.',
  ]));

  raiz.appendChild(el('div', { class: 'acciones' }, [
    el('button', {
      class: 'ghost', type: 'button',
      onclick: () => { edicion.sumando = true; edicion.filtro = ''; render(); },
    }, ['Sumar a alguien']),
  ]));

  /* ---- qué se conserva y qué no */

  if (edicion.error) raiz.appendChild(aviso('mal', edicion.error));

  if (cuentaCierra()) {
    if (!edicion.previa) {
      if (!edicion.error) {
        raiz.appendChild(el('div', { class: 'vacio' }, ['Viendo cómo queda…']));
        pedirVistaPrevia();
      }
    } else {
      raiz.appendChild(panelBalance(edicion.previa.balance));
      raiz.appendChild(el('div', { class: 'acciones' }, [
        el('button', {
          class: 'primary', type: 'button',
          onclick: (e) => conBoton(e.target, guardarLaEdicion, edicion),
        }, ['Guardar los cambios']),
      ]));
    }
  } else {
    raiz.appendChild(el('div', { class: 'acciones' }, [
      el('button', { class: 'primary', type: 'button', disabled: true }, ['Guardar los cambios']),
    ]));
    raiz.appendChild(el('p', { class: 'pista', style: 'text-align:center' }, [
      'El botón no se puede tocar hasta que la cuenta cierre.',
    ]));
  }
}

const CHUKKERS_DE = { 8: 6, 9: 7, 10: 8, 12: 9 };

function renglonDeEdicion(f) {
  const chip = el('button', {
    type: 'button', class: 'chip color ' + f.color, 'aria-pressed': 'true',
    style: 'padding:5px 9px',
    onclick: (e) => { e.stopPropagation(); rotarColor(f); },
    disabled: f.fuera,
  }, [Hoja.LABEL[f.color]]);

  return el('div', { class: 'quien compacto' + (f.fuera ? ' fuera' : '') + (f.entro ? ' entro' : '') }, [
    el('button', {
      type: 'button', class: 'orden' + (f.fuera ? '' : ' saca'),
      'aria-label': (f.fuera ? 'Volver a poner a ' : 'Sacar a ') + f.apodo,
      onclick: () => { f.fuera = !f.fuera; tocarLaEdicion(); },
    }, [f.fuera ? '+' : '−']),
    el('span', { style: 'flex:1;min-width:0' }, [
      el('b', {}, [f.apodo]),
      f.fuera ? el('span', {}, ['no vino']) : (f.entro ? el('span', {}, ['entró en su lugar']) : null),
    ].filter(Boolean)),
    chip,
  ]);
}

/** Meter a alguien del plantel que no está en la planilla. */
function listaParaSumar(raiz) {
  raiz.appendChild(el('h2', {}, ['Sumar a alguien']));

  const puestos = new Set(edicion.filas.map((f) => f.id));
  const texto = (edicion.filtro || '').trim().toLowerCase();
  const gente = estado.plantel
    .filter((j) => j.activo && !puestos.has(j.id))
    .filter((j) => !texto || j.apodo.toLowerCase().includes(texto)
      || String(j.nombre || '').toLowerCase().includes(texto));

  raiz.appendChild(el('input', {
    type: 'text', placeholder: 'Buscar…', value: edicion.filtro || '',
    'aria-label': 'Buscar un jugador',
    oninput: (e) => { edicion.filtro = e.target.value; render(); },
  }));

  if (!gente.length) {
    raiz.appendChild(el('div', { class: 'vacio' }, ['No hay nadie que coincida.']));
  } else {
    raiz.appendChild(el('div', { class: 'lista tabla', style: 'margin-top:8px' }, gente.map((j) =>
      el('button', {
        type: 'button', class: 'quien compacto',
        onclick: () => {
          // Entra en el lugar del primero que se sacó: se queda con su color,
          // que es el que quedó libre, y su renglón en la planilla.
          const hueco = edicion.filas.find((f) => f.fuera && !f.reemplazado);
          const color = hueco ? hueco.color : (colorConLugarEnLaEdicion() || 'azul');
          const nuevo = {
            id: j.id, apodo: j.apodo, handicap: Number(j.hcp_efectivo) || 0,
            color, fuera: false, entro: true,
          };
          if (hueco) {
            hueco.reemplazado = true;
            edicion.filas.splice(edicion.filas.indexOf(hueco) + 1, 0, nuevo);
          } else {
            edicion.filas.push(nuevo);
          }
          edicion.sumando = false;
          edicion.filtro = '';
          tocarLaEdicion();
        },
      }, [
        el('span', { class: 'orden' }, ['+']),
        el('span', { style: 'flex:1;min-width:0' }, [el('b', {}, [j.apodo])]),
        el('span', { class: 'hcp' }, [hcp(Number(j.hcp_efectivo) || 0)]),
      ]))));
  }

  raiz.appendChild(el('div', { class: 'acciones' }, [
    el('button', {
      class: 'ghost', type: 'button',
      onclick: () => { edicion.sumando = false; edicion.filtro = ''; render(); },
    }, ['Volver']),
  ]));
}

function colorConLugarEnLaEdicion() {
  const cupos = CUPOS_EDICION(edicion.cantidad);
  return Object.keys(cupos).find((c) => cuantosDe(c) < cupos[c]) || null;
}

/** El balance que armó el servidor, tal cual viene. */
function panelBalance(b) {
  const caja = el('div', { class: 'balance' }, [
    el('h3', {}, ['Qué pasa con lo cargado']),
  ]);
  b.enPalabras.conserva.forEach((t) =>
    caja.appendChild(el('div', { class: 'conserva' }, [el('i', {}, ['✓']), el('span', {}, [t])])));
  b.enPalabras.pierde.forEach((t) =>
    caja.appendChild(el('div', { class: 'pierde' }, [el('i', {}, ['✕']), el('span', {}, [t])])));
  if (!b.enPalabras.pierde.length) {
    caja.appendChild(el('div', { class: 'conserva' }, [
      el('i', {}, ['✓']), el('span', {}, ['No se pierde nada de lo que ya estaba cargado.']),
    ]));
  }
  return caja;
}

async function guardarLaEdicion() {
  await pedir('/api/practica?id=' + encodeURIComponent(edicion.practicaId), {
    method: 'PUT',
    body: JSON.stringify({ ...datosDeLaEdicion(), guardar: true }),
  });
  const id = edicion.practicaId;
  edicion.abierta = false;
  edicion.filas = [];
  edicion.previa = null;
  practicas.lista = null;
  await abrirPractica(id);
  await cargarPracticas();
  cargarJornadas();      // pueden haber cambiado los chukkers de los caballos
  rankingSucio = true;   // y con eso, los puntos
}

/* ---------------------------------------------------------- la puerta */

/**
 * El botón que abre la edición. Va abajo de la planilla y arriba del link de
 * borrar, con una línea que diga para qué es cada uno: son dos cosas muy
 * distintas y quedan pegadas.
 */
function panelEditar(abierta) {
  return el('div', { style: 'margin-top:10px' }, [
    el('button', {
      class: 'ghost', type: 'button',
      onclick: () => abrirEdicion(abierta),
    }, ['✎ Editar la práctica']),
  ]);
}

function vistaPracticas(raiz) {
  if (edicion.abierta) return vistaEditar(raiz);

  if (practicas.abierta) {
    const { practica, planilla } = practicas.abierta;
    raiz.appendChild(el('button', {
      class: 'link', type: 'button',
      onclick: () => { practicas.abierta = null; practicas.borrando = false; render(); },
    }, ['‹ Volver a la lista']));
    const marcador = panelMarcador(practicas.abierta);
    if (marcador) raiz.appendChild(marcador);

    raiz.appendChild(panelPlanilla(planilla, {
      fecha: practica.fecha.slice(0, 10),
      hora: String(practica.hora).slice(0, 5),
      cancha: practica.cancha,
      notas: practica.notas || '',
      // Lo que hace que la planilla exportada salga con el marcador y el MVP.
      partidos: practicas.abierta.partidos,
      mvp: practicas.abierta.mvp ? practicas.abierta.mvp.apodo : null,
    }, false));

    if (estado.jugador.admin) raiz.appendChild(panelCargarResultado(practicas.abierta));

    if (practicas.error) raiz.appendChild(aviso('mal', practicas.error));
    if (estado.jugador.admin) {
      raiz.appendChild(panelEditar(practicas.abierta));
      raiz.appendChild(panelBorrar(practica));
      raiz.appendChild(el('p', { class: 'pista', style: 'text-align:center' }, [
        'Editar es para arreglar lo que pasó: el que faltó, el que entró en su lugar, '
        + 'de cuántos se terminó jugando. Borrar se lleva todo.',
      ]));
    }
    return;
  }

  raiz.appendChild(titulo('Prácticas de la temporada'));

  if (practicas.error) { raiz.appendChild(aviso('mal', practicas.error)); return; }
  if (!practicas.lista) { raiz.appendChild(el('div', { class: 'vacio' }, ['Cargando…'])); return; }
  if (!practicas.lista.length) {
    raiz.appendChild(el('div', { class: 'vacio' }, [
      estado.jugador.admin
        ? 'Todavía no hay ninguna. Armá la primera desde la pestaña Armar.'
        : 'Todavía no hay prácticas cargadas.',
    ]));
    return;
  }

  // La primera vez, se abre la última práctica y nada más.
  if (!practicas.desplegadas) practicas.desplegadas = new Set([practicas.lista[0].id]);

  /* Agrupadas por mes. Una temporada son casi cincuenta prácticas: de corrido
     es un rollo interminable, por mes se sabe siempre dónde está uno. */
  const meses = [];
  practicas.lista.forEach((p) => {
    const clave = p.fecha.slice(0, 7);
    let grupo = meses.length && meses[meses.length - 1].clave === clave
      ? meses[meses.length - 1]
      : null;
    if (!grupo) { grupo = { clave, practicas: [] }; meses.push(grupo); }
    grupo.practicas.push(p);
  });

  meses.forEach((m) => {
    raiz.appendChild(el('div', { class: 'mes' }, [
      nombreDelMes(m.clave),
      el('span', { class: 'raya' }),
      el('em', {}, [m.practicas.length + (m.practicas.length === 1 ? ' práctica' : ' prácticas')]),
    ]));
    m.practicas.forEach((p) => raiz.appendChild(tarjetaDePractica(p)));
  });
}

/** 'Septiembre 2026' a partir de '2026-09'. */
function nombreDelMes(clave) {
  const d = new Date(clave + '-15T12:00:00');
  const txt = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

/**
 * Una práctica como se veía en la v1: los equipos con sus jugadores a la
 * vista, el marcador de cada enfrentamiento y el MVP con su estrella.
 *
 * Plegada es un solo renglón —fecha, cancha, resultado y MVP—; se toca y se
 * despliegan los equipos. La planilla entera se abre desde el pie.
 */
function tarjetaDePractica(p) {
  const equipos = Object.keys(p.equipos || {});
  const orden = ['azul', 'blanco', 'colorado', 'bicolor'];
  const columnas = orden.filter((c) => equipos.includes(c));

  const marcadores = (p.partidos || []).filter((x) => x.golesA !== null && x.golesA !== undefined);
  const abierta = practicas.desplegadas.has(p.id);

  const marcador = marcadores.length
    ? el('span', { class: 'marcadores' }, [
      ...marcadores.map((x) => el('span', {}, golesEnColor(x))),
      // Plegada, el MVP viaja abajo del resultado; abierta va en el pie.
      !abierta && p.mvp
        ? el('span', { class: 'mvp-chico' }, [estrella(10), p.mvp])
        : null,
    ].filter(Boolean))
    : el('span', { class: 'marca pendiente' }, ['sin resultado']);

  return el('div', { class: 'card practica' + (abierta ? '' : ' plegada') }, [
    el('button', {
      type: 'button', class: 'practica-cabecera', 'aria-expanded': abierta,
      onclick: () => {
        if (abierta) practicas.desplegadas.delete(p.id);
        else practicas.desplegadas.add(p.id);
        render();
      },
    }, [
      el('span', { style: 'flex:1;min-width:0' }, [
        el('b', {}, [fechaLarga(p.fecha)]),
        el('span', {}, ['Cancha ' + p.cancha + ' · ' + p.hora + ' hs · ' + p.formato + ' jugadores']),
      ]),
      marcador,
      icono(abierta ? 'arriba' : 'abajo', 16, 'flecha'),
    ]),

    abierta
      ? el('div', { class: 'equipos-grid' }, columnas.map((color) =>
        el('div', { class: 'equipo-col' }, [
          el('h4', { class: 'color ' + color }, [Hoja.LABEL[color]]),
          ...p.equipos[color].map((j) => el('div', { class: 'renglon-jug' }, [
            el('span', {}, [j.apodo]),
            el('em', {}, [hcp(j.handicap)]),
          ])),
        ])))
      : null,

    abierta
      ? el('div', { class: 'pie-practica' }, [
        p.mvp ? estrella(13) : null,
        p.mvp ? 'MVP' : null,
        p.mvp ? el('b', {}, [p.mvp]) : el('span', { style: 'color:var(--muted)' }, ['sin MVP']),
        el('span', { style: 'flex:1' }),
        el('button', {
          type: 'button', class: 'ver-planilla',
          onclick: () => abrirPractica(p.id),
        }, ['Ver la planilla', icono('derecha', 14)]),
      ].filter(Boolean))
      : null,
  ]);
}

/* --------------------------------------------------------------- plantel */

const nuevo = {
  nombre: '', apodo: '', handicap: 0, hcp_interno: 0,
  categoria: 'socio', invitado_por: '', abierto: false, error: null,
};

/**
 * El jugador que se está corrigiendo. `id` es cuál está abierto —uno solo a la
 * vez— y el resto es lo que se está escribiendo, que recién viaja al guardar:
 * así se puede arrepentir sin haber tocado nada.
 */
const corrigiendo = { id: null, campos: null, error: null };

function abrirCorreccion(j) {
  if (corrigiendo.id === j.id) {
    corrigiendo.id = null;
    corrigiendo.campos = null;
  } else {
    corrigiendo.id = j.id;
    corrigiendo.campos = {
      nombre: j.nombre,
      apodo: j.apodo,
      hcp_interno: j.hcp_interno,
      handicap: j.handicap,
      categoria: j.categoria,
      invitado_por: j.invitado_por_id || '',
      activo: j.activo,
    };
  }
  corrigiendo.error = null;
  render();
}

/** '14/3' a partir de '1987-03-14'. El año del jugador no se muestra. */
function diaYMes(iso) {
  const [, mes, dia] = String(iso).split('-').map(Number);
  return dia + '/' + mes;
}

/** Un desplegable con el plantel, para elegir quién invita. */
function selectorDeJugador(elegidoId, alElegir) {
  const s = el('select', { 'aria-label': 'Quién lo invita' });
  s.appendChild(el('option', { value: '' }, ['— elegí un jugador —']));
  estado.plantel
    .filter((j) => j.activo && j.categoria !== 'invitado')
    .slice()
    .sort((a, b) => a.apodo.localeCompare(b.apodo))
    .forEach((j) => {
      const o = el('option', { value: j.id }, [j.apodo + ' · ' + j.nombre]);
      if (j.id === elegidoId) o.selected = true;
      s.appendChild(o);
    });
  s.addEventListener('change', (e) => alElegir(e.target.value));
  return s;
}

/**
 * El cartel de cumpleaños del plantel. El día que alguien cumple se pone en
 * rojo —y con él el ícono de la solapa— para que los admins no se lo pierdan.
 */
function cartelDeCumples() {
  const c = estado.cumples;
  if (!c) return el('span');

  if (c.hoy.length) {
    const quienes = c.hoy.map((x) => x.apodo);
    return el('div', { class: 'cumple hoy' }, [
      icono('cumple', 20),
      el('div', {}, [
        el('b', {}, [quienes.length === 1 ? 'Hoy cumple ' + quienes[0] : 'Hoy cumplen ' + enLista(quienes)]),
        el('span', {}, ['Mandale el saludo al grupo.']),
      ]),
    ]);
  }

  if (!c.proximo) {
    return el('div', { class: 'cumple' }, [
      icono('cumple', 20),
      el('div', {}, [
        el('b', {}, ['Todavía nadie cargó su cumpleaños']),
        el('span', {}, ['Cada uno la carga la primera vez que entra a la app.']),
      ]),
    ]);
  }

  const p = c.proximo;
  return el('div', { class: 'cumple' }, [
    icono('cumple', 20),
    el('div', {}, [
      el('b', {}, ['El próximo cumpleaños es el de ' + p.apodo]),
      el('span', {}, [
        'El ' + p.dia + '/' + p.mes
        + (p.dias === 1 ? ', mañana' : ', en ' + p.dias + ' días')
        + (c.cargados < c.total ? ' · ' + (c.total - c.cargados) + ' sin cargar' : ''),
      ]),
    ]),
  ]);
}

const enLista = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1]);

async function cargarPlantel() {
  estado.plantel = (await pedir('/api/jugadores')).jugadores;
}

function vistaPlantel(raiz) {
  raiz.appendChild(titulo('Plantel'));
  raiz.appendChild(cartelDeCumples());

  raiz.appendChild(el('button', {
    class: nuevo.abierto ? 'ghost' : 'primary', type: 'button',
    onclick: () => { nuevo.abierto = !nuevo.abierto; nuevo.error = null; render(); },
  }, [nuevo.abierto ? 'Cancelar' : 'Sumar un jugador']));

  if (nuevo.abierto) {
    const campo = (etiqueta, control) =>
      el('label', { class: 'campo' }, [el('span', {}, [etiqueta]), control]);

    raiz.appendChild(el('div', { class: 'card p', style: 'margin-top:10px' }, [
      campo('Nombre y apellido', el('input', {
        type: 'text', value: nuevo.nombre, placeholder: 'Ardissone Joaquín',
        oninput: (e) => { nuevo.nombre = e.target.value; },
      })),
      campo('Cómo va en la planilla', el('input', {
        type: 'text', value: nuevo.apodo, placeholder: 'Joaco',
        oninput: (e) => { nuevo.apodo = e.target.value; },
      })),
      el('div', { class: 'grilla-2' }, [
        campo('HCP interno', el('input', {
          type: 'number', value: nuevo.hcp_interno, min: -2, max: 10, step: 1,
          oninput: (e) => { nuevo.hcp_interno = e.target.value; },
        })),
        campo('HCP AAP', el('input', {
          type: 'number', value: nuevo.handicap, min: -2, max: 10, step: 1,
          oninput: (e) => { nuevo.handicap = e.target.value; },
        })),
      ]),
      campo('Categoría', el('div', { class: 'chips' }, ['socio', 'temporario', 'invitado'].map((c) =>
        el('button', {
          type: 'button', class: 'chip', 'aria-pressed': nuevo.categoria === c,
          onclick: () => { nuevo.categoria = c; render(); },
        }, [c])))),
      // Al invitado se le anota quién lo trajo: es de las primeras cosas que
      // se preguntan en el club cuando aparece una cara nueva.
      nuevo.categoria === 'invitado'
        ? campo('Quién lo invita', selectorDeJugador(nuevo.invitado_por, (id) => { nuevo.invitado_por = id; }))
        : null,
      nuevo.error ? aviso('mal', nuevo.error) : null,
      el('button', {
        class: 'primary', type: 'button', style: 'margin-top:10px',
        onclick: (e) => conBoton(e.target, async () => {
          nuevo.error = null;
          try {
            await pedir('/api/jugadores', {
              method: 'POST',
              body: JSON.stringify({
                nombre: nuevo.nombre, apodo: nuevo.apodo,
                handicap: nuevo.handicap, hcp_interno: nuevo.hcp_interno,
                categoria: nuevo.categoria,
                invitado_por: nuevo.invitado_por || null,
              }),
            });
            await cargarPlantel();
            Object.assign(nuevo, {
              nombre: '', apodo: '', handicap: 0, hcp_interno: 0,
              invitado_por: '', abierto: false,
            });
          } catch (err) {
            nuevo.error = err.message;
          }
        }),
      }, ['Guardar']),
    ]));
  }

  // Cada jugador se toca y se abre para corregirlo. La lista no puede ser una
  // `.lista.tabla` con los renglones adentro, porque el formulario tiene que
  // meterse entre dos: por eso cada uno va con su bloque propio.
  raiz.appendChild(el('div', { class: 'lista tabla plantel', style: 'margin-top:14px' },
    estado.plantel.map((j) => {
      const abierto = corrigiendo.id === j.id;
      return el('div', { class: 'renglon-plantel' }, [
        el('button', {
          type: 'button',
          class: 'quien fila-jugador' + (j.activo ? '' : ' apagado') + (abierto ? ' abierta' : ''),
          onclick: () => abrirCorreccion(j),
        }, [
          el('span', { style: 'flex:1' }, [
            el('b', {}, [j.apodo]),
            el('span', {}, [
              j.nombre + ' · ' + j.categoria
              + (j.invitado_por ? ' de ' + j.invitado_por : '')
              + (j.activo ? '' : ' · dado de baja')
              + (j.activado ? '' : ' · sin entrar todavía')
              + (j.fecha_nacimiento ? ' · cumple ' + diaYMes(j.fecha_nacimiento) : ''),
            ]),
          ]),
          // Primero la flecha con lo que le movieron los resultados y después,
          // más grande y a la derecha, el handicap con el que hoy se arman los
          // equipos: ese es el número que importa, el otro explica de dónde sale.
          ajusteConFlecha(j.ajuste),
          el('span', { class: 'hcp-actual' }, [hcp(j.hcp_efectivo)]),
          icono(abierto ? 'arriba' : 'abajo', 15, 'flechita'),
        ].filter(Boolean)),
        abierto ? formularioDeCorreccion(j) : null,
      ].filter(Boolean));
    })));
}

/**
 * Corregir un jugador que ya está.
 *
 * El HCP interno es el único número que se toca seguido, así que va primero y
 * con el cartel que explica qué pasa al cambiarlo: el ajuste que se ganó
 * jugando no se pierde, se recalcula solo sobre el número nuevo.
 */
function formularioDeCorreccion(j) {
  const c = corrigiendo.campos;
  const campo = (etiqueta, control, pista) =>
    el('label', { class: 'campo' }, [
      el('span', {}, [etiqueta]),
      control,
      pista ? el('em', { class: 'pista-campo' }, [pista]) : null,
    ].filter(Boolean));

  return el('div', { class: 'desplegado corregir' }, [
    el('div', { class: 'grilla-2' }, [
      campo('HCP interno', el('input', {
        type: 'number', value: c.hcp_interno, min: -2, max: 10, step: 1, inputmode: 'numeric',
        oninput: (e) => { c.hcp_interno = e.target.value; },
      }), 'el del club'),
      campo('HCP AAP', el('input', {
        type: 'number', value: c.handicap, min: -2, max: 10, step: 1, inputmode: 'numeric',
        oninput: (e) => { c.handicap = e.target.value; },
      }), 'el oficial'),
    ]),
    // Lo que más se pregunta al cambiar un handicap, contestado antes de que lo
    // pregunten: los resultados viejos no se tocan.
    j.ajuste
      ? el('p', { class: 'pista' }, [
        'Hoy juega de ' + hcp(j.hcp_efectivo) + ': ' + hcp(j.hcp_interno)
        + ' que le pusiste, ' + (j.ajuste > 0 ? 'más ' : 'menos ')
        + Math.abs(j.ajuste) + ' que se ganó jugando. Si cambiás el de arriba, '
        + 'eso que se ganó no se pierde: se vuelve a sumar sobre el número nuevo.',
      ])
      : null,
    campo('Cómo va en la planilla', el('input', {
      type: 'text', value: c.apodo, maxlength: 20,
      oninput: (e) => { c.apodo = e.target.value; },
    }), 'el apodo corto, el que entra en la planilla'),
    campo('Nombre y apellido', el('input', {
      type: 'text', value: c.nombre, maxlength: 60,
      oninput: (e) => { c.nombre = e.target.value; },
    })),
    campo('Categoría', el('div', { class: 'chips tres' }, ['socio', 'temporario', 'invitado'].map((x) =>
      el('button', {
        type: 'button', class: 'chip', 'aria-pressed': c.categoria === x,
        onclick: () => { c.categoria = x; render(); },
      }, [x])))),
    c.categoria === 'invitado'
      ? campo('Quién lo invita', selectorDeJugador(c.invitado_por, (id) => { c.invitado_por = id; }))
      : null,
    // Baja, no borrado: sus prácticas, sus puntos y sus caballos quedan.
    el('label', { class: 'campo tilde' }, [
      el('input', {
        type: 'checkbox', checked: !c.activo,
        onchange: (e) => { c.activo = !e.target.checked; render(); },
      }),
      el('span', {}, ['Darlo de baja']),
      el('em', {}, ['deja de aparecer para armar prácticas; no se borra nada de lo que jugó']),
    ]),
    corrigiendo.error ? aviso('mal', corrigiendo.error) : null,
    el('div', { class: 'acciones' }, [
      el('button', {
        class: 'primary', type: 'button',
        // `conBoton` deja el error en `corrigiendo.error` si algo falla, y en
        // ese caso lo de abajo no corre: el formulario queda abierto con lo
        // que se escribió, que es lo que uno quiere cuando le rebotan algo.
        onclick: (e) => conBoton(e.target, async () => {
          await pedir('/api/jugadores', {
            method: 'POST',
            body: JSON.stringify({ id: j.id, ...c }),
          });
          await cargarPlantel();
          corrigiendo.id = null;
          corrigiendo.campos = null;
        }, corrigiendo),
      }, ['Guardar']),
      el('button', {
        class: 'link', type: 'button', onclick: () => abrirCorreccion(j),
      }, ['Cancelar']),
    ]),
  ].filter(Boolean));
}

/* ----------------------------------------------------------------- marco */

/* Las solapas, con su ícono dibujado arriba del texto: así entran más de
   ancho, y el dibujo se ve igual en todos los teléfonos. */
/* El orden es el que pidió el club: primero lo que se mira todos los días
   —el ranking y la ficha propia—, después los caballos, y las herramientas de
   organizar al final. */
/* Anotación va primera —es lo que se toca durante la semana, todos los días— y
   solo si está prendida en esta copia: mientras el club no la use, la solapa no
   está y Armar elige del plantel como siempre. */
const PESTANAS_ADMIN = [
  ['anotacion', 'Anotación'],
  ['ranking', 'Ranking'], ['jugador', 'Jugador'], ['caballos', 'Caballos'],
  ['practicas', 'Prácticas'], ['armar', 'Armar'], ['plantel', 'Plantel'],
  ['canchas', 'Canchas'],
];
const PESTANAS_JUGADOR = [
  ['anotacion', 'Anotación'],
  ['ranking', 'Ranking'], ['jugador', 'Jugador'], ['caballos', 'Caballos'],
  ['practicas', 'Prácticas'],
];

const lasPestanas = () => (estado.jugador.admin ? PESTANAS_ADMIN : PESTANAS_JUGADOR)
  .filter(([id]) => id !== 'anotacion' || estado.conAnotacion);

/** Lo que cada solapa necesita traído, la primera vez que se la mira. */
function alEntrarA(id) {
  // Anotación se vuelve a pedir cada vez que se entra: en el rato que uno
  // estuvo en otra pestaña se pudo anotar media docena de gente.
  if (id === 'anotacion') cargarAnotacion().then(render);
  // Armar mira la misma lista, así que entra con lo último y con el día y la
  // hora que puso la convocatoria: no hay que volver a tipearlos.
  if (id === 'armar' && estado.conAnotacion) {
    cargarAnotacion().then(() => { copiarElDiaDeLaLista(); render(); });
  }
  if (id === 'ranking' && (!ranking.lista || rankingSucio)) cargarRanking();
  if (id === 'jugador' && (!miFicha.datos || rankingSucio)) abrirJugador(estado.jugador.id, 'mi');
  if (id === 'canchas' && !canchas.datos) cargarCanchas();
  // Si la carga inicial se cayó, volver a tocar la solapa vuelve a intentar.
  // Antes había que cerrar la app entera para salir de "Cargando…".
  if (id === 'caballos' && !caballos.eventos) cargarJornadas();
}

function pestanas() {
  const cuales = lasPestanas();

  return el('div', { class: 'barra-pestanas' }, [
    el('nav', { class: 'pestanas' }, cuales.map(([id, texto]) =>
      el('button', {
        type: 'button', class: 'pestana', 'aria-pressed': estado.vista === id,
        onclick: () => {
          // Al salir de la carga de caballos se guarda lo que quedó pendiente.
          if (estado.vista === 'caballos' && id !== 'caballos') guardarAhora();
          estado.vista = id;
          alEntrarA(id);
          render();
        },
      }, [
        icono(id, 19, id === 'plantel' && hayCumpleHoy() ? 'de-cumple' : null),
        el('span', {}, [texto]),
      ]))),
  ]);
}

function render() {
  const app = vaciar(document.getElementById('app'));
  app.appendChild(pestanas());

  const raiz = el('div');
  app.appendChild(raiz);

  if (estado.vista === 'anotacion') vistaAnotacion(raiz);
  else if (estado.vista === 'armar' && estado.jugador.admin) {
    if (armado.cambiando) vistaCambiar(raiz); else vistaArmar(raiz);
  } else if (estado.vista === 'plantel' && estado.jugador.admin) vistaPlantel(raiz);
  else if (estado.vista === 'caballos') vistaCaballos(raiz);
  else if (estado.vista === 'ranking') vistaRanking(raiz);
  else if (estado.vista === 'jugador') vistaJugador(raiz);
  else if (estado.vista === 'canchas' && estado.jugador.admin) vistaCanchas(raiz);
  else vistaPracticas(raiz);

  app.appendChild(el('div', { class: 'salir' }, [
    el('button', {
      class: 'link', type: 'button',
      onclick: async () => { await pedir('/api/salir', { method: 'POST' }); location.reload(); },
    }, ['Salir de este teléfono']),
    // La versión, chiquita. Sirve para una sola cosa, pero importante: saber si
    // lo que estás mirando es lo último que se subió o quedó el código viejo.
    el('div', { class: 'version' }, ['versión ' + VERSION]),
  ]));
}

/** ¿Cumple alguien hoy? Solo lo sabe un admin: el dato no sale para el resto. */
const hayCumpleHoy = () => !!(estado.cumples && estado.cumples.hoy.length);

/** Arranca la parte de adentro: trae lo que hace falta y dibuja. */
async function adentro(jugador, temporada, cumples) {
  estado.jugador = jugador;
  estado.temporada = temporada || null;
  estado.cumples = cumples || null;
  // La app abre en el ranking, que es lo que más se mira.
  estado.vista = 'ranking';

  document.getElementById('subtitulo').textContent = jugador.apodo;
  const chip = vaciar(document.getElementById('chip-admin'));
  if (jugador.admin) chip.appendChild(el('span', { class: 'pill admin' }, ['ADMIN']));

  render();
  alEntrarA(estado.vista);
  if (jugador.admin) {
    try { await cargarPlantel(); } catch (e) { armado.error = e.message; }
    render();
  }

  // …salvo que haya una lista abierta y todavía no te hayas anotado: ahí abre
  // en Anotación, que es a lo que venías.
  if (estado.conAnotacion) {
    await cargarAnotacion();
    const d = anotacion.datos;
    if (estado.vista === 'ranking' && d && d.convocatoria && !d.convocatoria.cerrada
        && !d.yo.anotado) {
      estado.vista = 'anotacion';
    }
    render();
  }

  cargarPracticas();
  cargarJornadas();
}

// Si cierra la app con algo sin guardar, se manda igual antes de irse.
window.addEventListener('pagehide', () => {
  if (estado.jugador && estado.vista === 'caballos') guardarAlSalir();
});
