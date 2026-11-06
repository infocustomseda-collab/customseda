# Conexión de customseda.com a la nueva tienda

## Estado de la preparación — 6 de noviembre de 2026

El administrador ha autorizado conectar `customseda.com` a la nueva web, ha confirmado que el catálogo de Shopify no ha cambiado desde la importación, que ya puede entrar al CMS y que Stripe permite cobros reales. No se ha cancelado Shopify ni se han cambiado registros del dominio durante esta preparación.

La zona `customseda.com` está activa en Cloudflare, plan Free. La consulta pública previa muestra `customseda.com` → `23.227.38.66` y `www.customseda.com` → `shops.myshopify.com`. Estos datos no sustituyen una copia actual de todos los registros antes del cambio. Los servidores de nombres siguen siendo `elmo.ns.cloudflare.com` y `romina.ns.cloudflare.com`.

La sesión de Wrangler puede consultar la zona y los dominios de Workers, pero no los registros DNS. La credencial de configuración existente también devuelve un error de autenticación al consultar DNS. Es necesario recuperar ese acceso para exportar los registros y preparar el cambio de `www`. No ampliar permisos de Stripe para consultar el estado de cuenta: la clave restringida no permite esa lectura y el administrador ya ha confirmado el estado.

## Cambio preparado

- [wrangler.jsonc](../wrangler.jsonc): dominio personalizado de producción `customseda.com`, `EMDASH_SITE_URL=https://customseda.com` y `CMS_ORIGIN` de staging actualizado.
- [src/lib/domain-redirect.ts](../src/lib/domain-redirect.ts): la dirección pública antigua de Workers redirige con 301 al dominio real, conservando ruta y consulta. El Worker se ejecuta antes de los archivos estáticos para que también redirijan páginas, imágenes y recursos. No modifica staging ni localhost.
- El contenido, la base de datos, los medios y las credenciales existentes se conservan. La copia de páginas del proceso normal de publicación generará canonical, sitemap y metadatos con el dominio real.

No integrar esta rama hasta coordinar DNS, Stripe y el despliegue. La redirección de la dirección antigua requiere que el dominio real esté conectado; integrarla antes dejaría a los visitantes en Shopify.

El cambio anterior de Checkout Studio permanece separado en `fix/stripe-checkout-studio`; no forma parte de esta rama.

## Comprobaciones posteriores y evolución

- El administrador ha iniciado sesión en el panel de Cloudflare. Se ha exportado el DNS actual a `.emdash/backups/domain-2026-11-06/dns-before.txt` (ignorado). Hay 12 registros; además del A de Shopify existe un AAAA raíz `2620:127:f00f:6::`, también sin proxy. La copia registra correo y subdominios para preservarlos.
- D1 rechaza la exportación completa por sus tablas virtuales FTS. Se han exportado las 83 tablas ordinarias a `production-tables-before.sql` en la misma carpeta privada; se excluyen índices virtuales y sus tablas derivadas, que requieren reconstrucción al restaurar. No se ha realizado ninguna restauración.
- Compra de prueba completada con tarjeta de Stripe y datos ficticios: MAREA, tallas M/M, recogida, 50 EUR. Checkout devuelve la página de agradecimiento y la API confirma `status=complete`, `payment_status=paid`, `livemode=false`. La clave restringida no permite leer Events (403), por lo que esta comprobación no confirma la entrega del webhook.
- Se ha creado la regla nativa de Cloudflare `WWW a customseda.com` (`f6d1c7ade73746dca75379def79cd820`): `http.host eq "www.customseda.com"`, destino dinámico `concat("https://customseda.com", http.request.uri.path)`, 301 y conservación de consulta. Está habilitada, pero `www` sigue sin proxy; aún no desvía tráfico.
- No se ha asociado el dominio al Worker, modificado A/AAAA/CNAME, actualizado Stripe ni integrado esta PR. La tienda pública continúa en Shopify.
- Tras incorporar `origin/master` (`efc6c04`), pasan 276 pruebas, tipos y la comprobación de GitHub. Sin embargo, [la última publicación de master](https://github.com/infocustomseda-collab/customseda/actions/runs/42233954530) falla antes de subir el Worker: `English size copies are referenced; review and merge their selections before cleanup.` La migración de tallas introducida por la PR #50 encuentra nueve copias inglesas, todas sin referencias actuales pero con una revisión histórica cada una. No borrar revisiones ni saltarse ese control para publicar el dominio: resolver primero la migración preservando la restauración del historial.

## Orden del cambio

La corrección del bloqueo de tallas se ha integrado en [PR #51](https://github.com/infocustomseda-collab/customseda/pull/51). La migración conserva las identidades referenciadas y el historial sin reescribirlo, y permite que termine la publicación. La rama del dominio incorpora esa corrección; las comprobaciones de la regresión incluyen restaurar la versión antigua como borrador.

### Conexión aplicada tras la confirmación de los dos registros DNS

El administrador confirmó específicamente la sustitución del A y AAAA de Shopify. Ambos se han retirado y `customseda.com` se ha asociado al Worker `customseda`. HTTPS devuelve 200 con la nueva tienda. `www` conserva su registro CNAME, ahora dirigido a `customseda.com` con proxy: la regla nativa devuelve 301 tanto desde HTTP como desde HTTPS y conserva ruta y consulta. No se han modificado los registros MX/TXT ni `account.customseda.com`.

El endpoint de Stripe `we_1UYVrRAZJSfcbFofm7xd1QBO` se ha actualizado desde el Dashboard a `https://customseda.com/api/stripe/webhook`, conservando sus cuatro eventos, versión y secreto. El plugin entraba en un bucle de autenticación al intentar escribir; el Dashboard confirmó el destino actualizado. No se ha enviado un evento de prueba a producción: la revisión automática rechazó ese POST por la prohibición del proyecto de realizar escrituras de prueba allí. Queda pendiente verificar una entrega real autorizada; una lectura GET no valida el procesamiento de eventos POST.

La integración de esta PR inicia la publicación de los nuevos orígenes y la redirección de Workers. No dar por completada esa publicación hasta una comprobación posterior. Shopify sigue contratado y accesible para el historial; no se ha transferido la renovación del dominio. El administrador debe entrar por correo al CMS del nuevo dominio y registrar una passkey para ese origen.

1. Completar la compra de prueba en staging y confirmar su pago y entrega del webhook en el sandbox, sin registrar datos de prueba en la base de datos de producción. Revisar envío, tallas y devolución a la tienda. La sesión abierta durante la preparación muestra `Entorno de prueba` y usa `cs_test_`; abrirla no equivale a completar el pago.
2. Con el acceso a Cloudflare recuperado, exportar el DNS actual a un archivo ignorado y guardar una copia de la base de datos y del catálogo de origen. Anotar la revisión de Git y la versión desplegada. Conservar los pedidos históricos de Shopify y confirmar que siguen accesibles. Evitar cambios editoriales y coordinar los pedidos que lleguen durante el traslado.
3. Revisar las comprobaciones de la PR y conectar el dominio raíz al Worker `customseda`, cuenta `9e52d6bc1e5b9be5cd11be4c1030485a`. El registro A actual es de Shopify: revisar la sustitución prevista en Cloudflare. No modificar MX, TXT, correo ni `account.customseda.com`.
4. Para `www`, preparar la redirección nativa de Cloudflare a `https://customseda.com`, conservando ruta y consulta. Requiere un registro DNS con proxy para `www`. Guardar antes el CNAME actual de Shopify. Comprobar las reglas existentes para añadir la nueva sin reemplazarlas.
5. Verificar HTTPS y acceso al webhook en el dominio real antes de actualizar Stripe. Cambiar solo la URL del endpoint de producción `we_1UYVrRAZJSfcbFofm7xd1QBO` a `https://customseda.com/api/stripe/webhook`, conservando su secreto, versión y los cuatro eventos existentes. El endpoint de staging permanece igual. No crear un endpoint nuevo sin coordinar su secreto.
6. Integrar la PR del dominio y dejar que GitHub publique producción y después staging. La publicación genera las páginas desde contenido publicado y conserva el proceso normal de migraciones. Informar del enlace y del despliegue en curso, sin darlo por terminado hasta una comprobación posterior.
7. Después del despliegue, comprobar dominio raíz y `www`, redirecciones de la dirección antigua, canonical/sitemap, páginas, medios, CMS, «Ver sitio» y un webhook firmado. El administrador entra al CMS del dominio nuevo por correo y registra una nueva passkey: la antigua pertenece al origen Workers. Una compra real y su reembolso requieren participación y autorización específica del administrador.
8. Mantener Shopify disponible para pedidos históricos, devoluciones y recuperación. No cancelar la suscripción ni transferir la renovación del dominio como parte de este cambio.

## Recuperación

Si falla la conexión antes del despliegue, restaurar los registros web originales de la copia DNS y desactivar solo la nueva regla de `www`. Mantener el endpoint de Stripe en una dirección que siga atendiendo POST sin redirecciones.

Si ya se integró la PR, preparar su reversión por PR, restaurando el origen Workers tanto en producción como en staging y retirando la redirección de la dirección antigua. Coordinar la restauración del webhook y DNS con esa publicación. No restaurar bases de datos ni medios como parte de una reversión de dominio. Las redirecciones 301 pueden permanecer en las cachés de los navegadores.

## Referencias

- [Dominios personalizados de Workers](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Redirección de www al dominio raíz](https://developers.cloudflare.com/rules/url-forwarding/examples/redirect-www-to-root/)
- [Plan, fase 12](superpowers/plans/2026-10-24-custom-seda.md#12-domain-cutover-and-operational-handover)
