/* ===========================================================================
   Anotación: quién juega el próximo día.

   Antes la lista era el grupo de WhatsApp: el que se acordaba escribía "voy" y
   el que armaba contaba mensajes para atrás. Acá el orden de llegada lo guarda
   la base con la hora exacta, y de esa lista salen después las prácticas.

   La regla del club, puesta en una línea: el último que se anota es el primero
   que queda afuera. Por eso la lista nunca se reordena sola.
   =========================================================================== */

const anotacion = {
  datos: null,        // { convocatoria, anotados, yo } tal como lo manda el servidor
  error: null,
  // El formulario para abrir la lista del próximo día (solo administradores).
  nueva: { abierta: false, fecha: '', hora: '20:00', notas: '' },
  sumando: false,     // está abierto el buscador para sumar a alguien a mano
  filtro: '',
  borrando: false,
};

/* --------------------------------------------------------------- servidor */

async function cargarAnotacion() {
  try {
    anotacion.datos = await pedir('/api/anotaciones');
    anotacion.error = null;
  } catch (e) {
    anotacion.error = e.message;
  }
}

/** Todas las acciones vuelven con la lista entera, así la pantalla no adivina. */
async function accionAnotacion(cuerpo) {
  anotacion.datos = await pedir('/api/anotaciones', {
    method: 'POST', body: JSON.stringify(cuerpo),
  });
}

/* ----------------------------------------------------------------- fechas */

/**
 * Cuándo se anotó, como se lo dice uno a otro: 'hoy 19:42', 'mar 21:05'.
 * La hora viaja en UTC y se muestra en la del teléfono, que es la del club.
 */
function cuandoSeAnoto(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dos = (n) => String(n).padStart(2, '0');
  const reloj = dos(d.getHours()) + ':' + dos(d.getMinutes());
  if (d.toDateString() === new Date().toDateString()) return 'hoy ' + reloj;
  return d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '') + ' ' + reloj;
}

/** El próximo viernes, que es cuando juega el club casi siempre. */
function proximoViernes() {
  const d = new Date();
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
  const dos = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate());
}

/* ------------------------------------------------------ cuántas prácticas */

const FORMATOS_POSIBLES = [12, 10, 9, 8];

/**
 * Con cuántos anotados salen cuántas prácticas. Busca la combinación que deja
 * menos gente afuera y, entre las que empatan, la de menos prácticas: con 18
 * es mejor una de 10 y una de 8 que dos de 9 y uno mirando.
 */
function comoSalen(cuantos) {
  if (cuantos < 8) return null;
  let mejor = null;
  const buscar = (resto, desde, armadas) => {
    if (armadas.length) {
      const gana = !mejor || resto < mejor.sobran
        || (resto === mejor.sobran && armadas.length < mejor.practicas.length);
      if (gana) mejor = { sobran: resto, practicas: armadas.slice() };
    }
    if (armadas.length >= 4) return;
    for (let i = desde; i < FORMATOS_POSIBLES.length; i += 1) {
      const f = FORMATOS_POSIBLES[i];
      if (f <= resto) {
        armadas.push(f);
        buscar(resto - f, i, armadas);
        armadas.pop();
      }
    }
  };
  buscar(cuantos, 0, []);
  return mejor;
}

/** 'salen dos prácticas: una de 10 y una de 8. Quedan 2 afuera.' */
function textoDeReparto(cuantos) {
  const r = comoSalen(cuantos);
  if (!r) return 'Con ' + cuantos + (cuantos === 1 ? ' anotado' : ' anotados')
    + ' todavía no alcanza: la más chica es de 8.';
  const lista = r.practicas.map((n) => 'una de ' + n);
  const cuales = lista.length === 1 ? lista[0]
    : lista.slice(0, -1).join(', ') + ' y ' + lista[lista.length - 1];
  const verbo = r.practicas.length === 1 ? 'sale' : 'salen';
  return 'Con ' + cuantos + ' anotados ' + verbo + ' ' + cuales + '.'
    + (r.sobran ? ' Quedan ' + r.sobran + ' afuera: los últimos que se anotaron.' : ' Juegan todos.');
}

/* ------------------------------------------------------------------ vista */

function vistaAnotacion(raiz) {
  raiz.appendChild(titulo('Anotación'));

  if (!anotacion.datos) {
    if (anotacion.error) raiz.appendChild(aviso('mal', anotacion.error));
    else raiz.appendChild(el('div', { class: 'vacio' }, ['Cargando…']));
    return;
  }

  const { convocatoria, anotados, yo } = anotacion.datos;
  const admin = estado.jugador.admin;

  if (!convocatoria) {
    raiz.appendChild(el('div', { class: 'vacio' }, [
      admin
        ? 'No hay ninguna lista abierta. Abrí la del próximo día de juego.'
        : 'Todavía no hay práctica para anotarse. Cuando se abra, aparece acá.',
    ]));
    if (anotacion.error) raiz.appendChild(aviso('mal', anotacion.error));
    if (admin) raiz.appendChild(panelAbrirLista());
    return;
  }

  /* ---- el día */

  raiz.appendChild(el('div', { class: 'card p' }, [
    el('div', { class: 'cabecera-hoja', style: 'margin-bottom:0' }, [
      el('b', {}, [fechaLarga(convocatoria.fecha)]),
      el('span', {}, [
        convocatoria.hora + ' hs · '
        + (convocatoria.cerrada ? 'la lista está cerrada' : 'la cancha se define al armar'),
      ]),
    ]),
    convocatoria.notas
      ? el('div', { class: 'nota-hoja' }, [convocatoria.notas])
      : null,
  ].filter(Boolean)));

  /* ---- mi lugar en la lista */

  if (convocatoria.cerrada && !yo.anotado) {
    raiz.appendChild(aviso('nota', 'La lista ya está cerrada. Las planillas salen en Prácticas.'));
  } else if (yo.anotado) {
    raiz.appendChild(el('div', { class: 'anotado', style: 'margin-top:12px' }, [
      icono('listo', 24),
      el('div', { style: 'flex:1;min-width:0' }, [
        el('b', {}, ['Anotado']),
        el('span', {}, [
          'Sos el ' + yo.puesto + 'º de la lista'
          + (yo.cuando ? ' · te anotaste ' + cuandoSeAnoto(yo.cuando) : ''),
        ]),
      ]),
      convocatoria.cerrada ? null : el('button', {
        class: 'link', type: 'button',
        onclick: (e) => conBoton(e.target, () => accionAnotacion({ accion: 'me-bajo' }), anotacion),
      }, ['Me bajo']),
    ].filter(Boolean)));
  } else {
    raiz.appendChild(el('div', { style: 'margin-top:12px' }, [
      el('button', {
        class: 'primary grande', type: 'button',
        onclick: (e) => conBoton(e.target, () => accionAnotacion({ accion: 'juego' }), anotacion),
      }, ['JUEGO']),
    ]));
    raiz.appendChild(el('p', { class: 'pista', style: 'text-align:center' }, [
      'Te podés bajar hasta que se armen las prácticas.',
    ]));
  }

  if (anotacion.error) raiz.appendChild(aviso('mal', anotacion.error));

  /* ---- lo que puede hacer un administrador */

  if (admin) raiz.appendChild(panelDeAdmin(convocatoria, anotados));

  /* ---- la lista */

  raiz.appendChild(el('h2', {}, [
    anotados.length
      ? (anotados.length === 1 ? 'Se anotó 1' : 'Se anotaron ' + anotados.length)
      : 'Todavía no se anotó nadie',
  ]));

  if (!anotados.length) {
    raiz.appendChild(el('div', { class: 'vacio' }, ['Sé el primero.']));
  } else {
    raiz.appendChild(el('div', { class: 'lista tabla' }, anotados.map((a, i) =>
      renglonDeAnotado(a, i + 1, convocatoria, admin))));
  }

  if (admin && anotados.length) {
    raiz.appendChild(el('p', { class: 'pista' }, [textoDeReparto(anotados.length)]));
  }
  if (admin) raiz.appendChild(panelBorrarDelPie(convocatoria, anotados));
}

/** Un renglón de la lista. Un admin lo toca y lo baja; el resto solo mira. */
function renglonDeAnotado(a, puesto, convocatoria, admin) {
  const soyYo = a.jugadorId === estado.jugador.id;
  const puedeBajarlo = admin && !convocatoria.cerrada;

  const hijos = [
    el('span', { class: 'orden' }, [String(puesto)]),
    el('span', { style: 'flex:1;min-width:0' }, [el('b', {}, [a.apodo])]),
    a.aMano ? el('span', { class: 'marca' }, ['SUMADO']) : null,
    soyYo ? el('span', { class: 'marca listo' }, ['VOS']) : null,
    el('span', { class: 'col-chico ancha' }, [cuandoSeAnoto(a.cuando)]),
    // El handicap interno no es público: solo sale hacia un administrador, y
    // el servidor ni siquiera se lo manda al resto.
    a.handicap === undefined ? null : el('span', { class: 'hcp' }, [hcp(a.handicap)]),
  ].filter(Boolean);

  if (!puedeBajarlo) {
    return el('div', { class: 'quien estatico' + (soyYo ? ' yo' : '') }, hijos);
  }
  return el('button', {
    type: 'button', class: 'quien' + (soyYo ? ' yo' : ''),
    title: 'Bajar a ' + a.apodo + ' de la lista',
    onclick: (e) => conBoton(e.target, () =>
      accionAnotacion({ accion: 'me-bajo', jugadorId: a.jugadorId }), anotacion),
  }, hijos);
}

/* ------------------------------------------------------------ el admin */

function panelDeAdmin(convocatoria, anotados) {
  const fuera = el('div');

  fuera.appendChild(el('div', { class: 'dos-botones' }, [
    convocatoria.cerrada ? null : el('button', {
      class: 'ghost', type: 'button',
      onclick: () => { anotacion.sumando = !anotacion.sumando; anotacion.filtro = ''; render(); },
    }, [anotacion.sumando ? 'Cerrar' : 'Sumar a alguien']),
    el('button', {
      class: 'ghost', type: 'button',
      onclick: (e) => copiarLaLista(convocatoria, anotados, e.currentTarget),
    }, [icono('compartir', 16), 'Copiar para el grupo']),
  ].filter(Boolean)));

  fuera.appendChild(el('div', { style: 'text-align:center' }, [
    el('button', {
      class: 'link', type: 'button',
      onclick: (e) => conBoton(e.target, () => accionAnotacion({
        accion: convocatoria.cerrada ? 'reabrir' : 'cerrar',
      }), anotacion),
    }, [convocatoria.cerrada ? 'Reabrir la lista' : 'Cerrar la lista']),
  ]));

  if (convocatoria.cerrada) {
    fuera.appendChild(aviso('nota',
      'Nadie más se puede anotar ni bajar. Armá las prácticas en la solapa Armar.'));
  }

  if (anotacion.sumando) fuera.appendChild(panelSumarAlguien(anotados));
  return fuera;
}

/** Borrar la lista entera. Va al final de todo, lejos de lo que se toca. */
function panelBorrarDelPie(convocatoria, anotados) {
  if (!anotacion.borrando) {
    return el('div', { style: 'text-align:center;margin-top:10px' }, [
      el('button', {
        class: 'link rojo', type: 'button',
        onclick: () => { anotacion.borrando = true; render(); },
      }, ['Borrar la lista del ' + Hoja.fechaCorta(convocatoria.fecha)]),
    ]);
  }
  return panelBorrarLista(convocatoria, anotados);
}

/**
 * Sumar a mano al que no se anotó: el que avisó por teléfono, el invitado que
 * cae. Queda marcado como SUMADO, así en la lista se ve que no se anotó solo.
 */
function panelSumarAlguien(anotados) {
  const ya = new Set(anotados.map((a) => a.jugadorId));
  const texto = (anotacion.filtro || '').trim().toLowerCase();
  const libres = estado.plantel
    .filter((j) => j.activo && !ya.has(j.id))
    .filter((j) => !texto || j.apodo.toLowerCase().includes(texto)
      || j.nombre.toLowerCase().includes(texto));

  return el('div', { class: 'card p', style: 'margin-top:10px' }, [
    el('input', {
      type: 'text', placeholder: 'Buscar en el plantel…', value: anotacion.filtro || '',
      'aria-label': 'Buscar en el plantel',
      oninput: (e) => { anotacion.filtro = e.target.value; render(); },
    }),
    libres.length
      ? el('div', { class: 'lista tabla', style: 'margin-top:10px' },
        libres.slice(0, 40).map((j) => el('button', {
          type: 'button', class: 'quien compacto',
          onclick: (e) => conBoton(e.target, async () => {
            await accionAnotacion({ accion: 'juego', jugadorId: j.id });
            anotacion.filtro = '';
          }, anotacion),
        }, [
          el('span', { class: 'orden' }, ['+']),
          el('span', { style: 'flex:1;min-width:0' }, [el('b', {}, [j.apodo])]),
          el('span', { class: 'hcp' }, [hcp(j.hcp_efectivo)]),
        ])))
      : el('div', { class: 'vacio' }, [
        texto ? 'No hay nadie que coincida.' : 'Ya están todos anotados.',
      ]),
  ]);
}

function panelBorrarLista(convocatoria, anotados) {
  return el('div', { class: 'card p', style: 'margin-top:10px;border-color:var(--rojo)' }, [
    el('div', { style: 'font-size:13px' }, [
      '¿Borrar la lista del ' + fechaLarga(convocatoria.fecha) + '?',
    ]),
    el('div', { class: 'pista' }, [
      anotados.length
        ? 'Se pierden los ' + anotados.length + ' anotados y hay que volver a anotarse. '
          + 'Las prácticas que ya armaste no se tocan.'
        : 'No se puede deshacer.',
    ]),
    el('div', { class: 'acciones' }, [
      el('button', {
        class: 'peligro', type: 'button',
        onclick: (e) => conBoton(e.target, async () => {
          await accionAnotacion({ accion: 'borrar' });
          anotacion.borrando = false;
        }, anotacion),
      }, ['Sí, borrarla']),
      el('button', {
        class: 'ghost', type: 'button',
        onclick: () => { anotacion.borrando = false; render(); },
      }, ['No, dejarla']),
    ]),
  ]);
}

/** Abrir la lista del próximo día. */
function panelAbrirLista() {
  const n = anotacion.nueva;
  if (!n.fecha) n.fecha = proximoViernes();

  if (!n.abierta) {
    return el('div', { class: 'acciones' }, [
      el('button', {
        class: 'primary', type: 'button',
        onclick: () => { n.abierta = true; render(); },
      }, ['Abrir la lista']),
    ]);
  }

  const campo = (etiqueta, control) =>
    el('label', { class: 'campo' }, [el('span', {}, [etiqueta]), control]);

  return el('div', { class: 'card p', style: 'margin-top:12px' }, [
    el('div', { class: 'grilla-2' }, [
      campo('Día de juego', el('input', {
        type: 'date', value: n.fecha,
        onchange: (e) => { n.fecha = e.target.value || proximoViernes(); },
      })),
      campo('Hora', el('input', {
        type: 'time', value: n.hora,
        onchange: (e) => { n.hora = e.target.value || '20:00'; },
      })),
    ]),
    campo('Aviso para el club (opcional)', el('textarea', {
      rows: 2, maxlength: 400, placeholder: 'Ej.: si llueve se suspende, avisamos por el grupo.',
      oninput: (e) => { n.notas = e.target.value; },
    }, [n.notas])),
    el('p', { class: 'pista' }, [
      'La cancha y de cuántos es cada práctica se deciden después, al armar.',
    ]),
    el('div', { class: 'acciones' }, [
      el('button', {
        class: 'primary', type: 'button',
        onclick: (e) => conBoton(e.target, async () => {
          await accionAnotacion({
            accion: 'abrir', fecha: n.fecha, hora: n.hora, notas: n.notas,
          });
          n.abierta = false;
          n.notas = '';
        }, anotacion),
      }, ['Abrir la lista']),
      el('button', {
        class: 'link', type: 'button',
        onclick: () => { n.abierta = false; render(); },
      }, ['Cancelar']),
    ]),
  ]);
}

/* ------------------------------------------------------ para el grupo */

/**
 * El mensaje que se pega en el grupo: el día, el link para anotarse y quiénes
 * van. Es lo que hace que el que no entró todavía entre.
 */
function textoDeLaLista(convocatoria, anotados) {
  const lineas = [
    'PRÁCTICA · ' + fechaLarga(convocatoria.fecha) + ' · ' + convocatoria.hora + ' hs',
  ];
  if (convocatoria.notas) lineas.push(convocatoria.notas);
  lineas.push('');
  if (anotados.length) {
    lineas.push('Van ' + anotados.length + ':');
    anotados.forEach((a, i) => lineas.push((i + 1) + '. ' + a.apodo));
  } else {
    lineas.push('Todavía no se anotó nadie.');
  }
  lineas.push('');
  lineas.push(convocatoria.cerrada
    ? 'La lista está cerrada.'
    : 'Anotate acá: ' + location.origin);
  return lineas.join('\n');
}

/** Deja el botón como estaba: el ícono y su texto. */
function volverAPoner(boton, nombre, texto) {
  vaciar(boton);
  boton.appendChild(icono(nombre, 16));
  boton.appendChild(document.createTextNode(texto));
}

async function copiarLaLista(convocatoria, anotados, boton) {
  const texto = textoDeLaLista(convocatoria, anotados);
  try {
    if (navigator.share) await navigator.share({ text: texto });
    else await navigator.clipboard.writeText(texto);
    boton.textContent = 'Listo';
  } catch (e) {
    // Cancelar el compartir del celular no es un error que haya que mostrar.
    if (e && e.name === 'AbortError') return;
    boton.textContent = 'No se pudo copiar';
  }
  setTimeout(() => volverAPoner(boton, 'compartir', 'Copiar para el grupo'), 1600);
}
