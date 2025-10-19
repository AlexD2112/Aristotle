"use client";

import { useState } from "react";

export default function JoinGamePage() {
  const [gameId, setGameId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [name, setName] = useState("");
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [players, setPlayers] = useState([]);

  const fetchPlayers = async () => {
    try {

      const endpoint = process.env.NEXT_PUBLIC_APPSYNC_URL;
      const apiKey = process.env.NEXT_PUBLIC_API_KEY;

      const query = `
        query P($g: ID!) {
          listPlayers(gameId: $g) {
            playerId
            name
            score
            joinedAt
          }
        }
      `;

      const variables = { g: gameId };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          ...(apiKey ? { "x-api-key": apiKey } : {}),
        },
        body: JSON.stringify({ query, variables }),
      });

      const data = await res.json();

      if (data.errors) throw new Error(data.errors[0].message);

      setPlayers(data.data.listPlayers);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleJoin = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const endpoint = process.env.NEXT_PUBLIC_APPSYNC_URL;
      console.log(`Endpoint: ${endpoint}`)
      const apiKey = process.env.NEXT_PUBLIC_API_KEY; // if you’re using API key auth (or use JWT if Cognito)

      const mutation = `
        mutation JoinGame($gameId: ID!, $playerId: ID!, $name: String!) {
          joinGame(gameId: $gameId, playerId: $playerId name: $name) {
            gameId
            playerId
            name
            score
            joinedAt
          }
        }
      `;
      const playerId = name;
      const variables = { gameId,playerId, name };
        console.log(JSON.stringify({ query: mutation, variables }));
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        ...(apiKey ? { "x-api-key": apiKey } : {}),
        // if using Cognito User Pools:
        // "Authorization": yourCognitoIdToken
      },
      body: JSON.stringify({ query: mutation, variables }),
    });

      const data = await res.json();

      if (data.errors) throw new Error(data.errors[0].message);

      setResponse(data.data.joinGame);
      await fetchPlayers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: "2rem auto", textAlign: "center" }}>
      <h1>Join Game</h1>
      <p>Join an existing quiz game by entering your details.</p>

      {!response && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <input
            type="text"
            placeholder="Game ID"
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
          />
          <input
            type="text"
            placeholder="Display Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button onClick={handleJoin} disabled={loading}>
            {loading ? "Joining..." : "Join Game"}
          </button>
        </div>
      )}

      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      {response && (
        <>
          <pre
            style={{
              background: "#f4f4f4",
              padding: "1rem",
              borderRadius: "6px",
              textAlign: "left",
            }}
          >
            {JSON.stringify(response, null, 2)}
          </pre>
          <h2>Current Players</h2>
          <ul style={{ listStyle: "none", padding: 0, textAlign: "left" }}>
            {players.map((player) => (
              <li
                key={player.playerId}
                style={{
                  borderBottom: "1px solid #ccc",
                  padding: "0.5rem 0",
                }}
              >
                <strong>Name:</strong> {player.name} <br />
                <strong>Player ID:</strong> {player.playerId} <br />
                <strong>Score:</strong> {player.score} <br />
                <strong>Joined At:</strong> {player.joinedAt}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}