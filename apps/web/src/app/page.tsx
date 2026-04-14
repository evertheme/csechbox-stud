import Link from "next/link";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.main}>
      <div className={styles.hero}>
        <h1 className={styles.title}>♠ CSechBox Poker</h1>
        <p className={styles.subtitle}>Play Texas Hold'em with friends</p>
        <div className={styles.actions}>
          <Link href="/lobby" className={styles.btnPrimary}>
            Enter Lobby
          </Link>
        </div>
      </div>
    </main>
  );
}
