# Project Architecture and Development Patterns

## 1. Overview

This project is a local-first desktop finance application built as an **Angular renderer + Electron main process + SQLite database** system.

The codebase is not organized like a typical HTTP backend with REST controllers and ORM entities. Instead, it uses an **IPC-driven layered architecture**:

- **Angular pages/components** render UI and trigger actions.
- **Angular services** act as typed client-side gateways to Electron IPC channels.
- **Electron controllers** validate payloads, orchestrate domain operations, and call model/data modules.
- **Electron models** encapsulate SQLite access and domain persistence logic.
- **SQLite** is the single source of truth for persisted financial data.
- **Typed DTO contracts** define the boundary between renderer and main process.

The project conventions are strongly centered on:
- explicit payload validation,
- DTO-to-model mapping,
- thin UI pages,
- domain-specific service/controller/model modules,
- local configuration and state persistence,
- predictable naming by feature/domain.

This is confirmed by:
- `src/app/config/api.ts`
- `src/app/services/base-ipc.service.ts`
- `src/app/services/accounts.service.ts`
- `electron/controllers/accounts.controller.js`
- `electron/controllers/transactions/transactions.controller.js`
- `electron/controllers/plan-items.controller.js`
- `electron/controllers/sync.controller.js`
- `electron/models/index.js`
- `electron/database/index.js`

---

## 2. High-Level Architecture

At a high level, the application has two runtime layers.

### Renderer layer: Angular application

The Angular app is configured in `src/app/app.config.ts` and routed in `src/app/app.routes.ts`.

Key characteristics:
- standalone Angular components,
- route-based page loading,
- root-provided services,
- local UI state via signals, RxJS, and local storage,
- no direct database or filesystem access.

Example from `src/app/app.config.ts`:

```ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideI18n(),
    provideZard(),
    provideEchartsCore({ echarts }),
  ],
};
```

### Main process layer: Electron controllers + models

The Electron side exposes domain modules through controllers collected in `electron/controllers/index.js`:

```js
module.exports = {
  appMetaController,
  accountsController,
  accountValuationsController,
  categoriesController,
  budgetsController,
  analyticsController,
  planItemsController,
  backupController,
  syncController,
  dataExportController,
  importExcelController,
  transactionsController,
  transfersController,
  resetController,
  updateController,
  windowController,
};
```

These controllers call Electron models registered in `electron/models/index.js`:

```js
module.exports = {
  appMetaModel,
  accountsModel,
  accountValuationsModel,
  categoriesModel,
  budgetsModel,
  analyticsModel,
  planItemsModel,
  backupModel,
  syncModel,
  dataExportModel,
  importExcelModel,
  transactionsModel,
  transfersModel,
};
```

### Persistence layer: SQLite helpers

Database access is centralized through `electron/database/index.js`, which exports low-level helpers such as:

- `insertRow`
- `selectOne`
- `selectRows`
- `updateRows`
- `deleteRows`
- `runMigrations`
- `createDatabase`
- `getDatabase`

This indicates a **custom data-access layer**, not an ORM.

---

## 3. Request Lifecycle

The dominant execution flow is:

**Angular page/component → Angular service → typed IPC client → Electron controller → Electron model → SQLite → controller response → Angular service mapping → UI**

### Example: account listing flow

1. A page or section requests accounts through `AccountsService`.
2. `AccountsService` calls `this.ipcClient.list(payload)`.
3. The Electron `accountsController.list()` validates and normalizes the payload.
4. It delegates to `accountsModel`.
5. The model queries SQLite.
6. The controller returns paginated DTO-shaped rows.
7. The Angular service maps DTOs into `AccountModel` instances.
8. The component consumes typed frontend models.

From `src/app/services/accounts.service.ts`:

```ts
async list(payload?: DTO.AccountListDto): Promise<AccountListResult> {
  const response = await this.ipcClient.list(payload);
  return mapPaginatedResult(response, (row) => AccountModel.fromDTO(row));
}
```

From `electron/controllers/accounts.controller.js`:

```js
function list(payload) {
  const { where, options, pagination, all } = normalizeWhereOptionsListPayload(payload, {
    allowedPayloadFields: LIST_PAYLOAD_FIELDS,
    defaultPage: DEFAULT_PAGE,
    defaultPageSize: DEFAULT_PAGE_SIZE,
    maxPageSize: MAX_PAGE_SIZE,
  });
  const { limit: _ignoredLimit, offset: _ignoredOffset, ...listOptions } = options;

  return executeWhereOptionsListQuery(accountsModel, { where, listOptions, pagination, all });
}
```

### Example: transfer creation flow

**UI dialog/page → `TransactionsService.createTransfer()` → IPC `transactions.createTransfer` → `transfersController.create()` → `transfersModel.create()` → bundled transfer response**

From `src/app/services/transactions.service.ts`:

```ts
async createTransfer(payload: DTO.TransactionCreateTransferDto): Promise<TransactionTransferResult> {
  const transfer = await this.ipcClient.createTransfer(payload);
  return mapTransferBundleResult(
    transfer,
    (row) => TransferModel.fromDTO(row),
    (row) => TransactionModel.fromDTO(row),
  );
}
```

From `electron/controllers/transactions/transfers.controller.js`:

```js
function create(payload, options = {}) {
  const transferPayload = normalizeCreatePayload(payload, options);
  return transfersModel.create(transferPayload);
}
```

### Special lifecycle: sync feature

The sync feature is more stateful:

**Angular SyncService → IPC sync controller → filesystem/database operations → IPC event broadcast → Angular event listeners update state and show toasts**

This is visible in:
- `src/app/pages/data-backups-page/services/sync.service.ts`
- `electron/controllers/sync.controller.js`

---

## 4. Models Pattern

## Purpose

There are two distinct “model” concepts in the project:

1. **Frontend models** in `src/app/models/`
   - wrap DTOs,
   - normalize values,
   - expose UI-friendly properties,
   - convert back to DTOs when needed.

2. **Electron data/domain models** in `electron/models/`
   - encapsulate persistence and domain operations against SQLite.

This separation is deliberate and important.

## File/location conventions

Frontend models:
- located in `src/app/models/`
- named `<domain>.model.ts`
- re-exported from `src/app/models/index.ts`

Examples:
- `src/app/models/accounts.model.ts`
- `src/app/models/transactions.model.ts`
- `src/app/models/common.model.ts`

Electron models:
- located in `electron/models/`
- named `<domain>.model.js`
- aggregated in `electron/models/index.js`

Examples:
- `electron/models/accounts.model.js`
- `electron/models/plan-items.model.js`
- `electron/models/sync.model.js`

## Structure

### Frontend model structure

Typical structure:
- immutable constructor fields,
- `static fromDTO(dto)` factory,
- optional computed getters,
- `toDTO()` serializer.

Example from `src/app/models/accounts.model.ts`:

```ts
export class AccountModel {
  constructor(
    public readonly id: RowId,
    public readonly name: string,
    public readonly type: AccountType,
    public readonly description: string | null,
    public readonly colorKey: string | null,
    public readonly icon: string | null,
    public readonly locked: boolean,
    public readonly archived: boolean,
    public readonly createdAt: UnixTimestampMilliseconds,
    public readonly updatedAt: UnixTimestampMilliseconds | null,
  ) {}

  static fromDTO(dto: AccountDto): AccountModel {
    return new AccountModel(
      dto.id,
      dto.name,
      normalizeAccountType(dto.type),
      dto.description,
      normalizeVisualColorKey(dto.color_key),
      normalizeVisualIconKey(dto.icon),
      toBooleanFlag(dto.locked),
      toBooleanFlag(dto.archived),
      dto.created_at,
      dto.updated_at,
    );
  }

  get displayMode(): AccountDisplayMode {
    return deriveAccountDisplayMode(this.type);
  }
}
```

### Shared frontend model helpers

`src/app/models/common.model.ts` contains normalization helpers shared by frontend models:

```ts
export function toBooleanFlag(value: SqliteBoolean): boolean {
  return value === 1;
}

export function centsToAmount(valueInCents: number): number {
  return valueInCents / 100;
}
```

This shows a convention:
- SQLite/DTO storage format stays close to persistence,
- frontend models convert to ergonomic UI types.

## Flow of execution

DTO from IPC response → `Model.fromDTO()` → component/UI usage  
UI edits → `toDTO()` or DTO payload construction → service → IPC

## Code examples

From `src/app/models/transactions.model.ts`:

```ts
static fromDTO(dto: TransactionDto): TransactionModel {
  return new TransactionModel(
    dto.id,
    dto.account_id,
    dto.category_id,
    dto.occurred_at,
    centsToAmount(dto.amount_cents),
    dto.description,
    [...dto.tags],
    dto.transfer_id,
    toBooleanFlag(dto.settled),
    dto.created_at,
    dto.updated_at,
  );
}
```

## How to add a new feature

For a new frontend entity:
1. Create `src/app/models/<entity>.model.ts`.
2. Add immutable constructor fields.
3. Implement `static fromDTO(dto)`.
4. Implement `toDTO()` if the UI needs reverse conversion.
5. Re-export it from `src/app/models/index.ts`.
6. Use it in the corresponding Angular service mapping.

## Best practices and rules

- Keep frontend models immutable.
- Always normalize DTO values at the boundary.
- Convert cents/flags/timestamps once in the model layer.
- Add computed getters for UI semantics, not persistence logic.

## Anti-patterns to avoid

- Passing raw DTOs directly through components.
- Mixing UI formatting logic into Electron models.
- Storing renderer-only derived fields in persistence DTOs.

---

## 5. Database / ORM Pattern

## Purpose

The project uses **SQLite with a custom data-access layer**, not an ORM.

The database layer exists to:
- keep persistence local and deterministic,
- centralize SQL access in Electron,
- avoid exposing DB concerns to Angular,
- support migrations and schema evolution.

## File/location conventions

Database infrastructure:
- `electron/database/index.js`
- likely supporting files under `electron/database/`

Electron persistence/domain models:
- `electron/models/*.model.js`

There are no ORM entities, decorators, or repository classes in the typical TypeORM/Sequelize sense.

## Structure

The pattern is:

- low-level DB helpers in `electron/database/`
- domain-specific model modules in `electron/models/`
- controllers call models directly

From `electron/database/index.js`:

```js
module.exports = {
  closeDatabase,
  countRows,
  createDatabase,
  deleteRows,
  getDatabase,
  getDatabasePath,
  getMigrationFilePaths,
  getSchemaFilePaths,
  initSchema,
  isFirstStart,
  insertRow,
  markFirstStartCompleted,
  runMigrations,
  selectDistinctYearsFromUnixTimestampColumn,
  selectOne,
  selectRows,
  updateRows,
};
```

This indicates:
- explicit SQL operations,
- reusable CRUD primitives,
- migration-driven schema management.

## Flow of execution

Controller validates payload → model performs DB operation → controller returns row/result

Example from `electron/controllers/accounts.controller.js`:

```js
const insertedId = accountsModel.create(row);
return accountsModel.getById(Number(insertedId));
```

## Code examples

Representative controller-to-model usage:

```js
const changed = accountsModel.updateById(id, {
  ...changes,
  updated_at: nowUnixTimestampMilliseconds(),
});

return {
  changed,
  row: accountsModel.getById(id),
};
```

## How to add a new feature

1. Add or update schema/migration files in the database layer.
2. Create `electron/models/<entity>.model.js`.
3. Implement persistence functions such as:
   - `create`
   - `getById`
   - `list`
   - `count`
   - `updateById`
   - `deleteById`
4. Re-export the model in `electron/models/index.js`.
5. Use the model from a controller.

## Best practices and rules

- Keep DB access in Electron only.
- Use model modules as the persistence boundary.
- Return plain row objects from Electron models.
- Apply migrations on startup.

## Anti-patterns to avoid

- Querying SQLite from Angular.
- Embedding SQL or DB helpers directly in controllers.
- Treating Electron controllers as persistence modules.

---

## 6. DTO / Schema Pattern

## Purpose

DTOs define the **typed contract across the IPC boundary** between Angular and Electron.

They exist to:
- make IPC calls type-safe,
- standardize request/response shapes,
- preserve a stable boundary between renderer and main process,
- separate transport shape from frontend model shape.

There are no Pydantic schemas or backend request classes because this is a TypeScript/JavaScript Electron app, not Python.

## File/location conventions

DTOs are imported from `@/dtos` throughout the renderer:

- `src/app/models/accounts.model.ts`
- `src/app/services/accounts.service.ts`
- `src/app/config/api.ts`

The central IPC contract is declared in `src/app/config/api.ts`.

## Structure

`src/app/config/api.ts` defines:
- channel enum,
- typed IPC client interface,
- request/response signatures per channel.

Example:

```ts
export enum APIChannel {
  APP_META = 'appMeta',
  ACCOUNT_VALUATIONS = 'accountValuations',
  ACCOUNTS = 'accounts',
  CATEGORIES = 'categories',
  BUDGETS = 'budgets',
  ANALYTICS = 'analytics',
  PLAN_ITEMS = 'planItems',
  TRANSACTIONS = 'transactions',
  BACKUP = 'backup',
  DATA_EXPORT = 'dataExport',
  IMPORT_EXCEL = 'importExcel',
  SYNC = 'sync',
  RESET = 'reset',
  UPDATE = 'update',
  WINDOW = 'window',
}
```

And channel-specific contracts:

```ts
readonly accounts: {
  readonly create: IpcRequest<DTO.AccountCreateDto, DTO.AccountCreateResponse>;
  readonly get: IpcRequest<DTO.AccountGetDto, DTO.AccountGetResponse>;
  readonly list: OptionalIpcRequest<DTO.AccountListDto, DTO.AccountListResponse>;
  readonly update: IpcRequest<DTO.AccountUpdateDto, DTO.AccountUpdateResponse>;
  readonly remove: IpcRequest<DTO.AccountRemoveDto, DTO.AccountRemoveResponse>;
};
```

## Flow of execution

Component/service builds DTO payload → IPC client sends DTO → controller validates runtime shape → controller returns DTO-compatible response → Angular service maps to frontend model

## Code examples

From `AccountsService`:

```ts
async create(payload: DTO.AccountCreateDto): Promise<AccountModel | null> {
  const row = await this.ipcClient.create(payload);
  return mapNullableRow(row, (value) => AccountModel.fromDTO(value));
}
```

## How to add a new feature

1. Add DTO types in the DTO module.
2. Extend `ElectronIpcClient` in `src/app/config/api.ts`.
3. Add a new `APIChannel` entry if needed.
4. Implement matching Electron controller methods.
5. Map DTOs to frontend models in the Angular service.

## Best practices and rules

- Keep DTOs transport-oriented.
- Use snake_case where persistence/IPC responses already follow DB naming.
- Convert to camelCase in frontend models where appropriate.
- Keep request and response types explicit.

## Anti-patterns to avoid

- Returning ad hoc untyped objects from IPC.
- Using frontend model classes as transport payloads.
- Skipping runtime validation in Electron because TypeScript exists in Angular.

---

## 7. API Routes Pattern

## Purpose

There are no HTTP routes. The equivalent of API routes in this project is **Electron IPC channels and methods**.

These routes exist to expose backend-like capabilities from the main process to the renderer while preserving process isolation.

## File/location conventions

- Channel definitions: `src/app/config/api.ts`
- Angular IPC base class: `src/app/services/base-ipc.service.ts`
- Electron controllers: `electron/controllers/*.controller.js`

## Structure

The route pattern is:

- one channel per domain,
- multiple methods per channel,
- typed client methods in Angular,
- matching controller functions in Electron.

Base IPC access is standardized in `src/app/services/base-ipc.service.ts`:

```ts
export abstract class BaseIpcService<TChannel extends APIChannel> {
  constructor(protected readonly channel: TChannel) {}

  protected get ipcClient(): ElectronIpcClient[`${TChannel}`] {
    const channelKey = this.channel as unknown as `${TChannel}`;
    const channelClient = window.electronAPI?.ipcClient?.[channelKey];
    if (!channelClient) {
      throw new Error(`Electron IPC channel "${String(this.channel)}" is not available in this environment.`);
    }

    return channelClient;
  }
}
```

## Flow of execution

Angular service selects channel → invokes method → Electron handler dispatches to controller function → result returned over IPC

## Code examples

Accounts channel methods in `api.ts`:

```ts
readonly accounts: {
  readonly create: IpcRequest<DTO.AccountCreateDto, DTO.AccountCreateResponse>;
  readonly get: IpcRequest<DTO.AccountGetDto, DTO.AccountGetResponse>;
  readonly list: OptionalIpcRequest<DTO.AccountListDto, DTO.AccountListResponse>;
  readonly update: IpcRequest<DTO.AccountUpdateDto, DTO.AccountUpdateResponse>;
  readonly remove: IpcRequest<DTO.AccountRemoveDto, DTO.AccountRemoveResponse>;
};
```

## How to add a new feature

1. Decide whether the feature belongs to an existing channel or a new one.
2. Add method signatures to `ElectronIpcClient`.
3. Implement controller functions in Electron.
4. Expose them through the preload/main IPC wiring.
5. Wrap them in an Angular service.

## Best practices and rules

- Group IPC methods by domain.
- Keep channel names stable.
- Use typed request/response signatures.
- Treat IPC as the public backend API of the app.

## Anti-patterns to avoid

- Creating one-off global IPC calls outside the channel structure.
- Letting components call `window.electronAPI` directly.
- Mixing unrelated domains into a single channel.

---

## 8. Controllers Pattern

## Purpose

Electron controllers are the main-process application layer. They:
- validate incoming payloads,
- normalize values,
- enforce business rules,
- call model functions,
- shape responses.

They are closer to **application services/controllers combined** than to thin Express controllers.

## File/location conventions

- `electron/controllers/*.controller.js`
- transaction subdomain split under `electron/controllers/transactions/`

Examples:
- `electron/controllers/accounts.controller.js`
- `electron/controllers/account-valuations.controller.js`
- `electron/controllers/plan-items.controller.js`
- `electron/controllers/sync.controller.js`
- `electron/controllers/transactions/transactions.controller.js`
- `electron/controllers/transactions/transfers.controller.js`

## Structure

Typical controller structure:
1. import model(s),
2. import validation/normalization helpers from `./utils`,
3. define allowed fields/constants,
4. define normalization helpers,
5. export CRUD/application functions.

Example from `electron/controllers/accounts.controller.js`:

```js
function create(payload) {
  const row = {
    ...normalizeAccountChanges(payload, 'payload', { partial: false }),
    created_at: nowUnixTimestampMilliseconds(),
  };
  const insertedId = accountsModel.create(row);

  return accountsModel.getById(Number(insertedId));
}
```

### Validation-first style

Controllers consistently validate payloads before doing anything:

```js
const body = ensurePlainObject(payload, 'payload');
assertAllowedKeys(body, CREATE_FIELDS, 'payload');
```

### Business rule enforcement

Example:
- locked accounts cannot be updated or deleted (`accounts.controller.js`)
- transfer source and destination accounts must differ (`transfers.controller.js`)
- plan item type and start date have immutability rules (`plan-items.controller.js`)
- sync operations serialize concurrent execution (`sync.controller.js`)

## Flow of execution

IPC payload → controller validation → normalization → model call → response object

## Code examples

From `electron/controllers/transactions/transactions.controller.js`:

```js
function create(payload, options = {}) {
  const planItemId = normalizeInternalPlanItemId(options);
  const row = {
    ...normalizeTransactionChanges(payload, 'payload'),
    created_at: nowUnixTimestampMilliseconds(),
    ...(planItemId === undefined ? {} : { plan_item_id: planItemId }),
  };
  const insertedId = transactionsModel.create(row);

  return transactionsModel.getById(Number(insertedId));
}
```

From `electron/controllers/plan-items.controller.js`:

```js
function run(payload) {
  let id;
  if (typeof payload === 'number' || typeof payload === 'string') {
    id = extractId(payload);
  } else {
    const body = ensurePlainObject(payload, 'payload');
    assertAllowedKeys(body, PLAN_RUN_FIELDS, 'payload');
    id = extractId({ id: body.id });
  }

  return planItemsModel.run(id, buildPlanRunExecutors());
}
```

## How to add a new feature

1. Create `electron/controllers/<entity>.controller.js`.
2. Import the corresponding model.
3. Define allowed field sets and validation helpers.
4. Implement `create/get/list/update/remove` if CRUD applies.
5. Add domain-specific operations if needed.
6. Export from `electron/controllers/index.js`.

## Best practices and rules

- Validate every payload at runtime.
- Use helper functions from `electron/controllers/utils.js`.
- Keep controller functions domain-focused.
- Add timestamps in controllers when creating/updating rows.
- Return consistent result shapes.

## Anti-patterns to avoid

- Trusting renderer payloads without validation.
- Duplicating validation logic inline everywhere.
- Putting filesystem/database primitives directly in IPC wiring instead of controllers.

---

## 9. Services Pattern

## Purpose

On the Angular side, services are the renderer-side application/data-access layer. They:
- wrap IPC calls,
- expose typed methods,
- map DTOs into frontend models,
- sometimes manage reactive state and notifications.

There is no separate backend “service layer” in Electron in the classic sense; controller modules absorb much of that responsibility.

## File/location conventions

General services:
- `src/app/services/*.service.ts`

Feature-specific services:
- `src/app/pages/<feature>/services/*.service.ts`

Examples:
- `src/app/services/accounts.service.ts`
- `src/app/services/transactions.service.ts`
- `src/app/services/local-preferences.service.ts`
- `src/app/pages/data-backups-page/services/sync.service.ts`

## Structure

### Thin IPC wrapper services

Typical CRUD service:
- extends `BaseIpcService`
- sets channel in constructor
- maps DTO responses to frontend models

Example from `AccountsService`:

```ts
@Injectable({ providedIn: 'root' })
export class AccountsService extends BaseIpcService<APIChannel.ACCOUNTS> {
  constructor() {
    super(APIChannel.ACCOUNTS);
  }
}
```

### Stateful feature services

Some services also manage UI state, loading flags, event subscriptions, and toasts.

`src/app/pages/data-backups-page/services/sync.service.ts` is the clearest example:
- `BehaviorSubject` state stores,
- loading observables,
- IPC event binding,
- normalization methods,
- toast notifications,
- refresh orchestration.

## Flow of execution

Component/page → Angular service → IPC → response mapping → component state update

For stateful services:
IPC event → service normalization → subject update → UI subscription reacts

## Code examples

From `src/app/services/accounts.service.ts`:

```ts
async update(payload: DTO.AccountUpdateDto): Promise<AccountUpdateResult> {
  const result = await this.ipcClient.update(payload);
  return mapUpdateResult(result, (row) => AccountModel.fromDTO(row));
}
```

From `src/app/pages/data-backups-page/services/sync.service.ts`:

```ts
onIpcEvent('sync:stateChanged', (payload) => {
  this.setState(payload as DTO.SyncStateDto);
});
```

## How to add a new feature

1. Create `src/app/services/<entity>.service.ts` or a feature-local service.
2. Extend `BaseIpcService` if it wraps IPC.
3. Add typed methods matching the IPC contract.
4. Map DTOs to frontend models using `service-utils.ts`.
5. If the feature is stateful, expose observables/signals and loading flags.

## Best practices and rules

- Keep components thin; move IPC and mapping into services.
- Use `providedIn: 'root'` for shared services.
- Centralize DTO-to-model mapping in services.
- Use RxJS for long-lived async stateful features.

## Anti-patterns to avoid

- Calling `window.electronAPI` directly from components.
- Returning raw DTOs when a frontend model exists.
- Mixing presentation concerns into generic data services.

---

## 10. Dependency Injection Pattern

## Purpose

Angular dependency injection is used to:
- provide application-wide services,
- configure framework providers,
- inject router/services into guards and services,
- keep components decoupled from concrete implementations.

Electron does not use a formal DI container.

## File/location conventions

- app-level providers: `src/app/app.config.ts`
- injectable services: `src/app/services/*.service.ts`
- functional guards using `inject()`: `src/app/core/guards/*.ts`

## Structure

### Angular provider configuration

From `src/app/app.config.ts`:

```ts
providers: [
  provideBrowserGlobalErrorListeners(),
  provideRouter(routes),
  provideI18n(),
  provideZard(),
  provideEchartsCore({ echarts }),
]
```

### Root services

Example:

```ts
@Injectable({
  providedIn: 'root',
})
export class AccountsService extends BaseIpcService<APIChannel.ACCOUNTS> { ... }
```

### Functional injection

From `src/app/core/guards/onboarding.guard.ts`:

```ts
export const onboardingGuard: CanActivateFn = () => {
  const localPreferences = inject(LocalPreferencesService);
  if (localPreferences.getOnboardingCompleted()) {
    return true;
  }
  return inject(Router).createUrlTree(['/onboarding']);
};
```

### Service-to-service injection

From `SyncService`:

```ts
private readonly localPreferencesService = inject(LocalPreferencesService);
```

## Flow of execution

Angular bootstraps providers → components/guards/services resolve dependencies via DI → services coordinate app behavior

## How to add a new feature

1. Create an `@Injectable` service.
2. Use `providedIn: 'root'` unless feature scoping is required.
3. Inject dependencies with constructor injection or `inject()`.
4. Register app-wide providers in `app.config.ts` only when needed.

## Best practices and rules

- Prefer Angular DI over manual singleton patterns.
- Use `inject()` in functional guards and modern services where appropriate.
- Keep provider registration centralized.

## Anti-patterns to avoid

- Instantiating services manually with `new`.
- Accessing globals directly when a service abstraction exists.
- Overusing app-level providers for feature-local concerns.

---

## 11. Error Handling and Response Pattern

## Purpose

The project uses explicit runtime validation and pragmatic error propagation. Errors are handled differently in Electron and Angular:

- **Electron controllers** throw `Error` with precise messages.
- **Angular services** catch errors, normalize messages, and show toast notifications where appropriate.
- **Responses** are usually plain objects with predictable shapes.

## File/location conventions

- validation helpers: `electron/controllers/utils.js`
- controller errors: all Electron controllers
- UI error handling: Angular services, especially `sync.service.ts`

## Structure

### Validation helpers

`electron/controllers/utils.js` is the central validation toolkit:
- `ensurePlainObject`
- `ensureNonEmptyObject`
- `requireString`
- `normalizeEnum`
- `normalizePositiveInteger`
- `normalizeBooleanFlag`
- `assertAllowedKeys`
- `pickDefined`
- pagination helpers

Example:

```js
function assertAllowedKeys(value, allowedKeys, label) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unsupported ${label} field: "${key}"`);
    }
  }
}
```

### Response formatting conventions

Common response shapes:
- single row or `null`
- `{ changed, row }`
- `{ changed }`
- `{ rows, total, page, page_size }`
- feature-specific result objects for sync/backup/import/export

Examples:
- `accounts.controller.js` update returns `{ changed, row }`
- list endpoints return paginated objects
- sync returns action/result objects with `action`, `pulled`, `pushed`, `reason`, etc.

### Angular-side error presentation

From `sync.service.ts`:

```ts
catchError((error) => {
  toast.error(this.toErrorMessage(error, 'Failed to load sync settings.'));
  return of(this.settingsSubject.value);
})
```

## Flow of execution

Invalid payload/business rule violation → Electron throws → IPC rejects → Angular service catches → toast/fallback state

## Code examples

Locked account rule:

```js
if (existingAccount?.locked === 1) {
  throw new Error('Locked accounts cannot be deleted.');
}
```

## How to add a new feature

1. Validate payloads with shared helpers.
2. Throw explicit `Error` messages in Electron.
3. Return consistent result objects.
4. In Angular, catch errors at the service boundary.
5. Show user-facing toasts only where appropriate.

## Best practices and rules

- Fail fast on invalid payloads.
- Keep error messages specific and actionable.
- Reuse validation helpers.
- Keep response shapes stable.

## Anti-patterns to avoid

- Silent failures in Electron.
- Returning inconsistent shapes for similar operations.
- Catching and swallowing errors without UI feedback or fallback behavior.

---

## 12. Configuration Pattern

## Purpose

Configuration is split between:
- Angular app/provider configuration,
- local user preferences in browser storage,
- Electron runtime/database environment,
- feature-specific defaults.

## File/location conventions

- app config: `src/app/app.config.ts`
- route config: `src/app/app.routes.ts`
- local preference keys/defaults: `src/app/config/local-preferences.config.ts`
- local preference service: `src/app/services/local-preferences.service.ts`
- README documents DB env behavior

## Structure

### Angular configuration

`app.config.ts` wires framework-level providers.

### Route configuration

`app.routes.ts` defines lazy-loaded pages and onboarding guards.

### Local preferences

`src/app/config/local-preferences.config.ts` defines keys and defaults:

```ts
export enum LocalPreferenceKey {
  THEME = 'theme',
  THEME_COLOR = 'theme_color',
  LANGUAGE = 'language',
  CURRENCY = 'currency',
  CURRENCY_FORMAT_STYLE = 'currency_format_style',
  DASHBOARD_USE_VALUATION = 'dashboard_use_valuation',
  ONBOARDING_COMPLETED = 'onboarding_completed',
  TRANSACTIONS_TABLE_STATE = 'transactions_table_state',
  TRANSFERS_TABLE_STATE = 'transfers_table_state',
  SYNC_STATE = 'sync_state',
}
```

`LocalPreferencesService` encapsulates localStorage access and normalization.

### Environment/runtime configuration

From `README.md`:
- DB stored in Electron `userData/data/`
- environment override via `BORINGBALANCE_DB_ENV=dev|prod`

## Flow of execution

App startup → providers initialized → local preferences loaded → guards/routes use preferences → Electron runtime uses DB env and migrations

## Code examples

From `LocalPreferencesService`:

```ts
getOnboardingCompleted(): boolean {
  const value = this.getText(LocalPreferenceKey.ONBOARDING_COMPLETED);
  return value === '1' || value === 'true' ? true : LOCAL_PREFERENCE_DEFAULTS.onboardingCompleted;
}
```

## How to add a new feature

1. Add config keys/defaults in `src/app/config/` if renderer-facing.
2. Add a service abstraction for reading/writing config.
3. For Electron runtime config, keep it in Electron-side modules or documented env vars.
4. Normalize values at read time.

## Best practices and rules

- Centralize keys and defaults.
- Wrap localStorage access in a service.
- Normalize persisted values before use.
- Keep environment-sensitive logic in Electron.

## Anti-patterns to avoid

- Hardcoding preference keys across components.
- Reading localStorage directly from many places.
- Mixing renderer preferences with Electron runtime config.

---

## 13. External Integrations Pattern

## Purpose

External integrations are limited and privacy-conscious. The project avoids hosted backend dependencies and instead integrates with:
- Electron APIs,
- filesystem,
- SQLite,
- optional sync folders,
- Excel import/export,
- update checks,
- UI libraries.

## File/location conventions

Examples:
- sync integration: `electron/controllers/sync.controller.js`
- export/import controllers and models
- update controller
- Angular wrappers in feature services

## Structure

### Native integrations in Electron

Electron main process handles:
- dialogs (`dialog.showOpenDialog`)
- filesystem (`fs`)
- paths (`path`)
- database lifecycle
- app lifecycle hooks

Example from `sync.controller.js`:

```js
const { dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
```

### Renderer integrations via services

Angular never accesses these directly; it uses IPC services.

### Event-based integrations

Sync uses broadcast IPC events:
- `sync:stateChanged`
- `sync:pullCompleted`
- `sync:pullFailed`
- `sync:pushCompleted`
- `sync:pushFailed`
- `sync:conflictDetected`

## Flow of execution

Renderer requests native action → Electron performs integration → result/event returned → Angular service updates UI state

## Code examples

Folder selection in `sync.controller.js`:

```js
async function selectFolder() {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return {
    folderPath: result.filePaths[0],
  };
}
```

## How to add a new feature

1. Put native/filesystem/network integration in Electron.
2. Expose it through a controller and IPC contract.
3. Wrap it in an Angular service.
4. Normalize results before UI consumption.
5. Use event broadcasting if the integration is long-running or stateful.

## Best practices and rules

- Keep native access in Electron only.
- Prefer explicit user-controlled integrations.
- Normalize external data before exposing it to UI.
- Use events for background state changes.

## Anti-patterns to avoid

- Accessing Node APIs from Angular.
- Returning raw external payloads without normalization.
- Coupling UI directly to filesystem or OS APIs.

---

## 14. How to Add a New Feature

Below is the project-consistent path for adding a new entity or domain feature.

### Example: add a new entity `Merchant`

#### 1. Define DTOs
Add request/response DTOs in the DTO module:
- `MerchantDto`
- `MerchantCreateDto`
- `MerchantUpdateDto`
- `MerchantListDto`
- response types

#### 2. Add IPC contract
Update `src/app/config/api.ts`:

```ts
export enum APIChannel {
  // ...
  MERCHANTS = 'merchants',
}
```

Add:

```ts
readonly merchants: {
  readonly create: IpcRequest<DTO.MerchantCreateDto, DTO.MerchantCreateResponse>;
  readonly get: IpcRequest<DTO.MerchantGetDto, DTO.MerchantGetResponse>;
  readonly list: OptionalIpcRequest<DTO.MerchantListDto, DTO.MerchantListResponse>;
  readonly update: IpcRequest<DTO.MerchantUpdateDto, DTO.MerchantUpdateResponse>;
  readonly remove: IpcRequest<DTO.MerchantRemoveDto, DTO.MerchantRemoveResponse>;
};
```

#### 3. Add database schema/migration
Create the SQLite table and migration in the Electron database layer.

#### 4. Add Electron model
Create `electron/models/merchants.model.js` with functions like:
- `create`
- `getById`
- `list`
- `count`
- `updateById`
- `deleteById`

Export it from `electron/models/index.js`.

#### 5. Add Electron controller
Create `electron/controllers/merchants.controller.js`:
- define allowed fields,
- validate payloads with `utils.js`,
- add timestamps,
- call `merchantsModel`.

Export it from `electron/controllers/index.js`.

#### 6. Wire IPC
Expose the controller methods through the preload/main IPC bridge.

#### 7. Add frontend model
Create `src/app/models/merchants.model.ts`:
- `static fromDTO`
- `toDTO`
- any computed getters

Re-export from `src/app/models/index.ts`.

#### 8. Add Angular service
Create `src/app/services/merchants.service.ts` extending `BaseIpcService`.

#### 9. Add UI page/components
Create page/components under `src/app/pages/...` or feature folders.
Keep pages thin and delegate data access to services.

#### 10. Add tests
Add Angular tests for service/component behavior where appropriate.

### Feature addition checklist

- DTOs added
- IPC contract updated
- DB schema/migration added
- Electron model added
- Electron controller added
- controller exported
- IPC wiring added
- frontend model added
- Angular service added
- page/component added
- tests added

---

## 15. Project Conventions

1. **Domain-first naming**
   - accounts, budgets, categories, transactions, sync, backup, etc.
   - same domain name reused across models, services, controllers, and pages.

2. **Renderer/main separation**
   - Angular never touches DB/filesystem directly.
   - Electron owns persistence and native integrations.

3. **Typed IPC boundary**
   - `src/app/config/api.ts` is the contract source.

4. **Frontend model mapping**
   - DTOs are mapped into frontend classes before UI use.

5. **Validation-first controllers**
   - every Electron controller validates payloads explicitly.

6. **Consistent CRUD response shapes**
   - row/null
   - `{ changed, row }`
   - `{ changed }`
   - paginated `{ rows, total, page, page_size }`

7. **Shared normalization helpers**
   - `electron/controllers/utils.js`
   - `src/app/models/common.model.ts`
   - `src/app/services/service-utils.ts`

8. **Thin pages/components**
   - UI composition and local interaction only.
   - business/data logic belongs in services/controllers.

9. **Stateful features use dedicated services**
   - sync is the clearest example.

10. **Local-first configuration**
   - preferences in local storage,
   - DB in local SQLite,
   - optional user-managed sync/backup folders.

---

## 16. Anti-Patterns to Avoid

1. **Calling `window.electronAPI` directly from components**
   - bypasses service abstractions and breaks consistency.

2. **Skipping DTO-to-model mapping**
   - leaks transport/storage shape into UI.

3. **Adding unvalidated controller payload handling**
   - breaks the project’s validation-first discipline.

4. **Putting DB logic in controllers**
   - persistence belongs in Electron models.

5. **Putting native filesystem logic in Angular**
   - violates renderer/main separation.

6. **Returning inconsistent response shapes**
   - makes services and UI harder to maintain.

7. **Using localStorage directly across the app**
   - use `LocalPreferencesService`.

8. **Embedding feature state in components when it belongs in a service**
   - especially for long-lived async features like sync, backup, updates.

9. **Changing naming conventions across layers**
   - keep domain names aligned across DTOs, services, controllers, and models.

10. **Treating this as a web backend architecture**
   - there are no HTTP routes, no ORM entities, and no backend DI container; the correct abstraction is IPC + Electron controllers/models.

---

## 17. Summary

This project follows a clear and disciplined desktop application architecture:

- **Angular renderer** for UI, routing, and local interaction
- **Angular services** as typed IPC clients and state managers
- **Electron controllers** as validation and application logic layer
- **Electron models** as persistence/domain access layer
- **SQLite** as local storage
- **DTO contracts** as the renderer/main boundary
- **local preferences and feature services** for client-side state
- **event-driven IPC** for long-running/background features like sync

The most important architectural rule is:

**UI code stays in Angular, native and persistence logic stays in Electron, and the boundary between them is explicit, typed, and validated.**

That rule is consistently reflected in:
- `src/app/config/api.ts`
- `src/app/services/base-ipc.service.ts`
- `src/app/services/accounts.service.ts`
- `src/app/pages/data-backups-page/services/sync.service.ts`
- `electron/controllers/accounts.controller.js`
- `electron/controllers/transactions/transactions.controller.js`
- `electron/controllers/plan-items.controller.js`
- `electron/controllers/sync.controller.js`
- `electron/controllers/utils.js`
- `electron/database/index.js`