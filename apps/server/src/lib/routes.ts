import type { Application } from "express";

export interface RouteInfo {
  method: string;
  path:   string;
}

// Express doesn't export its internal layer types, so we type just enough.
interface ExpressLayer {
  route?: {
    path:    string;
    methods: Record<string, boolean>;
  };
  handle?: { stack?: ExpressLayer[] };
  regexp:  { source: string };
  name:    string;
}

/**
 * Walk express's internal `_router.stack` to collect all registered routes.
 * Works for both direct `app.get(...)` routes and `Router` instances mounted
 * with `app.use('/prefix', router)`.
 */
export function extractRoutes(app: Application): RouteInfo[] {
  const routes: RouteInfo[] = [];

  const router = (app as unknown as { _router?: { stack?: ExpressLayer[] } })
    ._router;

  if (!router?.stack) return routes;

  function walk(stack: ExpressLayer[], prefix: string): void {
    for (const layer of stack) {
      if (layer.route) {
        // Direct route — collect every HTTP method attached to it.
        const methods = Object.entries(layer.route.methods)
          .filter(([, enabled]) => enabled)
          .map(([m]) => m.toUpperCase());

        for (const method of methods) {
          routes.push({ method, path: prefix + layer.route.path });
        }
      } else if (layer.name === "router" && layer.handle?.stack) {
        // Mounted sub-router.  Reconstruct the mount prefix from the regexp
        // that Express builds internally.
        //
        // Express 4 regexp for `app.use('/api/rooms', router)` looks like:
        //   ^\/api\/rooms\/?(?=\/|$)
        const src   = layer.regexp.source;
        const match = /^\^\\\/(.+?)\\\/\?\(\?=\\\/\|\$\)/.exec(src);
        const sub   = match
          ? `/${match[1]!.replace(/\\\//g, "/")}`
          : "";

        walk(layer.handle.stack, prefix + sub);
      }
    }
  }

  walk(router.stack, "");
  return routes;
}
