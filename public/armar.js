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
  planilla: null,      // lo que devolvió el servidor
  cabecera: null,      // la cabecera con la que se armó esa planilla
  guardada: null,      // la práctica ya publicada
  error: null,
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

function alternar(id) {
  const ya = elegido(id);
  if (ya) {
    armado.elegidos = armado.elegidos.filter((e) => e.id !== id);
  } else {
    const color = colorConLugar();
    if (!color) return;
    armado.elegidos.push({ id, color });
  }
  armado.planilla = null;
  armado.guardada = null;
  const siguiente = colorConLugar();
  if (siguiente) armado.colorActivo = siguiente;
  render();
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
}

const cabeceraActual = () => ({
  fecha: armado.fecha, hora: armado.hora, cancha: armado.cancha, notas: armado.notas,
});

/* --------------------------------------------------------------- servidor */

async function pedirPlanilla({ balancear, guardar }) {
  armado.error = null;
  const cuerpo = {
    ...cabeceraActual(),
    formato: armado.cantidad,
    guardar: !!guardar,
  };
  if (balancear) cuerpo.seleccion = armado.elegidos.map((e) => e.id);
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
  // La imagen se prepara ya, para que compartir salga en un solo toque.
  Hoja.preparar(r.planilla, armado.cabecera).catch(() => {});
  return r;
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

/* ------------------------------------------------------------ vista armar */

function vistaArmar(raiz) {
  raiz.appendChild(el('h2', {}, ['La práctica']));

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
    campo('Cancha', el('div', { class: 'chips' }, [1, 2, 3, 4, 5, 6].map((n) =>
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

  /* ---- plantel */

  const activos = estado.plantel.filter((j) => j.activo);
  raiz.appendChild(el('div', { class: 'lista' }, activos.map((j) => {
    const marca = elegido(j.id);
    const posicion = marca ? armado.elegidos.indexOf(marca) + 1 : null;
    return el('button', {
      type: 'button', class: 'quien' + (marca ? ' puesto ' + marca.color : ''),
      onclick: () => alternar(j.id),
    }, [
      el('span', { class: 'orden' }, [marca ? String(posicion) : '']),
      el('span', { style: 'flex:1' }, [
        el('b', {}, [j.apodo]),
        el('span', {}, [j.nombre]),
      ]),
      el('span', { class: 'hcp' }, [hcp(j.hcp_interno)]),
    ]);
  })));

  if (!activos.length) {
    raiz.appendChild(el('div', { class: 'vacio' }, ['No hay nadie en el plantel todavía.']));
  }

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
        onclick: () => { armado.elegidos = []; armado.planilla = null; armado.guardada = null; render(); },
      }, ['Empezar de nuevo'])
      : null,
  ]));

  if (armado.error) raiz.appendChild(aviso('mal', armado.error));

  if (armado.planilla) {
    raiz.appendChild(el('h2', {}, [armado.guardada ? 'Publicada' : 'Así queda']));
    raiz.appendChild(panelPlanilla(armado.planilla, armado.cabecera, !armado.guardada));
  }
}

/* ----------------------------------------------------------- la planilla */

function panelPlanilla(planilla, cabecera, sinPublicar) {
  const caja = el('div', { class: 'card p' });

  caja.appendChild(el('div', { class: 'cabecera-hoja' }, [
    el('b', {}, [Hoja.fechaCorta(cabecera.fecha)]),
    el('span', {}, ['Cancha ' + cabecera.cancha + ' · ' + cabecera.hora + ' hs · '
      + planilla.chukkers + ' chukkers']),
  ]));

  const columnas = el('div', { class: 'equipos-tabla' });
  planilla.equipos.forEach((color) => {
    columnas.appendChild(el('div', { class: 'equipo' }, [
      el('h3', { class: 'color ' + color }, [Hoja.LABEL[color]]),
      ...planilla.jugadores.filter((j) => j.color === color).map((j) =>
        el('div', { class: 'renglon' + (j.todos ? ' de-mas' : '') }, [
          el('span', {}, [j.apodo]),
          j.nota ? el('em', {}, [j.nota]) : null,
        ])),
      planilla.hcpConocido
        ? el('div', { class: 'suma' }, ['HCP ' + planilla.hcpPorEquipo[color]])
        : null,
    ]));
  });
  caja.appendChild(columnas);

  const bicolor = planilla.jugadores.find((j) => j.color === 'bicolor');
  if (bicolor) {
    caja.appendChild(el('div', { class: 'equipo bicolor-caja' }, [
      el('h3', { class: 'color bicolor' }, ['BICOLOR']),
      el('div', { class: 'renglon' }, [el('span', {}, [bicolor.apodo]), el('em', {}, [bicolor.nota])]),
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
  if (sinPublicar) {
    acciones.appendChild(el('button', {
      class: 'primary', type: 'button',
      onclick: (e) => conBoton(e.target, async () => {
        await pedirPlanilla({ balancear: false, guardar: true });
        armado.elegidos = [];   // lista para cargar la próxima
        armado.colorActivo = coloresDe(armado.cantidad)[0];
        practicas.lista = null;
        cargarPracticas();      // para que aparezca en la otra pestaña
      }),
    }, ['Publicar la práctica']));
  }
  acciones.appendChild(el('button', {
    class: sinPublicar ? 'ghost' : 'primary', type: 'button',
    onclick: (e) => Hoja.compartir(planilla, cabecera, e.target),
  }, ['Compartir la imagen']));
  acciones.appendChild(el('button', {
    class: 'ghost', type: 'button',
    onclick: (e) => Hoja.copiar(planilla, cabecera, e.target),
  }, ['Copiar en texto']));
  caja.appendChild(acciones);

  if (!sinPublicar) {
    caja.appendChild(aviso('ok', 'Quedó guardada. Ya la podés mandar al grupo.'));
  }

  return caja;
}

/* ------------------------------------------------------------- prácticas */

const practicas = {
  lista: null, abierta: null, error: null, borrando: false,
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
      el('b', {}, [p.golesA + ' - ' + p.golesB]),
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

function vistaPracticas(raiz) {
  if (practicas.abierta) {
    const { practica, planilla } = practicas.abierta;
    raiz.appendChild(el('button', {
      class: 'link', type: 'button',
      onclick: () => { practicas.abierta = null; practicas.borrando = false; render(); },
    }, ['‹ Volver a la lista']));
    raiz.appendChild(panelPlanilla(planilla, {
      fecha: practica.fecha.slice(0, 10),
      hora: String(practica.hora).slice(0, 5),
      cancha: practica.cancha,
      notas: practica.notas || '',
      // Lo que hace que la planilla exportada salga con el marcador y el MVP.
      partidos: practicas.abierta.partidos,
      mvp: practicas.abierta.mvp ? practicas.abierta.mvp.apodo : null,
    }, false));

    const marcador = panelMarcador(practicas.abierta);
    if (marcador) raiz.appendChild(marcador);
    if (estado.jugador.admin) raiz.appendChild(panelCargarResultado(practicas.abierta));

    if (practicas.error) raiz.appendChild(aviso('mal', practicas.error));
    if (estado.jugador.admin) raiz.appendChild(panelBorrar(practica));
    return;
  }

  raiz.appendChild(el('h2', {}, ['Prácticas de la temporada']));

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

  raiz.appendChild(el('div', { class: 'lista' }, practicas.lista.map((p) =>
    el('button', {
      type: 'button', class: 'quien',
      onclick: () => abrirPractica(p.id),
    }, [
      el('span', { style: 'flex:1;min-width:0' }, [
        el('b', {}, [fechaLarga(p.fecha.slice(0, 10))]),
        el('span', {}, ['Cancha ' + p.cancha + ' · ' + String(p.hora).slice(0, 5)
          + ' hs · ' + p.formato + ' jugadores']),
      ]),
      p.marcador
        ? el('span', { class: 'marca listo' }, [p.marcador])
        : el('span', { class: 'marca pendiente' }, ['sin resultado']),
    ]))));
}

/* --------------------------------------------------------------- plantel */

const nuevo = { nombre: '', apodo: '', handicap: 0, hcp_interno: 0, categoria: 'socio', abierto: false, error: null };

async function cargarPlantel() {
  estado.plantel = (await pedir('/api/jugadores')).jugadores;
}

function vistaPlantel(raiz) {
  raiz.appendChild(el('h2', {}, ['Plantel']));

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
              }),
            });
            await cargarPlantel();
            Object.assign(nuevo, { nombre: '', apodo: '', handicap: 0, hcp_interno: 0, abierto: false });
          } catch (err) {
            nuevo.error = err.message;
          }
        }),
      }, ['Guardar']),
    ]));
  }

  raiz.appendChild(el('div', { class: 'lista', style: 'margin-top:14px' },
    estado.plantel.map((j) => el('div', { class: 'quien estatico' + (j.activo ? '' : ' apagado') }, [
      el('span', { style: 'flex:1' }, [
        el('b', {}, [j.apodo]),
        el('span', {}, [j.nombre + ' · ' + j.categoria + (j.activado ? '' : ' · sin entrar todavía')]),
      ]),
      el('span', { class: 'hcp' }, [hcp(j.hcp_interno)]),
    ]))));
}

/* ----------------------------------------------------------------- marco */

/* Las pestañas, con su ícono como en la v1. Son varias: se deslizan. */
const PESTANAS_ADMIN = [
  ['armar', '🏇 Armar'], ['practicas', '📋 Prácticas'], ['ranking', '🏆 Ranking'],
  ['jugador', '👤 Jugador'], ['canchas', '🏟️ Canchas'], ['caballos', '🐴 Caballos'],
  ['plantel', '👥 Plantel'],
];
const PESTANAS_JUGADOR = [
  ['practicas', '📋 Prácticas'], ['ranking', '🏆 Ranking'], ['jugador', '👤 Jugador'],
  ['canchas', '🏟️ Canchas'], ['caballos', '🐴 Caballos'],
];

/** Lo que cada solapa necesita traído, la primera vez que se la mira. */
function alEntrarA(id) {
  if (id === 'ranking' && (!ranking.lista || rankingSucio)) cargarRanking();
  if (id === 'jugador' && (!miFicha.datos || rankingSucio)) abrirJugador(estado.jugador.id, 'mi');
  if (id === 'canchas' && !canchas.datos) cargarCanchas();
}

function pestanas() {
  const cuales = estado.jugador.admin ? PESTANAS_ADMIN : PESTANAS_JUGADOR;

  return el('nav', { class: 'pestanas' }, cuales.map(([id, texto]) =>
    el('button', {
      type: 'button', class: 'pestana', 'aria-pressed': estado.vista === id,
      onclick: () => {
        // Al salir de la carga de caballos se guarda lo que quedó pendiente.
        if (estado.vista === 'caballos' && id !== 'caballos') guardarAhora();
        estado.vista = id;
        alEntrarA(id);
        render();
      },
    }, [texto])));
}

function render() {
  const app = vaciar(document.getElementById('app'));
  app.appendChild(pestanas());

  const raiz = el('div');
  app.appendChild(raiz);

  if (estado.vista === 'armar' && estado.jugador.admin) vistaArmar(raiz);
  else if (estado.vista === 'plantel' && estado.jugador.admin) vistaPlantel(raiz);
  else if (estado.vista === 'caballos') vistaCaballos(raiz);
  else if (estado.vista === 'ranking') vistaRanking(raiz);
  else if (estado.vista === 'jugador') vistaJugador(raiz);
  else if (estado.vista === 'canchas') vistaCanchas(raiz);
  else vistaPracticas(raiz);

  app.appendChild(el('div', { class: 'salir' }, [
    el('button', {
      class: 'link', type: 'button',
      onclick: async () => { await pedir('/api/salir', { method: 'POST' }); location.reload(); },
    }, ['Salir de este teléfono']),
  ]));
}

/** Arranca la parte de adentro: trae lo que hace falta y dibuja. */
async function adentro(jugador, temporada) {
  estado.jugador = jugador;
  estado.temporada = temporada || null;
  estado.vista = jugador.admin ? 'armar' : 'practicas';

  document.getElementById('subtitulo').textContent = jugador.apodo;
  const chip = vaciar(document.getElementById('chip-admin'));
  if (jugador.admin) chip.appendChild(el('span', { class: 'pill admin' }, ['ADMIN']));

  render();
  if (jugador.admin) {
    try { await cargarPlantel(); } catch (e) { armado.error = e.message; }
    render();
  }
  cargarPracticas();
  cargarJornadas();
}

// Si cierra la app con algo sin guardar, se manda igual antes de irse.
window.addEventListener('pagehide', () => {
  if (estado.jugador && estado.vista === 'caballos') guardarAlSalir();
});
