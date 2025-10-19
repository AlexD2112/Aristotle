import { useState, useEffect, useRef } from 'react';

export default function MultiplayerFlask() {
    const [questionBankId, setQuestionBankId] = useState('');
    const [message, setMessage] = useState('');
    const [sessionId, setSessionId] = useState('');
    const [playerName, setPlayerName] = useState('');
    const [players, setPlayers] = useState([]);
    const [hasJoined, setHasJoined] = useState(false);
    const pollingRef = useRef(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        try {
            const response = await fetch('http://localhost:6767/api/create_quiz', {
                method: 'POST',
                headers: {
                    'X-Key': questionBankId,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                mode: 'cors'
            });

            let data;
            try {
                data = await response.json();
            } catch (jsonError) {
                console.error('Failed to parse JSON:', jsonError);
                const text = await response.text();
                console.error('Response text:', text);
                setMessage('Error parsing server response');
                return;
            }

            console.log(data)
            if (response.ok) {
                setMessage(`Successfully created game with ID ${data.sessionID}`);
            } else {
                setMessage('Error creating game');
            }
        } catch (error) {
            setMessage('Error connecting to server');
            console.error('Error:', error);
        }
    };

    const pollPlayers = () => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
        }
        pollingRef.current = setInterval(async () => {
            try {
                const response = await fetch('http://localhost:6767/api/game_info', {
                    method: 'GET',
                    headers: {
                        'X-Key': sessionId,
                        'Accept': 'application/json'
                    },
                    mode: 'cors'
                });
                if (!response.ok) {
                    console.error('Failed to fetch game info');
                    return;
                }
                let data;
                try {
                    data = await response.json();
                } catch (jsonError) {
                    console.error('Failed to parse JSON:', jsonError);
                    return;
                }
                console.log(data);
                if (data.players) {
                    setPlayers(data.players);
                } else if (data.data && data.data.players) {
                    setPlayers(data.data.players);
                }
            } catch (error) {
                console.error('Error polling game info:', error);
            }
        }, 500);
    };

    const handleJoinGame = async (e) => {
        e.preventDefault();

        try {
            const response = await fetch('http://localhost:6767/api/join_game', {
                method: 'POST',
                headers: {
                    'X-Key': sessionId,
                    'X-Player-Name': playerName,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                mode: 'cors'
            });

            let data;
            try {
                data = await response.json();
            } catch (jsonError) {
                console.error('Failed to parse JSON:', jsonError);
                const text = await response.text();
                console.error('Response text:', text);
                setMessage('Error parsing server response');
                return;
            }

            if (response.ok) {
                setMessage(`Successfully joined game with ID ${sessionId} as ${playerName}`);
                setHasJoined(true);
                pollPlayers();
            } else {
                setMessage('Error joining game');
            }
        } catch (error) {
            setMessage('Error connecting to server');
            console.error('Error:', error);
        }
    };

    const handleStartGame = async () => {
        try {
            const response = await fetch('http://localhost:6767/api/start_game', {
                method: 'POST',
                headers: {
                    'X-Key': sessionId,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                mode: 'cors'
            });
            console.log(response.ok);
            let data;
            try {
                data = await response.json();
            } catch (jsonError) {
                console.error('Failed to parse JSON:', jsonError);
                const text = await response.text();
                console.error('Response text:', text);
                setMessage('Error parsing server response');
                return;
            }

            if (response.ok) {
                setMessage('Game has started!');
                pollPlayers();
            } else {
                setMessage('Error starting game');
            }
        } catch (error) {
            setMessage('Error connecting to server');
            console.error('Error:', error);
        }
    };

    useEffect(() => {
        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
            }
        };
    }, []);

    return (
        <div style={{ padding: '20px' }}>
            {!hasJoined && (
                <>
                    <h1>Create Game</h1>
                    <form onSubmit={handleSubmit}>
                        <div>
                            <label>
                                Question Bank ID:
                                <input 
                                    type="text"
                                    value={questionBankId}
                                    onChange={(e) => setQuestionBankId(e.target.value)}
                                    required
                                />
                            </label>
                        </div>
                        <button type="submit">Create Game</button>
                    </form>

                    <h1>Join Game</h1>
                    <form onSubmit={handleJoinGame}>
                        <div>
                            <label>
                                Session ID:
                                <input
                                    type="text"
                                    value={sessionId}
                                    onChange={(e) => setSessionId(e.target.value)}
                                    required
                                />
                            </label>
                        </div>
                        <div>
                            <label>
                                Player Name:
                                <input
                                    type="text"
                                    value={playerName}
                                    onChange={(e) => setPlayerName(e.target.value)}
                                    required
                                />
                            </label>
                        </div>
                        <button type="submit">Join Game</button>
                    </form>
                </>
            )}

            {hasJoined && (
                <button onClick={handleStartGame}>Start Game</button>
            )}

            {message && <p>{message}</p>}

            {players.length > 0 && (
                <div>
                    <h2>Players in Game:</h2>
                    <ul>
                        {players.map((name, index) => (
                            <li key={index}>{name}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}