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

    // Los goles de cada equipo, si ya se cargó el resultado. En las de 12 son
    // tres partidos, así que el marcador va abajo con cada franja.
    const partidos = (cabecera.partidos || []).filter((p) => p.golesA !== null && p.golesA !== undefined);
    const golesDe = {};
    if (planilla.cantidad !== 12) {
      partidos.forEach((p) => { golesDe[p.equipoA] = p.golesA; golesDe[p.equipoB] = p.golesB; });
    }

    equipos.forEach((equipo, i) => {
      const x = margen + colAncho * i;
      const padding = 26;

      ctx.fillStyle = IMPRESO[equipo];
      ctx.font = fuente(38, 'bold');
      ctx.fillText(LABEL[equipo], x + padding, tablaY + 46);

      // El marcador al lado del color, como lo escribe el club.
      if (golesDe[equipo] !== undefined) {
        ctx.font = fuente(44, 'bold');
        ctx.fillStyle = TINTA.negro;
        ctx.textAlign = 'right';
        ctx.fillText(String(golesDe[equipo]), x + colAncho - padding, tablaY + 48);
        ctx.textAlign = 'left';
      }

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

    // ---- las franjas de las de 12, con su marcador si ya está cargado
    if (planilla.franjas) {
      ctx.font = fuente(34);
      planilla.franjas.forEach((f, i) => {
        const partido = (cabecera.partidos || []).find((p) => p.orden === i + 1);
        const conGoles = partido && partido.golesA !== null && partido.golesA !== undefined;

        ctx.fillStyle = TINTA.negro;
        const etiqueta = 'Chukkers ' + f.desde + ' a ' + f.hasta + ':  ';
        ctx.fillText(etiqueta, margen, y);
        let x = margen + ctx.measureText(etiqueta).width;

        const escribir = (texto, color) => {
          ctx.fillStyle = color;
          ctx.fillText(texto, x, y);
          x += ctx.measureText(texto).width;
        };

        escribir(LABEL[f.juegan[0]], IMPRESO[f.juegan[0]]);
        if (conGoles) escribir('  ' + partido.golesA, TINTA.negro);
        escribir('  vs  ', TINTA.negro);
        escribir(LABEL[f.juegan[1]], IMPRESO[f.juegan[1]]);
        if (conGoles) escribir('  ' + partido.golesB, TINTA.negro);
        y += 48;
      });
      y += 12;
    }

    // ---- el MVP, abajo de la lista
    if (cabecera.mvp) {
      ctx.font = fuente(34, 'bold');
      ctx.fillStyle = TINTA.negro;
      const etiqueta = 'MVP:  ';
      ctx.fillText(etiqueta, margen, y);
      ctx.font = fuente(34);
      ctx.fillText(cabecera.mvp, margen + ctx.measureText(etiqueta).width, y);
      y += 56;
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
      'Manager de polo Tito Bogado.        +54 9 11 5133-9095',
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
      // El resultado y el MVP cambian el dibujo: si no entran acá, la imagen
      // guardada se queda con el marcador viejo.
      (cabecera.partidos || []).map((p) => p.orden + ':' + p.golesA + '-' + p.golesB).join(','),
      cabecera.mvp || '',
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
    const partidos = (cabecera.partidos || []).filter((p) => p.golesA !== null && p.golesA !== undefined);
    const golesDe = {};
    if (planilla.cantidad !== 12) {
      partidos.forEach((p) => { golesDe[p.equipoA] = p.golesA; golesDe[p.equipoB] = p.golesB; });
    }

    planilla.equipos.forEach((equipo) => {
      lineas.push(LABEL[equipo] + (golesDe[equipo] !== undefined ? '  ' + golesDe[equipo] : ''));
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
      planilla.franjas.forEach((f, i) => {
        const p = (cabecera.partidos || []).find((x) => x.orden === i + 1);
        const con = p && p.golesA !== null && p.golesA !== undefined;
        lineas.push('Chukkers ' + f.desde + ' a ' + f.hasta + ': '
          + LABEL[f.juegan[0]] + (con ? ' ' + p.golesA : '')
          + ' vs ' + LABEL[f.juegan[1]] + (con ? ' ' + p.golesB : ''));
      });
      lineas.push('');
    }
    if (cabecera.mvp) {
      lineas.push('MVP: ' + cabecera.mvp);
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
    lineas.push('Manager de polo: Tito Bogado. +54 9 11 5133-9095');
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

  /**
   * Compartir cualquier imagen que arme la app, no solo la planilla: sale por
   * el menú del celular y, donde no existe, se baja.
   *
   * `texto` viaja al lado del archivo. Donde el destino lo acepta —WhatsApp lo
   * pone de epígrafe— la dirección de la app queda escrita en el mensaje, y ahí
   * sí se toca: adentro de un JPG no hay nada tocable.
   */
  async function compartirCanvas(canvas, nombre, boton, texto) {
    const original = boton.dataset.original || boton.textContent;
    boton.dataset.original = original;
    boton.disabled = true;
    boton.textContent = 'Preparando…';

    const blob = await aBlob(canvas);
    if (blob && navigator.canShare) {
      const archivo = new File([blob], nombre, { type: 'image/jpeg' });
      if (navigator.canShare({ files: [archivo] })) {
        try {
          await navigator.share(texto ? { files: [archivo], text: texto } : { files: [archivo] });
          avisar(boton, 'Compartida', original);
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') { avisar(boton, original, original); return; }
        }
      }
    }
    if (!blob) { avisar(boton, 'No se pudo generar la imagen', original); return; }
    bajarBlob(blob, nombre);
    avisar(boton, 'Guardada — mandala por WhatsApp', original);
  }

  function bajarBlob(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ------------------------------------------------------------------- PDF */

  /**
   * El mismo dibujo, en PDF y con un botón de verdad: lo único que se puede
   * tocar adentro de un archivo.
   *
   * Está escrito a mano, sin ninguna biblioteca. No es capricho: la app no baja
   * nada de afuera —por eso anda con mala señal en la cancha— y un PDF de una
   * página con una imagen adentro es media docena de objetos. El JPEG entra tal
   * cual, sin volver a comprimirlo, porque `DCTDecode` es justamente eso.
   */
  function pdfDeUnCanvas(canvas, bytesJpeg, enlaces) {
    const anchoPt = 595.28;                       // el ancho de una A4
    const altoPt = anchoPt * canvas.height / canvas.width;
    const aPt = (px) => px * anchoPt / canvas.width;

    const cachos = [];
    let largo = 0;
    const crudo = (texto) => {
      const b = new Uint8Array(texto.length);
      for (let i = 0; i < texto.length; i++) b[i] = texto.charCodeAt(i) & 0xff;
      return b;
    };
    const poner = (cosa) => {
      const b = typeof cosa === 'string' ? crudo(cosa) : cosa;
      cachos.push(b);
      largo += b.length;
    };

    const posiciones = [];
    const objeto = (numero, cuerpo, datos) => {
      posiciones[numero] = largo;
      poner(numero + ' 0 obj\n' + cuerpo);
      if (datos) { poner('\nstream\n'); poner(datos); poner('\nendstream'); }
      poner('\nendobj\n');
    };

    // El contenido: estirar la imagen a toda la página. La matriz `cm` lleva el
    // cuadrado unidad al tamaño del papel.
    const contenido = 'q ' + anchoPt.toFixed(2) + ' 0 0 ' + altoPt.toFixed(2) + ' 0 0 cm /Im0 Do Q';

    // Los anotadores de enlace van en coordenadas de PDF, que cuentan desde
    // abajo: por eso el `alto - y` de cada rectángulo.
    const anotaciones = (enlaces || []).map((z, i) => 7 + i);

    poner('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
    objeto(1, '<< /Type /Catalog /Pages 2 0 R >>');
    objeto(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    objeto(3, '<< /Type /Page /Parent 2 0 R'
      + ' /MediaBox [0 0 ' + anchoPt.toFixed(2) + ' ' + altoPt.toFixed(2) + ']'
      + ' /Resources << /XObject << /Im0 5 0 R >> >>'
      + ' /Contents 4 0 R'
      + (anotaciones.length ? ' /Annots [' + anotaciones.map((n) => n + ' 0 R').join(' ') + ']' : '')
      + ' >>');
    objeto(4, '<< /Length ' + contenido.length + ' >>', contenido);
    objeto(5, '<< /Type /XObject /Subtype /Image'
      + ' /Width ' + canvas.width + ' /Height ' + canvas.height
      + ' /ColorSpace /DeviceRGB /BitsPerComponent 8'
      + ' /Filter /DCTDecode /Length ' + bytesJpeg.length + ' >>', bytesJpeg);
    objeto(6, '<< /Type /Outlines /Count 0 >>');

    (enlaces || []).forEach((z, i) => {
      const x1 = aPt(z.x);
      const x2 = aPt(z.x + z.ancho);
      const y1 = altoPt - aPt(z.y + z.alto);
      const y2 = altoPt - aPt(z.y);
      objeto(7 + i, '<< /Type /Annot /Subtype /Link'
        + ' /Rect [' + [x1, y1, x2, y2].map((n) => n.toFixed(2)).join(' ') + ']'
        + ' /Border [0 0 0]'
        + ' /A << /Type /Action /S /URI /URI (' + z.url.replace(/([()\\])/g, '\\$1') + ') >> >>');
    });

    const total = 7 + (enlaces || []).length;
    const inicioXref = largo;
    let xref = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
    for (let n = 1; n < total; n++) {
      xref += String(posiciones[n]).padStart(10, '0') + ' 00000 n \n';
    }
    poner(xref);
    poner('trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + inicioXref + '\n%%EOF\n');

    const salida = new Uint8Array(largo);
    let i = 0;
    cachos.forEach((c) => { salida.set(c, i); i += c.length; });
    return new Blob([salida], { type: 'application/pdf' });
  }

  /** Arma el PDF de un canvas y lo manda al menú de compartir. */
  async function compartirPDF(canvas, nombre, boton, enlaces, texto) {
    const original = boton.dataset.original || boton.textContent;
    boton.dataset.original = original;
    boton.disabled = true;
    boton.textContent = 'Preparando…';

    const jpeg = await aBlob(canvas);
    if (!jpeg) { avisar(boton, 'No se pudo generar el archivo', original); return; }
    const pdf = pdfDeUnCanvas(canvas, new Uint8Array(await jpeg.arrayBuffer()), enlaces);

    if (navigator.canShare) {
      const archivo = new File([pdf], nombre, { type: 'application/pdf' });
      if (navigator.canShare({ files: [archivo] })) {
        try {
          await navigator.share(texto ? { files: [archivo], text: texto } : { files: [archivo] });
          avisar(boton, 'Compartido', original);
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') { avisar(boton, original, original); return; }
        }
      }
    }
    bajarBlob(pdf, nombre);
    avisar(boton, 'Guardado — mandalo por WhatsApp', original);
  }

  return {
    preparar, compartir, copiar, texto, enCanvas, compartirCanvas,
    compartirPDF, pdfDeUnCanvas,
    fechaCorta, fuente, LOGO, LABEL, IMPRESO,
  };
})();
