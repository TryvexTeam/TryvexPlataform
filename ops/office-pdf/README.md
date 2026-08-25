# office-pdf — vistas previas de Office en el chat

Convierte los adjuntos de Office del chat a **PDF** para que se vean fiel (membrete,
portada, diseño) y nítidos con scroll. El chat los dibuja con PDF.js.

## Cómo funciona
`watcher.py` corre en el VPS (systemd `tryvex-office-pdf`), mira el bucket
`adjuntos-chat` de Supabase y por cada Office sin PDF deja el resultado en
`_pdf/<id>.pdf`. El endpoint del CRM (`/api/chat/adjuntos/[id]?pdf=1`) lo sirve.

- **Word / Excel** → LibreOffice, local en el VPS.
- **PowerPoint** (pptx/ppt/odp) → **CloudConvert** (LibreOffice Impress no puede
  con presentaciones en este servidor). El pptx sale a CloudConvert **una sola
  vez** al convertirlo; el PDF que vuelve queda como nuestro. Sin la key, los
  pptx se saltan y se quedan en el visor de Microsoft (como estaban).

## La API key de CloudConvert
1. Crear cuenta gratis en https://cloudconvert.com (10 conversiones/día, sin tarjeta).
2. Dashboard → API Keys → crear una con permiso **`task.write`** (y `task.read`).
3. Guardarla en el vault y ponerla en el VPS como `CLOUDCONVERT_API_KEY`
   (env del servicio `tryvex-office-pdf`, p. ej. en `/etc/tryvex/office-pdf.env`).
4. `systemctl restart tryvex-office-pdf`.

## Reintentar un pptx que falló
Los pptx ya intentados se anotan en `/var/lib/tryvex-office-pdf/pptx-intentados.txt`
para no quemar las 10/día en un archivo que falla en loop. Para reintentar uno,
se borra su línea de ese archivo y se reinicia el servicio.
