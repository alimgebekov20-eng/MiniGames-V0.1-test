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

// Хранилище лобби
let lobbies = [];
let players = {};
let nextLobbyId = 1;
let nextPlayerId = 1;

// Генерация кода для закрытых лобби
function generateLobbyCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
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
            return true; // Лобби пустое, можно удалить
        }
        if (this.creatorId === playerId && this.players.length > 0) {
            // Передаем права создателя следующему игроку
            this.creatorId = this.players[0].id;
        }
        return false;
    }

    getInfo() {
        return {
            id: this.id,
            name: this.name,
            maxPlayers: this.maxPlayers,
            currentPlayers: this.players.length,
            isPrivate: this.isPrivate,
            isGameStarted: this.isGameStarted,
            creatorId: this.creatorId,
            players: this.players.map(p => ({ id: p.id, name: p.name, isCreator: p.id === this.creatorId })),
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
                    player = new Player(data.name, ws._socket.remoteAddress);
                    players[player.id] = player;
                    ws.send(JSON.stringify({
                        type: 'joined',
                        playerId: player.id,
                        lobbies: getPopularLobbies()
                    }));
                    break;

                case 'createLobby':
                    const { lobbyName, maxPlayers, isPrivate } = data;
                    const newLobby = new Lobby(lobbyName, parseInt(maxPlayers), isPrivate, player.id);
                    newLobby.addPlayer(player);
                    player.currentLobbyId = newLobby.id;
                    lobbies.push(newLobby);
                    
                    // Отправляем всем обновленный список лобби
                    broadcastLobbies();
                    
                    ws.send(JSON.stringify({
                        type: 'lobbyCreated',
                        lobby: newLobby.getInfo()
                    }));
                    break;

                case 'joinLobby':
                    const lobbyId = data.lobbyId;
                    const lobby = lobbies.find(l => l.id === lobbyId);
                    if (lobby && !lobby.isGameStarted) {
                        if (lobby.players.length < lobby.maxPlayers) {
                            // Проверка на закрытое лобби
                            if (lobby.isPrivate && data.code !== lobby.code) {
                                ws.send(JSON.stringify({
                                    type: 'error',
                                    message: 'Неверный код доступа'
                                }));
                                return;
                            }
                            lobby.addPlayer(player);
                            player.currentLobbyId = lobby.id;
                            
                            // Обновляем всех в лобби
                            broadcastLobbyUpdate(lobby.id);
                            broadcastLobbies();
                            
                            ws.send(JSON.stringify({
                                type: 'lobbyJoined',
                                lobby: lobby.getInfo()
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
                                broadcastLobbyUpdate(gameLobby.id);
                                broadcastLobbies();
                                
                                ws.send(JSON.stringify({
                                    type: 'gameStarted',
                                    lobby: gameLobby.getInfo()
                                }));
                            } else {
                                ws.send(JSON.stringify({
                                    type: 'error',
                                    message: 'Недостаточно игроков для начала игры (минимум 2)'
                                }));
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
                                lobby: currentLobby.getInfo()
                            }));
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
            delete players[player.id];
        }
    });
});

// Вспомогательные функции
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
        const lobbyInfo = lobby.getInfo();
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'lobbyUpdate',
                    lobby: lobbyInfo
                }));
            }
        });
    }
}

// HTTP маршруты
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
