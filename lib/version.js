/**
 * Qué versión de la app está publicada.
 *
 * Existe por una pregunta concreta que no tenía respuesta: "subí los archivos
 * pero no veo los cambios, ¿llegaron o no?". Con esto se contesta mirando: el
 * número está abajo de todo en la pantalla y también en /api/diagnostico.
 *
 * Se cambia a mano en cada versión que se publica. Y va pegado al `?v=` de los
 * `<script>` de index.html, que es lo que obliga al celular a bajar el código
 * nuevo en vez de usar el que tenía guardado.
 */

module.exports = { VERSION: '2026.09.02' };
