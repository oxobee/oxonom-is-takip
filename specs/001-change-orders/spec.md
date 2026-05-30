# Feature Specification: Ordenes de Cambio (Change Orders)

**Feature Branch**: `001-change-orders`

**Created**: 2026-05-30

**Status**: Draft

**Input**: User description: "ArchiFlow necesita un módulo de Órdenes de Cambio para gestionar modificaciones al alcance, costo o cronograma de un proyecto de construcción. Las órdenes de cambio son el workflow más crítico en construcción: cuando el cliente pide algo nuevo, hay un cambio en condiciones del sitio, o se necesita ajustar el presupuesto, se debe documentar formalmente, obtener aprobaciones, y actualizar el presupuesto del proyecto. Actualmente ArchiFlow no tiene este módulo — los usuarios lo hacen manualmente fuera de la plataforma."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Crear Orden de Cambio (Priority: P1)

Como Director o Arquitecto de proyecto, quiero crear una Orden de Cambio formal cuando el alcance, costo o cronograma del proyecto cambia, para documentar la modificación y enviarla a aprobación. Debo poder especificar: tipo de cambio (alcance, costo, cronograma, combinado), descripción detallada, justificación, impacto en costo (monto anterior, monto nuevo, diferencia), impacto en cronograma (días de extensión si aplica), y adjuntar archivos de soporte (fotos, planos, documentos). La orden debe tener un estado (borrador, pendiente aprobación, aprobada, rechazada, cancelada) y quedar vinculada al proyecto correspondiente.

**Why this priority**: Sin la capacidad de crear órdenes de cambio, todo el módulo no existe. Es el flujo mínimo viable — crear, editar como borrador, y enviar a aprobación. Esto ya entrega valor porque formaliza un proceso que hoy se hace por WhatsApp o email.

**Independent Test**: Se puede probar creando una orden de cambio desde un proyecto existente, llenando todos los campos, guardándola como borrador, y luego enviándola a aprobación. El resultado debe ser un documento en Firestore con estado "pendiente" visible en la pantalla de Órdenes de Cambio del proyecto.

**Acceptance Scenarios**:

1. **Given** un usuario con rol Admin/Director/Arquitecto en un proyecto activo, **When** crea una nueva Orden de Cambio completando descripción, justificación e impacto de costo, **Then** la orden se guarda en Firestore con estado "borrador" vinculada al projectId y tenantId correctos
2. **Given** una orden de cambio en estado "borrador", **When** el usuario hace clic en "Enviar a aprobación", **Then** el estado cambia a "pendiente_aprobacion" y se envía una notificación al Interventor/Super Admin del tenant
3. **Given** una orden de cambio en estado "borrador", **When** el usuario adjunta un archivo (foto, PDF), **Then** el archivo se sube a Firebase Storage y la referencia queda en el documento de la orden
4. **Given** un usuario con rol Contratista o Miembro, **When** intenta crear una Orden de Cambio, **Then** el sistema bloquea la acción y muestra un mensaje de permisos insuficientes

---

### User Story 2 - Aprobar/Rechazar Orden de Cambio (Priority: P2)

Como Interventor o Super Admin, quiero revisar y aprobar o rechazar las Órdenes de Cambio pendientes, con comentarios de revisión, para que el cambio quede formalmente autorizado o denegado con trazabilidad. Al aprobar una orden de cambio de costo, el presupuesto del proyecto debe actualizarse automáticamente (si la orden tiene impacto en costo). Al aprobar una orden de cronograma, la fecha de finalización del proyecto debe ajustarse. Cada cambio de estado debe registrarse en el log de actividad.

**Why this priority**: La aprobación es el segundo paso crítico del workflow. Sin ella, las órdenes quedan en limbo. Pero es P2 porque P1 (crear) ya permite documentar el cambio; la aprobación agrega el flujo formal.

**Independent Test**: Se puede probar creando una orden de cambio (P1), luego como Interventor navegando a la lista de pendientes, abriendo la orden, escribiendo un comentario de revisión, y aprobándola. Verificar que el presupuesto del proyecto se actualiza con el monto aprobado.

**Acceptance Scenarios**:

1. **Given** una orden de cambio en estado "pendiente_aprobacion", **When** un Interventor o Super Admin la aprueba con comentarios, **Then** el estado cambia a "aprobada", se registra la aprobación (aprobadoPor, fechaAprobacion, comentarios), y se actualiza el presupuesto del proyecto si aplica
2. **Given** una orden de cambio en estado "pendiente_aprobacion", **When** un Interventor o Super Admin la rechaza con razón, **Then** el estado cambia a "rechazada", se registra la razón, y el presupuesto NO se modifica
3. **Given** una orden de cambio aprobada con impacto en costo de +$50,000,000 COP, **When** se aprueba, **Then** el campo `budget` del proyecto incrementa en $50,000,000 COP y se registra en el log de actividad
4. **Given** una orden de cambio aprobada con impacto en cronograma de +15 días, **When** se aprueba, **Then** la fecha `endDate` del proyecto se extiende 15 días y se registra en el log de actividad
5. **Given** un usuario con rol Arquitecto o Contratista, **When** intenta aprobar una orden, **Then** el sistema bloquea la acción (solo Interventor/Super Admin pueden aprobar)

---

### User Story 3 - Listar y Filtrar Órdenes de Cambio (Priority: P3)

Como cualquier miembro del equipo de proyecto, quiero ver la lista de Órdenes de Cambio de mi proyecto con filtros por estado, tipo y fecha, para tener visibilidad de los cambios que han ocurrido y su estado de aprobación. Debo poder ver un resumen con el número de orden, tipo, descripción corta, monto del impacto, estado y fecha. El contador del Dashboard debe mostrar cuántas órdenes están pendientes de aprobación.

**Why this priority**: La visualización es necesaria para la usabilidad del módulo, pero las P1 y P2 ya permiten crear y aprobar. Sin la lista, los usuarios no podrían encontrar sus órdenes fácilmente.

**Independent Test**: Se puede probar creando varias órdenes de cambio con diferentes estados (borrador, pendiente, aprobada, rechazada) y verificando que los filtros funcionan correctamente y el Dashboard muestra el contador de pendientes.

**Acceptance Scenarios**:

1. **Given** un proyecto con 5 órdenes de cambio (2 aprobadas, 2 pendientes, 1 rechazada), **When** el usuario filtra por estado "pendiente_aprobacion", **Then** solo se muestran las 2 órdenes pendientes
2. **Given** un proyecto con órdenes de cambio, **When** el usuario filtra por tipo "costo", **Then** solo se muestran las órdenes cuyo tipo sea "costo" o "combinado"
3. **Given** un proyecto con 3 órdenes pendientes de aprobación, **When** el usuario ve el Dashboard, **Then** el widget de Órdenes de Cambio muestra "3 pendientes" con link a la lista filtrada
4. **Given** un usuario con rol Cliente, **When** ve las órdenes de cambio, **Then** solo puede verlas (read-only), no puede crear, editar ni aprobar

---

### User Story 4 - Historial y Exportar Órdenes de Cambio (Priority: P4)

Como Director o Interventor, quiero ver el historial completo de cambios de cada orden (quién la creó, cuándo se envió, quién la aprobó/rechazó, comentarios) y poder exportar la lista a PDF o Excel para reportes a clientes y entidades. El PDF debe incluir el membrete del proyecto, la información completa de cada orden, y las firmas digitales (nombre + fecha de aprobación).

**Why this priority**: La exportación y auditoría es importante para la formalidad del proceso constructivo, pero no es esencial para el MVP. Las primeras tres historias ya entregan el flujo completo.

**Independent Test**: Se puede probar creando y aprobando una orden de cambio, luego exportando la lista a PDF y verificando que contiene todos los datos correctos con el formato esperado.

**Acceptance Scenarios**:

1. **Given** una orden de cambio con actividad (creación, envío, aprobación), **When** el usuario abre el historial, **Then** ve la secuencia cronológica de eventos con usuario, fecha, acción y comentarios
2. **Given** un proyecto con órdenes de cambio, **When** el usuario exporta a PDF, **Then** se genera un PDF con nombre del proyecto, logo, tabla de órdenes con todos los campos, y sección de aprobaciones
3. **Given** un proyecto con órdenes de cambio, **When** el usuario exporta a Excel, **Then** se genera un archivo .xlsx con columnas para todos los campos de cada orden

---

### Edge Cases

- ¿Qué pasa cuando se intenta aprobar una orden de cambio que ya fue aprobada? El sistema debe mostrar un error: "Esta orden ya fue procesada"
- ¿Qué pasa cuando se elimina un proyecto que tiene órdenes de cambio? Las órdenes se conservan pero se marcan como "proyecto eliminado" para auditoría
- ¿Qué pasa cuando el monto de la orden de cambio excede el presupuesto restante del proyecto? Se muestra una advertencia pero se permite crear la orden (la decisión es del Interventor)
- ¿Qué pasa si dos usuarios intentan aprobar la misma orden simultáneamente? Firestore maneja la concurrencia — solo la primera transacción exitosa cambia el estado
- ¿Qué pasa cuando un usuario pierde el rol de Interventor mientras tiene órdenes pendientes? Las órdenes permanecen pendientes, cualquier otro Interventor/Super Admin puede aprobarlas
- ¿Qué pasa con órdenes de cambio de cronograma cuando el proyecto ya terminó? Se muestra advertencia "El proyecto ya finalizó" pero se permite crear la orden para proyectos cerrados administrativamente

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE permitir crear órdenes de cambio vinculadas a un proyecto y tenant específicos
- **FR-002**: Cada orden de cambio DEBE tener: número secuencial (CO-001, CO-002...), tipo (alcance, costo, cronograma, combinado), descripción, justificación, estado, impactos (costo y/o cronograma), y referencias a archivos adjuntos
- **FR-003**: El sistema DEBE implementar el flujo de estados: borrador → pendiente_aprobacion → aprobada/rechazada → (cancelada desde cualquier estado anterior a aprobación)
- **FR-004**: Solo roles Admin, Director, Arquitecto pueden crear y editar órdenes de cambio en estado borrador
- **FR-005**: Solo roles Interventor y Super Admin pueden aprobar o rechazar órdenes de cambio
- **FR-006**: Al aprobar una orden con impacto en costo, el sistema DEBE actualizar automáticamente el presupuesto del proyecto
- **FR-007**: Al aprobar una orden con impacto en cronograma, el sistema DEBE extender automáticamente la fecha de finalización del proyecto
- **FR-008**: Cada cambio de estado DEBE registrarse en el log de actividad del proyecto
- **FR-009**: El sistema DEBE enviar notificaciones a los aprobadores cuando una orden cambia a "pendiente_aprobacion"
- **FR-010**: El sistema DEBE enviar notificación al creador cuando su orden es aprobada o rechazada
- **FR-011**: Los archivos adjuntos DEBEN almacenarse en Firebase Storage bajo la ruta `tenants/{tenantId}/changeOrders/{orderId}/`
- **FR-012**: Las órdenes de cambio DEBEN incluirse en los reportes de presupuesto del proyecto (ReportsFinanciero)
- **FR-013**: El Dashboard DEBE mostrar un widget con el conteo de órdenes pendientes de aprobación
- **FR-014**: El sistema DEBE generar números secuenciales de orden por proyecto (CO-001, CO-002...) usando un contador atómico
- **FR-015**: El sistema DEBE permitir filtrar órdenes por estado, tipo y rango de fechas
- **FR-016**: El rol Cliente DEBE tener acceso solo lectura a las órdenes de cambio
- **FR-017**: El sistema DEBE soportar la exportación de órdenes a PDF y Excel

### Key Entities

- **ChangeOrder**: Número secuencial, tipo, descripción, justificación, estado, impacto costo (montoAnterior, montoNuevo, diferencia), impacto cronograma (días extensión), archivos adjuntos, historial de aprobación, vinculada a projectId y tenantId
- **ChangeOrderHistory**: Log de eventos por orden (creación, envío, aprobación, rechazo, cancelación) con usuario, timestamp, acción y comentarios
- **ChangeOrderCounter**: Contador secuencial por proyecto para generar números CO-001, CO-002...

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un Director puede crear una orden de cambio completa en menos de 3 minutos (incluyendo adjuntar 1 archivo)
- **SC-002**: Un Interventor puede aprobar o rechazar una orden de cambio en menos de 1 minuto
- **SC-003**: Al aprobar una orden de costo, el presupuesto del proyecto se actualiza en tiempo real (< 2 segundos)
- **SC-004**: La lista de órdenes carga en menos de 1 segundo para proyectos con hasta 100 órdenes
- **SC-005**: El módulo funciona correctamente en Android WebView/TWA (flujo completo de crear y aprobar)
- **SC-006**: Las notificaciones de órdenes pendientes llegan en menos de 5 segundos

## Assumptions

- Los archivos adjuntos usan Firebase Storage (ya configurado en el proyecto)
- El presupuesto del proyecto se almacena en el campo `budget` del documento del proyecto en Firestore
- La fecha de finalización del proyecto se almacena en `endDate` del documento del proyecto
- Las notificaciones usan el sistema existente (`notifyExternal` y `useNotifications`)
- Los roles de usuario ya están definidos en el sistema (`ADMIN_EMAILS`, `rolePerms`)
- El módulo debe respetar la arquitectura multi-tenant existente (tenantId en todos los documentos)
- La numeración secuencial es por proyecto, no por tenant
- Se asume que solo se necesita un nivel de aprobación (no requiere cadena de aprobaciones múltiples)
- El tamaño máximo de archivos adjuntos es 10MB por archivo, máximo 5 archivos por orden
