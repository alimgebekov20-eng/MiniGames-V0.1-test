const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// Загрузка игр
const games = {};
const gamesPath = path.join(__dirname, '../games');
if (fs.existsSync(gamesPath)) {
    const gameFolders = fs.readdirSync(gamesPath);
    gameFolders.forEach(folder => {
        const serverPath = path.join(gamesPath, folder, `${folder}Server.js`);
        if (fs.existsSync(serverPath)) {
            const GameClass = require(serverPath);
            games[folder] = {
                class: GameClass,
                instances: {}
            };
            console.log(`✅ Загружена игра: ${folder}`);
        }
    });
}

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
        this.gameInstance = null;
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
            gameMode: this.gameMode
        };
        
        if (forPlayerId && this.players.some(p => p.id === forPlayerId)) {
            info.code = this.code;
        }
        
        return info;
    }

    getGameState(forPlayerId) {
        if (this.gameInstance && typeof this.gameInstance.getState === 'function') {
            return this.gameInstance.getState(forPlayerId);
        }
        return null;
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
                        lobbies: getPopularLobbies(),
                        games: Object.keys(games)
                    }));
                    break;

                case 'createLobby':
                    const { lobbyName, maxPlayers, isPrivate, gameMode } = data;
                    const newLobby = new Lobby(lobbyName, parseInt(maxPlayers), isPrivate, player.id);
                    newLobby.addPlayer(player);
                    newLobby.gameMode = gameMode;
                    player.currentLobbyId = newLobby.id;
                    lobbies.push(newLobby);
                    
                    // Создаем экземпляр игры
                    if (games[gameMode]) {
                        const GameClass = games[gameMode].class;
                        newLobby.gameInstance = new GameClass(newLobby);
                    }
                    
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
                            
                            if (lobby.gameInstance && typeof lobby.gameInstance.onPlayerJoin === 'function') {
                                lobby.gameInstance.onPlayerJoin(player.id);
                            }
                            
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
                            
                            if (foundLobby.gameInstance && typeof foundLobby.gameInstance.onPlayerJoin === 'function') {
                                foundLobby.gameInstance.onPlayerJoin(player.id);
                            }
                            
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
                            if (leaveLobby.gameInstance && typeof leaveLobby.gameInstance.onPlayerLeave === 'function') {
                                leaveLobby.gameInstance.onPlayerLeave(player.id);
                            }
                            
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
                                
                                if (gameLobby.gameInstance && typeof gameLobby.gameInstance.startGame === 'function') {
                                    gameLobby.gameInstance.startGame();
                                }
                                
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

                case 'gameAction':
                    if (player && player.currentLobbyId) {
                        const gameLobby = lobbies.find(l => l.id === player.currentLobbyId);
                        if (gameLobby && gameLobby.gameInstance) {
                            const result = gameLobby.gameInstance.handleAction(player.id, data.action, data.params);
                            if (result) {
                                broadcastGameState(gameLobby.id);
                                if (result.broadcast) {
                                    // Широковещательное сообщение
                                    broadcastGameMessage(gameLobby.id, result.message);
                                }
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
                                const state = currentLobby.getGameState(player.id);
                                if (state) {
                                    ws.send(JSON.stringify({
                                        type: 'gameState',
                                        state: state
                                    }));
                                }
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
                if (lobby.gameInstance && typeof lobby.gameInstance.onPlayerLeave === 'function') {
                    lobby.gameInstance.onPlayerLeave(player.id);
                }
                
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
    if (lobby && lobby.gameInstance) {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                const playerId = Object.keys(players).find(id => players[id].socketId === client._socket.remoteAddress);
                if (playerId) {
                    const player = players[playerId];
                    if (player && player.currentLobbyId === lobbyId) {
                        const state = lobby.gameInstance.getState(parseInt(playerId));
                        if (state) {
                            client.send(JSON.stringify({
                                type: 'gameState',
                                state: state
                            }));
                        }
                    }
                }
            }
        });
    }
}

function broadcastGameMessage(lobbyId, message) {
    const lobby = lobbies.find(l => l.id === lobbyId);
    if (lobby) {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                const playerId = Object.keys(players).find(id => players[id].socketId === client._socket.remoteAddress);
                if (playerId) {
                    const player = players[playerId];
                    if (player && player.currentLobbyId === lobbyId) {
                        client.send(JSON.stringify({
                            type: 'gameMessage',
                            message: message
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

app.get('/api/games', (req, res) => {
    res.json(Object.keys(games));
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        uptime: process.uptime(),
        timestamp: Date.now(),
        lobbiesCount: lobbies.length,
        playersCount: Object.keys(players).length,
        games: Object.keys(games)
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
