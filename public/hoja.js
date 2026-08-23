/* ===========================================================================
   La hoja de la práctica — mismo armado que los Word del club.

   Se dibuja en un canvas A4 a 150 ppp y de ahí sale la imagen que se manda por
   WhatsApp. No calcula nada: el `x7` y los paréntesis vienen ya escritos desde
   el servidor, que es donde vive el motor.

   Se usa así:
     Hoja.compartir(planilla, cabecera, boton)   imagen al menú de compartir
     Hoja.texto(planilla, cabecera)              la misma planilla en texto
   `cabecera` es { fecha, hora, cancha, notas }.
   =========================================================================== */

window.Hoja = (function () {
  const HOJA = { w: 1240, h: 1754, margen: 92 };
  const TINTA = { negro: '#111111', gris: '#555555', linea: '#999999' };
  const LABEL = { azul: 'AZUL', blanco: 'BLANCO', colorado: 'COLORADO', bicolor: 'BICOLOR' };
  const IMPRESO = { azul: '#1d4ed8', blanco: '#111111', colorado: '#b91c1c', bicolor: '#92400e' };

  const LOGO = new Image();
  LOGO.src = window.LOGO_SAN_DIEGO || '';

  /** Como lo escribe el club en la planilla: "Sábado 9/9". */
  function fechaCorta(iso) {
    const d = new Date(iso + 'T12:00:00');
    const dia = d.toLocaleDateString('es-AR', { weekday: 'long' });
    return dia.charAt(0).toUpperCase() + dia.slice(1) + ' ' + d.getDate() + '/' + (d.getMonth() + 1);
  }

  function fuente(px, peso) {
    return (peso ? peso + ' ' : '') + px + 'px "Helvetica Neue", Helvetica, Arial, sans-serif';
  }

  /** Parte el texto en líneas que entren en el ancho dado, respetando los saltos. */
  function envolverTexto(ctx, texto, maxAncho) {
    const lineas = [];
    texto.split('\n').forEach((parrafo) => {
      const palabras = parrafo.trim().split(/\s+/).filter(Boolean);
      if (!palabras.length) { lineas.push(''); return; }
      let actual = palabras[0];
      for (let i = 1; i < palabras.length; i++) {
        const probar = actual + ' ' + palabras[i];
        if (ctx.measureText(probar).width > maxAncho) { lineas.push(actual); actual = palabras[i]; }
        else actual = probar;
      }
      lineas.push(actual);
    });
    return lineas;
  }

  function dibujar(ctx, planilla, cabecera) {
    const { w, h, margen } = HOJA;
    const ancho = w - margen * 2;
    const nota = String(cabecera.notas || '').trim();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    // El logo va arriba a la derecha, a la altura del bloque de fecha y hora.
    if (LOGO.complete && LOGO.naturalWidth) {
      const alto = 210;
      const anchoLogo = LOGO.naturalWidth * alto / LOGO.naturalHeight;
      ctx.drawImage(LOGO, w - margen - anchoLogo, margen, anchoLogo, alto);
    }

    let y = margen + 52;

    ctx.fillStyle = TINTA.negro;
    ctx.font = fuente(52, 'bold');
    ctx.fillText(fechaCorta(cabecera.fecha), margen, y);
    y += 60;

    ctx.font = fuente(42);
    ctx.fillText('Cancha ' + cabecera.cancha, margen, y);
    y += 54;
    ctx.fillText(cabecera.hora + ' hs.', margen, y);
    y += 40;

    ctx.font = fuente(30);
    ctx.fillStyle = TINTA.gris;
    ctx.fillText(planilla.chukkers + ' chukkers', margen, y);
    y += 58;

    if (planilla.cantidad === 9 || planilla.cantidad === 10) {
      ctx.font = fuente(32);
      ctx.fillStyle = TINTA.negro;
      ctx.fillText('Entre paréntesis está el chukker que salen.', margen, y);
      y += 56;
    }

    // ---- tabla de equipos
    const equipos = planilla.equipos;
    const colAncho = ancho / equipos.length;
    const filas = Math.max.apply(null, equipos.map((e) =>
      planilla.jugadores.filter((j) => j.color === e).length));
    const altoCabecera = 66;
    const altoFila = 74;
    const altoTabla = altoCabecera + filas * altoFila;
    const tablaY = y;

    ctx.strokeStyle = TINTA.linea;
    ctx.lineWidth = 2;
    ctx.strokeRect(margen, tablaY, ancho, altoTabla);
    ctx.beginPath();
    ctx.moveTo(margen, tablaY + altoCabecera);
    ctx.lineTo(margen + ancho, tablaY + altoCabecera);
    for (let i = 1; i < equipos.length; i++) {
      ctx.moveTo(margen + colAncho * i, tablaY);
      ctx.lineTo(margen + colAncho * i, tablaY + altoTabla);
    }
    ctx.stroke();

    equipos.forEach((equipo, i) => {
      const x = margen + colAncho * i;
      const padding = 26;

      ctx.fillStyle = IMPRESO[equipo];
      ctx.font = fuente(38, 'bold');
      ctx.fillText(LABEL[equipo], x + padding, tablaY + 46);

      planilla.jugadores.filter((j) => j.color === equipo).forEach((j, fila) => {
        const filaY = tablaY + altoCabecera + altoFila * fila + 48;
        ctx.fillStyle = TINTA.negro;
        ctx.font = fuente(36);
        ctx.fillText(j.apodo, x + padding, filaY);

        if (j.nota) {
          ctx.font = fuente(32, j.todos ? 'bold' : '');
          ctx.fillStyle = j.todos ? TINTA.negro : TINTA.gris;
          ctx.textAlign = 'right';
          ctx.fillText(j.nota, x + colAncho - padding, filaY);
          ctx.textAlign = 'left';
        }
      });
    });

    y = tablaY + altoTabla + 44;

    // ---- el bicolor va en su propio recuadro, como en la planilla de 9
    const bicolor = planilla.jugadores.find((j) => j.color === 'bicolor');
    if (bicolor) {
      const alto = 96;
      ctx.strokeRect(margen, y, colAncho, alto);
      ctx.fillStyle = IMPRESO.bicolor;
      ctx.font = fuente(26, 'bold');
      ctx.fillText('BICOLOR', margen + 26, y + 36);
      ctx.fillStyle = TINTA.negro;
      ctx.font = fuente(36);
      ctx.fillText(bicolor.apodo, margen + 26, y + 76);
      ctx.font = fuente(32);
      ctx.fillStyle = TINTA.gris;
      ctx.textAlign = 'right';
      ctx.fillText(bicolor.nota, margen + colAncho - 26, y + 76);
      ctx.textAlign = 'left';
      y += alto + 44;
    }

    // ---- las franjas de las de 12
    if (planilla.franjas) {
      ctx.font = fuente(34);
      planilla.franjas.forEach((f) => {
        ctx.fillStyle = TINTA.negro;
        const etiqueta = 'Chukkers ' + f.desde + ' a ' + f.hasta + ':  ';
        ctx.fillText(etiqueta, margen, y);
        const x = margen + ctx.measureText(etiqueta).width;
        const uno = LABEL[f.juegan[0]];
        ctx.fillStyle = IMPRESO[f.juegan[0]];
        ctx.fillText(uno, x, y);
        const x2 = x + ctx.measureText(uno).width;
        ctx.fillStyle = TINTA.negro;
        ctx.fillText('  vs  ', x2, y);
        ctx.fillStyle = IMPRESO[f.juegan[1]];
        ctx.fillText(LABEL[f.juegan[1]], x2 + ctx.measureText('  vs  ').width, y);
        y += 48;
      });
      y += 12;
    }

    // ---- la nota del organizador, en su recuadro
    if (nota) {
      ctx.font = fuente(32);
      const lineas = envolverTexto(ctx, nota, ancho - 56);
      const alto = 34 + lineas.length * 44;
      ctx.strokeStyle = TINTA.linea;
      ctx.lineWidth = 2;
      ctx.strokeRect(margen, y, ancho, alto);
      ctx.fillStyle = TINTA.negro;
      lineas.forEach((linea, i) => ctx.fillText(linea, margen + 28, y + 48 + i * 44));
      y += alto + 44;
    }

    // ---- el pie del club, corrido abajo del cuadro como en los Word
    const pie = [
      'Puntualidad.',
      'Cambios rápidos entre chukkers.',
      'Mantener limpia la zona de Palenques.',
      'Manager de polo Tito Bogado.        +54 9 11 6865-5766',
    ];
    ctx.font = fuente(32);
    ctx.fillStyle = TINTA.negro;
    let pieY = y + 24;
    pie.forEach((linea) => { ctx.fillText(linea, margen, pieY); pieY += 48; });

    return pieY;   // dónde terminó el contenido
  }

  /**
   * La hoja se dibuja en una A4 entera y después se recorta a lo que ocupó.
   * En WhatsApp la miniatura es la imagen entera: media página en blanco abajo
   * hace que la planilla se vea diminuta.
   */
  function enCanvas(planilla, cabecera) {
    const completa = document.createElement('canvas');
    completa.width = HOJA.w;
    completa.height = HOJA.h;
    const fin = dibujar(completa.getContext('2d'), planilla, cabecera);

    const alto = Math.min(HOJA.h, Math.round(fin + HOJA.margen));
    if (alto >= HOJA.h) return completa;

    const recortada = document.createElement('canvas');
    recortada.width = HOJA.w;
    recortada.height = alto;
    const ctx = recortada.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, HOJA.w, alto);
    ctx.drawImage(completa, 0, 0);
    return recortada;
  }

  const aBlob = (canvas) =>
    new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));

  const nombreDeArchivo = (planilla, cabecera) =>
    'practica-' + cabecera.fecha + '-cancha' + cabecera.cancha + '-' + planilla.cantidad + 'jug.jpg';

  /* La imagen se prepara apenas se arma la planilla y queda guardada. Compartir
     tiene que salir en el mismo toque del botón: si el navegador tiene que
     esperar a que se dibuje, pierde el permiso y no abre el menú de compartir. */
  let lista = { clave: null, blob: null };

  function clave(planilla, cabecera) {
    return [
      cabecera.fecha, cabecera.cancha, cabecera.hora, cabecera.notas, planilla.cantidad,
      planilla.jugadores.map((j) => j.id + ':' + j.color).join(','),
    ].join('|');
  }

  async function preparar(planilla, cabecera) {
    const k = clave(planilla, cabecera);
    if (lista.clave === k && lista.blob) return lista.blob;
    // Si el logo todavía no cargó, se lo espera: sin él la hoja sale coja.
    if (!LOGO.complete && LOGO.src) {
      await new Promise((resolve) => {
        LOGO.addEventListener('load', resolve, { once: true });
        LOGO.addEventListener('error', resolve, { once: true });
        setTimeout(resolve, 1500);
      });
    }
    const blob = await aBlob(enCanvas(planilla, cabecera));
    lista = { clave: k, blob };
    return blob;
  }

  function avisar(boton, texto, original) {
    boton.textContent = texto;
    boton.disabled = false;
    if (texto !== original) setTimeout(() => { boton.textContent = original; }, 3000);
  }

  function bajar(planilla, cabecera, boton, original) {
    const blob = lista.blob;
    if (!blob) { avisar(boton, 'No se pudo generar la imagen', original); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreDeArchivo(planilla, cabecera);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    avisar(boton, 'Guardada — mandala por WhatsApp', original);
  }

  /**
   * En el celular abre el menú de compartir con la imagen adentro, que es como
   * llega a WhatsApp. En la computadora no existe ese menú: ahí la baja.
   */
  async function compartir(planilla, cabecera, boton) {
    const original = boton.dataset.original || boton.textContent;
    boton.dataset.original = original;
    boton.disabled = true;

    const nombre = nombreDeArchivo(planilla, cabecera);
    let blob = lista.clave === clave(planilla, cabecera) ? lista.blob : null;
    if (!blob) {
      boton.textContent = 'Preparando…';
      blob = await preparar(planilla, cabecera);
    }

    if (blob && navigator.canShare) {
      const archivo = new File([blob], nombre, { type: 'image/jpeg' });
      if (navigator.canShare({ files: [archivo] })) {
        try {
          await navigator.share({ files: [archivo] });
          avisar(boton, 'Compartida', original);
          return;
        } catch (e) {
          // Si lo cerró a propósito no hay nada que avisar; si no, se baja.
          if (e && e.name === 'AbortError') { avisar(boton, original, original); return; }
        }
      }
    }
    bajar(planilla, cabecera, boton, original);
  }

  /** La misma planilla en texto, para pegar en el grupo. */
  function texto(planilla, cabecera) {
    const lineas = [];
    lineas.push('SAN DIEGO — Práctica');
    lineas.push(fechaCorta(cabecera.fecha) + ' · Cancha ' + cabecera.cancha
      + ' · ' + cabecera.hora + ' hs · ' + planilla.chukkers + ' chukkers');
    lineas.push('');
    planilla.equipos.forEach((equipo) => {
      lineas.push(LABEL[equipo]);
      planilla.jugadores.filter((j) => j.color === equipo).forEach((j) => {
        lineas.push('  ' + j.apodo + (j.nota ? '  ' + j.nota : ''));
      });
      lineas.push('');
    });
    const bicolor = planilla.jugadores.find((j) => j.color === 'bicolor');
    if (bicolor) {
      lineas.push('BICOLOR');
      lineas.push('  ' + bicolor.apodo + '  ' + bicolor.nota);
      lineas.push('');
    }
    if (planilla.franjas) {
      planilla.franjas.forEach((f) => {
        lineas.push('Chukkers ' + f.desde + ' a ' + f.hasta + ': '
          + LABEL[f.juegan[0]] + ' vs ' + LABEL[f.juegan[1]]);
      });
      lineas.push('');
    }
    if (String(cabecera.notas || '').trim()) {
      lineas.push(String(cabecera.notas).trim());
      lineas.push('');
    }
    if (planilla.cantidad === 9 || planilla.cantidad === 10) {
      lineas.push('Entre paréntesis está el chukker que salen.');
    }
    lineas.push('Puntualidad. Cambios rápidos entre chukkers.');
    lineas.push('Mantener limpia la zona de palenques.');
    lineas.push('Manager de polo: Tito Bogado. +54 9 11 6865-5766');
    return lineas.join('\n');
  }

  function copiar(planilla, cabecera, boton) {
    const contenido = texto(planilla, cabecera);
    const original = boton.dataset.original || boton.textContent;
    boton.dataset.original = original;
    const listo = () => avisar(boton, 'Copiado', original);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(contenido).then(listo).catch(() => respaldo(contenido, boton, listo, original));
    } else {
      respaldo(contenido, boton, listo, original);
    }
  }

  function respaldo(contenido, boton, listo, original) {
    const area = document.createElement('textarea');
    area.value = contenido;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:-1000px';
    document.body.appendChild(area);
    area.select();
    let salio = false;
    try { salio = document.execCommand('copy'); } catch (e) { salio = false; }
    document.body.removeChild(area);
    if (salio) listo();
    else avisar(boton, 'No se pudo copiar — sacale una captura', original);
  }

  return { preparar, compartir, copiar, texto, enCanvas, fechaCorta, LABEL, IMPRESO };
})();
