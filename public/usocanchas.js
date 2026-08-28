/* ===========================================================================
   El gráfico de uso de canchas.

   Una curva por cancha a lo largo de la temporada. El alto de cada semana es
   cuántas veces se usó esa cancha —prácticas y partidos juntos—, pero la curva
   va parada en los días en que realmente se jugó, no en el lunes: así tiene la
   variación que tuvo la semana de verdad y dos canchas que trabajaron días
   distintos no comparten la vertical.

   Los únicos puntos del gráfico son los partidos de torneo, montados sobre la
   propia curva, en su día. Como ninguna otra cosa lleva punto, un punto sobre
   la línea ya quiere decir "acá hubo partido".

   Tres solapas: las seis juntas, una por cancha, y los números. Y sale en JPG
   para el grupo, con el mismo dibujo.
   =========================================================================== */

/* Un color por cancha, en orden fijo: la 1 es siempre azul, la 6 siempre verde.
   Están validados para que se distingan entre sí también para quien no ve bien
   los colores. */
const COLOR_CANCHA = {
  1: '#2a78d6',   // azul
  2: '#eb6834',   // naranja
  3: '#1baf7a',   // agua
  4: '#eda100',   // amarillo
  5: '#e87ba4',   // rosa
  6: '#008300',   // verde
};
const CANCHAS_TODAS = [1, 2, 3, 4, 5, 6];

/* Los dos trabajos que el club hace siempre tienen su color; "otro" va en gris,
   que puede ser cualquier cosa. Los dos se leen sobre blanco: 5,9:1 el marrón
   de la arena y 7,1:1 el verde del fertilizante. */
const CLASE_TRABAJO = { arena: 'arena', fertilizante: 'fert', otro: 'otro-trabajo' };
const COLOR_LLUVIA = '#2a78d6';
const UNIDAD_FIJA = { arena: 'm³', fertilizante: 'kg' };
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const UN_DIA = 86400000;
const enFecha = (iso) => new Date(iso + 'T12:00:00Z');

/**
 * Blanco o tinta arriba del color de la cancha, el que se lea mejor. Los seis
 * colores están elegidos para distinguirse entre sí como líneas, no para tener
 * texto encima: el amarillo de la 4 con letra blanca no se lee.
 */
function tintaSobre(hex) {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const luz = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (luz + 0.05) >= (luz + 0.05) / 0.0687 ? '#ffffff' : '#16202e';
}

/** El lunes de la semana de esa fecha. */
function lunesDe(iso) {
  const d = enFecha(iso);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * De la lista de días que manda el servidor a las series que se dibujan: una
 * por cancha, con un punto por semana.
 */
function seriesDeCanchas(dias, lluvias, trabajos) {
  if (!dias || !dias.length) return null;

  // Las semanas salen de TODO lo que pasó, no solo de lo que se jugó: una
  // semana de 140 mm es justamente una semana en la que nadie jugó, y si no
  // tuviera columna la lluvia que lo explica quedaría afuera del cuadro.
  const cuando = [
    ...dias.map((d) => d.fecha),
    ...(lluvias || []).map((l) => l.fecha),
    ...(trabajos || []).map((t) => t.fecha),
  ];
  const semanas = [...new Set(cuando.map(lunesDe))].sort();
  const origen = enFecha(semanas[0]).getTime();
  const cuandoDe = (iso) => (enFecha(iso).getTime() - origen) / UN_DIA;
  const largo = cuandoDe(semanas[semanas.length - 1]) + 6;

  const series = CANCHAS_TODAS.map((c) => {
    const puntos = semanas.map((s) => {
      const aca = dias.filter((d) => Number(d.cancha) === c && lunesDe(d.fecha) === s);
      const cuando = aca.map((d) => cuandoDe(d.fecha));
      return {
        // El jueves cuando la cancha descansó: la curva necesita un lugar donde
        // pararse igual, y el medio de la semana es el que menos la deforma.
        x: cuando.length ? cuando.reduce((a, b) => a + b, 0) / cuando.length : cuandoDe(s) + 3,
        total: aca.length,
        partidos: aca.filter((d) => d.clase === 'torneo').map((d) => cuandoDe(d.fecha)).sort((a, b) => a - b),
        semana: s,
      };
    });
    const suyos = (trabajos || []).filter((t) => Number(t.cancha) === c);
    return {
      cancha: c,
      color: COLOR_CANCHA[c],
      puntos,
      total: puntos.reduce((a, p) => a + p.total, 0),
      partidos: puntos.reduce((a, p) => a + p.partidos.length, 0),
      trabajos: suyos,
      arena: sumaDe(suyos, 'arena'),
      fertilizante: sumaDe(suyos, 'fertilizante'),
    };
  });

  // En qué carril va cada cancha: primero la que más se usó. Así, cuando dos
  // empatan, la que viene trabajando más queda arriba y las curvas se cruzan lo
  // menos posible.
  [...series].sort((a, b) => b.total - a.total).forEach((s, k) => { s.orden = k; });

  // La lluvia se dibuja donde cayó, así que va con su día y sus milímetros. Solo
  // la de adentro del gráfico: una lluvia de antes de la primera práctica no
  // tiene dónde pararse.
  const agua = (lluvias || [])
    .map((l) => ({ ...l, x: cuandoDe(l.fecha) }))
    .filter((l) => l.x >= 0 && l.x <= largo && l.mm > 0)
    .sort((a, b) => a.x - b.x);

  const techo = Math.max(1, ...series.flatMap((s) => s.puntos.map((p) => p.total)));
  return { semanas, series, techo, largo, cuandoDe, agua };
}

/** Cuánta arena —o cuánto fertilizante— se le echó en total. */
const sumaDe = (trabajos, tipo) => trabajos
  .filter((t) => t.tipo === tipo)
  .reduce((a, t) => a + Number(t.cantidad), 0);

/** 12 y no 12,00; pero 2,5 sí, que media tonelada de arena es media. */
const enNumero = (n) => (Number.isInteger(Number(n))
  ? String(Number(n))
  : String(Math.round(Number(n) * 10) / 10).replace('.', ','));

/* ---------------------------------------------------------------- la curva */
/* Interpolación monótona (Fritsch–Carlson): curva suave que nunca se pasa de
   los valores que une. Con splines comunes, dos semanas seguidas en 1 y 0
   dibujarían una panza abajo del cero, que sería mentira. */
function pendientesDe(pts) {
  const n = pts.length;
  if (n < 2) return [0];
  const d = [];
  for (let i = 0; i < n - 1; i += 1) d.push((pts[i + 1].y - pts[i].y) / (pts[i + 1].x - pts[i].x));
  const m = [d[0]];
  for (let i = 1; i < n - 1; i += 1) {
    if (d[i - 1] * d[i] <= 0) { m.push(0); continue; }
    const h1 = pts[i].x - pts[i - 1].x;
    const h2 = pts[i + 1].x - pts[i].x;
    const w1 = 2 * h2 + h1;
    const w2 = h2 + 2 * h1;
    m.push((w1 + w2) / (w1 / d[i - 1] + w2 / d[i]));
  }
  m.push(d[n - 2]);
  return m;
}

/** Los tramos de curva, como una lista de puntos y sus curvas de Bézier. */
function caminoDe(pts, m) {
  let d = 'M' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
  for (let i = 0; i < pts.length - 1; i += 1) {
    const h = (pts[i + 1].x - pts[i].x) / 3;
    d += ' C' + (pts[i].x + h).toFixed(1) + ' ' + (pts[i].y + m[i] * h).toFixed(1)
      + ' ' + (pts[i + 1].x - h).toFixed(1) + ' ' + (pts[i + 1].y - m[i + 1] * h).toFixed(1)
      + ' ' + pts[i + 1].x.toFixed(1) + ' ' + pts[i + 1].y.toFixed(1);
  }
  return d;
}

/**
 * Los puntos que se dibujan: los de cada semana más uno pegado a cada punta,
 * con el mismo valor. El número es de la semana entera, así que vale también el
 * lunes y el domingo; sin esto cada curva arrancaría en un lugar distinto y el
 * gráfico quedaría mordido de los costados.
 */
const conPuntas = (puntos, largo) => [
  { ...puntos[0], x: 0 },
  ...puntos,
  { ...puntos[puntos.length - 1], x: largo },
];

/** El alto exacto de la curva en ese lugar, para montarle los puntos encima. */
function alturaEnLaCurva(pts, m, x) {
  let i = 0;
  while (i < pts.length - 2 && x > pts[i + 1].x) i += 1;
  const h = pts[i + 1].x - pts[i].x;
  const t = Math.max(0, Math.min(1, (x - pts[i].x) / h));
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * pts[i].y + (t3 - 2 * t2 + t) * h * m[i]
    + (-2 * t3 + 3 * t2) * pts[i + 1].y + (t3 - t2) * h * m[i + 1];
}

/**
 * Qué semanas llevan fecha abajo. No se pueden rotular todas —con dieciséis ya
 * se tocan, y con una temporada larga se pisan—, así que se van salteando hasta
 * que entren, y se marca en negrita la primera de cada mes, que es la que ubica.
 */
function rotulosDelEje(semanas, x, cuandoDe, separacionMinima) {
  const puestos = [];
  let ultima = -1e9;
  semanas.forEach((s, i) => {
    const donde = x(cuandoDe(s));
    if (donde - ultima < separacionMinima) return;
    ultima = donde;
    const d = enFecha(s);
    const primeraDelMes = i === 0 || enFecha(semanas[i - 1]).getUTCMonth() !== d.getUTCMonth();
    puestos.push({
      x: donde,
      mes: primeraDelMes,
      texto: primeraDelMes ? d.getUTCDate() + ' ' + MES_CORTO[d.getUTCMonth()] : String(d.getUTCDate()),
    });
  });
  return puestos;
}

/** De cuánto en cuánto van las rayas de la izquierda: nunca más de seis. */
const pasoDelEje = (techo) => (techo <= 6 ? 1 : Math.ceil(techo / 6));

/**
 * De qué tamaño va el punto de un partido y cuánto se abren dos del mismo día.
 *
 * El punto quiere ser angosto como un día —así dos partidos de días seguidos no
 * se funden en un manchón— pero en una temporada de cuatro meses un día son tres
 * píxeles y el punto desaparecería. Entonces: nunca menos de `minimo`, y cuando
 * el día queda más chico que el punto, los del mismo día se abren lo que haga
 * falta para que se sigan contando.
 */
function medidaDelPunto(anchoDia, base, minimo) {
  const radio = Math.max(minimo, Math.min(base, anchoDia * 0.75));
  return { radio, paso: Math.max(anchoDia * 0.8, radio * 1.35) };
}

/** Los puntos de partido de una serie, ya ubicados sobre su curva. */
function puntosDePartido(serie, pts, m, x, medida) {
  const porDia = {};
  serie.puntos.flatMap((p) => p.partidos).forEach((d) => { (porDia[d] = porDia[d] || []).push(d); });
  const salida = [];
  Object.entries(porDia).forEach(([d, mismos]) => {
    mismos.forEach((_, k) => {
      const cx = x(Number(d)) + (k - (mismos.length - 1) / 2) * medida.paso;
      salida.push({ cx, cy: alturaEnLaCurva(pts, m, cx) });
    });
  });
  return salida;
}

/**
 * El ancho de la franja de lluvia, en píxeles. 150 mm ocupan dos días y de ahí
 * para abajo en proporción; nunca menos de un pelo, para que una llovizna igual
 * se vea. Va detrás de las curvas y bien transparente: es el clima, no una
 * cancha más.
 */
const DIAS_POR_MM = 2 / 150;
const anchoDeLluvia = (mm, anchoDia) => Math.max(1.5, mm * DIAS_POR_MM * anchoDia);

/* --------------------------------------------------------------- el dibujo */

const svgNodo = (tag, attrs, hijos) => {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs || {}).forEach(([k, v]) => { if (v !== null) n.setAttribute(k, String(v)); });
  (hijos || []).forEach((h) => n.appendChild(typeof h === 'string' ? document.createTextNode(h) : h));
  return n;
};

/**
 * Las seis canchas en un mismo gráfico. `separacion` es el carril de cada una:
 * unos píxeles fijos para que dos canchas que la misma semana jugaron lo mismo
 * queden paralelas y no una encima de la otra.
 */
function curvasJuntas(svg, plano, { ancho, alto, separacion, grosor }) {
  const { semanas, series, techo, largo } = plano;
  svg.setAttribute('viewBox', '0 0 ' + ancho + ' ' + alto);
  vaciar(svg);

  const media = (CANCHAS_TODAS.length - 1) / 2 * separacion;
  const izq = 26;
  const der = 10;
  const arriba = plano.agua.length ? 36 : 24;
  const abajo = 32 + media;
  const x = (d) => izq + (ancho - izq - der) * d / largo;
  const y = (v) => arriba + (alto - arriba - abajo) * (1 - v / techo);

  for (let v = 0; v <= techo; v += pasoDelEje(techo)) {
    svg.appendChild(svgNodo('line', {
      x1: izq - 4, x2: ancho - der, y1: y(v), y2: y(v), class: v ? 'grilla' : 'base',
    }));
    svg.appendChild(svgNodo('text', {
      x: izq - 9, y: y(v) + 4, 'text-anchor': 'end', class: 'eje',
    }, [String(v)]));
  }

  // La lluvia: arriba de la grilla y abajo de las curvas, con sus milímetros
  // escritos. Si dos caen muy juntas, la segunda se saltea el número: mejor sin
  // número que encimado.
  const anchoDia = x(1) - x(0);
  let ultimoMm = -1e9;
  plano.agua.forEach((l) => {
    const w = anchoDeLluvia(l.mm, anchoDia);
    const centro = x(l.x);
    const banda = svgNodo('rect', {
      x: centro - w / 2, y: arriba - 6, width: w,
      height: y(0) + media + 3 - (arriba - 6), class: 'banda-lluvia',
    });
    banda.appendChild(svgNodo('title', {}, [Hoja.fechaCorta(l.fecha) + ' · ' + l.mm + ' mm']));
    svg.appendChild(banda);

    if (centro - ultimoMm < 34) return;
    ultimoMm = centro;
    svg.appendChild(svgNodo('text', {
      x: centro, y: arriba - 11, 'text-anchor': 'middle', class: 'mm-lluvia',
    }, [l.mm + ' mm']));
  });

  rotulosDelEje(semanas, x, plano.cuandoDe, 34).forEach((r) => {
    svg.appendChild(svgNodo('text', {
      x: r.x, y: alto - abajo + media + 22, 'text-anchor': 'middle',
      class: 'eje' + (r.mes ? ' primero' : ''),
    }, [r.texto]));
  });

  const carril = (s) => (s.orden - (CANCHAS_TODAS.length - 1) / 2) * separacion;
  const dibujadas = series.map((s) => {
    const pts = conPuntas(s.puntos, largo).map((p) => ({ x: x(p.x), y: y(p.total) + carril(s) }));
    return { serie: s, pts, m: pendientesDe(pts) };
  });

  dibujadas.forEach(({ serie, pts, m }) => {
    svg.appendChild(svgNodo('path', {
      d: caminoDe(pts, m), class: 'linea', stroke: serie.color, 'stroke-width': grosor,
    }));
  });

  // Un punto por partido, montado sobre su curva, en el día que se jugó. Los
  // del mismo día quedan casi pegados; los de días distintos los separa el
  // calendario solo.
  const medida = medidaDelPunto(anchoDia, grosor * 2.2, 2.6);
  dibujadas.forEach(({ serie, pts, m }) => {
    puntosDePartido(serie, pts, m, x, medida).forEach((p) => {
      svg.appendChild(svgNodo('circle', {
        cx: p.cx, cy: p.cy, r: medida.radio, fill: serie.color, class: 'punto-partido',
      }));
    });
  });

  return { x, y, izq, der, arriba, abajo, media };
}

/** Una cancha por renglón, todas con la misma altura para poder compararlas. */
function curvasPorCancha(caja, plano) {
  const { semanas, series, techo, largo } = plano;
  vaciar(caja);

  series.forEach((s) => {
    const fila = el('div', { class: 'renglon-cancha' + (s.total ? '' : ' apagada') }, [
      el('div', { class: 'renglon-rotulo' }, [
        el('i', { style: 'background:' + s.color }),
        'C' + s.cancha,
        el('b', {}, [String(s.total)]),
      ]),
    ]);

    const svg = svgNodo('svg', { class: 'grafico', viewBox: '0 0 300 46' });
    const x = (d) => 6 + 288 * d / largo;
    const y = (v) => 40 - 32 * v / techo;
    svg.appendChild(svgNodo('line', { x1: 0, x2: 300, y1: 40, y2: 40, class: 'base' }));

    // La lluvia cae sobre las seis, así que va en todos los renglones: si
    // estuviera en uno solo parecería que llovió únicamente ahí.
    const anchoDia = x(1) - x(0);
    plano.agua.forEach((l) => {
      const w = anchoDeLluvia(l.mm, anchoDia);
      svg.appendChild(svgNodo('rect', {
        x: x(l.x) - w / 2, y: 2, width: w, height: 38, class: 'banda-lluvia',
      }));
    });

    const pts = conPuntas(s.puntos, largo).map((p) => ({ x: x(p.x), y: y(p.total) }));
    const m = pendientesDe(pts);
    svg.appendChild(svgNodo('path', {
      d: caminoDe(pts, m), class: 'linea', stroke: s.color, 'stroke-width': 2,
    }));

    const medida = medidaDelPunto(anchoDia, 4, 2.4);
    puntosDePartido(s, pts, m, x, medida).forEach((p) => {
      svg.appendChild(svgNodo('circle', {
        cx: p.cx, cy: p.cy, r: medida.radio, fill: s.color, class: 'punto-partido',
      }));
    });

    fila.appendChild(svg);
    caja.appendChild(fila);
  });

  // Las semanas, una sola vez abajo de todo.
  const pie = el('div', { class: 'renglon-cancha renglon-eje' }, [el('div', { class: 'renglon-rotulo' })]);
  const svg = svgNodo('svg', { class: 'grafico', viewBox: '0 0 300 16' });
  rotulosDelEje(semanas, (d) => 6 + 288 * d / largo, plano.cuandoDe, 30).forEach((r) => {
    svg.appendChild(svgNodo('text', {
      x: r.x, y: 11, 'text-anchor': 'middle', class: 'eje' + (r.mes ? ' primero' : ''),
    }, [r.texto]));
  });
  pie.appendChild(svg);
  caja.appendChild(pie);
}

/** La misma data en un cuadro, que se corre para el costado. */
function numerosDeCanchas(caja, plano) {
  const { semanas, series } = plano;
  vaciar(caja);

  const cab = semanas.map((s) => {
    const d = enFecha(s);
    return d.getUTCDate() + '/' + (d.getUTCMonth() + 1);
  });

  let html = '<table><thead><tr><th>Cancha</th>'
    + cab.map((c) => '<th>' + c + '</th>').join('') + '<th>Total</th></tr></thead><tbody>';

  // Arriba de todo la lluvia, que es la que explica las semanas flojas.
  const mmPorSemana = semanas.map((s) => plano.agua
    .filter((l) => lunesDe(l.fecha) === s)
    .reduce((a, l) => a + l.mm, 0));
  const mmTotal = mmPorSemana.reduce((a, b) => a + b, 0);
  if (mmTotal) {
    html += '<tr class="fila-lluvia"><td>Lluvia<span class="sub-total">' + mmTotal + ' mm</span></td>'
      + mmPorSemana.map((mm) => '<td>' + (mm ? mm + '<span class="parcial">mm</span>' : '—') + '</td>').join('')
      + '<td>' + mmTotal + '</td></tr>';
  }

  series.forEach((s) => {
    html += '<tr><td><span class="punto-cancha" style="background:' + s.color + '"></span>C' + s.cancha
      + (s.arena ? '<span class="sub-total arena">' + enNumero(s.arena) + ' m³</span>' : '')
      + (s.fertilizante ? '<span class="sub-total fert">' + enNumero(s.fertilizante) + ' kg</span>' : '')
      + '</td>';
    s.puntos.forEach((p) => {
      const deLaSemana = s.trabajos.filter((t) => lunesDe(t.fecha) === p.semana);
      html += '<td>' + (p.total || '—')
        + (p.partidos.length
          ? ' <span style="color:' + s.color + ';font-weight:700">' + '•'.repeat(p.partidos.length) + '</span>'
          : '')
        + deLaSemana.map((t) => '<span class="parcial ' + CLASE_TRABAJO[t.tipo] + '">'
          + enNumero(t.cantidad) + ' ' + t.unidad + '</span>').join('')
        + '</td>';
    });
    html += '<td><b>' + s.total + '</b></td></tr>';
  });
  const porSemana = semanas.map((_, i) => series.reduce((a, s) => a + s.puntos[i].total, 0));
  html += '</tbody><tfoot><tr><td>Total</td>' + porSemana.map((v) => '<td>' + v + '</td>').join('')
    + '<td>' + porSemana.reduce((a, b) => a + b, 0) + '</td></tr></tfoot></table>';

  const rodante = el('div', { class: 'rodante' });
  rodante.innerHTML = html;
  caja.appendChild(rodante);
  caja.appendChild(el('p', { class: 'pista' }, [
    'Cada ● es un partido de torneo. En marrón la arena, en verde el fertilizante.',
  ]));
}

/* ------------------------------------------------------------------ en JPG */

const JPG_CANCHAS = { ancho: 2000, alto: 900, separacion: 8, grosor: 4.5 };

function usoDeCanchasEnCanvas(plano, temporada) {
  const { semanas, series, techo, largo } = plano;
  const M = JPG_CANCHAS;
  const margen = 70;
  const cabecera = 210;
  const pie = 215;
  const alto = cabecera + M.alto + pie;

  const canvas = document.createElement('canvas');
  canvas.width = M.ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, M.ancho, alto);

  if (Hoja.LOGO.complete && Hoja.LOGO.naturalWidth) {
    const altoLogo = 120;
    const anchoLogo = Hoja.LOGO.naturalWidth * altoLogo / Hoja.LOGO.naturalHeight;
    ctx.drawImage(Hoja.LOGO, M.ancho - margen - anchoLogo, 30, anchoLogo, altoLogo);
  }
  ctx.fillStyle = '#16202e';
  ctx.font = Hoja.fuente(46, 'bold');
  ctx.fillText('Uso de canchas', margen, 96);
  ctx.font = Hoja.fuente(26);
  ctx.fillStyle = '#6b7891';
  const totales = series.reduce((a, s) => a + s.total, 0);
  const partidos = series.reduce((a, s) => a + s.partidos, 0);
  ctx.fillText(
    (temporada ? temporada.nombre + '  ·  ' : '')
    + 'por semana  ·  ' + (totales - partidos) + (totales - partidos === 1 ? ' práctica' : ' prácticas')
    + ' y ' + partidos + (partidos === 1 ? ' partido' : ' partidos'),
    margen, 140,
  );

  const media = (CANCHAS_TODAS.length - 1) / 2 * M.separacion;
  const izq = margen + 40;
  const der = margen;
  const arriba = cabecera;
  const abajo = alto - pie - media;
  const x = (d) => izq + (M.ancho - izq - der) * d / largo;
  const y = (v) => arriba + (abajo - arriba) * (1 - v / techo);

  ctx.textAlign = 'right';
  ctx.font = Hoja.fuente(24);
  for (let v = 0; v <= techo; v += pasoDelEje(techo)) {
    ctx.strokeStyle = v ? '#eef2f8' : '#dde3ec';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(izq - 8, y(v));
    ctx.lineTo(M.ancho - der, y(v));
    ctx.stroke();
    ctx.fillStyle = '#6b7891';
    ctx.fillText(String(v), izq - 18, y(v) + 8);
  }

  // La lluvia, detrás de las curvas y con sus milímetros escritos: el JPG no
  // tiene dónde tocar para que salga el cartelito.
  const anchoDia = x(1) - x(0);
  ctx.textAlign = 'center';
  let ultimoMm = -1e9;
  plano.agua.forEach((l) => {
    const w = anchoDeLluvia(l.mm, anchoDia);
    const centro = x(l.x);
    ctx.fillStyle = COLOR_LLUVIA;
    ctx.globalAlpha = 0.22;
    ctx.fillRect(centro - w / 2, arriba - 14, w, abajo + media + 6 - (arriba - 14));
    ctx.globalAlpha = 1;
    if (centro - ultimoMm < 90) return;
    ultimoMm = centro;
    ctx.font = Hoja.fuente(21, 'bold');
    ctx.fillStyle = COLOR_LLUVIA;
    ctx.fillText(l.mm + ' mm', centro, arriba - 24);
  });

  rotulosDelEje(semanas, x, plano.cuandoDe, 90).forEach((r) => {
    ctx.font = Hoja.fuente(23, r.mes ? 'bold' : '');
    ctx.fillStyle = r.mes ? '#16202e' : '#6b7891';
    ctx.fillText(r.texto, r.x, abajo + media + 44);
  });
  ctx.textAlign = 'left';

  const carril = (s) => (s.orden - (CANCHAS_TODAS.length - 1) / 2) * M.separacion;
  const dibujadas = series.map((s) => {
    const pts = conPuntas(s.puntos, largo).map((p) => ({ x: x(p.x), y: y(p.total) + carril(s) }));
    return { serie: s, pts, m: pendientesDe(pts) };
  });

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  dibujadas.forEach(({ serie, pts, m }) => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length - 1; i += 1) {
      const h = (pts[i + 1].x - pts[i].x) / 3;
      ctx.bezierCurveTo(pts[i].x + h, pts[i].y + m[i] * h,
        pts[i + 1].x - h, pts[i + 1].y - m[i + 1] * h, pts[i + 1].x, pts[i + 1].y);
    }
    ctx.strokeStyle = serie.color;
    ctx.lineWidth = M.grosor;
    ctx.stroke();
  });

  const medida = medidaDelPunto(x(1) - x(0), M.grosor * 2.2, 7);
  dibujadas.forEach(({ serie, pts, m }) => {
    puntosDePartido(serie, pts, m, x, medida).forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.cx, p.cy, medida.radio, 0, Math.PI * 2);
      ctx.fillStyle = serie.color;
      ctx.fill();
    });
  });
  ctx.lineCap = 'butt';

  /* la referencia y el pie */
  let cx = margen;
  const cy = alto - pie + 112;
  ctx.font = Hoja.fuente(24);
  series.forEach((s) => {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx + 30, cy - 8);
    ctx.stroke();
    ctx.fillStyle = s.total ? '#16202e' : '#6b7891';
    const texto = 'Cancha ' + s.cancha + '  ' + s.total;
    ctx.fillText(texto, cx + 40, cy);
    cx += 40 + ctx.measureText(texto).width + 40;
  });
  ctx.font = Hoja.fuente(21);
  ctx.fillStyle = '#6b7891';
  ctx.fillText(
    'El punto sobre la línea es un partido de torneo; la franja azul, lluvia. '
    + 'Club de Campo San Diego.',
    margen, alto - 40,
  );

  return canvas;
}

/* ------------------------------------------------------------- la pantalla */

/** Cuál de las tres vistas del gráfico está a la vista. */
let vistaGrafico = 'juntas';   // juntas | renglones | numeros

function graficoDeCanchas(raiz, datos) {
  const plano = seriesDeCanchas(datos.dias, datos.lluvias, datos.trabajos);
  if (!plano) return;

  raiz.appendChild(el('h2', {}, ['Uso de canchas']));
  raiz.appendChild(el('p', { class: 'pista', style: 'margin-bottom:10px' }, [
    'Cuántas veces se usó cada cancha por semana. La curva se para en los días '
    + 'en que se jugó, y el punto sobre la línea es un partido de torneo.',
  ]));

  const solapa = el('div', { class: 'chips', style: 'margin-bottom:10px' });
  const cuerpoGrafico = el('div');
  raiz.appendChild(solapa);
  raiz.appendChild(cuerpoGrafico);

  const pintar = () => {
    vaciar(solapa);
    [['juntas', 'Juntas'], ['renglones', 'Por cancha'], ['numeros', 'Números']]
      .forEach(([clave, texto]) => {
        solapa.appendChild(el('button', {
          type: 'button', class: 'chip', 'aria-pressed': vistaGrafico === clave,
          onclick: () => { vistaGrafico = clave; pintar(); },
        }, [texto]));
      });

    vaciar(cuerpoGrafico);
    if (vistaGrafico === 'numeros') {
      numerosDeCanchas(cuerpoGrafico, plano);
      return;
    }

    if (vistaGrafico === 'juntas') {
      cuerpoGrafico.appendChild(el('div', { class: 'refs-canchas' }, plano.series.map((s) =>
        el('span', { class: 'ref-cancha' + (s.total ? '' : ' apagada') }, [
          el('i', { style: 'background:' + s.color }),
          'Cancha ' + s.cancha,
          el('b', {}, [String(s.total)]),
        ]))));
      const svg = svgNodo('svg', {
        class: 'grafico', role: 'img',
        'aria-label': 'Curvas de uso semanal de las seis canchas.',
      });
      cuerpoGrafico.appendChild(svg);
      curvasJuntas(svg, plano, { ancho: 352, alto: 236, separacion: 3.8, grosor: 1.7 });
    } else {
      curvasPorCancha(cuerpoGrafico, plano);
    }

    cuerpoGrafico.appendChild(el('p', { class: 'pista' }, [
      'Cada punto sobre la línea es un partido de torneo, en el día que se jugó. '
      + (plano.agua.length ? 'La franja azul es lluvia: cuanto más ancha, más milímetros.' : ''),
    ]));
  };
  pintar();

  raiz.appendChild(el('div', { class: 'acciones' }, [
    el('button', {
      class: 'ghost', type: 'button',
      onclick: (e) => Hoja.compartirCanvas(
        usoDeCanchasEnCanvas(plano, datos.temporada),
        'canchas-' + hoy() + '.jpg',
        e.currentTarget,
      ),
    }, [icono('compartir', 16), 'Compartir el gráfico en JPG']),
  ]));
}
