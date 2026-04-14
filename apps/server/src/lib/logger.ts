import chalk from "chalk";

// ─── Icons ────────────────────────────────────────────────────────────────────

const ICONS = {
  success: "✅",
  error:   "❌",
  warn:    "⚠️ ",
  info:    "ℹ️ ",
  route:   "📡",
  env:     "📝",
  socket:  "🔌",
} as const;

// ─── Method colours ───────────────────────────────────────────────────────────

const METHOD_COLOR: Record<string, (s: string) => string> = {
  GET:    chalk.green.bold,
  POST:   chalk.blue.bold,
  PUT:    chalk.yellow.bold,
  PATCH:  chalk.magenta.bold,
  DELETE: chalk.red.bold,
};

// ─── Public API ───────────────────────────────────────────────────────────────

export const logger = {
  /** Startup banner printed once at boot. */
  banner(version = "0.0.1"): void {
    const inner = `   ♠ ♥   P O K E R   S E R V E R   ♦ ♣   v${version}`;
    const width = inner.length + 4;
    const bar   = "═".repeat(width);

    console.log();
    console.log(chalk.cyan(`╔${bar}╗`));
    console.log(chalk.cyan("║  ") + chalk.yellow.bold(inner) + chalk.cyan("  ║"));
    console.log(chalk.cyan(`╚${bar}╝`));
    console.log();
  },

  success(msg: string): void {
    console.log(`  ${ICONS.success}  ${chalk.green(msg)}`);
  },

  error(msg: string, err?: unknown): void {
    console.error(`  ${ICONS.error}  ${chalk.red(msg)}`);
    if (err != null) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`       ${chalk.red.dim(detail)}`);
    }
  },

  warn(msg: string): void {
    console.warn(`  ${ICONS.warn} ${chalk.yellow(msg)}`);
  },

  info(msg: string): void {
    console.log(`  ${ICONS.info} ${chalk.dim(msg)}`);
  },

  /** Log a single registered HTTP route. */
  route(method: string, path: string): void {
    const colour = METHOD_COLOR[method] ?? chalk.white.bold;
    console.log(`  ${ICONS.route}  ${colour(method.padEnd(7))} ${chalk.dim(path)}`);
  },

  /** Log a labelled key→value pair (for env/config). */
  env(label: string, value: string): void {
    console.log(`  ${ICONS.env}  ${chalk.dim(label + ":")} ${chalk.cyan(value)}`);
  },

  /** Thin horizontal rule for visual separation. */
  divider(): void {
    console.log(chalk.dim("  " + "─".repeat(52)));
  },
};
