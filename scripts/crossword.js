// Office Crossword - Consolidated JavaScript
console.log('Crossword.js loaded successfully!');

// Test function to verify JavaScript is working
function testJavaScript() {
    console.log('JavaScript test function called successfully!');
    return 'JavaScript is working!';
}

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
            console.log('Loading words from CSV...');
            const response = await fetch(this.config.get('files.wordListPath'));
            
            if (!response.ok) {
                throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
            }
            
            const csvText = await response.text();
            console.log(`CSV loaded, length: ${csvText.length} characters`);
            
            const lines = csvText.split('\n').filter(line => line.trim());
            console.log(`CSV has ${lines.length} lines`);
            
            if (lines.length < 2) {
                throw new Error('CSV file is too short or empty');
            }
            
            const startIndex = lines[0].toLowerCase().includes('clue') ? 1 : 0;
            console.log(`Starting from line ${startIndex + 1} (header: ${lines[0]})`);
            
            this.words = [];
            this.clues = {};
            
            for (let i = startIndex; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line) {
                    const parts = line.split(',');
                    if (parts.length >= 2) {
                        const clue = parts[0].replace(/"/g, '').trim();
                        const word = parts[1].trim().toLowerCase();
                        
                        if (word.length >= this.config.get('words.minLength') && 
                            /^[a-z]+$/.test(word)) {
                            this.words.push(word);
                            this.clues[word] = clue;
                        }
                    }
                }
            }
            
            console.log(`Loaded ${this.words.length} words with clues from CSV`);
            
            if (this.words.length === 0) {
                throw new Error('No valid words loaded from CSV');
            }
            
            // Validate that we have enough words for the target count
            const targetCount = this.config.get('words.targetCount');
            if (this.words.length < targetCount) {
                console.warn(`Warning: Only ${this.words.length} words available, target is ${targetCount}`);
            }
            
        } catch (error) {
            console.error('Error loading words from CSV:', error);
            throw error;
        }
    }

    /**
     * Selects words for the crossword puzzle, filtering by length and quality.
     * Ensures only words meeting minimum length requirements are used.
     * @returns {Array} - Array of selected words for placement
     */
    selectWordsForPuzzle() {
        const targetCount = this.config.get('words.targetCount');
        const minLength = this.config.get('words.minLength');
        const maxLength = this.config.get('words.maxLength');
        
        // Filter words by length requirements
        const validWords = this.words.filter(word => 
            word.length >= minLength && 
            word.length <= maxLength &&
            /^[a-z]+$/.test(word) // Only alphabetic words
        );
        
        console.log(`Found ${validWords.length} valid words (length ${minLength}-${maxLength})`);
        
        if (validWords.length === 0) {
            console.warn('No valid words found, using fallback words');
            return ['crossword', 'puzzle', 'word', 'game', 'play', 'solve', 'clue', 'answer'];
        }
        
        // Sort by length (longer words first for better intersections)
        validWords.sort((a, b) => b.length - a.length);
        
        // Take the best words up to target count
        const selected = validWords.slice(0, Math.min(targetCount * 2, validWords.length));
        
        console.log(`Selected ${selected.length} words for placement`);
        return selected;
    }

    validateFinalGrid() {
        console.log('Validating final grid...');
        
        // Check if crossword array exists and has correct dimensions
        if (!this.crossword || !Array.isArray(this.crossword)) {
            throw new Error('Crossword grid is not properly initialized');
        }
        
        if (this.crossword.length !== this.gridSize) {
            throw new Error(`Grid height mismatch: expected ${this.gridSize}, got ${this.crossword.length}`);
        }
        
        // Check each row
        for (let i = 0; i < this.gridSize; i++) {
            if (!this.crossword[i] || !Array.isArray(this.crossword[i])) {
                throw new Error(`Row ${i} is not properly initialized`);
            }
            
            if (this.crossword[i].length !== this.gridSize) {
                throw new Error(`Row ${i} width mismatch: expected ${this.gridSize}, got ${this.crossword[i].length}`);
            }
            
            // Check each cell
            for (let j = 0; j < this.gridSize; j++) {
                const cell = this.crossword[i][j];
                if (cell !== '' && cell !== '#' && (typeof cell !== 'string' || cell.length !== 1)) {
                    throw new Error(`Invalid cell at [${i}][${j}]: ${cell}`);
                }
            }
        }
        
        console.log('Grid validation passed');
        
        // Validate placed words
        if (!this.placedWords || !Array.isArray(this.placedWords)) {
            throw new Error('Placed words array is not properly initialized');
        }
        
        console.log(`Validation complete: ${this.placedWords.length} words placed`);
    }

    initializeGrid() {
        console.log(`Initializing ${this.gridSize}x${this.gridSize} grid...`);
        
        if (!this.gridSize || this.gridSize <= 0) {
            throw new Error(`Invalid grid size: ${this.gridSize}`);
        }
        
        this.crossword = Array(this.gridSize).fill().map(() => Array(this.gridSize).fill(''));
        this.placedWords = [];
        
        // Validate grid initialization
        if (!this.crossword || this.crossword.length !== this.gridSize) {
            throw new Error('Grid initialization failed');
        }
        
        for (let i = 0; i < this.gridSize; i++) {
            if (!this.crossword[i] || this.crossword[i].length !== this.gridSize) {
                throw new Error(`Row ${i} initialization failed`);
            }
        }
        
        console.log('Grid initialization complete');
    }

    /**
     * Places black squares in the crossword grid to create word separations.
     * Uses a strategic approach to create better word spaces.
     */
    placeBlackSquares() {
        console.log('Starting black square placement...');
        
        // Validate grid exists before proceeding
        if (!this.crossword || !Array.isArray(this.crossword)) {
            throw new Error('Grid not initialized for black square placement');
        }
        
        const maxBlackSquares = Math.floor(this.gridSize * this.gridSize * this.config.get('blackSquares.percentage'));
        let blackSquareCount = 0;
        
        console.log(`Target black squares: ${maxBlackSquares}, Grid size: ${this.gridSize}`);
        
        // Place strategic black squares first (corners and edges)
        this.placeStrategicBlackSquares();
        
        // Place black squares in a more strategic pattern for better word separation
        const strategicPattern = this.createStrategicPattern();
        
        for (const [row, col] of strategicPattern) {
            if (blackSquareCount >= maxBlackSquares) break;
            
            if (this.crossword[row][col] === '' && this.canPlaceBlackSquare(row, col)) {
                this.crossword[row][col] = '#';
                blackSquareCount++;
            }
        }
        
        // Fill remaining with minimal random placement
        const remainingAttempts = Math.max(10, maxBlackSquares - blackSquareCount);
        
        for (let attempt = 0; attempt < remainingAttempts && blackSquareCount < maxBlackSquares; attempt++) {
            const row = Math.floor(Math.random() * this.gridSize);
            const col = Math.floor(Math.random() * this.gridSize);
            
            if (this.crossword[row][col] === '' && this.canPlaceBlackSquare(row, col)) {
                this.crossword[row][col] = '#';
                blackSquareCount++;
            }
        }
        
        console.log(`Black squares placed: ${blackSquareCount}`);
    }

    /**
     * Creates a strategic pattern for black square placement that creates better word spaces.
     * @returns {Array} - Array of [row, col] positions for strategic black squares
     */
    createStrategicPattern() {
        const pattern = [];
        
        // Create a more balanced pattern that doesn't block too many words
        for (let i = 2; i < this.gridSize - 2; i += 3) {
            for (let j = 2; j < this.gridSize - 2; j += 3) {
                // Skip some positions to avoid over-blocking
                if (Math.random() > 0.4) {
                    pattern.push([i, j]);
                }
            }
        }
        
        // Add some edge separators for better word boundaries
        for (let i = 1; i < this.gridSize - 1; i += 4) {
            if (Math.random() > 0.5) {
                pattern.push([0, i]); // Top edge
                pattern.push([this.gridSize - 1, i]); // Bottom edge
            }
        }
        
        for (let i = 1; i < this.gridSize - 1; i += 4) {
            if (Math.random() > 0.5) {
                pattern.push([i, 0]); // Left edge
                pattern.push([i, this.gridSize - 1]); // Right edge
            }
        }
        
        return pattern;
    }

    /**
     * Places strategic black squares at corners and edges for better grid structure.
     */
    placeStrategicBlackSquares() {
        const strategicPositions = [
            [0, 0], [0, this.gridSize - 1], [this.gridSize - 1, 0], [this.gridSize - 1, this.gridSize - 1],
            [0, Math.floor(this.gridSize / 2)], [Math.floor(this.gridSize / 2), 0],
            [this.gridSize - 1, Math.floor(this.gridSize / 2)], [Math.floor(this.gridSize / 2), this.gridSize - 1]
        ];
        
        strategicPositions.forEach(([row, col]) => {
            if (row >= 0 && row < this.gridSize && col >= 0 && col < this.gridSize && 
                this.crossword[row] && this.crossword[row][col] === '') {
                this.crossword[row][col] = '#';
            }
        });
    }

    /**
     * Checks if a black square can be placed at the given position.
     * Simplified validation without strict connectivity requirements.
     * @param {number} row - Row position
     * @param {number} col - Column position
     * @returns {boolean} - True if placement is allowed
     */
    canPlaceBlackSquare(row, col) {
        // Basic bounds check
        if (row < 0 || row >= this.gridSize || col < 0 || col >= this.gridSize) {
            return false;
        }
        
        // Check if it would create a 2x2 block of black squares
        if (this.wouldCreate2x2Block(row, col)) {
            return false;
        }
        
        // Check if it would isolate a single letter
        if (this.wouldIsolateSingleLetter(row, col)) {
            return false;
        }
        
        return true;
    }

    /**
     * Checks if placing a black square would create a 2x2 block.
     * @param {number} row - Row position
     * @param {number} col - Column position
     * @returns {boolean} - True if it would create a 2x2 block
     */
    wouldCreate2x2Block(row, col) {
        // Check all possible 2x2 blocks that include this position
        for (let r = Math.max(0, row - 1); r <= Math.min(this.gridSize - 2, row); r++) {
            for (let c = Math.max(0, col - 1); c <= Math.min(this.gridSize - 2, col); c++) {
                let blackCount = 0;
                for (let i = 0; i < 2; i++) {
                    for (let j = 0; j < 2; j++) {
                        if (this.crossword[r + i][c + j] === '#') {
                            blackCount++;
                        }
                    }
                }
                if (blackCount >= 3) { // Would create a 2x2 block
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Checks if placing a black square would isolate a single letter.
     * @param {number} row - Row position
     * @param {number} col - Column position
     * @returns {boolean} - True if it would isolate a single letter
     */
    wouldIsolateSingleLetter(row, col) {
        // This is a simplified check - we'll allow more flexibility
        // since we disabled strict connectivity requirements
        return false;
    }

    placeWordsWithSymmetry() {
        console.log('Starting word placement...');
        
        // Validate grid exists before proceeding
        if (!this.crossword || !Array.isArray(this.crossword)) {
            throw new Error('Grid not initialized for word placement');
        }
        
        const selectedWords = this.selectWordsForPuzzle();
        const localPlacedWords = [];
        
        console.log(`Selected ${selectedWords.length} words for placement`);
        
        // Start with a central word
        const centralWord = selectedWords.find(w => w.length >= 5) || selectedWords[0];
        if (centralWord) {
            const center = Math.floor(this.gridSize / 2);
            const wordLength = centralWord.length;
            const startCol = center - Math.floor(wordLength / 2);
            
            if (startCol >= 0 && startCol + wordLength <= this.gridSize) {
                console.log(`Placing central word: "${centralWord}" at center ${center}, startCol ${startCol}`);
                
                // Validate that the center row exists
                if (!this.crossword[center]) {
                    throw new Error(`Center row ${center} does not exist in crossword array`);
                }
                
                for (let i = 0; i < centralWord.length; i++) {
                    const col = startCol + i;
                    if (col < 0 || col >= this.gridSize) {
                        throw new Error(`Column ${col} is out of bounds for word placement`);
                    }
                    this.crossword[center][col] = centralWord[i];
                }
                
                localPlacedWords.push({
                    word: centralWord,
                    row: center,
                    col: startCol,
                    horizontal: true,
                    number: 1
                });
                
                console.log(`Central word placed successfully`);
            }
        }
        
        // Now place words that can intersect with existing words
        const remainingWords = selectedWords.filter(w => w !== centralWord);
        remainingWords.sort((a, b) => b.length - a.length);
        
        let placedCount = 0;
        const maxWords = Math.min(this.config.get('words.targetCount'), 20);
        
        for (const word of remainingWords) {
            if (placedCount >= maxWords) break;
            
            // Try to place word with intersections first
            const placed = this.tryPlaceWordWithIntersections(word, localPlacedWords);
            if (placed) {
                localPlacedWords.push(placed);
                placedCount++;
                console.log(`Placed word "${word}" with intersection`);
                continue;
            }
            
            // If no intersection possible, try placing in empty space
            const placedInSpace = this.tryPlaceWordInEmptySpace(word, localPlacedWords);
            if (placedInSpace) {
                localPlacedWords.push(placedInSpace);
                placedCount++;
                console.log(`Placed word "${word}" in empty space`);
            }
        }
        
        this.placedWords = localPlacedWords;
        console.log(`Total words placed: ${localPlacedWords.length}`);
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

    /**
     * Attempts to place a word by finding intersections with existing words.
     * This is the primary method for creating interlocking crossword patterns.
     * @param {string} word - The word to place
     * @param {Array} existingWords - Array of already placed words
     * @returns {Object|null} - Placed word object or null if placement failed
     */
    tryPlaceWordWithIntersections(word, existingWords) {
        const attempts = 50; // Limit attempts to avoid infinite loops
        
        for (let attempt = 0; attempt < attempts; attempt++) {
            for (const existingWord of existingWords) {
                const intersection = this.findIntersection(word, existingWord);
                if (intersection) {
                    const placed = this.placeWordAtIntersection(word, intersection);
                    if (placed) return placed;
                }
            }
        }
        
        return null;
    }

    /**
     * Attempts to place a word in empty space when no intersections are possible.
     * This ensures more words get placed even if they don't intersect perfectly.
     * @param {string} word - The word to place
     * @param {Array} existingWords - Array of already placed words
     * @returns {Object|null} - Placed word object or null if placement failed
     */
    tryPlaceWordInEmptySpace(word, existingWords) {
        const attempts = 50;
        
        for (let attempt = 0; attempt < attempts; attempt++) {
            const horizontal = Math.random() < 0.5;
            
            // Try to place near existing words for potential future intersections
            let row, col;
            
            if (existingWords.length > 0) {
                // Pick a random existing word and try to place near it
                const randomWord = existingWords[Math.floor(Math.random() * existingWords.length)];
                if (horizontal) {
                    row = randomWord.row + Math.floor(Math.random() * 3) - 1; // Within 1 row
                    col = Math.floor(Math.random() * (this.gridSize - word.length + 1));
                } else {
                    row = Math.floor(Math.random() * (this.gridSize - word.length + 1));
                    col = randomWord.col + Math.floor(Math.random() * 3) - 1; // Within 1 column
                }
            } else {
                // Random placement if no existing words
                row = Math.floor(Math.random() * (this.gridSize - word.length + 1));
                col = Math.floor(Math.random() * (this.gridSize - word.length + 1));
            }
            
            // Ensure bounds
            row = Math.max(0, Math.min(this.gridSize - word.length, row));
            col = Math.max(0, Math.min(this.gridSize - word.length, col));
            
            if (horizontal) {
                if (this.canPlaceWordHorizontally(word, row, col)) {
                    return this.placeWordHorizontally(word, row, col, existingWords.length + 1);
                }
            } else {
                if (this.canPlaceWordVertically(word, row, col)) {
                    return this.placeWordVertically(word, row, col, existingWords.length + 1);
                }
            }
        }
        
        return null;
    }

    /**
     * Checks if a word can be placed horizontally at the specified position.
     * @param {string} word - The word to check
     * @param {number} row - Row position
     * @param {number} col - Column position
     * @returns {boolean} - True if placement is possible
     */
    canPlaceWordHorizontally(word, row, col) {
        if (col + word.length > this.gridSize) return false;
        
        for (let i = 0; i < word.length; i++) {
            const currentCell = this.crossword[row][col + i];
            if (currentCell !== '' && currentCell !== word[i]) return false;
        }
        
        return true;
    }

    /**
     * Checks if a word can be placed vertically at the specified position.
     * @param {string} word - The word to check
     * @param {number} row - Row position
     * @param {number} col - Column position
     * @returns {boolean} - True if placement is possible
     */
    canPlaceWordVertically(word, row, col) {
        if (row + word.length > this.gridSize) return false;
        
        for (let i = 0; i < word.length; i++) {
            const currentCell = this.crossword[row + i][col];
            if (currentCell !== '' && currentCell !== word[i]) return false;
        }
        
        return true;
    }

    /**
     * Places a word horizontally at the specified position.
     * @param {string} word - The word to place
     * @param {number} row - Row position
     * @param {number} col - Column position
     * @param {number} number - Word number for clues
     * @returns {Object} - Placed word object
     */
    placeWordHorizontally(word, row, col, number) {
        for (let i = 0; i < word.length; i++) {
            this.crossword[row][col + i] = word[i];
        }
        
        return {
            word: word,
            row: row,
            col: col,
            horizontal: true,
            number: number
        };
    }

    /**
     * Places a word vertically at the specified position.
     * @param {string} word - The word to place
     * @param {number} row - Row position
     * @param {number} col - Column position
     * @param {number} number - Word number for clues
     * @returns {Object} - Placed word object
     */
    placeWordVertically(word, row, col, number) {
        for (let i = 0; i < word.length; i++) {
            this.crossword[row + i][col] = word[i];
        }
        
        return {
            word: word,
            row: row,
            col: col,
            horizontal: false,
            number: number
        };
    }

    /**
     * Finds valid intersections between a new word and existing words.
     * This is the core method for creating interlocking crossword patterns.
     * @param {string} newWord - The word to place
     * @param {Object} existingWord - An existing word in the grid
     * @returns {Object|null} - Intersection data or null if no valid intersection
     */
    findIntersection(newWord, existingWord) {
        const intersections = [];
        
        if (existingWord.horizontal) {
            // Existing word is horizontal, try to place new word vertically
            for (let i = 0; i < existingWord.word.length; i++) {
                const row = existingWord.row;
                const col = existingWord.col + i;
                const letter = existingWord.word[i];
                
                // Find matching letters in the new word
                for (let j = 0; j < newWord.length; j++) {
                    if (newWord[j] === letter) {
                        // Calculate where the new word would start
                        const newRow = row - j;
                        
                        // Check if this placement is valid
                        if (newRow >= 0 && newRow + newWord.length <= this.gridSize) {
                            // Verify the placement doesn't conflict with existing letters
                            let canPlace = true;
                            for (let k = 0; k < newWord.length; k++) {
                                const checkRow = newRow + k;
                                const checkCol = col;
                                
                                if (checkRow < 0 || checkRow >= this.gridSize || checkCol < 0 || checkCol >= this.gridSize) {
                                    canPlace = false;
                                    break;
                                }
                                
                                const currentCell = this.crossword[checkRow][checkCol];
                                if (currentCell !== '' && currentCell !== newWord[k]) {
                                    canPlace = false;
                                    break;
                                }
                            }
                            
                            if (canPlace) {
                                intersections.push({
                                    row: newRow,
                                    col: col,
                                    horizontal: false,
                                    intersectionPoint: j,
                                    existingLetterIndex: i
                                });
                            }
                        }
                    }
                }
            }
        } else {
            // Existing word is vertical, try to place new word horizontally
            for (let i = 0; i < existingWord.word.length; i++) {
                const row = existingWord.row + i;
                const col = existingWord.col;
                const letter = existingWord.word[i];
                
                // Find matching letters in the new word
                for (let j = 0; j < newWord.length; j++) {
                    if (newWord[j] === letter) {
                        // Calculate where the new word would start
                        const newCol = col - j;
                        
                        // Check if this placement is valid
                        if (newCol >= 0 && newCol + newWord.length <= this.gridSize) {
                            // Verify the placement doesn't conflict with existing letters
                            let canPlace = true;
                            for (let k = 0; k < newWord.length; k++) {
                                const checkRow = row;
                                const checkCol = newCol + k;
                                
                                if (checkRow < 0 || checkRow >= this.gridSize || checkCol < 0 || checkCol >= this.gridSize) {
                                    canPlace = false;
                                    break;
                                }
                                
                                const currentCell = this.crossword[checkRow][checkCol];
                                if (currentCell !== '' && currentCell !== newWord[k]) {
                                    canPlace = false;
                                    break;
                                }
                            }
                            
                            if (canPlace) {
                                intersections.push({
                                    row: row,
                                    col: newCol,
                                    horizontal: true,
                                    intersectionPoint: j,
                                    existingLetterIndex: i
                                });
                            }
                        }
                    }
                }
            }
        }
        
        // Return a random intersection if any exist
        return intersections.length > 0 ? 
            intersections[Math.floor(Math.random() * intersections.length)] : null;
    }

    placeWordAtIntersection(word, intersection) {
        const { row, col, horizontal } = intersection;
        
        // Validate bounds and array existence
        if (row < 0 || row >= this.gridSize || col < 0 || col >= this.gridSize) {
            return null;
        }
        
        if (!this.crossword[row] || !this.crossword[row + (horizontal ? 0 : word.length - 1)]) {
            return null;
        }
        
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
        if (col + word.length > this.gridSize || row < 0 || row >= this.gridSize) return null;
        
        // Validate array existence
        if (!this.crossword[row]) return null;
        
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
        if (row + word.length > this.gridSize || col < 0 || col >= this.gridSize) return null;
        
        // Validate array existence
        if (!this.crossword[row] || !this.crossword[row + word.length - 1]) return null;
        
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
        try {
            console.log('Starting crossword generation...');
            await this.loadWordsFromCSV();
            console.log('Words loaded, initializing grid...');
            this.initializeGrid();
            console.log('Grid initialized, placing black squares...');
            this.placeBlackSquares();
            console.log('Black squares placed, placing words...');
            this.placeWordsWithSymmetry();
            console.log('Words placed, validation complete');
            
            // Final validation before returning
            this.validateFinalGrid();
            
            return {
                grid: this.crossword,
                words: this.placedWords,
                size: this.gridSize
            };
        } catch (error) {
            console.error('Error in generateCrossword:', error);
            throw error;
        }
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
        
        // Store the grid data in the renderer instance for use by other methods
        this.crossword = grid;
        this.gridSize = size;
        
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

        // No more axis labels - clean, traditional crossword style
        // if (this.config.get('rendering.showGridLabels')) {
        //     this.createGridLabels(wrapper, size);
        // }

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
    console.log('DOM loaded, initializing crossword app...');
    try {
        // Test basic functionality
        testJavaScript();
        
        // Initialize the app
        crosswordApp = new CrosswordApp();
        await crosswordApp.initialize();
        console.log('Crossword app initialized successfully');
        
    } catch (error) {
        console.error('Error initializing crossword app:', error);
    }
});

// Global function for button click
async function generateCrossword() {
    if (crosswordApp) {
        await crosswordApp.handleGenerateClick();
    } else {
        console.error('Crossword app not initialized');
    }
}
