// Серверная часть игры "Угадай последовательность"
const displayName = '🎯 Угадай последовательность';
const description = 'Угадайте последовательность из 5 цветов';
const minPlayers = 2;
const maxPlayers = 8;

class GuessSequenceGame {
    constructor(lobby) {
        this.lobby = lobby;
        this.sequence = [];
        this.tempSequence = [];
        this.tempGuess = [];
        this.guesses = [];
        this.round = 0;
        this.gameOver = false;
        this.winner = null;
        this.settingPhase = true;
        this.removeMode = false;
        this.currentSetterIndex = 0;
        this.currentGuesserIndex = 1;
        this.showingResult = false;
        this.resultData = null;
        this.waitingForContinue = false;
        this.continueTimer = null;
        this.colors = ['blue', 'red', 'green', 'yellow', 'purple', 'brown'];
        this.colorValues = {
            'blue': '#4a90d9',
            'red': '#e74c3c',
            'green': '#2ecc71',
            'yellow': '#f1c40f',
            'purple': '#9b59b6',
            'brown': '#8B4513'
        };
    }

    getState(forPlayerId) {
        const players = this.lobby.players;
        const currentSetter = players[this.currentSetterIndex] || null;
        const currentGuesser = players[this.currentGuesserIndex] || null;
        
        return {
            isSetting: this.settingPhase,
            isGuessing: !this.settingPhase && !this.gameOver && !this.showingResult,
            isSpectator: !this.settingPhase && !this.gameOver && !this.showingResult,
            gameOver: this.gameOver,
            winner: this.winner,
            currentSetter: currentSetter ? currentSetter.name : null,
            currentGuesser: currentGuesser ? currentGuesser.name : null,
            tempSequence: this.tempSequence,
            tempGuess: this.tempGuess,
            sequence: this.sequence,
            guesses: this.guesses,
            round: this.round,
            removeMode: this.removeMode,
            showingResult: this.showingResult,
            resultData: this.resultData,
            waitingForContinue: this.waitingForContinue,
            players: players.map(p => p.name),
            totalPlayers: players.length,
            canContinue: this.waitingForContinue && this.canContinue(forPlayerId),
            isSetter: this.currentSetterIndex === players.findIndex(p => p.id === forPlayerId),
            isGuesser: this.currentGuesserIndex === players.findIndex(p => p.id === forPlayerId)
        };
    }

    canContinue(playerId) {
        if (!this.waitingForContinue) return false;
        const player = this.lobby.players.find(p => p.id === playerId);
        return player && this.lobby.players.indexOf(player) === this.currentGuesserIndex;
    }

    startGame() {
        this.sequence = [];
        this.tempSequence = [];
        this.tempGuess = [];
        this.guesses = [];
        this.round = 0;
        this.gameOver = false;
        this.winner = null;
        this.settingPhase = true;
        this.removeMode = false;
        this.currentSetterIndex = 0;
        this.currentGuesserIndex = 1 % this.lobby.players.length;
        this.showingResult = false;
        this.resultData = null;
        this.waitingForContinue = false;
        if (this.continueTimer) {
            clearTimeout(this.continueTimer);
            this.continueTimer = null;
        }
    }

    onPlayerJoin(playerId) {}

    onPlayerLeave(playerId) {
        if (this.gameOver) return;
        const players = this.lobby.players;
        const playerIndex = players.findIndex(p => p.id === playerId);
        if (playerIndex === this.currentSetterIndex || playerIndex === this.currentGuesserIndex) {
            if (players.length > 1) {
                this.currentSetterIndex = this.currentSetterIndex % players.length;
                this.currentGuesserIndex = (this.currentGuesserIndex + 1) % players.length;
                if (this.currentGuesserIndex === this.currentSetterIndex) {
                    this.currentGuesserIndex = (this.currentGuesserIndex + 1) % players.length;
                }
            }
        }
    }

    handleAction(playerId, action, params) {
        const players = this.lobby.players;
        const playerIndex = players.findIndex(p => p.id === playerId);
        if (this.gameOver) return null;

        // Переключение режима убирания
        if (action === 'toggleRemoveMode') {
            if (this.settingPhase && playerIndex === this.currentSetterIndex) {
                this.removeMode = !this.removeMode;
                return {};
            }
            return null;
        }

        // Добавление цвета в последовательность
        if (action === 'addColor') {
            if (this.settingPhase && playerIndex === this.currentSetterIndex) {
                if (this.removeMode) {
                    if (this.tempSequence.length > 0) {
                        this.tempSequence.pop();
                        return {};
                    }
                } else {
                    if (this.tempSequence.length < 5) {
                        this.tempSequence.push(params.color);
                        return {};
                    }
                }
            }
            return null;
        }

        // Удаление цвета из последовательности
        if (action === 'removeColor') {
            if (this.settingPhase && playerIndex === this.currentSetterIndex) {
                const index = params.index;
                if (index >= 0 && index < this.tempSequence.length) {
                    this.tempSequence.splice(index, 1);
                    return {};
                }
            }
            return null;
        }

        // Подтверждение последовательности
        if (action === 'submitSequence') {
            if (this.settingPhase && playerIndex === this.currentSetterIndex && this.tempSequence.length === 5) {
                this.sequence = [...this.tempSequence];
                this.settingPhase = false;
                this.round++;
                this.guesses = [];
                this.tempSequence = [];
                this.tempGuess = [];
                this.removeMode = false;
                return {};
            }
            return null;
        }

        // Добавление цвета в угадывание
        if (action === 'addGuess') {
            if (!this.settingPhase && !this.gameOver && playerIndex === this.currentGuesserIndex) {
                if (this.tempGuess.length < 5) {
                    this.tempGuess.push(params.color);
                    return {};
                }
            }
            return null;
        }

        // Удаление цвета из угадывания
        if (action === 'removeGuess') {
            if (!this.settingPhase && !this.gameOver && playerIndex === this.currentGuesserIndex) {
                const index = params.index;
                if (index >= 0 && index < this.tempGuess.length) {
                    this.tempGuess.splice(index, 1);
                    return {};
                }
            }
            return null;
        }

        // Отправка угадывания
        if (action === 'submitGuess') {
            if (!this.settingPhase && !this.gameOver && playerIndex === this.currentGuesserIndex) {
                if (this.tempGuess.length === 5) {
                    const guess = [...this.tempGuess];
                    this.guesses.push(guess);
                    this.tempGuess = [];
                    
                    // Проверка
                    let correct = 0;
                    let wrongPosition = 0;
                    const sequenceCopy = [...this.sequence];
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
                    
                    const isWin = correct === 5;
                    
                    // Показываем результат
                    this.showingResult = true;
                    this.resultData = {
                        guess: guess,
                        correct: correct,
                        wrongPosition: wrongPosition,
                        isWin: isWin,
                        feedback: guess.map((color, i) => {
                            if (color === this.sequence[i]) return 'correct';
                            if (this.sequence.includes(color)) return 'wrong-position';
                            return 'wrong';
                        })
                    };
                    
                    this.waitingForContinue = true;
                    
                    if (this.continueTimer) clearTimeout(this.continueTimer);
                    
                    // Автоматическая кнопка через 5 секунд
                    this.continueTimer = setTimeout(() => {
                        this.waitingForContinue = false;
                        this.continueTimer = null;
                        
                        if (isWin) {
                            this.gameOver = true;
                            this.winner = playerId;
                            return;
                        } else {
                            // ПЕРЕДАЕМ ХОД СЛЕДУЮЩЕМУ ИГРОКУ
                            const totalPlayers = this.lobby.players.length;
                            
                            // Находим следующего игрока после текущего угадывающего
                            let nextGuesserIndex = (this.currentGuesserIndex + 1) % totalPlayers;
                            
                            // Если следующий игрок - это загадывающий, то начинаем новый раунд
                            if (nextGuesserIndex === this.currentSetterIndex) {
                                // Новый раунд: новый загадывающий (следующий после старого)
                                const newSetterIndex = (this.currentSetterIndex + 1) % totalPlayers;
                                this.currentSetterIndex = newSetterIndex;
                                // Угадывает следующий после загадывающего
                                this.currentGuesserIndex = (newSetterIndex + 1) % totalPlayers;
                                this.settingPhase = true;
                                this.tempSequence = [];
                                this.tempGuess = [];
                                this.guesses = [];
                                this.round++;
                                this.showingResult = false;
                                this.resultData = null;
                                this.removeMode = false;
                            } else {
                                // Просто передаем ход следующему игроку
                                this.currentGuesserIndex = nextGuesserIndex;
                                this.showingResult = false;
                                this.resultData = null;
                            }
                        }
                    }, 5000);
                    
                    return {};
                }
            }
            return null;
        }

        // Продолжить после результата
        if (action === 'continue') {
            if (this.showingResult && this.waitingForContinue && playerIndex === this.currentGuesserIndex) {
                if (this.continueTimer) return null;
                
                this.waitingForContinue = false;
                this.showingResult = false;
                
                if (this.resultData && this.resultData.isWin) {
                    this.gameOver = true;
                    this.winner = playerId;
                    this.resultData = null;
                    return {};
                } else {
                    // ПЕРЕДАЕМ ХОД СЛЕДУЮЩЕМУ ИГРОКУ
                    const totalPlayers = this.lobby.players.length;
                    
                    // Находим следующего игрока после текущего угадывающего
                    let nextGuesserIndex = (this.currentGuesserIndex + 1) % totalPlayers;
                    
                    // Если следующий игрок - это загадывающий, то начинаем новый раунд
                    if (nextGuesserIndex === this.currentSetterIndex) {
                        // Новый раунд: новый загадывающий (следующий после старого)
                        const newSetterIndex = (this.currentSetterIndex + 1) % totalPlayers;
                        this.currentSetterIndex = newSetterIndex;
                        // Угадывает следующий после загадывающего
                        this.currentGuesserIndex = (newSetterIndex + 1) % totalPlayers;
                        this.settingPhase = true;
                        this.tempSequence = [];
                        this.tempGuess = [];
                        this.guesses = [];
                        this.round++;
                        this.removeMode = false;
                    } else {
                        // Просто передаем ход следующему игроку
                        this.currentGuesserIndex = nextGuesserIndex;
                    }
                    
                    this.resultData = null;
                    return {};
                }
            }
            return null;
        }

        return null;
    }
}

module.exports = {
    displayName,
    description,
    minPlayers,
    maxPlayers,
    createInstance: (lobby) => new GuessSequenceGame(lobby)
};
