# Deploy a producción — Tryvex App

> Objetivo de este documento: que **todo lo que llega a `main` llegue a producción (Vercel)**, de forma predecible. Escrito tras un incidente real el 2026-07-17.

---

## TL;DR

- Producción vive en Vercel: **team `tryvex1` (Tryvex-Agency)**, proyecto **`tryvexplataform`** → https://tryvexplataform.vercel.app
- **Hoy el deploy NO es automático al mergear a `main`.** Hay que dispararlo a mano (comando abajo) hasta que se conecte la Git Integration.
- Deploy manual (desde `main` actualizado):
  ```bash
  git checkout main && git pull origin main
  vercel deploy --prod --yes --scope tryvex1
  ```

---

## Qué pasó (el incidente del 2026-07-17)

1. Ariel mergeó el **PR #21** (Vex: fix del clasificador + Botón 1 + 290 leads) a `main` de `TryvexTeam/TryvexPlataform`, con OK humano. Correcto.
2. **Los cambios NO aparecieron en producción.** Al revisar Vercel, el último deploy de producción era de un commit viejo ("PRP-007 Google Calendar"), no del #21.
3. Es decir: **mergear a `main` no disparó ningún deploy.** El código quedó en GitHub pero no en la web.

### Complicación que confundió el diagnóstico
Existen **dos proyectos Vercel con el mismo nombre** `tryvexplataform`:
- Uno en el team personal `ignvvcio254s-projects`, conectado a **otro repo** (`Dela07/tryvex-proyects`, rama `Lanidn`).
- El **real de producción**, en el team `tryvex1` (Tryvex-Agency).

Mirar el proyecto equivocado hace creer que "sí hubo deploy" cuando era de otro repo/rama. **Siempre verificar el scope `tryvex1`.**

---

## Causa

El proyecto `tryvexplataform` del team `tryvex1` **no está desplegando automáticamente desde `main` de `TryvexTeam/TryvexPlataform`**. O la Git Integration no está conectada a ese repo, o su Production Branch no es `main`. Por eso cada merge a `main` se queda en GitHub y no llega a la web solo.

---

## Solución aplicada hoy (deploy manual)

Desde el repo, parado en `main` **actualizado** (con el #21):

```bash
cd TryvexPlataform
git checkout main && git pull origin main        # traer lo aprobado
vercel deploy --prod --yes --scope tryvex1        # deploy a produccion
```

Resultado verificado: deploy `READY`, `target: production`, aliased a https://tryvexplataform.vercel.app (smoke test HTTP 307 → sirve, redirige a login).

⚠️ **OJO con la rama:** `vercel deploy` sube el **working directory actual**, no lo que está en GitHub. Si deployás desde una rama feature, subís esa rama (código sin revisar). **Siempre deployar desde `main` limpio.**

---

## La meta: que `main` → Vercel sea AUTOMÁTICO

Para no depender del deploy manual, conectar la **Git Integration** del proyecto:

1. Vercel → team **tryvex1** → proyecto **tryvexplataform** → **Settings → Git**.
2. Conectar el repo **`TryvexTeam/TryvexPlataform`** (si figura otro repo, reconectar a este).
3. **Production Branch = `main`**.
4. Guardar.

Desde ahí, **cada merge a `main` dispara un deploy de producción automático**. Los PRs generan Preview Deployments (URL por PR para revisar antes de mergear). Fin del deploy manual.

> Mientras no se conecte, usar el comando manual de arriba tras cada merge importante a `main`.

---

## Pendiente que bloquea Vex en la web

El código de Vex está en producción, pero **le faltan 2 env vars** en Vercel (verificado el 2026-07-17: no están en producción):

- `GEMINI_API_KEY`
- `GROQ_API_KEY`

Subirlas: Vercel → tryvex1 → tryvexplataform → **Settings → Environment Variables** → agregar ambas en **Production/Preview/Development** → **Redeploy**. Recién ahí Vex responde en la web.

Verificación objetiva: en producción, preguntarle a Vex *"mostrame los gimnasios"* → si responde con datos, las keys quedaron bien.

---

## Checklist de deploy (hasta que sea automático)

- [ ] `git checkout main && git pull origin main`
- [ ] Confirmar que `main` tiene lo que querés (`git log --oneline -5`)
- [ ] `vercel deploy --prod --yes --scope tryvex1`
- [ ] Smoke test: `curl -s -o /dev/null -w "%{http_code}" https://tryvexplataform.vercel.app` (307/200 = OK)
- [ ] Si tocaste Vex: confirmar `GEMINI_API_KEY` + `GROQ_API_KEY` en env vars

---

## PWA, push y jornada — pasos obligatorios antes de usarlo (PR #28)

El código ya está en `main`, pero **no funciona hasta hacer estas dos cosas**. Sin
ellas, `/jornada` responde error y las suscripciones push no se guardan.

### 1. Aplicar las migraciones

En Supabase → SQL Editor, pegar en este orden:

- `supabase/migrations/017_push_subscriptions.sql`
- `supabase/migrations/018_jornadas.sql`

La 018 crea la columna `es_admin` y la activa para
`ignacio.andres.navarrete.silva@gmail.com`: ese correo es el único que ve la
jornada de todo el equipo.

Alternativa desde la terminal, con `SUPABASE_DB_URL` en el entorno:

```bash
node --env-file=.env.local scripts/aplicar-migracion.mjs 017_push_subscriptions.sql
node --env-file=.env.local scripts/aplicar-migracion.mjs 018_jornadas.sql
```

Sin esa variable el script imprime el SQL para pegarlo a mano.

### 2. Cargar las llaves VAPID en Vercel

Las notificaciones push van firmadas con VAPID; sin las llaves no sale ningún aviso
(la campanita in-app sigue funcionando igual, el push es best-effort).

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` → `mailto:tryvexentreprise@gmail.com`

Están generadas en el `.env.local` local. Si hay que regenerarlas:

```bash
node -e "import('web-push').then(m=>console.log(m.default.generateVAPIDKeys()))"
```

Al cambiarlas, las suscripciones viejas dejan de servir: cada persona tiene que
volver a apretar **Activar notificaciones** en Configuración.

### Verificación objetiva

- `curl -s -o /dev/null -w "%{http_code}" https://tryvexplataform.vercel.app/manifest.webmanifest` → **200**
- Lo mismo con `/sw.js` y `/offline.html` → **200** (si dan 307, el matcher de `proxy.ts` volvió a taparlos)
- En Chrome, la barra de direcciones muestra el icono de instalar
- Marcar entrada en `/jornada` y confirmar que aparece la fila con "en curso"
