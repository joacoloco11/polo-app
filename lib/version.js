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

/**
 * En qué copia de la app estamos parados. Sale de la variable `AMBIENTE` de
 * Vercel: en la app de prueba vale `prueba`, y en la del club no está puesta.
 *
 * Es lo que hace que la de prueba lleve su franja naranja arriba. A propósito
 * **no** se mira la dirección: el código no tiene ninguna anotada, así que una
 * copia nueva —otra prueba, una demo— se marca poniendo la variable y nada más.
 */
const AMBIENTE = process.env.AMBIENTE === 'prueba' ? 'prueba' : 'produccion';

/**
 * Si la solapa **Anotación** está a la vista.
 *
 * El código es uno solo para las dos copias, pero no todo lo que está escrito
 * tiene que aparecer el mismo día: Anotación cambia cómo se junta la gente para
 * jugar, y eso se prueba antes de soltarlo al club. Así que va detrás de una
 * variable de Vercel —`ANOTACION=si`— en vez de sacarla del código y quedarse
 * con dos versiones que después hay que volver a juntar.
 *
 * Apagada, no aparece la solapa, nadie puede abrir una lista, y Armar elige del
 * plantel como venía haciendo. Prenderla no necesita subir nada: se agrega la
 * variable, **Redeploy**, y ya está.
 */
const ANOTACION = process.env.ANOTACION === 'si';

module.exports = { VERSION: '2026.09.24', AMBIENTE, ANOTACION };
