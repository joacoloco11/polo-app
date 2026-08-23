/* ===========================================================================
   El ranking de la temporada y la ficha de cada jugador.

   El ranking se ordena por prácticas, después por puntos y después por MVP —
   ese es el criterio del club—, y se puede tocar el encabezado para ordenar
   por cualquiera de los tres.

   La ficha rearma lo que mostraba la v1: con quién jugó más, en qué canchas y
   el historial completo. Las cuentas se hacen acá con las prácticas que manda
   el servidor, igual que antes.
   =========================================================================== */

const ranking = {
  lista: null,
  temporada: null,
  orden: 'practicas',   // practicas | puntos | mvps
  abierta: null,        // la ficha de un jugador
  error: null,
};

/** Cuando se carga un resultado, lo que está en pantalla queda viejo. */
let rankingSucio = false;

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

async function abrirJugador(id) {
  try {
    ranking.abierta = await pedir('/api/jugador?id=' + encodeURIComponent(id));
    ranking.error = null;
  } catch (e) {
    ranking.error = e.message;
  }
  render();
}

/** 3 en vez de 3,0 — pero 1,5 cuando hay medios. */
const puntos = (n) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(1).replace('.', ','));

/* ------------------------------------------------------------- la lista */

function vistaRanking(raiz) {
  if (ranking.abierta) return fichaDeJugador(raiz);

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

  raiz.appendChild(el('div', { class: 'lista' }, ordenada.map((j, i) =>
    el('button', {
      type: 'button', class: 'quien fila-ranking',
      onclick: () => abrirJugador(j.jugador_id),
    }, [
      el('span', { class: 'puesto-nro' + (i < 3 ? ' podio' : '') }, [String(i + 1)]),
      el('span', { style: 'flex:1;min-width:0' }, [
        el('b', {}, [j.apodo]),
        el('span', {}, [j.nombre]),
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

/* -------------------------------------------------------------- la ficha */

function fichaDeJugador(raiz) {
  const { jugador, practicas: jugadas, resumen } = ranking.abierta;

  raiz.appendChild(el('button', {
    class: 'link', type: 'button',
    onclick: () => { ranking.abierta = null; render(); },
  }, ['‹ Volver al ranking']));

  raiz.appendChild(el('div', { class: 'card p ficha' }, [
    el('b', {}, [jugador.apodo]),
    el('span', {}, [
      jugador.nombre + ' · ' + jugador.categoria + ' · HCP ' + hcp(jugador.handicap)
      + (jugador.invitado_por ? ' · invitado por ' + jugador.invitado_por : ''),
    ]),
  ]));

  /* ---- los números */
  const conHcp = jugadas.filter((p) => p.hcpPractica !== null);
  const promedioHcp = conHcp.length
    ? conHcp.reduce((a, p) => a + p.hcpPractica, 0) / conHcp.length
    : null;

  raiz.appendChild(el('div', { class: 'card p numeros' }, [
    el('div', {}, [el('b', { class: 'teal' }, [String(resumen.practicas)]), el('span', {}, ['prácticas'])]),
    el('div', {}, [el('b', {}, [puntos(resumen.puntos)]), el('span', {}, ['puntos'])]),
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

  const masDe = (cuenta) => Object.entries(cuenta).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const companero = masDe(conmigo);
  const compartido = masDe(cruzado);

  if (companero || compartido) {
    const caja = el('div', { class: 'card p', style: 'margin-top:14px' });
    if (companero) {
      caja.appendChild(el('div', { class: 'renglon-dato' }, [
        el('span', { style: 'flex:1' }, [
          el('em', {}, ['Compañero más frecuente']),
          el('b', {}, [companero[0]]),
        ]),
        el('span', { class: 'marca listo' }, [companero[1] + 'x']),
      ]));
    }
    if (compartido) {
      caja.appendChild(el('div', { class: 'renglon-dato' }, [
        el('span', { style: 'flex:1' }, [
          el('em', {}, ['Con quien más compartió cancha']),
          el('b', {}, [compartido[0]]),
        ]),
        el('span', { class: 'marca' }, [compartido[1] + 'x']),
      ]));
    }
    raiz.appendChild(caja);
  }

  /* ---- canchas */
  const canchas = {};
  jugadas.forEach((p) => { canchas[p.cancha] = (canchas[p.cancha] || 0) + 1; });
  const porCancha = Object.entries(canchas).sort((a, b) => b[1] - a[1]);

  if (porCancha.length) {
    raiz.appendChild(el('h2', {}, ['Canchas']));
    raiz.appendChild(el('div', { class: 'canchas' }, porCancha.map(([cancha, veces]) =>
      el('div', { class: 'cancha' }, [
        el('b', {}, ['C' + cancha]),
        el('span', {}, [veces + 'x']),
        el('em', {}, [Math.round(veces / jugadas.length * 100) + '%']),
      ]))));
  }

  /* ---- historial */
  raiz.appendChild(el('h2', {}, ['Historial (' + jugadas.length + ')']));
  raiz.appendChild(el('div', { class: 'lista' }, jugadas.map((p) => {
    const jugados = p.partidos.filter((x) =>
      x.golesA !== null && (x.equipoA === p.miEquipo || x.equipoB === p.miEquipo || p.miEquipo === 'bicolor'));
    const marcador = jugados.map((x) => x.golesA + '-' + x.golesB).join(' · ');

    return el('div', { class: 'quien estatico' }, [
      el('span', { style: 'flex:1;min-width:0' }, [
        el('b', {}, [Hoja.fechaCorta(p.fecha)]),
        el('span', {}, [
          'Cancha ' + p.cancha + ' · ' + p.formato + ' jug.'
          + (p.hcpPractica === null ? '' : ' · HCP ' + p.hcpPractica)
          + (marcador ? ' · ' + marcador : ''),
        ]),
      ]),
      p.mvpId === jugador.id ? el('span', { class: 'marca' }, ['MVP']) : null,
      el('span', { class: 'sello ' + p.miEquipo }, [Hoja.LABEL[p.miEquipo]]),
    ]);
  })));
}
