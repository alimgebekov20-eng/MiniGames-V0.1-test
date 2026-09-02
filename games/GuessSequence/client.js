// Клиентская часть игры "Угадай последовательность"
class GameClient {
    constructor() {
        this.container = null;
        this.gameState = null;
        this.onAction = null;
        this.colors = ['blue', 'red', 'green', 'yellow', 'purple', 'brown'];
        this.colorValues = {
            'blue': '#4a90d9',
            'red': '#e74c3c',
            'green': '#2ecc71',
            'yellow': '#f1c40f',
            'purple': '#9b59b6',
            'brown': '#8B4513'
        };
        this.colorNames = {
            'blue': 'Синий',
            'red': 'Красный',
            'green': 'Зеленый',
            'yellow': 'Желтый',
            'purple': 'Фиолетовый',
            'brown': 'Коричневый'
        };
    }

    render(container, onAction) {
        this.container = container;
        this.onAction = onAction;
        this.renderGame();
    }

    update(state) {
        this.gameState = state;
        this.renderGame();
    }

    renderGame() {
        if (!this.container) return;
        const state = this.gameState;
        if (!state) {
            this.container.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">Ожидание начала игры...</div>';
            return;
        }
        if (state.gameOver) {
            this.renderGameOver();
            return;
        }
        let html = `
            <div class="game-players">
                <div class="player-roles">
                    <div class="role-display setter">
                        <span class="role-label">Загадывает:</span> <span style="font-weight:bold;color:#667eea;">${state.currentSetter || '—'}</span>
                    </div>
                    <div class="role-display guesser">
                        <span class="role-label">Угадывает:</span> <span style="font-weight:bold;color:#48bb78;">${state.currentGuesser || '—'}</span>
                    </div>
                </div>
            </div>
            <div style="text-align:center;margin:5px 0;font-size:14px;color:#999;">Раунд ${state.round + 1} | Попыток: ${state.guesses ? state.guesses.length : 0}</div>
        `;
        if (state.isSetting) {
            html += this.renderSettingPhase();
        } else if (state.isGuessing) {
            html += this.renderGuessingPhase();
        } else if (state.showingResult) {
            html += this.renderResultPhase();
        } else {
            html += this.renderSpectatorPhase();
        }
        this.container.innerHTML = html;
        this.addEventListeners();
    }

    renderSettingPhase() {
        const state = this.gameState;
        const isSetter = this.isCurrentPlayer('setter');
        if (!isSetter) {
            return `
                <div style="text-align:center;padding:30px;color:#666;">
                    <div style="font-size:24px;margin-bottom:10px;">⏳</div>
                    <div><strong>${state.currentSetter}</strong> загадывает последовательность...</div>
                </div>
            `;
        }
        return `
            <div style="text-align:center;margin:20px 0;">
                <h3>Выберите 5 цветов</h3>
                <p style="color:#666;">Нажмите на цвет, чтобы добавить</p>
            </div>
            <div class="remove-toggle">
                <span class="toggle-label">🔧 Режим убирания:</span>
                <button class="btn btn-warning" id="toggleRemoveBtn" style="padding:8px 20px;">
                    🔄 <span id="removeModeStatus">${state.removeMode ? 'Вкл' : 'Выкл'}</span>
                </button>
                <span class="toggle-status ${state.removeMode ? 'on' : 'off'}" id="removeModeIndicator">${state.removeMode ? 'Вкл' : 'Выкл'}</span>
            </div>
            <div class="color-palette">
                ${this.colors.map(color => `
                    <button class="color-btn" style="background:${this.colorValues[color]};" data-color="${color}"></button>
                `).join('')}
            </div>
            <div class="sequence-container" id="sequenceDisplay">
                ${state.tempSequence.length === 0 ? 
                    '<div style="color:#999;padding:20px;">Нажмите на цвет, чтобы добавить</div>' :
                    state.tempSequence.map((color, index) => `
                        <div class="color-block" style="background:${this.colorValues[color]};" data-index="${index}"></div>
                    `).join('')
                }
            </div>
            <div style="text-align:center;">
                <button class="btn btn-success" id="submitSequenceBtn" style="display:${state.tempSequence.length === 5 ? 'inline-block' : 'none'};">✅ Подтвердить</button>
            </div>
        `;
    }

    renderGuessingPhase() {
        const state = this.gameState;
        const isGuesser = this.isCurrentPlayer('guesser');
        if (!isGuesser) {
            return `
                <div style="text-align:center;padding:30px;color:#666;">
                    <div style="font-size:24px;margin-bottom:10px;">🤔</div>
                    <div><strong>${state.currentGuesser}</strong> угадывает последовательность...</div>
                    <div style="margin-top:10px;font-size:14px;">Попыток: ${state.guesses ? state.guesses.length : 0}</div>
                </div>
            `;
        }
        return `
            <div style="text-align:center;margin:20px 0;">
                <h3>Угадайте последовательность!</h3>
                <p style="color:#666;">Выберите 5 цветов в правильном порядке</p>
            </div>
            <div class="color-palette">
                ${this.colors.map(color => `
                    <button class="color-btn" style="background:${this.colorValues[color]};" data-color="${color}"></button>
                `).join('')}
            </div>
            <div class="sequence-container" id="guessDisplay">
                ${state.tempGuess.length === 0 ? 
                    '<div style="color:#999;padding:20px;">Выберите 5 цветов</div>' :
                    state.tempGuess.map((color, index) => `
                        <div class="color-block" style="background:${this.colorValues[color]};" data-index="${index}"></div>
                    `).join('')
                }
            </div>
            <div style="text-align:center;">
                <button class="btn btn-primary" id="submitGuessBtn" style="display:${state.tempGuess.length === 5 ? 'inline-block' : 'none'};">🎯 Угадать!</button>
            </div>
        `;
    }

    renderResultPhase() {
        const state = this.gameState;
        const isGuesser = this.isCurrentPlayer('guesser');
        const result = state.resultData;
        if (!result) return '<div style="text-align:center;padding:30px;">Загрузка результата...</div>';
        const guessColors = result.guess.map(color => this.colorValues[color]);
        const canContinue = state.canContinue && isGuesser;
        const isDisabled = state.waitingForContinue;
        return `
            <div style="text-align:center;margin:20px 0;">
                <h3>${result.isWin ? '🎉 ПРАВИЛЬНО!' : 'Попробуйте еще раз'}</h3>
            </div>
            <div class="result-row">
                <span class="result-label">Ваша попытка:</span>
                ${guessColors.map((color, i) => `
                    <div class="color-block" style="background:${color};${this.getFeedbackStyle(result.feedback[i])}"></div>
                `).join('')}
            </div>
            <div class="result-row">
                <span class="result-label">✅ Правильно на месте:</span>
                <span style="font-size:24px;font-weight:bold;color:#2ecc71;">${'✅'.repeat(result.correct)}</span>
                <span style="font-size:18px;">(${result.correct}/5)</span>
            </div>
            <div class="result-row">
                <span class="result-label">🟡 Правильно, не на месте:</span>
                <span style="font-size:24px;font-weight:bold;color:#f1c40f;">${'🟡'.repeat(result.wrongPosition)}</span>
                <span style="font-size:18px;">(${result.wrongPosition})</span>
            </div>
            <div style="text-align:center;margin-top:20px;">
                <button class="btn ${isDisabled ? 'btn-secondary' : 'btn-success'}" 
                        id="continueBtn" 
                        style="padding:12px 40px;${isDisabled ? 'opacity:0.5;cursor:not-allowed;' : ''}"
                        ${isDisabled ? 'disabled' : ''}>
                    ${isDisabled ? '⏳ Подождите 5 секунд...' : '▶️ Продолжить'}
                </button>
                ${!isGuesser ? `<div style="margin-top:10px;color:#999;font-size:14px;">Ожидайте, <strong>${state.currentGuesser}</strong> смотрит результат...</div>` : ''}
            </div>
        `;
    }

    renderSpectatorPhase() {
        const state = this.gameState;
        return `
            <div style="text-align:center;padding:30px;color:#666;">
                <div style="font-size:24px;margin-bottom:10px;">👀</div>
                <div>Наблюдайте за игрой...</div>
                <div style="margin-top:10px;font-size:14px;">
                    <strong>${state.currentSetter}</strong> загадал последовательность
                </div>
                <div style="font-size:14px;color:#999;">Попыток: ${state.guesses ? state.guesses.length : 0}</div>
            </div>
        `;
    }

    renderGameOver() {
        const state = this.gameState;
        const winnerName = state.winner ? this.getPlayerName(state.winner) : 'Никто';
        return `
            <div style="text-align:center;padding:40px;">
                <div class="winner-text">🎉 ${winnerName} ПОБЕДИЛ!</div>
                <p style="font-size:18px;margin-top:20px;color:#666;">Игра завершена! Возвращение в лобби через 5 секунд...</p>
                <div style="margin-top:20px;font-size:14px;color:#999;">Правильная последовательность: ${state.sequence ? state.sequence.map(c => this.colorNames[c] || c).join(' → ') : '—'}</div>
            </div>
        `;
    }

    getFeedbackStyle(feedback) {
        if (feedback === 'correct') return 'border-color:#2ecc71;box-shadow:0 0 20px rgba(46,204,113,0.5);';
        if (feedback === 'wrong-position') return 'border-color:#f1c40f;box-shadow:0 0 20px rgba(241,196,15,0.5);';
        if (feedback === 'wrong') return 'border-color:#e74c3c;box-shadow:0 0 20px rgba(231,76,60,0.5);';
        return '';
    }

    isCurrentPlayer(role) {
        const state = this.gameState;
        if (!state) return false;
        const playerName = document.getElementById('playerName').textContent;
        if (role === 'setter') return state.currentSetter === playerName;
        if (role === 'guesser') return state.currentGuesser === playerName;
        return false;
    }

    getPlayerName(playerId) {
        const state = this.gameState;
        if (state && state.players && state.players[playerId]) return state.players[playerId];
        return 'Игрок';
    }

    addEventListeners() {
        const container = this.container;
        if (!container) return;

        container.querySelectorAll('.color-btn').forEach(btn => {
            btn.onclick = () => {
                const color = btn.dataset.color;
                if (this.onAction) {
                    if (this.gameState.isSetting) {
                        this.onAction('addColor', { color });
                    } else if (this.gameState.isGuessing) {
                        this.onAction('addGuess', { color });
                    }
                }
            };
        });

        container.querySelectorAll('#sequenceDisplay .color-block').forEach(block => {
            block.onclick = () => {
                const index = parseInt(block.dataset.index);
                if (this.onAction && this.gameState.isSetting) {
                    this.onAction('removeColor', { index });
                }
            };
        });

        container.querySelectorAll('#guessDisplay .color-block').forEach(block => {
            block.onclick = () => {
                const index = parseInt(block.dataset.index);
                if (this.onAction && this.gameState.isGuessing) {
                    this.onAction('removeGuess', { index });
                }
            };
        });

        const submitSeqBtn = container.querySelector('#submitSequenceBtn');
        if (submitSeqBtn) {
            submitSeqBtn.onclick = () => { if (this.onAction) this.onAction('submitSequence', {}); };
        }

        const submitGuessBtn = container.querySelector('#submitGuessBtn');
        if (submitGuessBtn) {
            submitGuessBtn.onclick = () => { if (this.onAction) this.onAction('submitGuess', {}); };
        }

        const toggleRemoveBtn = container.querySelector('#toggleRemoveBtn');
        if (toggleRemoveBtn) {
            toggleRemoveBtn.onclick = () => { if (this.onAction) this.onAction('toggleRemoveMode', {}); };
        }

        const continueBtn = container.querySelector('#continueBtn');
        if (continueBtn) {
            continueBtn.onclick = () => {
                if (this.onAction && !continueBtn.disabled) {
                    this.onAction('continue', {});
                }
            };
        }
    }
}

// Регистрируем глобально
window.GameClient = GameClient;
