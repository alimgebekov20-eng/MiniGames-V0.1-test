const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// Хранилище
let lobbies = [];
let players = {};
let nextLobbyId = 1;
let nextPlayerId = 1;
let usedNames = new Set();

// Генерация кода
function generateLobbyCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Генерация случайного имени
function generateRandomName() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let name = '';
    for (let i = 0; i < 10; i++) {
        name += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return name;
}

// Проверка имени
function isValidName(name) {
    if (!name || name.length < 3) return false;
    if (!/^[a-zA-Z0-9]+$/.test(name)) return false;
    return true;
}

// Класс лобби
class Lobby {
    constructor(name, maxPlayers, isPrivate, creatorId) {
        this.id = nextLobbyId++;
        this.name = name;
        this.maxPlayers = maxPlayers;
        this.isPrivate = isPrivate;
        this.code = isPrivate ? generateLobbyCode() : null;
        this.players = [];
        this.creatorId = creatorId;
        this.isGameStarted = false;
        this.createdAt = Date.now();
        this.popularity = 0;
        this.gameMode = null;
        this.currentSetter = null;
        this.currentGuesser = null;
        this.setterIndex = 0;
        this.sequence = [];
        this.guesses = [];
        this.round = 0;
        this.gameOver = false;
        this.winner = null;
        this.settingPhase = false;
    }

    addPlayer(player) {
        if (this.players.length < this.maxPlayers) {
            this.players.push(player);
            this.popularity++;
            return true;
        }
        return false;
    }

    removePlayer(playerId) {
        this.players = this.players.filter(p => p.id !== playerId);
        this.popularity = Math.max(0, this.popularity - 1);
        if (this.players.length === 0) {
            return true;
        }
        if (this.creatorId === playerId && this.players.length > 0) {
            this.creatorId = this.players[0].id;
        }
        return false;
    }

    getInfo(forPlayerId = null) {
        const info = {
            id: this.id,
            name: this.name,
            maxPlayers: this.maxPlayers,
            currentPlayers: this.players.length,
            isPrivate: this.isPrivate,
            isGameStarted: this.isGameStarted,
            creatorId: this.creatorId,
            players: this.players.map(p => ({ 
                id: p.id, 
                name: p.name, 
                isCreator: p.id === this.creatorId 
            })),
            gameMode: this.gameMode,
            gameOver: this.gameOver,
            winner: this.winner
        };
        
        if (forPlayerId && this.players.some(p => p.id === forPlayerId)) {
            info.code = this.code;
        }
        
        return info;
    }

    getGameState(forPlayerId) {
        const player = this.players.find(p => p.id === forPlayerId);
        const isSetter = this.currentSetter && this.currentSetter.id === forPlayerId;
        const isGuesser = this.currentGuesser && this.currentGuesser.id === forPlayerId;
        
        return {
            isSetting: this.settingPhase && isSetter,
            isGuessing: !this.settingPhase && isGuesser,
            isSpectator: !isSetter && !isGuesser && this.isGameStarted,
            currentSetter: this.currentSetter ? this.currentSetter.name : null,
            currentGuesser: this.currentGuesser ? this.currentGuesser.name : null,
            sequence: this.settingPhase ? [] : this.sequence,
            guesses: this.guesses,
            round: this.round,
            gameOver: this.gameOver,
            winner: this.winner,
            players: this.players.map(p => p.name),
            setterIndex: this.setterIndex,
            totalPlayers: this.players.length,
            code: this.code
        };
    }
}

// Класс игрока
class Player {
    constructor(name, socketId) {
        this.id = nextPlayerId++;
        this.name = name;
        this.socketId = socketId;
        this.currentLobbyId = null;
    }
}

// WebSocket обработчики
wss.on('connection', (ws) => {
    let player = null;

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'join':
                    let playerName = data.name;
                    // Если имя невалидное, генерируем случайное
                    if (!isValidName(playerName)) {
                        do {
                            playerName = generateRandomName();
                        } while (usedNames.has(playerName));
                    }
                    usedNames.add(playerName);
                    player = new Player(playerName, ws._socket.remoteAddress);
                    players[player.id] = player;
                    ws.send(JSON.stringify({
                        type: 'joined',
                        playerId: player.id,
                        playerName: playerName,
                        lobbies: getPopularLobbies()
                    }));
                    break;

                case 'createLobby':
                    const { lobbyName, maxPlayers, isPrivate } = data;
                    const newLobby = new Lobby(lobbyName, parseInt(maxPlayers), isPrivate, player.id);
                    newLobby.addPlayer(player);
                    player.currentLobbyId = newLobby.id;
                    lobbies.push(newLobby);
                    
                    broadcastLobbies();
                    
                    ws.send(JSON.stringify({
                        type: 'lobbyCreated',
                        lobby: newLobby.getInfo(player.id)
                    }));
                    break;

                case 'joinLobby':
                    const lobbyId = data.lobbyId;
                    const lobby = lobbies.find(l => l.id === lobbyId);
                    if (lobby && !lobby.isGameStarted) {
                        if (lobby.players.length < lobby.maxPlayers) {
                            if (lobby.isPrivate && data.code !== lobby.code) {
                                ws.send(JSON.stringify({
                                    type: 'error',
                                    message: 'Неверный код доступа'
                                }));
                                return;
                            }
                            lobby.addPlayer(player);
                            player.currentLobbyId = lobby.id;
                            
                            broadcastLobbyUpdate(lobby.id);
                            broadcastLobbies();
                            
                            ws.send(JSON.stringify({
                                type: 'lobbyJoined',
                                lobby: lobby.getInfo(player.id)
                            }));
                        } else {
                            ws.send(JSON.stringify({
                                type: 'error',
                                message: 'Лобби заполнено'
                            }));
                        }
                    } else {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Лобби не найдено или игра уже началась'
                        }));
                    }
                    break;

                case 'joinByCode':
                    const code = data.code.toUpperCase();
                    const foundLobby = lobbies.find(l => l.isPrivate && l.code === code && !l.isGameStarted);
                    if (foundLobby) {
                        if (foundLobby.players.length < foundLobby.maxPlayers) {
                            foundLobby.addPlayer(player);
                            player.currentLobbyId = foundLobby.id;
                            broadcastLobbyUpdate(foundLobby.id);
                            broadcastLobbies();
                            ws.send(JSON.stringify({
                                type: 'lobbyJoined',
                                lobby: foundLobby.getInfo(player.id)
                            }));
                        } else {
                            ws.send(JSON.stringify({
                                type: 'error',
                                message: 'Лобби заполнено'
                            }));
                        }
                    } else {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Неверный код или лобби не найдено'
                        }));
                    }
                    break;

                case 'leaveLobby':
                    if (player && player.currentLobbyId) {
                        const leaveLobby = lobbies.find(l => l.id === player.currentLobbyId);
                        if (leaveLobby) {
                            const isEmpty = leaveLobby.removePlayer(player.id);
                            if (isEmpty) {
                                lobbies = lobbies.filter(l => l.id !== leaveLobby.id);
                            } else {
                                broadcastLobbyUpdate(leaveLobby.id);
                            }
                            player.currentLobbyId = null;
                            broadcastLobbies();
                            
                            ws.send(JSON.stringify({
                                type: 'leftLobby'
                            }));
                        }
                    }
                    break;

                case 'startGame':
                    if (player && player.currentLobbyId) {
                        const gameLobby = lobbies.find(l => l.id === player.currentLobbyId);
                        if (gameLobby && gameLobby.creatorId === player.id) {
                            if (gameLobby.players.length >= 2) {
                                gameLobby.isGameStarted = true;
                                gameLobby.gameMode = data.gameMode || 'Угадай последовательность';
                                gameLobby.setterIndex = 0;
                                gameLobby.currentSetter = gameLobby.players[0];
                                gameLobby.currentGuesser = gameLobby.players[1];
                                gameLobby.settingPhase = true;
                                gameLobby.sequence = [];
                                gameLobby.guesses = [];
                                gameLobby.round = 0;
                                gameLobby.gameOver = false;
                                gameLobby.winner = null;
                                
                                broadcastLobbyUpdate(gameLobby.id);
                                broadcastLobbies();
                                
                                broadcastGameState(gameLobby.id);
                                
                                wss.clients.forEach(client => {
                                    if (client.readyState === WebSocket.OPEN) {
                                        const playerId = Object.keys(players).find(id => players[id].socketId === client._socket.remoteAddress);
                                        if (playerId) {
                                            const player = players[playerId];
                                            if (player && player.currentLobbyId === gameLobby.id) {
                                                client.send(JSON.stringify({
                                                    type: 'gameStarted',
                                                    lobby: gameLobby.getInfo(parseInt(playerId))
                                                }));
                                            }
                                        }
                                    }
                                });
                            } else {
                                ws.send(JSON.stringify({
                                    type: 'error',
                                    message: 'Недостаточно игроков для начала игры (минимум 2)'
                                }));
                            }
                        }
                    }
                    break;

                case 'setSequence':
                    if (player && player.currentLobbyId) {
                        const gameLobby = lobbies.find(l => l.id === player.currentLobbyId);
                        if (gameLobby && gameLobby.settingPhase && gameLobby.currentSetter.id === player.id) {
                            gameLobby.sequence = data.sequence;
                            gameLobby.settingPhase = false;
                            gameLobby.round++;
                            gameLobby.guesses = [];
                            
                            const totalPlayers = gameLobby.players.length;
                            const nextIndex = (gameLobby.setterIndex + 1) % totalPlayers;
                            gameLobby.setterIndex = nextIndex;
                            gameLobby.currentSetter = gameLobby.players[nextIndex];
                            gameLobby.currentGuesser = gameLobby.players[(nextIndex + 1) % totalPlayers];
                            
                            broadcastGameState(gameLobby.id);
                        }
                    }
                    break;

                case 'makeGuess':
                    if (player && player.currentLobbyId) {
                        const gameLobby = lobbies.find(l => l.id === player.currentLobbyId);
                        if (gameLobby && !gameLobby.settingPhase && gameLobby.currentGuesser.id === player.id) {
                            const guess = data.guess;
                            gameLobby.guesses.push(guess);
                            
                            let correct = 0;
                            let wrongPosition = 0;
                            const sequenceCopy = [...gameLobby.sequence];
                            const guessCopy = [...guess];
                            
                            for (let i = 0; i < sequenceCopy.length; i++) {
                                if (sequenceCopy[i] === guessCopy[i]) {
                                    correct++;
                                    sequenceCopy[i] = null;
                                    guessCopy[i] = null;
                                }
                            }
                            
                            for (let i = 0; i < guessCopy.length; i++) {
                                if (guessCopy[i] !== null) {
                                    const index = sequenceCopy.indexOf(guessCopy[i]);
                                    if (index !== -1) {
                                        wrongPosition++;
                                        sequenceCopy[index] = null;
                                    }
                                }
                            }
                            
                            const result = {
                                guess: guess,
                                correct: correct,
                                wrongPosition: wrongPosition,
                                isWin: correct === 5
                            };
                            
                            broadcastGameResult(gameLobby.id, result);
                            
                            if (result.isWin) {
                                gameLobby.gameOver = true;
                                gameLobby.winner = player.id;
                                broadcastGameState(gameLobby.id);
                                
                                setTimeout(() => {
                                    gameLobby.isGameStarted = false;
                                    gameLobby.gameOver = false;
                                    gameLobby.winner = null;
                                    gameLobby.sequence = [];
                                    gameLobby.guesses = [];
                                    broadcastLobbyUpdate(gameLobby.id);
                                    broadcastLobbies();
                                }, 5000);
                            } else {
                                const totalPlayers = gameLobby.players.length;
                                const currentIndex = gameLobby.players.findIndex(p => p.id === player.id);
                                const nextIndex = (currentIndex + 1) % totalPlayers;
                                const nextPlayer = gameLobby.players[nextIndex];
                                
                                if (nextPlayer.id === gameLobby.currentSetter.id) {
                                    gameLobby.settingPhase = true;
                                    gameLobby.currentSetter = gameLobby.players[gameLobby.setterIndex];
                                    gameLobby.currentGuesser = gameLobby.players[(gameLobby.setterIndex + 1) % totalPlayers];
                                } else {
                                    gameLobby.currentGuesser = nextPlayer;
                                }
                                
                                broadcastGameState(gameLobby.id);
                            }
                        }
                    }
                    break;

                case 'searchLobbies':
                    const query = data.query || '';
                    const page = data.page || 0;
                    const filteredLobbies = getFilteredLobbies(query);
                    const paginatedLobbies = filteredLobbies.slice(page * 15, (page + 1) * 15);
                    
                    ws.send(JSON.stringify({
                        type: 'searchResults',
                        lobbies: paginatedLobbies.map(l => l.getInfo()),
                        total: filteredLobbies.length,
                        page: page
                    }));
                    break;

                case 'getLobbyInfo':
                    if (player && player.currentLobbyId) {
                        const currentLobby = lobbies.find(l => l.id === player.currentLobbyId);
                        if (currentLobby) {
                            ws.send(JSON.stringify({
                                type: 'lobbyInfo',
                                lobby: currentLobby.getInfo(player.id)
                            }));
                            if (currentLobby.isGameStarted) {
                                ws.send(JSON.stringify({
                                    type: 'gameState',
                                    state: currentLobby.getGameState(player.id)
                                }));
                            }
                        }
                    }
                    break;
            }
        } catch (error) {
            console.error('WebSocket error:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Произошла ошибка'
            }));
        }
    });

    ws.on('close', () => {
        if (player && player.currentLobbyId) {
            const lobby = lobbies.find(l => l.id === player.currentLobbyId);
            if (lobby) {
                const isEmpty = lobby.removePlayer(player.id);
                if (isEmpty) {
                    lobbies = lobbies.filter(l => l.id !== lobby.id);
                } else {
                    broadcastLobbyUpdate(lobby.id);
                }
                broadcastLobbies();
            }
        }
        if (player) {
            usedNames.delete(player.name);
            delete players[player.id];
        }
    });
});

function getPopularLobbies() {
    return lobbies
        .filter(l => !l.isGameStarted)
        .sort((a, b) => b.popularity - a.popularity)
        .slice(0, 15)
        .map(l => l.getInfo());
}

function getFilteredLobbies(query) {
    if (!query) return lobbies.filter(l => !l.isGameStarted);
    return lobbies.filter(l => 
        !l.isGameStarted && 
        l.name.toLowerCase().includes(query.toLowerCase())
    );
}

function broadcastLobbies() {
    const lobbyList = getPopularLobbies();
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'lobbyList',
                lobbies: lobbyList
            }));
        }
    });
}

function broadcastLobbyUpdate(lobbyId) {
    const lobby = lobbies.find(l => l.id === lobbyId);
    if (lobby) {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                const playerId = Object.keys(players).find(id => players[id].socketId === client._socket.remoteAddress);
                if (playerId) {
                    const player = players[playerId];
                    const isInLobby = player && player.currentLobbyId === lobbyId;
                    client.send(JSON.stringify({
                        type: 'lobbyUpdate',
                        lobby: lobby.getInfo(isInLobby ? parseInt(playerId) : null)
                    }));
                }
            }
        });
    }
}

function broadcastGameState(lobbyId) {
    const lobby = lobbies.find(l => l.id === lobbyId);
    if (lobby) {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                const playerId = Object.keys(players).find(id => players[id].socketId === client._socket.remoteAddress);
                if (playerId) {
                    const player = players[playerId];
                    if (player && player.currentLobbyId === lobbyId) {
                        client.send(JSON.stringify({
                            type: 'gameState',
                            state: lobby.getGameState(parseInt(playerId))
                        }));
                    }
                }
            }
        });
    }
}

function broadcastGameResult(lobbyId, result) {
    const lobby = lobbies.find(l => l.id === lobbyId);
    if (lobby) {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                const playerId = Object.keys(players).find(id => players[id].socketId === client._socket.remoteAddress);
                if (playerId) {
                    const player = players[playerId];
                    if (player && player.currentLobbyId === lobbyId) {
                        client.send(JSON.stringify({
                            type: 'gameResult',
                            result: result,
                            isWin: result.isWin,
                            winner: result.isWin ? lobby.winner : null
                        }));
                    }
                }
            }
        });
    }
}

app.get('/api/lobbies', (req, res) => {
    res.json(getPopularLobbies());
});

app.get('/api/lobbies/search', (req, res) => {
    const query = req.query.q || '';
    const page = parseInt(req.query.page) || 0;
    const filtered = getFilteredLobbies(query);
    const paginated = filtered.slice(page * 15, (page + 1) * 15);
    res.json({
        lobbies: paginated.map(l => l.getInfo()),
        total: filtered.length,
        page: page
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        uptime: process.uptime(),
        timestamp: Date.now(),
        lobbiesCount: lobbies.length,
        playersCount: Object.keys(players).length
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
