import type { Metadata } from "next";

export const metadata: Metadata = { title: "Lobby | CSechBox Poker" };

export default function LobbyPage() {
  return (
    <main style={{ padding: "2rem", maxWidth: "900px", margin: "0 auto" }}>
      <h1 style={{ color: "#ffd700", marginBottom: "1.5rem" }}>Game Lobby</h1>
      <p style={{ color: "#94a3b8" }}>
        Connect to a room to start playing. Room list loads here via Socket.IO.
      </p>
    </main>
  );
}
