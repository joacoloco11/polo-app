/**
 * Los casos de prueba son las cuatro planillas reales del club
 * (SD_Practica 8.1, 9.2, 10.1 y 12.1). Si el motor no las reproduce tal cual,
 * está mal el motor.
 *
 *   node --test app/tests/
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  FORMATOS, generarPlanilla, verificarPlanilla, formacionPorChukker, anotacion,
  repartirPorHandicap, desbalance, desdeGuardado, paraPantalla,
  enfrentamientos, puntosDelPartido, hcpDeLaPractica, ErrorDeArmado,
} = require('../lib/polo');

const j = (apodo, color, handicap = 0) => ({ id: apodo, apodo, nombre: apodo, handicap, color });
const sale = (p, apodo) => p.jugadores.find((x) => x.apodo === apodo).sale;

// ---------------------------------------------------------------- 8 jugadores

test('práctica de 8: seis chukkers y nadie sale', () => {
  const planilla = generarPlanilla(8, [
    j('Joaco', 'azul'), j('Alejo', 'azul'), j('Seba B.', 'azul'), j('Guido S.', 'azul'),
    j('Emi pp.', 'blanco'), j('Tabru', 'blanco'), j('Colo', 'blanco'), j('Diego K.', 'blanco'),
  ]);

  assert.equal(planilla.chukkers, 6);
  for (const jugador of planilla.jugadores) {
    assert.deepEqual(jugador.sale, [], `${jugador.apodo} no tendría que salir`);
    assert.equal(jugador.juega.length, 6);
  }
  assert.deepEqual(verificarPlanilla(planilla), []);
  assert.equal(anotacion(planilla, planilla.jugadores[0]), '');
});

// ---------------------------------------------------------------- 9 jugadores

test('práctica de 9: reproduce la planilla 9.2 con el bicolor', () => {
  const planilla = generarPlanilla(9, [
    j('Joaco', 'azul'), j('Alejo', 'azul'), j('Seba B.', 'azul'), j('Guido S.', 'azul'),
    j('Emi pp.', 'blanco'), j('Tabru', 'blanco'), j('Colo', 'blanco'), j('Diego K.', 'blanco'),
    j('David', 'bicolor'),
  ]);

  assert.equal(planilla.chukkers, 7);

  // Lo que dice la planilla: Joaco x7, Alejo (1), Seba B. (2), Guido S. (3),
  // Emi pp. x7, Tabru (5), Colo (6), Diego K. (7), David (4).
  assert.deepEqual(sale(planilla, 'Joaco'), []);
  assert.deepEqual(sale(planilla, 'Alejo'), [1]);
  assert.deepEqual(sale(planilla, 'Seba B.'), [2]);
  assert.deepEqual(sale(planilla, 'Guido S.'), [3]);
  assert.deepEqual(sale(planilla, 'Emi pp.'), []);
  assert.deepEqual(sale(planilla, 'Tabru'), [5]);
  assert.deepEqual(sale(planilla, 'Colo'), [6]);
  assert.deepEqual(sale(planilla, 'Diego K.'), [7]);
  assert.deepEqual(sale(planilla, 'David'), [4]);

  const david = planilla.jugadores.find((x) => x.apodo === 'David');
  assert.deepEqual(david.juegaDe, {
    1: 'azul', 2: 'azul', 3: 'azul',
    5: 'blanco', 6: 'blanco', 7: 'blanco',
  });
  assert.equal(david.juega.length, 6);

  // Dos juegan los 7, el resto 6.
  const de7 = planilla.jugadores.filter((x) => x.juega.length === 7).map((x) => x.apodo);
  assert.deepEqual(de7.sort(), ['Emi pp.', 'Joaco']);

  assert.deepEqual(verificarPlanilla(planilla), []);
  assert.equal(anotacion(planilla, planilla.jugadores[0]), 'x7');
  assert.equal(anotacion(planilla, david), '(4)');
});

test('práctica de 9: el handicap del bicolor suma en los dos equipos', () => {
  const planilla = generarPlanilla(9, [
    j('Joaco', 'azul', 1), j('Alejo', 'azul', 0), j('Seba B.', 'azul', 0), j('Guido S.', 'azul', 0),
    j('Emi pp.', 'blanco', 1), j('Tabru', 'blanco', 0), j('Colo', 'blanco', 0), j('Diego K.', 'blanco', 0),
    j('David', 'bicolor', 3),
  ]);

  assert.equal(planilla.hcpPorEquipo.azul, 4);
  assert.equal(planilla.hcpPorEquipo.blanco, 4);
  assert.equal(planilla.hcpPractica, 4);
});

// --------------------------------------------------------------- 10 jugadores

test('práctica de 10: reproduce la planilla 10.1', () => {
  const planilla = generarPlanilla(10, [
    j('Neves Nestor', 'azul'), j('Joaco', 'azul'), j('Alejo', 'azul'), j('Seba B.', 'azul'), j('Guido S.', 'azul'),
    j('Neves Gaston', 'blanco'), j('Emi pp.', 'blanco'), j('Tabru', 'blanco'), j('Colo', 'blanco'), j('Diego K.', 'blanco'),
  ]);

  assert.equal(planilla.chukkers, 8);

  // Planilla: Nestor x7 (5), Joaco x7 (6), Alejo (1 y 2), Seba B. (3 y 4), Guido S. (7 y 8).
  assert.deepEqual(sale(planilla, 'Neves Nestor'), [5]);
  assert.deepEqual(sale(planilla, 'Joaco'), [6]);
  assert.deepEqual(sale(planilla, 'Alejo'), [1, 2]);
  assert.deepEqual(sale(planilla, 'Seba B.'), [3, 4]);
  assert.deepEqual(sale(planilla, 'Guido S.'), [7, 8]);
  assert.deepEqual(sale(planilla, 'Neves Gaston'), [5]);
  assert.deepEqual(sale(planilla, 'Diego K.'), [7, 8]);

  const de7 = planilla.jugadores.filter((x) => x.juega.length === 7);
  assert.equal(de7.length, 4, 'cuatro jugadores juegan 7 chukkers');
  assert.equal(planilla.jugadores.filter((x) => x.juega.length === 6).length, 6);

  assert.deepEqual(verificarPlanilla(planilla), []);
  // La planilla del club escribe las dos cosas: "Neves Nestor  x7 (5)".
  assert.equal(anotacion(planilla, planilla.jugadores[0]), 'x7 (5)');
  assert.equal(anotacion(planilla, planilla.jugadores[1]), 'x7 (6)');
  assert.equal(anotacion(planilla, planilla.jugadores[2]), '(1 y 2)');
});

// --------------------------------------------------------------- 12 jugadores

test('práctica de 12: nueve chukkers en franjas de tres', () => {
  const planilla = generarPlanilla(12, [
    j('Joaco', 'azul'), j('Alejo', 'azul'), j('Seba B.', 'azul'), j('Guido S.', 'azul'),
    j('Emi pp.', 'blanco'), j('Tabru', 'blanco'), j('Colo', 'blanco'), j('Diego K.', 'blanco'),
    j('Ventu. Edu', 'colorado'), j('Venturini J.', 'colorado'), j('DT.', 'colorado'), j('Juan Gomez', 'colorado'),
  ]);

  assert.equal(planilla.chukkers, 9);

  // 1-3 azul vs blanco · 4-6 blanco vs colorado · 7-9 colorado vs azul
  assert.deepEqual(sale(planilla, 'Joaco'), [4, 5, 6]);
  assert.deepEqual(sale(planilla, 'Emi pp.'), [7, 8, 9]);
  assert.deepEqual(sale(planilla, 'Ventu. Edu'), [1, 2, 3]);

  for (const jugador of planilla.jugadores) {
    assert.equal(jugador.juega.length, 6, `${jugador.apodo} tiene que jugar 6 chukkers`);
  }

  const formacion = formacionPorChukker(planilla);
  assert.deepEqual(Object.keys(formacion[0].lados).sort(), ['azul', 'blanco']);
  assert.deepEqual(Object.keys(formacion[4].lados).sort(), ['blanco', 'colorado']);
  assert.deepEqual(Object.keys(formacion[8].lados).sort(), ['azul', 'colorado']);

  assert.deepEqual(verificarPlanilla(planilla), []);
  assert.equal(anotacion(planilla, planilla.jugadores[0]), '');
});

// -------------------------------------------------------------- invariantes

test('en todos los formatos hay 4 contra 4 en cada chukker', () => {
  const plantel = (n) =>
    Array.from({ length: n }, (_, i) => ({ id: `j${i}`, apodo: `J${i}`, nombre: `J${i}`, handicap: (i % 6) - 1 }));

  for (const cantidad of [8, 9, 10, 12]) {
    const asignados = repartirPorHandicap(cantidad, plantel(cantidad));
    const planilla = generarPlanilla(cantidad, asignados);

    assert.deepEqual(verificarPlanilla(planilla), [], `falla con ${cantidad} jugadores`);

    // Los lugares en cancha tienen que dar exacto: 8 por chukker.
    const lugares = planilla.jugadores.reduce((a, x) => a + x.juega.length, 0);
    assert.equal(lugares, 8 * FORMATOS[cantidad].chukkers, `lugares con ${cantidad} jugadores`);
  }
});

test('el reparto por handicap respeta los cupos y no deja diferencias grandes', () => {
  const plantel = [
    { id: '1', apodo: 'Venturino', handicap: 5 },
    { id: '2', apodo: 'Sanchez E.', handicap: 4 },
    { id: '3', apodo: 'Neves F.', handicap: 4 },
    { id: '4', apodo: 'Flores', handicap: 3 },
    { id: '5', apodo: 'Tassara', handicap: 2 },
    { id: '6', apodo: 'Neves G.', handicap: 2 },
    { id: '7', apodo: 'Gomez J.', handicap: 2 },
    { id: '8', apodo: 'Ardissone', handicap: 1 },
    { id: '9', apodo: 'Orrico', handicap: 1 },
    { id: '10', apodo: 'Bigio', handicap: 0 },
    { id: '11', apodo: 'Gerike', handicap: 0 },
    { id: '12', apodo: 'Prieri', handicap: -1 },
  ];

  const doce = repartirPorHandicap(12, plantel);
  for (const color of ['azul', 'blanco', 'colorado']) {
    assert.equal(doce.filter((x) => x.color === color).length, 4);
  }
  assert.ok(desbalance(doce, 12) <= 2, `desbalance de ${desbalance(doce, 12)} goles`);

  const nueve = repartirPorHandicap(9, plantel.slice(0, 9));
  assert.equal(nueve.filter((x) => x.color === 'bicolor').length, 1);
  assert.equal(nueve.filter((x) => x.color === 'azul').length, 4);
  assert.equal(nueve.filter((x) => x.color === 'blanco').length, 4);
  assert.ok(desbalance(nueve, 9) <= 2, `desbalance de ${desbalance(nueve, 9)} goles`);
});

test('los que juegan todos los chukkers son los que se eligieron primero', () => {
  // Se eligen en este orden, con el handicap más alto anteúltimo a propósito.
  const eleccion = [
    { id: '1', apodo: 'Primero', handicap: 0 },
    { id: '2', apodo: 'Segundo', handicap: 1 },
    { id: '3', apodo: 'Tercero', handicap: 0 },
    { id: '4', apodo: 'Cuarto', handicap: 1 },
    { id: '5', apodo: 'Quinto', handicap: 2 },
    { id: '6', apodo: 'Sexto', handicap: 0 },
    { id: '7', apodo: 'Septimo', handicap: 1 },
    { id: '8', apodo: 'Octavo', handicap: 5 },
    { id: '9', apodo: 'Noveno', handicap: 0 },
  ];

  const planilla = generarPlanilla(9, repartirPorHandicap(9, eleccion));
  const de7 = planilla.jugadores.filter((x) => x.todos);

  assert.equal(de7.length, 2, 'uno por equipo juega los 7');
  for (const jugador of de7) {
    const companeros = planilla.jugadores.filter((x) => x.color === jugador.color);
    const posicion = eleccion.findIndex((e) => e.apodo === jugador.apodo);
    for (const otro of companeros) {
      if (otro.apodo === jugador.apodo) continue;
      assert.ok(
        posicion < eleccion.findIndex((e) => e.apodo === otro.apodo),
        `${jugador.apodo} juega los 7 pero ${otro.apodo} se eligió antes`,
      );
    }
  }

  // El de handicap 5 se eligió octavo: no le toca jugar de más por ser el mejor.
  assert.equal(planilla.jugadores.find((x) => x.apodo === 'Octavo').todos, false);
});

test('no deja armar una práctica con los equipos incompletos', () => {
  assert.throws(
    () => generarPlanilla(12, [j('Joaco', 'azul'), j('Emi pp.', 'blanco')]),
    ErrorDeArmado,
  );
  assert.throws(
    () => generarPlanilla(8, [
      j('Joaco', 'azul'), j('Alejo', 'azul'), j('Seba B.', 'azul'), j('Guido S.', 'azul'),
      j('Emi pp.', 'azul'), j('Tabru', 'blanco'), j('Colo', 'blanco'), j('Diego K.', 'blanco'),
    ]),
    ErrorDeArmado,
  );
});

// ------------------------------------------------------ lo que va a la base

test('el orden que se guarda es el lugar dentro del equipo', () => {
  const planilla = generarPlanilla(10, [
    j('A1', 'azul'), j('A2', 'azul'), j('A3', 'azul'), j('A4', 'azul'), j('A5', 'azul'),
    j('B1', 'blanco'), j('B2', 'blanco'), j('B3', 'blanco'), j('B4', 'blanco'), j('B5', 'blanco'),
  ]);
  // La base tiene unique (practica_id, equipo, orden): 0..4 en cada equipo.
  ['azul', 'blanco'].forEach((color) => {
    const ordenes = planilla.jugadores.filter((x) => x.color === color).map((x) => x.orden);
    assert.deepEqual(ordenes, [0, 1, 2, 3, 4], `los órdenes del ${color}`);
  });
});

test('la planilla guardada se vuelve a leer igual', () => {
  for (const cantidad of [8, 9, 10, 12]) {
    const plantel = Array.from({ length: cantidad }, (_, i) => ({
      id: `j${i}`, apodo: `J${i}`, nombre: `Jugador ${i}`, handicap: (i % 5) - 1,
    }));
    const original = generarPlanilla(cantidad, repartirPorHandicap(cantidad, plantel));

    // Así viajan las filas de practica_jugador de vuelta desde PostgreSQL.
    const filas = original.jugadores.map((x) => ({
      jugador_id: x.id, equipo: x.color, orden: x.orden, sale: x.sale,
      juega_de: x.juegaDe || null, nombre: x.nombre, apodo: x.apodo,
      hcp_interno: x.handicap,
    }));

    const leida = paraPantalla(desdeGuardado(cantidad, filas));
    const escrita = paraPantalla(original);

    assert.deepEqual(leida.jugadores, escrita.jugadores, `ida y vuelta con ${cantidad}`);
    assert.deepEqual(leida.hcpPorEquipo, escrita.hcpPorEquipo);
    assert.deepEqual(leida.formacion, escrita.formacion);
  }
});

// ---------------------------------------------------- resultados y puntos

test('los enfrentamientos salen del formato', () => {
  for (const cantidad of [8, 9, 10]) {
    assert.deepEqual(enfrentamientos(cantidad).map((e) => [e.equipoA, e.equipoB]),
      [['azul', 'blanco']], `formato ${cantidad}`);
  }
  assert.deepEqual(enfrentamientos(12).map((e) => [e.orden, e.equipoA, e.equipoB, e.desde, e.hasta]), [
    [1, 'azul', 'blanco', 1, 3],
    [2, 'blanco', 'colorado', 4, 6],
    [3, 'colorado', 'azul', 7, 9],
  ]);
});

test('ganar suma 3 y empatar 1', () => {
  const partido = { equipoA: 'azul', equipoB: 'blanco', golesA: 6, golesB: 4 };
  assert.equal(puntosDelPartido(10, 'azul', partido), 3);
  assert.equal(puntosDelPartido(10, 'blanco', partido), 0);

  const empate = { equipoA: 'azul', equipoB: 'blanco', golesA: 4, golesB: 4 };
  assert.equal(puntosDelPartido(10, 'azul', empate), 1);
  assert.equal(puntosDelPartido(10, 'blanco', empate), 1);

  // Sin resultado cargado todavía no hay puntos.
  assert.equal(puntosDelPartido(10, 'azul', { equipoA: 'azul', equipoB: 'blanco', golesA: null, golesB: null }), 0);
});

test('el bicolor se lleva el promedio de los dos equipos', () => {
  const gana = { equipoA: 'azul', equipoB: 'blanco', golesA: 7, golesB: 4 };
  assert.equal(puntosDelPartido(9, 'bicolor', gana), 1.5);
  const empate = { equipoA: 'azul', equipoB: 'blanco', golesA: 4, golesB: 4 };
  assert.equal(puntosDelPartido(9, 'bicolor', empate), 1);
});

test('en las de 12 los enfrentamientos valen la mitad y el máximo sigue siendo 3', () => {
  const resultados = [
    { equipoA: 'azul', equipoB: 'blanco', golesA: 5, golesB: 3 },     // gana azul
    { equipoA: 'blanco', equipoB: 'colorado', golesA: 4, golesB: 4 }, // empate
    { equipoA: 'colorado', equipoB: 'azul', golesA: 6, golesB: 2 },   // gana colorado
  ];
  const total = (equipo) => resultados.reduce((a, p) => a + puntosDelPartido(12, equipo, p), 0);

  assert.equal(total('azul'), 1.5);      // ganó uno, perdió el otro
  assert.equal(total('blanco'), 0.5);    // perdió uno, empató el otro
  assert.equal(total('colorado'), 2);    // empató uno, ganó el otro

  // Cada equipo juega dos de los tres: el que descansa no suma.
  assert.equal(puntosDelPartido(12, 'colorado', resultados[0]), 0);

  // Ganando los dos que le tocan, un equipo llega al mismo tope que en las otras.
  const gananTodo = [
    { equipoA: 'azul', equipoB: 'blanco', golesA: 5, golesB: 1 },
    { equipoA: 'blanco', equipoB: 'colorado', golesA: 1, golesB: 5 },
    { equipoA: 'colorado', equipoB: 'azul', golesA: 1, golesB: 5 },
  ];
  assert.equal(gananTodo.reduce((a, p) => a + puntosDelPartido(12, 'azul', p), 0), 3);
});

test('el handicap de la práctica es el promedio de los cuatro de cada equipo', () => {
  const j = (handicap) => ({ handicap });
  // Cinco por equipo: cuentan los cuatro más altos.
  const diez = { azul: [j(5), j(2), j(1), j(0), j(-1)], blanco: [j(3), j(3), j(1), j(1), j(0)] };
  assert.equal(hcpDeLaPractica(diez), 8);   // (5+2+1+0) y (3+3+1+1) -> 8 y 8

  // El bicolor suma en los dos lados.
  const nueve = { azul: [j(1), j(0), j(0), j(0)], blanco: [j(1), j(0), j(0), j(0)], bicolor: [j(3)] };
  assert.equal(hcpDeLaPractica(nueve), 4);

  assert.equal(hcpDeLaPractica({}), null);
});
