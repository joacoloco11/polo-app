# Cómo publicar la app

Tres pasos: subir el código a GitHub, conectarlo a Vercel, cargar dos claves.
De punta a punta son unos 15 minutos, y solo se hace una vez.

## 1. Subir el código a GitHub

1. Entrá a [github.com/new](https://github.com/new).
2. **Repository name**: `polo-san-diego`. Dejalo en **Private**.
3. **Create repository**.
4. En la pantalla que sigue, clic en **uploading an existing file**.
5. Arrastrá ahí adentro **el contenido de la carpeta `app/`** — o sea `api`,
   `lib`, `public`, `tests`, `package.json`, `vercel.json`, `dev.js` y
   `.gitignore`. **La carpeta `app` en sí no**: lo que va arriba de todo es
   `package.json`, no otra carpeta.
6. Abajo, **Commit changes**.

> No subas `node_modules` si la tenés: es pesada y Vercel la genera sola. El
> archivo `.gitignore` ya la excluye.

## 2. Conectarlo a Vercel

1. Entrá a [vercel.com/new](https://vercel.com/new).
2. Vercel te va a mostrar tus repositorios de GitHub. Al lado de
   `polo-san-diego`, **Import**. Si no aparece, hay un botón para darle permiso
   de ver tus repositorios.
3. **No toques nada de la configuración** — la detecta sola.
4. Antes de darle Deploy, abrí **Environment Variables** y cargá las dos del
   paso 3.
5. **Deploy**. Tarda un minuto y te da una dirección tipo
   `polo-san-diego.vercel.app`.

## 3. Las dos claves

### `DATABASE_URL`

En Supabase, botón **Connect** arriba (o **Settings → Database → Connection
string**). Elegí la opción **Transaction pooler** — la del puerto **6543**.
Copiá esa línea y **reemplazá `[YOUR-PASSWORD]` por la contraseña de la base**
que guardaste cuando creaste el proyecto.

**Los corchetes se borran también.** Antes:

```
postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
```

Después, si tu contraseña fuera `Caballo2026`:

```
postgresql://postgres.abcdefgh:Caballo2026@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
```

Los dos puntos de antes y el arroba de después quedan donde están. Sin espacios.
Conviene hacer el cambio en un bloc de notas y recién después pegar el
resultado en Vercel.

Si no te acordás la contraseña, se resetea en **Settings → Database → Reset
database password**; no rompe nada de lo ya cargado. Y si tu contraseña tiene
símbolos (`@`, `#`, `/`, `?`, `:`) la conexión falla, porque adentro de una
dirección esos caracteres significan otra cosa: en ese caso reseteala y usá la
que genera Supabase, que es solo letras y números.

### `SESSION_SECRET`

**Esta no se busca en ningún lado: te la inventás vos.** No es una clave de
Supabase ni de Vercel, existe solo para esta app.

Escribí un texto largo y sin sentido, de 40 caracteres o más — apoyá los dedos
en el teclado, o encadená palabras al azar tipo
`caballo-tormenta-94-palenque-azul-chukker-77-verano`. No tiene que ser fácil
de recordar: se pega una vez y no se vuelve a escribir. Guardala donde
guardaste la contraseña de la base.

Sirve para firmar las sesiones: es lo que impide que alguien se fabrique una
cookie diciendo que es administrador. Si algún día la cambiás no se rompe nada,
pero todos tienen que volver a poner el PIN una vez.

## Si algo no arranca

Abrí tu dirección con `/api/diagnostico` al final —por ejemplo
`polo-san-diego.vercel.app/api/diagnostico`— y te dice exactamente qué falta:
si alguna variable no está cargada, si la contraseña de la base no coincide, si
faltan las tablas. No muestra ningún dato tuyo, solo qué está mal y qué hacer.

Acordate de que **las variables recién toman efecto en el próximo deploy**:
después de cargarlas hay que ir a **Deployments**, menú `···` del primero,
**Redeploy**.

## Cuando la app cambie

Cuando te pase una versión nueva: entrá a tu repositorio en GitHub, **Add file
→ Upload files**, arrastrá los archivos nuevos encima de los viejos y
**Commit changes**. Vercel se entera solo y republica en un minuto. Las claves
del paso 3 quedan donde están: eso se carga una sola vez.

> **Ojo:** subir archivos **agrega y pisa, pero no borra**. Si una versión nueva
> mueve o elimina archivos, los viejos siguen ahí y pueden romper el deploy. En
> ese caso hay que borrarlos a mano: entrás a la carpeta en GitHub, el menú
> `···` arriba a la derecha de la lista, **Delete directory**.

### El límite de funciones de Vercel

En el plan gratuito, Vercel no deja pasar de **12 "Serverless Functions"** por
deploy, y cuenta **un archivo de la carpeta `api/` como una función**. Si el
build falla con *"No more than 12 Serverless Functions…"*, es eso.

Por eso la carpeta `api/` tiene **un solo archivo**, `servidor.js`, y
`vercel.json` manda para ahí todo lo que empiece con `/api/`. Los endpuntos
viven en `lib/rutas/`, que Vercel no cuenta. Queda **una** función usada de las
doce. Si alguna vez agregás un archivo suelto en `api/`, volvés a gastar cupo.

**Para comprobar que quedó bien**, entrá a la carpeta `api` de tu repositorio en
GitHub: tiene que haber **un solo archivo, `servidor.js`**. Si ves ahí
`login.js`, `plantel.js`, `practicas.js` o una carpeta `_lib`, son los viejos y
hay que borrarlos — subir archivos no borra nada.

Si la versión nueva trae cambios en la base, hay que correr `db/schema.sql` otra
vez en el SQL Editor de Supabase **antes** de subir el código. Ese archivo se
puede correr las veces que haga falta: si algo ya está, lo deja como está, y no
borra datos. Al final te muestra una línea con cuántas tablas, vistas y
políticas quedaron.

## Después

La dirección que te da Vercel es la que va en la descripción del grupo. Cada
uno la abre, elige su nombre, pone su PIN y queda dentro.

Para que quede como una app en el celular: abrirla en el navegador, menú
compartir, **Agregar a pantalla de inicio**.

---

## Probarla en tu computadora (opcional)

Solo si tenés Node instalado y ganas. No hace falta para nada de lo de arriba.

```bash
npm install
cp .env.example .env      # y completás las dos claves
node --env-file=.env dev.js
```

Queda en `http://localhost:3000`. El archivo `dev.js` imita el ruteo de Vercel
y no se usa en producción.
