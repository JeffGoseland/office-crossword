// Office Crossword - Consolidated JavaScript

// Configuration Management
class CrosswordConfig {
    constructor() {
        this.defaultConfig = {
            grid: { size: 15, type: 'daily' },
            blackSquares: { percentage: 0.15, avoidCorners: true, avoid2x2Blocks: true },
            words: { minLength: 3, maxLength: 12, targetCount: 20, preferLonger: false, balanceAcrossDown: true },
            symmetry: { enabled: true, type: 'rotational' },
            placement: { maxAttempts: 200, ensureConnectivity: true, preventIsolatedLetters: true, density: 'medium' },
            rendering: { cellSize: 45, showNumbers: true, showClues: true, showGridLabels: true },
            difficulty: 'medium',
            files: { wordListPath: 'data/sample.csv', fallbackWords: [] }
        };
        this.config = { ...this.defaultConfig };
    }

    async loadConfig() {
        try {
            const response = await fetch('config/crossword-config.json');
            if (response.ok) {
                const fileConfig = await response.json();
                this.config = { ...this.defaultConfig, ...fileConfig };
                console.log('Configuration loaded from file:', this.config);
            } else {
                console.log('Config file not found, using defaults');
                this.config = { ...this.defaultConfig };
            }
        } catch (error) {
            console.log('Error loading config, using defaults:', error);
            this.config = { ...this.defaultConfig };
        }
        
        // Always try to load from cookies as override
        this.loadFromCookies();
        console.log('Final configuration:', this.config);
    }

    get(key) {
        const keys = key.split('.');
        let value = this.config;
        
        // Navigate through nested properties
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                // If we can't find the nested property, try to get it from default config
                let defaultValue = this.defaultConfig;
                for (const defaultKey of keys) {
                    if (defaultValue && typeof defaultValue === 'object' && defaultKey in defaultValue) {
                        defaultValue = defaultValue[defaultKey];
                    } else {
                        return null;
                    }
                }
                return defaultValue;
            }
        }
        
        return value;
    }

    updateConfig(updates) {
        for (const [key, value] of Object.entries(updates)) {
            const keys = key.split('.');
            let current = this.config;
            for (let i = 0; i < keys.length - 1; i++) {
                if (!current[keys[i]]) current[keys[i]] = {};
                current = current[keys[i]];
            }
            current[keys[keys.length - 1]] = value;
        }
        this.saveToCookies();
    }

    resetToDefaults() {
        this.config = { ...this.defaultConfig };
        this.deleteCookie('crosswordConfig');
    }

    setCookie(name, value, days = 30) {
        const expires = new Date();
        expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = `${name}=${JSON.stringify(value)};expires=${expires.toUTCString()};path=/`;
    }

    getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return JSON.parse(c.substring(nameEQ.length, c.length));
        }
        return null;
    }

    deleteCookie(name) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
    }

    loadFromCookies() {
        const cookieConfig = this.getCookie('crosswordConfig');
        if (cookieConfig) {
            this.config = { ...this.defaultConfig, ...cookieConfig };
        }
    }

    saveToCookies() {
        this.setCookie('crosswordConfig', this.config);
    }
}

// Crossword Generator
class CrosswordGenerator {
    constructor(config) {
        this.config = config;
        this.gridSize = config.get('grid.size') || 15;
        this.cellSize = config.get('rendering.cellSize') || 45;
        this.words = [];
        this.crossword = [];
        this.placedWords = [];
    }

    async loadWordsFromCSV() {
        try {
            const response = await fetch(this.config.get('files.wordListPath') || 'data/sample.csv');
            const csvText = await response.text();
            const lines = csvText.split('\n').filter(line => line.trim());
            
            // Skip header if it exists
            const startIndex = lines[0].toLowerCase().includes('clue') ? 1 : 0;
            
            this.words = [];
            this.clues = {};
            
            for (let i = startIndex; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line) {
                    const parts = line.split(',');
                    if (parts.length >= 2) {
                        const clue = parts[0].replace(/"/g, '').trim();
                        const word = parts[1].trim().toLowerCase();
                        
                        if (word.length >= this.config.get('words.minLength') || 3 && 
                            /^[a-z]+$/.test(word)) {
                            this.words.push(word);
                            this.clues[word] = clue;
                        }
                    }
                }
            }
                
            console.log(`Loaded ${this.words.length} words with clues from CSV`);
        } catch (error) {
            console.error('Error loading words from CSV:', error);
            // Use fallback words if CSV fails
            this.words = this.config.get('files.fallbackWords') || [
                'hello', 'world', 'crossword', 'puzzle', 'game', 'fun', 'play', 'solve',
                'word', 'letter', 'grid', 'clue', 'answer', 'check', 'across', 'down'
            ];
            this.clues = {};
            this.words.forEach(word => {
                this.clues[word] = `A ${word.length}-letter word`;
            });
        }
    }

    selectWordsForPuzzle() {
        const targetCount = this.config.get('words.targetCount') || 20;
        const minLength = this.config.get('words.minLength') || 3;
        const maxLength = this.config.get('words.maxLength') || 12;
        const preferLonger = this.config.get('words.preferLonger') || false;
        
        let filteredWords = this.words.filter(word => 
            word.length >= minLength && word.length <= maxLength
        );
        
        if (preferLonger) {
            filteredWords.sort((a, b) => b.length - a.length);
        }
        
        const shuffled = [...filteredWords].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, Math.min(targetCount, shuffled.length));
    }

    initializeGrid() {
        this.crossword = Array(this.gridSize).fill().map(() => Array(this.gridSize).fill(''));
        this.placedWords = [];
    }

    placeBlackSquares() {
        const maxBlackSquares = Math.floor(this.gridSize * this.gridSize * 
            (this.config.get('blackSquares.percentage') || 0.15));
        let blackSquareCount = 0;
        const center = Math.floor(this.gridSize / 2);

        // Place strategic black squares first
        this.placeStrategicBlackSquares();
        
        // Fill remaining with random placement, maintaining symmetry
        for (let i = 0; i < center && blackSquareCount < maxBlackSquares; i++) {
            for (let j = 0; j < center && blackSquareCount < maxBlackSquares; j++) {
                if (Math.random() < 0.2 && blackSquareCount < maxBlackSquares) {
                    const positions = [
                        [i, j], [i, this.gridSize - 1 - j], 
                        [this.gridSize - 1 - i, j], [this.gridSize - 1 - i, this.gridSize - 1 - j]
                    ];
                    
                    positions.forEach(([row, col]) => {
                        if (blackSquareCount < maxBlackSquares && 
                            this.crossword[row][col] === '' && 
                            this.isValidBlackSquarePlacement(row, col)) {
                            this.crossword[row][col] = '#';
                            blackSquareCount++;
                        }
                    });
                }
            }
        }
    }

    placeStrategicBlackSquares() {
        const strategicPositions = [
            [0, 0], [0, this.gridSize - 1], [this.gridSize - 1, 0], [this.gridSize - 1, this.gridSize - 1],
            [0, Math.floor(this.gridSize / 2)], [Math.floor(this.gridSize / 2), 0],
            [this.gridSize - 1, Math.floor(this.gridSize / 2)], [Math.floor(this.gridSize / 2), this.gridSize - 1]
        ];
        
        strategicPositions.forEach(([row, col]) => {
            if (this.crossword[row][col] === '' && this.isValidBlackSquarePlacement(row, col)) {
                this.crossword[row][col] = '#';
            }
        });
    }

    isValidBlackSquarePlacement(row, col) {
        const tempGrid = this.crossword.map(row => [...row]);
        tempGrid[row][col] = '#';
        
        const visited = Array(this.gridSize).fill().map(() => Array(this.gridSize).fill(false));
        let areaCount = 0;
        
        for (let i = 0; i < this.gridSize; i++) {
            for (let j = 0; j < this.gridSize; j++) {
                if (tempGrid[i][j] !== '#' && !visited[i][j]) {
                    this.floodFill(i, j, tempGrid, visited);
                    areaCount++;
                }
            }
        }
        
        return areaCount <= 1;
    }

    floodFill(row, col, grid, visited) {
        if (row < 0 || row >= this.gridSize || col < 0 || col >= this.gridSize || 
            visited[row][col] || grid[row][col] === '#') {
            return;
        }
        
        visited[row][col] = true;
        this.floodFill(row + 1, col, grid, visited);
        this.floodFill(row - 1, col, grid, visited);
        this.floodFill(row, col + 1, grid, visited);
        this.floodFill(row, col - 1, grid, visited);
    }

    placeWordsWithSymmetry() {
        const selectedWords = this.selectWordsForPuzzle();
        const localPlacedWords = [];
        
        // Start with a central word
        const centralWord = selectedWords.find(w => w.length >= 5) || selectedWords[0];
        if (centralWord) {
            const center = Math.floor(this.gridSize / 2);
            const wordLength = centralWord.length;
            const startCol = center - Math.floor(wordLength / 2);
            
            if (startCol >= 0 && startCol + wordLength <= this.gridSize) {
                for (let i = 0; i < centralWord.length; i++) {
                    this.crossword[center][startCol + i] = centralWord[i];
                }
                
                localPlacedWords.push({
                    word: centralWord,
                    row: center,
                    col: startCol,
                    horizontal: true,
                    number: 1
                });
            }
        }
        
        // Place other words with intersection logic
        const remainingWords = selectedWords.filter(w => w !== centralWord);
        remainingWords.sort((a, b) => b.length - a.length);
        
        let attempts = 0;
        const maxAttempts = 500;
        
        for (const word of remainingWords) {
            if (localPlacedWords.length >= this.config.get('words.targetCount') || 20) break;
            if (attempts >= maxAttempts) break;
            
            const placed = this.placeWordWithBetterIntersections(word, localPlacedWords);
            if (placed) {
                localPlacedWords.push(placed);
                attempts = 0;
            } else {
                attempts++;
            }
        }
        
        this.placedWords = localPlacedWords;
        return localPlacedWords;
    }

    placeWordWithBetterIntersections(word, existingWords) {
        const attempts = this.config.get('placement.maxAttempts') || 200;
        
        for (let attempt = 0; attempt < attempts; attempt++) {
            const placed = this.tryPlaceWordWithIntersections(word, existingWords);
            if (placed) return placed;
        }
        
        return null;
    }

    tryPlaceWordWithIntersections(word, existingWords) {
        for (const existingWord of existingWords) {
            const intersection = this.findIntersection(word, existingWord);
            if (intersection) {
                const placed = this.placeWordAtIntersection(word, intersection);
                if (placed) return placed;
            }
        }
        
        return this.placeWordWithSymmetry(word);
    }

    findIntersection(newWord, existingWord) {
        const intersections = [];
        
        if (existingWord.horizontal) {
            for (let i = 0; i < existingWord.word.length; i++) {
                const row = existingWord.row;
                const col = existingWord.col + i;
                const letter = existingWord.word[i];
                
                for (let j = 0; j < newWord.length; j++) {
                    if (newWord[j] === letter) {
                        const newRow = row - j;
                        if (newRow >= 0 && newRow + newWord.length <= this.gridSize) {
                            intersections.push({
                                row: newRow,
                                col: col,
                                horizontal: false,
                                intersectionPoint: j,
                                existingLetterIndex: i
                            });
                        }
                        
                        const newRowBelow = row + (newWord.length - j - 1);
                        if (newRowBelow >= 0 && newRowBelow + newWord.length <= this.gridSize) {
                            intersections.push({
                                row: newRowBelow,
                                col: col,
                                horizontal: false,
                                intersectionPoint: j,
                                existingLetterIndex: i
                            });
                        }
                    }
                }
            }
        } else {
            for (let i = 0; i < existingWord.word.length; i++) {
                const row = existingWord.row + i;
                const col = existingWord.col;
                const letter = existingWord.word[i];
                
                for (let j = 0; j < newWord.length; j++) {
                    if (newWord[j] === letter) {
                        const newCol = col - j;
                        if (newCol >= 0 && newCol + newWord.length <= this.gridSize) {
                            intersections.push({
                                row: row,
                                col: newCol,
                                horizontal: true,
                                intersectionPoint: j,
                                existingLetterIndex: i
                            });
                        }
                        
                        const newColRight = col + (newWord.length - j - 1);
                        if (newColRight >= 0 && newColRight + newWord.length <= this.gridSize) {
                            intersections.push({
                                row: row,
                                col: newColRight,
                                horizontal: true,
                                intersectionPoint: j,
                                existingLetterIndex: i
                            });
                        }
                    }
                }
            }
        }
        
        return intersections.length > 0 ? 
            intersections[Math.floor(Math.random() * intersections.length)] : null;
    }

    placeWordAtIntersection(word, intersection) {
        const { row, col, horizontal } = intersection;
        
        if (horizontal) {
            if (col + word.length > this.gridSize) return null;
            
            for (let i = 0; i < word.length; i++) {
                const currentCell = this.crossword[row][col + i];
                if (currentCell === '#' || (currentCell !== '' && currentCell !== word[i])) return null;
            }
            
            for (let i = 0; i < word.length; i++) {
                this.crossword[row][col + i] = word[i];
            }
            
            return {
                word: word,
                row: row,
                col: col,
                horizontal: true,
                number: this.placedWords.length + 1
            };
        } else {
            if (row + word.length > this.gridSize) return null;
            
            for (let i = 0; i < word.length; i++) {
                const currentCell = this.crossword[row + i][col];
                if (currentCell === '#' || (currentCell !== '' && currentCell !== word[i])) return null;
            }
            
            for (let i = 0; i < word.length; i++) {
                this.crossword[row + i][col] = word[i];
            }
            
            return {
                word: word,
                row: row,
                col: col,
                horizontal: false,
                number: this.placedWords.length + 1
            };
        }
    }

    placeWordWithSymmetry(word) {
        const attempts = this.config.get('placement.maxAttempts') || 100;
        
        for (let attempt = 0; attempt < attempts; attempt++) {
            const horizontal = Math.random() < 0.5;
            const row = Math.floor(Math.random() * this.gridSize);
            const col = Math.floor(Math.random() * this.gridSize);
            
            if (horizontal) {
                const placed = this.tryPlaceHorizontal(word, row, col);
                if (placed) return placed;
            } else {
                const placed = this.tryPlaceVertical(word, row, col);
                if (placed) return placed;
            }
        }
        
        return null;
    }

    tryPlaceHorizontal(word, row, col) {
        if (col + word.length > this.gridSize) return null;
        
        for (let i = 0; i < word.length; i++) {
            const currentCell = this.crossword[row][col + i];
            if (currentCell === '#' || (currentCell !== '' && currentCell !== word[i])) return null;
        }
        
        for (let i = 0; i < word.length; i++) {
            this.crossword[row][col + i] = word[i];
        }
        
        return {
            word: word,
            row: row,
            col: col,
            horizontal: true,
            number: this.placedWords.length + 1
        };
    }

    tryPlaceVertical(word, row, col) {
        if (row + word.length > this.gridSize) return null;
        
        for (let i = 0; i < word.length; i++) {
            const currentCell = this.crossword[row + i][col];
            if (currentCell === '#' || (currentCell !== '' && currentCell !== word[i])) return null;
        }
        
        for (let i = 0; i < word.length; i++) {
            this.crossword[row + i][col] = word[i];
        }
        
        return {
            word: word,
            row: row,
            col: col,
            horizontal: false,
            number: this.placedWords.length + 1
        };
    }

    async generateCrossword() {
        await this.loadWordsFromCSV();
        this.initializeGrid();
        this.placeBlackSquares();
        this.placeWordsWithSymmetry();
        
        return {
            grid: this.crossword,
            words: this.placedWords,
            size: this.gridSize
        };
    }
}

// Crossword Renderer
class CrosswordRenderer {
    constructor(config) {
        this.config = config;
        this.gridSize = config.get('grid.size') || 15;
        this.cellSize = config.get('rendering.cellSize') || 45;
        this.clues = {}; // Store clues from CSV
    }

    setClues(clues) {
        this.clues = clues || {};
    }

    renderCrossword(crosswordData) {
        const { grid, words, size } = crosswordData;
        const container = document.getElementById('crossword-container');
        const cluesContainer = document.getElementById('clues-container');
        
        if (!container || !cluesContainer) {
            console.error('Required containers not found');
            return;
        }

        container.innerHTML = '';
        cluesContainer.innerHTML = '';

        const wrapper = document.createElement('div');
        wrapper.className = 'crossword-wrapper';

        if (this.config.get('rendering.showGridLabels')) {
            this.createGridLabels(wrapper, size);
        }

        const crosswordElement = this.createCrosswordGrid(grid, size);
        wrapper.appendChild(crosswordElement);

        if (this.config.get('rendering.showClues')) {
            this.createClues(cluesContainer, words);
        }

        container.appendChild(wrapper);
    }

    createGridLabels(wrapper, size) {
        const labelsContainer = document.createElement('div');
        labelsContainer.className = 'grid-labels';

        const rowLabels = document.createElement('div');
        rowLabels.className = 'row-labels';
        for (let i = 0; i < size; i++) {
            const label = document.createElement('div');
            label.className = 'grid-label';
            label.textContent = String.fromCharCode(65 + i);
            rowLabels.appendChild(label);
        }

        const colLabels = document.createElement('div');
        colLabels.className = 'column-labels';
        for (let i = 0; i < size; i++) {
            const label = document.createElement('div');
            label.className = 'grid-label';
            label.textContent = (i + 1).toString();
            colLabels.appendChild(label);
        }

        labelsContainer.appendChild(rowLabels);
        labelsContainer.appendChild(colLabels);
        wrapper.appendChild(labelsContainer);
    }

    createCrosswordGrid(grid, size) {
        const crosswordElement = document.createElement('div');
        crosswordElement.className = 'crossword';
        // Add +1 to size to accommodate axis labels
        crosswordElement.style.gridTemplateColumns = `repeat(${size + 1}, ${this.cellSize}px)`;
        crosswordElement.style.gridTemplateRows = `repeat(${size + 1}, ${this.cellSize}px)`;

        // Create top-left corner cell (empty)
        const cornerCell = document.createElement('div');
        cornerCell.className = 'cell axis-label';
        cornerCell.textContent = '';
        crosswordElement.appendChild(cornerCell);

        // Create top row labels (A, B, C...)
        for (let col = 0; col < size; col++) {
            const labelCell = document.createElement('div');
            labelCell.className = 'cell axis-label';
            labelCell.textContent = String.fromCharCode(65 + col); // A, B, C...
            crosswordElement.appendChild(labelCell);
        }

        // Create left column labels and grid content
        for (let row = 0; row < size; row++) {
            // Left column label (1, 2, 3...)
            const labelCell = document.createElement('div');
            labelCell.className = 'cell axis-label';
            labelCell.textContent = (row + 1).toString();
            crosswordElement.appendChild(labelCell);

            // Grid content row
            for (let col = 0; col < size; col++) {
                const cell = this.createCell(grid[row][col], row, col);
                crosswordElement.appendChild(cell);
            }
        }

        return crosswordElement;
    }

    createCell(content, row, col) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.row = row;
        cell.dataset.col = col;

        if (content === '#') {
            cell.classList.add('black');
        } else if (content !== '') {
            cell.textContent = content.toUpperCase();
            
            // Add cell number if this is the start of a word
            if (this.shouldShowNumber(row, col)) {
                const number = document.createElement('div');
                number.className = 'number';
                number.textContent = this.getCellNumber(row, col);
                cell.appendChild(number);
            }
        }

        return cell;
    }

    shouldShowNumber(row, col) {
        // Check if this cell should show a number (start of across or down word)
        return this.isWordStart(row, col, 'across') || this.isWordStart(row, col, 'down');
    }

    isWordStart(row, col, direction) {
        if (direction === 'across') {
            // Check if this is the start of a horizontal word
            return (col === 0 || this.crossword[row][col - 1] === '#') && 
                   (col < this.gridSize - 1 && this.crossword[row][col + 1] !== '#');
        } else {
            // Check if this is the start of a vertical word
            return (row === 0 || this.crossword[row - 1][col] === '#') && 
                   (row < this.gridSize - 1 && this.crossword[row + 1][col] !== '#');
        }
    }

    getCellNumber(row, col) {
        // Return a unique number for this cell based on word starts
        let number = 1;
        
        // Count word starts before this position
        for (let r = 0; r <= row; r++) {
            for (let c = 0; c <= col; c++) {
                if (r === row && c === col) {
                    return number;
                }
                if (this.isWordStart(r, c, 'across') || this.isWordStart(r, c, 'down')) {
                    number++;
                }
            }
        }
        
        return number;
    }

    createClues(container, words) {
        if (!words || words.length === 0) return;

        const acrossWords = words.filter(w => w.horizontal);
        const downWords = words.filter(w => !w.horizontal);

        if (acrossWords.length > 0) {
            const acrossSection = document.createElement('div');
            acrossSection.className = 'clue-section';
            
            const acrossTitle = document.createElement('h3');
            acrossTitle.textContent = 'Across';
            acrossSection.appendChild(acrossTitle);

            acrossWords.forEach(word => {
                const clue = this.createClue(word);
                acrossSection.appendChild(clue);
            });

            container.appendChild(acrossSection);
        }

        if (downWords.length > 0) {
            const downSection = document.createElement('div');
            downSection.className = 'clue-section';
            
            const downTitle = document.createElement('h3');
            downTitle.textContent = 'Down';
            downSection.appendChild(downTitle);

            downWords.forEach(word => {
                const clue = this.createClue(word);
                downSection.appendChild(clue);
            });

            container.appendChild(downSection);
        }
    }

    createClue(word) {
        const clueElement = document.createElement('div');
        clueElement.className = 'clue';
        
        const number = document.createElement('span');
        number.className = 'clue-number';
        number.textContent = word.number + '.';
        
        const text = document.createElement('span');
        text.className = 'clue-text';
        
        // Use actual clue from CSV if available, otherwise generate a fallback
        const actualClue = this.clues[word.word];
        text.textContent = actualClue || this.generateFallbackClue(word.word);
        
        clueElement.appendChild(number);
        clueElement.appendChild(text);
        
        return clueElement;
    }

    generateFallbackClue(word) {
        // Fallback clue generation if no actual clue is available
        const clues = [
            `A ${word.length}-letter word`,
            `Word meaning "${word}"`,
            `Synonym for "${word}"`,
            `Opposite of "${word}"`,
            `Word that rhymes with "${word}"`
        ];
        
        return clues[Math.floor(Math.random() * clues.length)];
    }

    showLoading() {
        const container = document.getElementById('crossword-container');
        if (container) {
            container.innerHTML = '<div class="loading">Generating crossword...</div>';
        }
    }

    hideLoading() {
        const loading = document.querySelector('.loading');
        if (loading) {
            loading.remove();
        }
    }
}

// Main Application
class CrosswordApp {
    constructor() {
        this.config = null;
        this.generator = null;
        this.renderer = null;
        this.isInitialized = false;
    }

    async initialize() {
        try {
           console.log('Starting crossword app initialization...');
            
            this.config = new CrosswordConfig();
            console.log('Configuration manager created');
            
            await this.config.loadConfig();
            console.log('Configuration loaded');
            
            this.generator = new CrosswordGenerator(this.config);
            console.log('Crossword generator created');
            
            this.renderer = new CrosswordRenderer(this.config);
            console.log('Crossword renderer created');
            
            this.isInitialized = true;
            console.log('Crossword app initialized successfully');
            
            await this.generateCrossword();
            
        } catch (error) {
            console.error('Failed to initialize crossword app:', error);
            console.error('Error stack:', error.stack);
            this.showError(`Failed to initialize application: ${error.message}`);
        }
    }

    async generateCrossword() {
        if (!this.isInitialized) {
            console.error('App not initialized');
            return;
        }

        try {
            console.log('Starting crossword generation...');
            this.renderer.showLoading();
            
            const crosswordData = await this.generator.generateCrossword();
            console.log('Crossword generated:', crosswordData);
            
            this.renderer.renderCrossword(crosswordData);
            console.log('Crossword rendered');
            
            this.renderer.hideLoading();
            
        } catch (error) {
            console.error('Failed to generate crossword:', error);
            console.error('Error stack:', error.stack);
            this.renderer.hideLoading();
            this.showError(`Failed to generate crossword: ${error.message}`);
        }
    }

    showError(message) {
        const container = document.getElementById('crossword-container');
        if (container) {
            container.innerHTML = `<div class="error">${message}</div>`;
        }
    }

    async handleGenerateClick() {
        await this.generateCrossword();
    }
}

// Global app instance
let crosswordApp;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    crosswordApp = new CrosswordApp();
    await crosswordApp.initialize();
});

// Global function for button click
async function generateCrossword() {
    if (crosswordApp) {
        await crosswordApp.handleGenerateClick();
    } else {
        console.error('Crossword app not initialized');
    }
}
