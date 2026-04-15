# CsechBox — Poker Monorepo

A full-stack multiplayer poker platform built as a Turborepo monorepo with **pnpm workspaces**.

## Stack


| Layer           | Technology                             |
| --------------- | -------------------------------------- |
| Web app         | Next.js 15 + React Native Web          |
| Mobile app      | React Native + Expo (expo-router)      |
| Backend         | Node.js + Express + Socket.IO          |
| Game logic      | Pure TypeScript (no runtime deps)      |
| Shared types    | TypeScript-only package                |
| Shared UI       | React Native components (web + mobile) |
| Build system    | Turborepo                              |
| Package manager | pnpm workspaces                        |


## Monorepo Structure

```
csechbox-stud/
├── apps/
│   ├── web/          Next.js (React Native Web)  :3000
│   ├── mobile/       Expo React Native app
│   └── server/       Express + Socket.IO          :3001
├── packages/
│   ├── game-engine/  Core poker logic (TypeScript)
│   ├── shared-types/ Shared TypeScript interfaces
│   ├── ui/           Shared RN components
│   └── config/       ESLint / TS / Jest configs
├── turbo.json
├── pnpm-workspace.yaml
└── tsconfig.json     (root project references)
```

## Build Pipeline (turbo.json)

```
shared-types  ──►  game-engine  ──►  server
                              └──►  web
shared-types  ─────────────────────► ui  ──►  web / mobile
```

All `build` tasks depend on `^build` (upstream packages build first).

## Getting Started

```bash
# Install all dependencies
pnpm install

# Build all packages and apps
pnpm build

# Start everything in dev mode
pnpm dev

# Run only the server
pnpm --filter @poker/server dev

# Run only the web app
pnpm --filter @poker/web dev

# Run tests
pnpm test
```

## Environment Variables

Copy `.env.example` → `.env` in each app:


| App           | Variable                 | Default                 |
| ------------- | ------------------------ | ----------------------- |
| `apps/server` | `PORT`                   | `3001`                  |
| `apps/server` | `CLIENT_ORIGIN`          | `*`                     |
| `apps/web`    | `NEXT_PUBLIC_SERVER_URL` | `http://localhost:3001` |
| `apps/mobile` | `EXPO_PUBLIC_SERVER_URL` | `http://localhost:3001` |


## TypeScript Project References

Every package and app participates in TypeScript project references for incremental, ordered compilation:

- `packages/config` — base configs only (no references)
- `packages/shared-types` — no references
- `packages/game-engine` → `shared-types`
- `packages/ui` → `shared-types`
- `apps/server` → `shared-types`, `game-engine`
- `apps/web` → `shared-types`, `ui`
- `apps/mobile` → `shared-types`, `ui`

