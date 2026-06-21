# Esquema de licencias de Ezio

Ezio usa licenciamiento híbrido por package:

| Package      | Licencia    | Razón |
|---|---|---|
| @ezio/core   | AGPLv3      | Núcleo de razonamiento — copyleft de red |
| @ezio/api    | AGPLv3      | Expone Core como servicio |
| @ezio/sdk    | AGPLv3*     | *Temporal — ver nota abajo |
| @ezio/mcp    | Apache 2.0  | Capa de integración, sin lógica de negocio |
| @ezio/cli    | MIT         | Aplicación, no librería para embeber |
| @ezio/app    | MIT         | Aplicación, no librería para embeber |
| skills/agents| MIT         | Contenido declarativo |

Nota sobre @ezio/sdk: la versión actual importa @ezio/core directamente
in-process, por lo que hereda obligaciones de AGPLv3. Esto es temporal:
una vez que el SDK hable con Core exclusivamente vía red (a través de
@ezio/api), pasará a Apache 2.0. Ver roadmap.

---