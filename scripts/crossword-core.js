// Core crossword generation logic
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
            const startIndex = lines[0].toLowerCase().includes('word') ? 1 : 0;
            
            this.words = lines.slice(startIndex)
                .map(line => line.trim().toLowerCase())
                .filter(word => word.length >= this.config.get('words.minLength') || 3)
                .filter(word => /^[a-z]+$/.test(word)); // Only letters
                
            console.log(`Loaded ${this.words.length} words from CSV`);
        } catch (error) {
            console.error('Error loading words from CSV:', error);
            // Use fallback words if CSV fails
            this.words = this.config.get('files.fallbackWords') || [
                'hello', 'world', 'crossword', 'puzzle', 'game', 'fun', 'play', 'solve',
                'word', 'letter', 'grid', 'clue', 'answer', 'check', 'across', 'down'
            ];
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
        
        // Shuffle and select target count
        const shuffled = [...filteredWords].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, Math.min(targetCount, shuffled.length));
    }

    initializeGrid() {
        this.crossword = Array(this.gridSize).fill().map(() => Array(this.gridSize).fill(''));
        this.placedWords = [];
    }

    placeBlackSquares() {
        const maxBlackSquares = Math.floor(this.gridSize * this.gridSize * 
            (this.config.get('blackSquares.percentage') || 0.17));
        let blackSquareCount = 0;
        const center = Math.floor(this.gridSize / 2);

        // Place black squares with rotational symmetry
        for (let i = 0; i < center && blackSquareCount < maxBlackSquares; i++) {
            for (let j = 0; j < center && blackSquareCount < maxBlackSquares; j++) {
                if (Math.random() < 0.3 && blackSquareCount < maxBlackSquares) {
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

    isValidBlackSquarePlacement(row, col) {
        // Check if placing a black square here would create isolated areas
        const tempGrid = this.crossword.map(row => [...row]);
        tempGrid[row][col] = '#';
        
        // Count connected areas
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
        
        return areaCount <= 1; // Only allow if it doesn't create isolated areas
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
        
        // Start with a central word to establish the grid structure
        const centralWord = selectedWords.find(w => w.length >= 5) || selectedWords[0];
        if (centralWord) {
            const center = Math.floor(this.gridSize / 2);
            const wordLength = centralWord.length;
            const startCol = center - Math.floor(wordLength / 2);
            
            if (startCol >= 0 && startCol + wordLength <= this.gridSize) {
                // Place central word horizontally
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
                
                // Place rotational counterpart
                const symRow = this.gridSize - 1 - center;
                const symCol = this.gridSize - 1 - startCol - wordLength + 1;
                if (symCol >= 0 && symCol + wordLength <= this.gridSize) {
                    for (let i = 0; i < centralWord.length; i++) {
                        this.crossword[symRow][symCol + i] = centralWord[i];
                    }
                }
            }
        }
        
        // Now place other words strategically
        const remainingWords = selectedWords.filter(w => w !== centralWord);
        remainingWords.sort((a, b) => b.length - a.length);
        
        for (const word of remainingWords) {
            if (localPlacedWords.length >= this.config.get('words.targetCount') || 20) break;
            
            const placed = this.placeWordWithSymmetry(word);
            if (placed) {
                localPlacedWords.push(placed);
            }
        }
        
        this.placedWords = localPlacedWords;
        return localPlacedWords;
    }

    placeWordWithSymmetry(word) {
        const attempts = this.config.get('placement.maxAttempts') || 100;
        
        for (let attempt = 0; attempt < attempts; attempt++) {
            const horizontal = Math.random() < 0.5;
            const row = Math.floor(Math.random() * this.gridSize);
            const col = Math.floor(Math.random() * this.gridSize);
            
            if (horizontal) {
                const placed = this.tryPlaceHorizontalWithSymmetry(word, row, col);
                if (placed) return placed;
            } else {
                const placed = this.tryPlaceVerticalWithSymmetry(word, row, col);
                if (placed) return placed;
            }
        }
        
        return null;
    }

    tryPlaceHorizontalWithSymmetry(word, row, col) {
        if (col + word.length > this.gridSize) return null;
        
        // Check if we can place the word
        if (!this.canPlaceWordWithSymmetry(word, row, col, true)) return null;
        
        // Place the word
        for (let i = 0; i < word.length; i++) {
            this.crossword[row][col + i] = word[i];
        }
        
        // Place rotational counterpart
        const symRow = this.gridSize - 1 - row;
        const symCol = this.gridSize - 1 - col - word.length + 1;
        
        if (symCol >= 0 && symCol + word.length <= this.gridSize) {
            for (let i = 0; i < word.length; i++) {
                this.crossword[symRow][symCol + i] = word[i];
            }
        }
        
        return {
            word: word,
            row: row,
            col: col,
            horizontal: true,
            number: this.placedWords.length + 1
        };
    }

    tryPlaceVerticalWithSymmetry(word, row, col) {
        if (row + word.length > this.gridSize) return null;
        
        if (!this.canPlaceWordWithSymmetry(word, row, col, false)) return null;
        
        // Place the word
        for (let i = 0; i < word.length; i++) {
            this.crossword[row + i][col] = word[i];
        }
        
        // Place rotational counterpart
        const symRow = this.gridSize - 1 - row - word.length + 1;
        const symCol = this.gridSize - 1 - col;
        
        if (symRow >= 0 && symRow + word.length <= this.gridSize) {
            for (let i = 0; i < word.length; i++) {
                this.crossword[symRow + i][symCol] = word[i];
            }
        }
        
        return {
            word: word,
            row: row,
            col: col,
            horizontal: false,
            number: this.placedWords.length + 1
        };
    }

    canPlaceWordWithSymmetry(word, row, col, horizontal) {
        if (horizontal) {
            if (col + word.length > this.gridSize) return false;
            
            for (let i = 0; i < word.length; i++) {
                const currentCell = this.crossword[row][col + i];
                if (currentCell === '#') return false;
                if (currentCell !== '' && currentCell !== word[i]) return false;
            }
            
            // Check if this would create isolated letters
            if (this.config.get('placement.preventIsolatedLetters') && 
                this.wouldCreateIsolatedLetters(word, row, col, true)) {
                return false;
            }
        } else {
            if (row + word.length > this.gridSize) return false;
            
            for (let i = 0; i < word.length; i++) {
                const currentCell = this.crossword[row + i][col];
                if (currentCell === '#') return false;
                if (currentCell !== '' && currentCell !== word[i]) return false;
            }
            
            if (this.config.get('placement.preventIsolatedLetters') && 
                this.wouldCreateIsolatedLetters(word, row, col, false)) {
                return false;
            }
        }
        
        return true;
    }

    wouldCreateIsolatedLetters(word, row, col, horizontal) {
        // Check if placing this word would create letters that don't cross with other words
        if (horizontal) {
            for (let i = 0; i < word.length; i++) {
                const hasCrossing = this.hasCrossingWord(row, col + i, horizontal);
                if (!hasCrossing) return true;
            }
        } else {
            for (let i = 0; i < word.length; i++) {
                const hasCrossing = this.hasCrossingWord(row + i, col, horizontal);
                if (!hasCrossing) return true;
            }
        }
        return false;
    }

    hasCrossingWord(row, col, isHorizontal) {
        // Check if there's already a word crossing at this position
        if (isHorizontal) {
            // Check for vertical crossing
            return (row > 0 && this.crossword[row - 1][col] !== '#' && this.crossword[row - 1][col] !== '') ||
                   (row < this.gridSize - 1 && this.crossword[row + 1][col] !== '#' && this.crossword[row + 1][col] !== '');
        } else {
            // Check for horizontal crossing
            return (col > 0 && this.crossword[row][col - 1] !== '#' && this.crossword[row][col - 1] !== '') ||
                   (col < this.gridSize - 1 && this.crossword[row][col + 1] !== '#' && this.crossword[row][col + 1] !== '');
        }
    }

    ensureGridConnectivity() {
        if (!this.config.get('placement.ensureConnectivity')) return;
        
        const isolatedAreas = this.findIsolatedAreas();
        if (isolatedAreas.length > 1) {
            this.connectIsolatedAreas(isolatedAreas);
        }
    }

    findIsolatedAreas() {
        const visited = Array(this.gridSize).fill().map(() => Array(this.gridSize).fill(false));
        const areas = [];
        
        for (let i = 0; i < this.gridSize; i++) {
            for (let j = 0; j < this.gridSize; j++) {
                if (this.crossword[i][j] !== '#' && !visited[i][j]) {
                    const area = [];
                    this.floodFill(i, j, this.crossword, visited, area);
                    areas.push(area);
                }
            }
        }
        
        return areas;
    }

    floodFill(row, col, grid, visited, area = null) {
        if (row < 0 || row >= this.gridSize || col < 0 || col >= this.gridSize || 
            visited[row][col] || grid[row][col] === '#') {
            return;
        }
        
        visited[row][col] = true;
        if (area) area.push([row, col]);
        
        this.floodFill(row + 1, col, grid, visited, area);
        this.floodFill(row - 1, col, grid, visited, area);
        this.floodFill(row, col + 1, grid, visited, area);
        this.floodFill(row, col - 1, grid, visited, area);
    }

    connectIsolatedAreas(areas) {
        // Simple approach: try to place bridge words between areas
        for (let i = 0; i < areas.length - 1; i++) {
            const bridgeWord = this.findBridgeWord(areas[i], areas[i + 1]);
            if (bridgeWord) {
                this.placeBridgeWord(bridgeWord, areas[i], areas[i + 1]);
            }
        }
    }

    findBridgeWord(area1, area2) {
        // Find a word that could connect two areas
        const shortWords = this.words.filter(w => w.length >= 3 && w.length <= 6);
        return shortWords.find(word => this.canBridgeAreas(word, area1, area2));
    }

    canBridgeAreas(word, area1, area2) {
        // Check if this word could be placed to connect the areas
        // This is a simplified check - in practice, you'd want more sophisticated logic
        return true;
    }

    placeBridgeWord(word, area1, area2) {
        // Place the bridge word to connect areas
        // This is a simplified implementation
        console.log(`Placing bridge word: ${word}`);
    }

    async generateCrossword() {
        await this.loadWordsFromCSV();
        this.initializeGrid();
        this.placeBlackSquares();
        this.placeWordsWithSymmetry();
        this.ensureGridConnectivity();
        
        return {
            grid: this.crossword,
            words: this.placedWords,
            size: this.gridSize
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CrosswordGenerator;
}
