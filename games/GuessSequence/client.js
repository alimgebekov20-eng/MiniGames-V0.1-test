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
            this.container.innerHTML = `
                <div style="text-align:center;padding:40px;color:#999;">
                    <div style="font-size:48px;margin-bottom:20px;">⏳</div>
                    Ожидание начала игры...
                </div>
            `;
            return;
        }

        if (state.gameOver) {
            this.renderGameOver();
            return;
        }

        let html = `
            <div style="background:#f8f9fa;padding:15px;border-radius:10px;margin:10px 0;">
                <div style="display:flex;justify-content:center;gap:20px;flex-wrap:wrap;">
                    <div style="padding:10px 20px;border-radius:10px;border:2px solid #667eea;background:white;">
                        <span style="font-weight:bold;">Загадывает:</span> 
                        <span style="font-weight:bold;color:#667eea;">${state.currentSetter || '—'}</span>
                    </div>
                    <div style="padding:10px 20px;border-radius:10px;border:2px solid #48bb78;background:white;">
                        <span style="font-weight:bold;">Угадывает:</span> 
                        <span style="font-weight:bold;color:#48bb78;">${state.currentGuesser || '—'}</span>
                    </div>
                </div>
                <div style="text-align:center;margin-top:10px;font-size:14px;color:#999;">
                    Раунд ${state.round + 1} | Попыток: ${state.guesses ? state.guesses.length : 0}
                </div>
            </div>
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
        const isSetter = state.isSetter;
        
        if (!isSetter) {
            return `
                <div style="text-align:center;padding:30px;color:#666;">
                    <div style="font-size:48px;margin-bottom:10px;">⏳</div>
                    <div style="font-size:18px;"><strong>${state.currentSetter}</strong> загадывает последовательность...</div>
                    <div style="margin-top:10px;font-size:14px;color:#999;">Выберите 5 цветов</div>
                </div>
            `;
        }

        return `
            <div style="text-align:center;margin:20px 0;">
                <h3>Выберите 5 цветов в правильной последовательности</h3>
                <p style="color:#666;">Нажмите на цвет, чтобы добавить его. Нажмите на блок, чтобы убрать.</p>
            </div>

            <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin:10px 0;padding:10px;background:#f8f9fa;border-radius:8px;flex-wrap:wrap;">
                <span style="font-weight:600;color:#333;">🔧 Режим убирания:</span>
                <button id="toggleRemoveBtn" style="padding:8px 20px;border:none;border-radius:8px;font-weight:600;cursor:pointer;background:${state.removeMode ? '#fc8181' : '#ed8936'};color:white;transition:all 0.2s;">
                    ${state.removeMode ? '🔄 Вкл' : '🔄 Выкл'}
                </button>
                <span style="padding:2px 12px;border-radius:12px;font-size:14px;font-weight:700;background:${state.removeMode ? '#fc8181' : '#48bb78'};color:white;">
                    ${state.removeMode ? 'Вкл' : 'Выкл'}
                </span>
            </div>

            <div style="display:flex;justify-content:center;gap:15px;flex-wrap:wrap;margin:20px 0;">
                ${this.colors.map(color => `
                    <button class="color-btn" style="width:60px;height:60px;border:none;border-radius:10px;background:${this.colorValues[color]};cursor:pointer;transition:transform 0.2s;box-shadow:0 2px 8px rgba(0,0,0,0.2);" data-color="${color}"></button>
                `).join('')}
            </div>

            <div style="display:flex;justify-content:center;gap:15px;margin:20px 0;min-height:70px;flex-wrap:wrap;padding:10px;background:#f8f9fa;border-radius:10px;border:2px dashed #ccc;">
                ${state.tempSequence.length === 0 ? 
                    '<div style="color:#999;padding:20px;">Нажмите на цвет, чтобы добавить</div>' :
                    state.tempSequence.map((color, index) => `
                        <div class="color-block" style="width:60px;height:60px;border-radius:10px;border:3px solid #333;background:${this.colorValues[color]};cursor:pointer;transition:all 0.2s;" data-index="${index}"></div>
                    `).join('')
                }
            </div>

            <div style="text-align:center;">
                <button id="submitSequenceBtn" class="btn btn-success" style="display:${state.tempSequence.length === 5 ? 'inline-block' : 'none'};padding:12px 40px;font-size:18px;">
                    ✅ Подтвердить
                </button>
            </div>
        `;
    }

    renderGuessingPhase() {
        const state = this.gameState;
        const isGuesser = state.isGuesser;
        
        if (!isGuesser) {
            return `
                <div style="text-align:center;padding:30px;color:#666;">
                    <div style="font-size:48px;margin-bottom:10px;">🤔</div>
                    <div style="font-size:18px;"><strong>${state.currentGuesser}</strong> угадывает последовательность...</div>
                    <div style="margin-top:10px;font-size:14px;color:#999;">Попыток: ${state.guesses ? state.guesses.length : 0}</div>
                </div>
            `;
        }

        return `
            <div style="text-align:center;margin:20px 0;">
                <h3>Угадайте последовательность!</h3>
                <p style="color:#666;">Выберите 5 цветов в правильном порядке</p>
                <div style="margin-top:5px;font-size:14px;color:#999;">Попыток: ${state.guesses ? state.guesses.length : 0}</div>
            </div>

            <div style="display:flex;justify-content:center;gap:15px;flex-wrap:wrap;margin:20px 0;">
                ${this.colors.map(color => `
                    <button class="guess-btn" style="width:60px;height:60px;border:none;border-radius:10px;background:${this.colorValues[color]};cursor:pointer;transition:transform 0.2s;box-shadow:0 2px 8px rgba(0,0,0,0.2);" data-color="${color}"></button>
                `).join('')}
            </div>

            <div style="display:flex;justify-content:center;gap:15px;margin:20px 0;min-height:70px;flex-wrap:wrap;padding:10px;background:#f8f9fa;border-radius:10px;border:2px dashed #ccc;">
                ${state.tempGuess.length === 0 ? 
                    '<div style="color:#999;padding:20px;">Выберите 5 цветов</div>' :
                    state.tempGuess.map((color, index) => `
                        <div class="guess-block" style="width:60px;height:60px;border-radius:10px;border:3px solid #333;background:${this.colorValues[color]};cursor:pointer;transition:all 0.2s;" data-index="${index}"></div>
                    `).join('')
                }
            </div>

            <div style="text-align:center;">
                <button id="submitGuessBtn" class="btn btn-primary" style="display:${state.tempGuess.length === 5 ? 'inline-block' : 'none'};padding:12px 40px;font-size:18px;">
                    🎯 Угадать!
                </button>
            </div>
        `;
    }

    renderResultPhase() {
        const state = this.gameState;
        const isGuesser = state.isGuesser;
        const result = state.resultData;
        
        if (!result) return '<div style="text-align:center;padding:30px;">Загрузка результата...</div>';

        const guessColors = result.guess.map(color => this.colorValues[color]);
        const isDisabled = state.waitingForContinue || !state.canContinue;

        let feedbackIcons = result.feedback.map(f => {
            if (f === 'correct') return '✅';
            if (f === 'wrong-position') return '🟡';
            return '❌';
        });

        return `
            <div style="text-align:center;margin:20px 0;">
                <h2 style="color:${result.isWin ? '#2ecc71' : '#e74c3c'};">${result.isWin ? '🎉 ПРАВИЛЬНО!' : 'Попробуйте еще раз'}</h2>
            </div>

            <div style="display:flex;justify-content:center;align-items:center;gap:15px;margin:10px 0;padding:10px;background:white;border-radius:10px;flex-wrap:wrap;">
                <span style="font-weight:bold;color:#333;min-width:100px;">Ваша попытка:</span>
                ${guessColors.map((color, i) => `
                    <div style="width:60px;height:60px;border-radius:10px;border:3px solid ${result.feedback[i] === 'correct' ? '#2ecc71' : result.feedback[i] === 'wrong-position' ? '#f1c40f' : '#e74c3c'};background:${color};box-shadow:${result.feedback[i] === 'correct' ? '0 0 20px rgba(46,204,113,0.5)' : result.feedback[i] === 'wrong-position' ? '0 0 20px rgba(241,196,15,0.5)' : '0 0 20px rgba(231,76,60,0.5)'};">
                        <div style="display:flex;justify-content:center;align-items:center;width:100%;height:100%;font-size:24px;">${feedbackIcons[i]}</div>
                    </div>
                `).join('')}
            </div>

            <div style="display:flex;justify-content:center;align-items:center;gap:15px;margin:10px 0;padding:10px;background:white;border-radius:10px;flex-wrap:wrap;">
                <span style="font-weight:bold;color:#333;min-width:100px;">✅ Правильно на месте:</span>
                <span style="font-size:24px;font-weight:bold;color:#2ecc71;">${'✅'.repeat(result.correct)}</span>
                <span style="font-size:18px;">(${result.correct}/5)</span>
            </div>

            <div style="display:flex;justify-content:center;align-items:center;gap:15px;margin:10px 0;padding:10px;background:white;border-radius:10px;flex-wrap:wrap;">
                <span style="font-weight:bold;color:#333;min-width:100px;">🟡 Правильно, не на месте:</span>
                <span style="font-size:24px;font-weight:bold;color:#f1c40f;">${'🟡'.repeat(result.wrongPosition)}</span>
                <span style="font-size:18px;">(${result.wrongPosition})</span>
            </div>

            <div style="text-align:center;margin-top:20px;">
                <button id="continueBtn" style="padding:12px 40px;border:none;border-radius:8px;font-size:18px;font-weight:600;cursor:${isDisabled ? 'not-allowed' : 'pointer'};background:${isDisabled ? '#a0aec0' : '#48bb78'};color:white;opacity:${isDisabled ? '0.5' : '1'};" ${isDisabled ? 'disabled' : ''}>
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
                <div style="font-size:48px;margin-bottom:10px;">👀</div>
                <div style="font-size:18px;">Наблюдайте за игрой...</div>
                <div style="margin-top:10px;font-size:14px;">
                    <strong>${state.currentSetter}</strong> загадал последовательность
                </div>
                <div style="font-size:14px;color:#999;">Попыток: ${state.guesses ? state.guesses.length : 0}</div>
            </div>
        `;
    }

    renderGameOver() {
        const state = this.gameState;
        const winnerName = state.winner ? state.players[state.players.indexOf(state.winner)] : 'Никто';
        const sequenceColors = state.sequence ? state.sequence.map(c => this.colorNames[c] || c).join(' → ') : '—';
        
        return `
            <div style="text-align:center;padding:40px;">
                <div style="font-size:48px;color:#f1c40f;text-shadow:0 0 30px rgba(241,196,15,0.5);animation:pulse 1s ease-in-out infinite;">
                    🎉 ${winnerName} ПОБЕДИЛ!
                </div>
                <p style="font-size:18px;margin-top:20px;color:#666;">Игра завершена! Возвращение в лобби через 5 секунд...</p>
                <div style="margin-top:20px;padding:15px;background:#f8f9fa;border-radius:10px;font-size:16px;color:#333;">
                    <span style="font-weight:bold;">Правильная последовательность:</span><br>
                    <div style="display:flex;justify-content:center;gap:10px;margin-top:10px;flex-wrap:wrap;">
                        ${state.sequence ? state.sequence.map(c => `
                            <div style="width:50px;height:50px;border-radius:8px;border:2px solid #333;background:${this.colorValues[c]};"></div>
                        `).join('') : '—'}
                    </div>
                </div>
            </div>
            <style>
                @keyframes pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.1); }
                }
            </style>
        `;
    }

    addEventListeners() {
        const container = this.container;
        if (!container) return;

        // Кнопки палитры для загадывания
        container.querySelectorAll('.color-btn').forEach(btn => {
            btn.onclick = () => {
                const color = btn.dataset.color;
                if (this.onAction && this.gameState.isSetting) {
                    this.onAction('addColor', { color });
                }
            };
            // Hover эффект
            btn.onmouseover = () => btn.style.transform = 'scale(1.1)';
            btn.onmouseout = () => btn.style.transform = 'scale(1)';
        });

        // Блоки последовательности (удаление)
        container.querySelectorAll('.color-block').forEach(block => {
            block.onclick = () => {
                const index = parseInt(block.dataset.index);
                if (this.onAction && this.gameState.isSetting) {
                    this.onAction('removeColor', { index });
                }
            };
            block.onmouseover = () => block.style.transform = 'scale(1.1)';
            block.onmouseout = () => block.style.transform = 'scale(1)';
        });

        // Кнопки палитры для угадывания
        container.querySelectorAll('.guess-btn').forEach(btn => {
            btn.onclick = () => {
                const color = btn.dataset.color;
                if (this.onAction && this.gameState.isGuessing) {
                    this.onAction('addGuess', { color });
                }
            };
            btn.onmouseover = () => btn.style.transform = 'scale(1.1)';
            btn.onmouseout = () => btn.style.transform = 'scale(1)';
        });

        // Блоки угадывания (удаление)
        container.querySelectorAll('.guess-block').forEach(block => {
            block.onclick = () => {
                const index = parseInt(block.dataset.index);
                if (this.onAction && this.gameState.isGuessing) {
                    this.onAction('removeGuess', { index });
                }
            };
            block.onmouseover = () => block.style.transform = 'scale(1.1)';
            block.onmouseout = () => block.style.transform = 'scale(1)';
        });

        // Кнопка подтверждения последовательности
        const submitSeqBtn = container.querySelector('#submitSequenceBtn');
        if (submitSeqBtn) {
            submitSeqBtn.onclick = () => {
                if (this.onAction) this.onAction('submitSequence', {});
            };
        }

        // Кнопка угадывания
        const submitGuessBtn = container.querySelector('#submitGuessBtn');
        if (submitGuessBtn) {
            submitGuessBtn.onclick = () => {
                if (this.onAction) this.onAction('submitGuess', {});
            };
        }

        // Кнопка режима убирания
        const toggleRemoveBtn = container.querySelector('#toggleRemoveBtn');
        if (toggleRemoveBtn) {
            toggleRemoveBtn.onclick = () => {
                if (this.onAction) this.onAction('toggleRemoveMode', {});
            };
        }

        // Кнопка продолжения
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
