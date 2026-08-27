# Cómo publicar esta versión, paso por paso

Son dos cosas y **el orden importa**: primero el SQL, después el código. Si se
sube el código antes, la app va a pedirle a la base columnas que todavía no
existen y va a tirar error.

Calculá 10 minutos. Si algo no coincide con lo que dice acá, pará y mandame la
captura.

---

## PARTE 1 — El SQL en Supabase

Esta versión agrega dos columnas y una vista nueva. El archivo se puede correr
las veces que haga falta: no borra nada y no duplica nada.

**1.** Entrá a [supabase.com](https://supabase.com) y abrí tu proyecto.

**2.** En la barra de la izquierda, tocá **SQL Editor** (el ícono de la hoja con
`>_`).

**3.** Tocá **+ New query** arriba a la izquierda. Se abre un recuadro vacío.

**4.** Abrí el archivo `db/schema.sql` del zip con el Bloc de notas (Windows) o
TextEdit (Mac).
> Si lo abrís con Word te va a cambiar las comillas y no va a funcionar. Bloc de
> notas o TextEdit, nada más.

**5.** Seleccioná **todo** el contenido (`Ctrl+A` en Windows, `Cmd+A` en Mac) y
copialo (`Ctrl+C` / `Cmd+C`).

**6.** Volvé al recuadro de Supabase. **Antes de pegar**, hacé clic adentro del
recuadro y borrá lo que haya: `Ctrl+A` y después `Delete`. El recuadro tiene que
quedar completamente vacío.
> Esto es importante: el SQL Editor corre **todo** lo que hay en el recuadro. Si
> queda algo de una vez anterior, corre las dos cosas juntas.

**7.** Pegá (`Ctrl+V` / `Cmd+V`).

**8.** Tocá **Run** abajo a la derecha (o `Ctrl+Enter`).

**9.** Esperá unos segundos. Abajo te tiene que aparecer una tabla de una sola
fila, así:

| tablas | vistas | politicas |
|---|---|---|
| 11 | 4 | 18 |

**Lo que tenés que ver:** `vistas` en **4**. Si dice 3, la vista nueva no se
creó — mandame la captura.

**Los avisos amarillos que dicen `does not exist, skipping` son normales**: es
el archivo fijándose qué falta antes de crearlo. No son errores.

---

## PARTE 2 — El código en GitHub

**1.** Entrá a github.com y abrí tu repositorio.

**2.** Asegurate de estar en la **portada del repositorio**, no adentro de una
carpeta. Arriba de la lista de archivos tenés que ver el nombre del repositorio
y nada más — si ves `nombre-del-repo / api` o `nombre-del-repo / public`, estás
adentro de una carpeta: tocá el nombre del repositorio para volver.
> Esto es lo que nos hizo perder una tarde la otra vez: los archivos se suben
> **adentro de la carpeta donde estás parado**.

**3.** Descomprimí el zip `SUBIR-A-GITHUB.zip` en tu computadora. Te van a quedar
estas carpetas y archivos sueltos:

```
api/  db/  lib/  public/  tests/
dev.js  package.json  vercel.json  .gitignore  COMO-PUBLICAR.md
```

**4.** En GitHub, tocá **Add file** → **Upload files**.

**5.** Arrastrá **todo junto** —las cinco carpetas y los archivos sueltos— a la
zona que dice *Drag files here*.

**6.** Esperá a que termine de subir (aparece la lista completa abajo).

**7.** Abajo de todo, en el recuadro de mensaje, escribí algo como
`handicap automático, flecha y cumpleaños`.

**8.** Tocá **Commit changes**.

---

## PARTE 3 — Verificar que quedó bien

Vercel publica solo, en un minuto o dos.

**1.** Entrá a [vercel.com](https://vercel.com), abrí el proyecto y mirá
**Deployments**. El de arriba tiene que decir **Ready** en verde.
> Si dice **Error**, tocalo y mandame la captura de lo que dice en rojo.

**2.** Abrí la app en el celular y fijate estas cinco cosas:

- [ ] Al entrar te pide la **fecha de nacimiento** (a vos ya no, si la cargaste
      en la prueba; a los demás sí)
- [ ] En **Ranking**, al lado de cada nombre hay una **flecha** verde o roja
- [ ] En **Plantel**, arriba, está el **cartel del próximo cumpleaños**
- [ ] En **Plantel**, cada jugador muestra su HCP interno y, al lado, cuánto le
      movieron los resultados (`+2`, `-1`)
- [ ] Entrando como jugador común (no admin), **los invitados no aparecen** en
      el ranking

**3.** Si algo de eso no está, entrá a `tu-direccion.vercel.app/api/diagnostico`
y mandame lo que dice. Esa página explica sola qué falta y no muestra ningún
dato del club.

---

## Si algo sale mal

| Lo que ves | Qué pasó |
|---|---|
| `column ... does not exist` en la app | Falta correr el SQL (Parte 1) |
| `vistas: 3` en vez de 4 | El SQL corrió a medias: repetí la Parte 1 desde el paso 6 |
| Vercel en **Error** | Mandame la captura del deployment |
| El ranking sin flechas | El código viejo quedó cacheado: cerrá y volvé a abrir la app |

Correr el SQL de nuevo no rompe nada, así que ante la duda: repetilo.
