# Gestión del sitio desde el ordenador del administrador

El administrador puede pedir cambios en lenguaje normal y señalar elementos en el navegador integrado de Codex. Codex se encarga del código y de Git; el contenido editable se gestiona en Emdash.

## Abrir y revisar el sitio

Abre esta carpeta en Codex y pide «Abre el sitio para revisar un cambio». El comando de arranque es siempre:

```sh
pnpm dev:production
```

La dirección local es `http://localhost:4321`. El programa se ejecuta en este ordenador y se conecta a la base de datos y las imágenes de producción. Muestra borradores. Las sesiones son locales; las passkeys del dominio público no sirven en localhost. No se debe ejecutar el asistente inicial ni el acceso de desarrollo del CMS: podrían crear usuarios en la base de datos real. Para editar contenido, usa el CMS de producción.

- [Sitio público](https://customseda.customseda.workers.dev/).
- [CMS de producción](https://customseda.customseda.workers.dev/_emdash/admin/).
- [Vista de pruebas](https://customseda-staging.customseda.workers.dev/), con borradores y acceso restringido. Se puede entrar desde «View site» en el CMS.

Los cambios de código se ven localmente antes de publicarlos. Los cambios de contenido guardados en el CMS afectan a los datos reales. Guardar un borrador no lo publica en la web pública.

## Pedir un cambio

Codex distingue tres casos de código: una función nueva, una corrección y un cambio de texto o fotos definidos en código. Antes de empezar comprueba que parte de la última versión publicada en GitHub y conserva cualquier trabajo pendiente. Cada cambio se prepara por separado y se presenta para revisión.

Si el dato está en Emdash, Codex indica «Debes realizar este cambio en el CMS» y señala el tipo de contenido y el campo. Productos, textos e imágenes administrados por el CMS no deben copiarse a los archivos del sitio. Las plantillas, componentes y estilos siguen gestionándose en código.

Las anotaciones sobre diseño se aplican respetando los componentes, tipografía y espacios compartidos de `DESIGN.md`. Si un cambio afecta a varias páginas, Codex explica el alcance antes de aplicarlo.

Cuando esté listo, Codex pregunta «¿Lo implementamos en producción?». Tras la autorización, guarda el cambio en GitHub, prepara su solicitud de revisión y lo integra en `master` cuando pasen sus comprobaciones. Informa de que la publicación está en curso sin esperar a que termine el despliegue. La confirmación de que ya está publicado requiere comprobar el resultado posteriormente.

## Cómo se publica

Al actualizar `master`, GitHub ejecuta las pruebas y la comprobación de tipos. Si pasan y los entornos están habilitados, publica primero producción y después pruebas. Ese orden respeta la base de datos compartida. Las solicitudes de revisión también ejecutan las comprobaciones, sin desplegar.

Producción genera HTML desde una copia de los contenidos publicados durante la compilación, prepara las imágenes y comprueba la salida estática antes de subirla. El CMS, los pagos y las API siguen funcionando en el servidor. Pruebas genera las páginas en cada visita desde los datos reales y muestra borradores tras autenticarse.

Publicar desde el CMS necesita además `GITHUB_REBUILD_TOKEN` en el Worker de producción. Es una credencial distinta del token de Cloudflare. Sin ella, publicar guarda el contenido pero no solicita la reconstrucción de las páginas públicas. La configuración y renovación están en [deployment.md](deployment.md#publishing-and-rebuilds).

## Preparación y mantenimiento técnico

- Herramientas: Git, GitHub CLI conectado a la cuenta administradora, Node 24 compatible (24.22.2 instalado en este ordenador) y pnpm 11.25.0. Astro, Emdash y Wrangler se instalan desde el archivo de dependencias del proyecto: `pnpm install --frozen-lockfile`.
- Autenticación habitual: sesión de Wrangler del administrador, preferiblemente en el llavero de macOS. Si caduca, renovar con `pnpm exec wrangler login --use-keyring`.
- Clave existente de Emdash: `.env.cloudflare-production`, excluida de Git y con permisos 600. No generar otra para sustituirla.
- Token de Cloudflare para tareas de configuración: `~/.config/customseda/cloudflare.env`, fuera del repositorio y con permisos 600. No mostrar su contenido ni cargarlo como secreto del Worker.
- GitHub: entornos `production` y `staging`, cada uno con el secreto `CLOUDFLARE_API_TOKEN` y la variable `EMDASH_TARGET_FINGERPRINT`. Las variables del repositorio `PRODUCTION_DEPLOY_ENABLED` y `STAGING_DEPLOY_ENABLED` activan el despliegue automático. Revisar la huella contra la cuenta y la base de datos configuradas antes de guardarla.
- Validación: `pnpm test` y `pnpm typecheck`; para verificar el resultado de producción usar el proceso remoto documentado. No construir una copia vacía de contenido local como sustituto de una validación de producción.
- La utilidad de mantenimiento `advance-local-export.mjs` adapta los streams a cuerpos con longitud conocida para R2 y limita cada subida a 256 MiB. No se ejecuta durante el trabajo normal ni forma parte del Worker desplegado.

No ejecutar varias instancias de desarrollo a la vez ni publicar manualmente mientras GitHub esté desplegando. No probar escrituras, importaciones o restauraciones sobre producción para comprobar que el entorno funciona.
