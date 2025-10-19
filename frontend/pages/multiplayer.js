"use client";

import { useState } from "react";

export default function JoinGamePage() {
  const [gameId, setGameId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [name, setName] = useState("");
  const[secPerQ, setSecPerQ] = useState("");
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [players, setPlayers] = useState([]);
  const [qBankId, setqBankId] = useState(['']);
  const backendBase = "http://localhost:6767"

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

   const handleStart = async () => {
    setError(null);
    try {
      const endpoint = process.env.NEXT_PUBLIC_APPSYNC_URL;
      const apiKey = process.env.NEXT_PUBLIC_API_KEY;

      const mutation = `
  mutation StartGame($gameId: ID!) {
    startGame(gameId: $gameId) {
      gameId
      status
      hostId
      currentQ
      createdAt
      settings {
        secondsPerQuestion
      }
    }
  }
`;

      const variables = { gameId };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          ...(apiKey ? { "x-api-key": apiKey } : {}),
        },
        body: JSON.stringify({ query: mutation, variables }),
      });

      const data = await res.json();

      if (data.errors) throw new Error(data.errors[0].message);

      console.log("Game started:", data.data.startGame);
    } catch (err) {
      setError(err.message);
    }
  };
  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = process.env.NEXT_PUBLIC_APPSYNC_URL;
      const apiKey = process.env.NEXT_PUBLIC_API_KEY;

      const createGameMutation = `
        mutation CreateGame($secondsPerQuestion: Int!) {
          createGame(secondsPerQuestion: $secondsPerQuestion) {
            gameId
            settings {
              secondsPerQuestion
            }
          }
        }
      `;

      const seconds = parseInt(secPerQ) || 20;

      const createVariables = { secondsPerQuestion: seconds };

      const createRes = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          ...(apiKey ? { "x-api-key": apiKey } : {}),
        },
        body: JSON.stringify({ query: createGameMutation, variables: createVariables }),
      });

      const createData = await createRes.json();

      if (createData.errors) throw new Error(createData.errors[0].message);

      const newGameId = createData.data.createGame.gameId;
      setGameId(newGameId);

      const joinGameMutation = `
        mutation JoinGame($gameId: ID!, $playerId: ID!, $name: String!) {
          joinGame(gameId: $gameId, playerId: $playerId, name: $name) {
            gameId
            playerId
            name
            score
            joinedAt
          }
        }
      `;

      const playerId = name;
      const joinVariables = { gameId: newGameId, playerId, name };

      const joinRes = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          ...(apiKey ? { "x-api-key": apiKey } : {}),
        },
        body: JSON.stringify({ query: joinGameMutation, variables: joinVariables }),
      });

      const joinData = await joinRes.json();

      if (joinData.errors) throw new Error(joinData.errors[0].message);

      setResponse(true);
      await fetchPlayers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

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

      setResponse(true);
      await fetchPlayers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: "2rem auto", textAlign: "center" }}>
      <input
        type="text"
        placeholder="Display Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
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
          <button onClick={handleJoin} disabled={loading}>
            {loading ? "Joining..." : "Join Game"}
          </button>
          <h1>CREATE GAME</h1>
          <p>Create a game by entering the question bank ID:</p>
          <input
          type="text"
          placeholder="Game ID"
          value={qBankId}
          onChange={(e) => setqBankId(e.target.value)}
          ></input>
          <button class="create" onClick={handleCreate} disabled={loading}>
            {loading ? "Creating..." : "Create Game"}</button>
        </div>
      )}
  
      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      {response && (
        <>
          <p>Seconds per question:</p>
          <input
          type="number"
          placeholder="Seconds per question"
          defaultValue={20}
          onChange={(e) => setSecPerQ(e.target.value)}
          >
          </input>
          <button class="start" onClick={handleStart}>Start Game</button>
          <h2>Current Players</h2>
          <div style={{ 
            display: "flex", 
            flexWrap: "wrap", 
            gap: "1rem", 
            justifyContent: "center",
            padding: "1rem" 
          }}>
            {players.map((player) => (
              <div
                key={player.playerId}
                style={{
                  padding: "0.5rem 1rem",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                }}
                className="player"
              >
                {player.name}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}