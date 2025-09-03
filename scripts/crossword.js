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

    /**
     * Resets configuration to default values and clears cookies.
     */
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

/**
 * Crossword Generator Class - Smart Intersection-First Approach
 * Analyzes word intersections, builds connection graphs, and creates professional crosswords.
 */
class CrosswordGenerator {
    constructor(config) {
        this.config = config;
        this.gridSize = config.get('grid.size') || 15;
        this.words = [];
        this.clues = {};
        this.crossword = null;
        this.placedWords = [];
        this.wordGraph = {};
    }

    /**
     * Main method to generate a crossword puzzle using the words-first approach.
     * @returns {Promise<Object>} - Generated crossword data
     */
    async generateCrossword() {
        try {
            console.log('Starting words-first crossword generation...');
            
            // Phase 1: Load words and build intersection graph
            await this.loadWordsFromCSV();
            const selectedWords = this.selectSmartWordSet();
            console.log(`Selected ${selectedWords.length} words for crossword`);
            
            // Phase 2: Build comprehensive word connection graph
            this.buildWordConnectionGraph(selectedWords);
            console.log('Word connection graph built');
            
            // Phase 3: Generate crossword grid with strategic placement
            const success = this.generateCrosswordGrid(selectedWords);
            if (!success) {
                throw new Error('Failed to generate valid crossword grid');
            }
            console.log('Crossword grid generated successfully');
            
            // Phase 4: Add professional black square patterns
            this.addProfessionalBlackSquares();
            console.log('Professional black squares added');
            
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

    /**
     * Loads words and clues from CSV file.
     * @returns {Promise<void>}
     */
    async loadWordsFromCSV() {
        try {
            console.log('Loading words from CSV...');
            const response = await fetch(this.config.get('files.wordListPath'));
            
            if (!response.ok) {
                throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
            }
            
            const csvText = await response.text();
            const lines = csvText.split('\n').filter(line => line.trim());
            
            if (lines.length < 2) {
                throw new Error('CSV file is too short or empty');
            }
            
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
                        
                        // STRICT WORD VALIDATION - Only allow valid English words
                        if (word.length >= this.config.get('words.minLength') && 
                            word.length <= this.config.get('words.maxLength') &&
                            /^[a-z]+$/.test(word) &&
                            this.isValidEnglishWord(word)) {
                            this.words.push(word);
                            this.clues[word] = clue;
                        }
                    }
                }
            }
            
            console.log(`Loaded ${this.words.length} words with clues from CSV`);
            console.log('First 5 words loaded:', this.words.slice(0, 5));
            console.log('Sample clues:', Object.entries(this.clues).slice(0, 3));
            
        } catch (error) {
            console.error('Error loading words from CSV:', error);
            throw error;
        }
    }

    /**
     * Validates if a word is a legitimate English word.
     * @param {string} word - Word to validate
     * @returns {boolean} - True if word is valid
     */
    isValidEnglishWord(word) {
        // Must be at least 3 characters
        if (word.length < 3) return false;
        
        // Must contain at least one vowel
        if (!/[aeiou]/.test(word)) return false;
        
        // Must not contain only consonants
        if (/^[bcdfghjklmnpqrstvwxyz]+$/.test(word)) return false;
        
        // Must not be all the same letter
        if (/^(.)\1+$/.test(word)) return false;
        
        // Must not contain common non-word patterns
        const invalidPatterns = [
            /^[bcdfghjklmnpqrstvwxyz]{4,}$/, // 4+ consonants in a row
            /[bcdfghjklmnpqrstvwxyz]{5,}/,   // 5+ consonants anywhere
            /^[aeiou]{3,}$/,                  // 3+ vowels in a row at start
            /[aeiou]{4,}/,                    // 4+ vowels anywhere
            /^[bcdfghjklmnpqrstvwxyz]{3,}[aeiou]?$/, // 3+ consonants at start
            /[aeiou]?[bcdfghjklmnpqrstvwxyz]{3,}$/  // 3+ consonants at end
        ];
        
        for (const pattern of invalidPatterns) {
            if (pattern.test(word)) return false;
        }
        
        return true;
    }

    /**
     * Selects a smart set of words that can create good intersections.
     * Analyzes word compatibility and prioritizes words with many possible connections.
     * @returns {Array} - Array of selected words
     */
    selectSmartWordSet() {
        const minLength = this.config.get('words.minLength');
        const maxLength = this.config.get('words.maxLength');
        const targetCount = Math.min(this.config.get('words.targetCount'), 20); // Cap at 20 for better quality
        
        console.log(`Smart word selection: minLength=${minLength}, maxLength=${maxLength}, targetCount=${targetCount}`);
        
        // Filter words by length requirements and additional quality checks
        const validWords = this.words.filter(word => 
            word.length >= minLength && 
            word.length <= maxLength &&
            this.isValidEnglishWord(word) &&
            word.length >= 4  // Minimum 4 letters for better quality
        );
        
        // Group words by length for better intersection potential
        const wordsByLength = {};
        for (const word of validWords) {
            const len = word.length;
            if (!wordsByLength[len]) wordsByLength[len] = [];
            wordsByLength[len].push(word);
        }
        
        // Select a balanced mix of word lengths
        const selected = [];
        const targetLengths = [8, 7, 6, 9, 5, 10, 4, 11, 12, 3]; // Priority order
        
        for (const length of targetLengths) {
            if (wordsByLength[length] && selected.length < targetCount) {
                const wordsOfLength = wordsByLength[length];
                const shuffle = this.shuffleArray([...wordsOfLength]);
                const needed = Math.min(targetCount - selected.length, Math.ceil(targetCount / 4));
                
                selected.push(...shuffle.slice(0, needed));
            }
        }
        
        // Fill remaining slots with random words
        const remaining = targetCount - selected.length;
        if (remaining > 0) {
            const allValid = validWords.filter(w => !selected.includes(w));
            const randomWords = this.shuffleArray([...allValid]).slice(0, remaining);
            selected.push(...randomWords);
        }
        
        console.log(`Selected ${selected.length} smart words with balanced lengths`);
        return selected;
    }

    /**
     * Shuffles an array using Fisher-Yates algorithm.
     * @param {Array} array - Array to shuffle
     * @returns {Array} - Shuffled array
     */
    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    /**
     * Analyzes which words can intersect with each other.
     * Creates a graph of possible word connections.
     * @param {Array} words - Array of words to analyze
     * @returns {Object} - Word intersection graph
     */
    analyzeWordIntersections(words) {
        const graph = {};
        
        for (let i = 0; i < words.length; i++) {
            const word1 = words[i];
            graph[word1] = [];
            
            for (let j = 0; j < words.length; j++) {
                if (i === j) continue;
                
                const word2 = words[j];
                const intersections = this.findWordIntersections(word1, word2);
                
                if (intersections.length > 0) {
                    graph[word1].push({
                        word: word2,
                        intersections: intersections
                    });
                }
            }
        }
        
        return graph;
    }

    /**
     * Finds all possible intersections between two words.
     * @param {string} word1 - First word
     * @param {string} word2 - Second word
     * @returns {Array} - Array of intersection points
     */
    findWordIntersections(word1, word2) {
        const intersections = [];
        
        // Only find intersections for valid words
        if (word1.length < 3 || word2.length < 3) {
            return intersections;
        }
        
        for (let i = 0; i < word1.length; i++) {
            for (let j = 0; j < word2.length; j++) {
                if (word1[i] === word2[j]) {
                    // Prefer intersections that create meaningful word segments
                    const score = this.calculateIntersectionScore(word1, word2, i, j);
                    intersections.push({
                        word1Index: i,
                        word2Index: j,
                        letter: word1[i],
                        score: score
                    });
                }
            }
        }
        
        // Sort intersections by quality score
        intersections.sort((a, b) => b.score - a.score);
        
        return intersections;
    }

    /**
     * Calculates a quality score for an intersection between two words.
     * @param {string} word1 - First word
     * @param {string} word2 - Second word
     * @param {number} index1 - Index in first word
     * @param {number} index2 - Index in second word
     * @returns {number} - Quality score (higher is better)
     */
    calculateIntersectionScore(word1, word2, index1, index2) {
        let score = 0;
        
        // Prefer intersections near the middle of words
        const mid1 = word1.length / 2;
        const mid2 = word2.length / 2;
        const distFromMid1 = Math.abs(index1 - mid1);
        const distFromMid2 = Math.abs(index2 - mid2);
        
        score += (word1.length - distFromMid1) + (word2.length - distFromMid2);
        
        // Prefer longer words
        score += word1.length + word2.length;
        
        // Bonus for common letters (e, a, r, t, o, i, n, s)
        const commonLetters = ['e', 'a', 'r', 't', 'o', 'i', 'n', 's'];
        if (commonLetters.includes(word1[index1])) {
            score += 5;
        }
        
        return score;
    }

    /**
     * Designs the grid layout based on selected words and their intersections.
     * @param {Array} words - Selected words
     * @param {Object} wordGraph - Word intersection graph
     * @returns {Object} - Grid layout design
     */
    designGridLayout(words, wordGraph) {
        console.log('=== DESIGNING GRID LAYOUT ===');
        console.log('Words to place:', words);
        console.log('Word graph:', wordGraph);
        
        // Start with a central word
        const centralWord = words.find(w => w.length >= 5) || words[0];
        const center = Math.floor(this.gridSize / 2);
        
        console.log('Central word:', centralWord, 'at center:', center);
        
        const layout = {
            centralWord: centralWord,
            centerRow: center,
            centerCol: Math.floor(center - centralWord.length / 2),
            wordPositions: [],
            blackSquares: []
        };
        
        console.log('Initial layout:', layout);
        
        // Place central word horizontally
        layout.wordPositions.push({
            word: centralWord,
            row: center,
            col: layout.centerCol,
            horizontal: true,
            number: 1
        });
        
        console.log('After placing central word:', layout.wordPositions);
        
        // Design black squares around the central word
        this.designBlackSquaresAroundWord(layout, centralWord, center, layout.centerCol, true);
        
        // Plan placement of other words
        this.planWordPlacements(layout, words, wordGraph);
        
        console.log('Final layout:', layout);
        console.log('Total word positions:', layout.wordPositions.length);
        console.log('Total black squares:', layout.blackSquares.length);
        
        return layout;
    }

    /**
     * Designs black squares around a placed word to create proper boundaries.
     * @param {Object} layout - Grid layout object
     * @param {string} word - Word to design around
     * @param {number} row - Word row position
     * @param {number} col - Word column position
     * @param {boolean} horizontal - Whether word is horizontal
     */
    designBlackSquaresAroundWord(layout, word, row, col, horizontal) {
        if (horizontal) {
            // Only add black squares at word boundaries (start/end)
            if (col > 0) {
                layout.blackSquares.push([row, col - 1]);
            }
            if (col + word.length < this.gridSize) {
                layout.blackSquares.push([row, col + word.length]);
            }
            
            // Occasionally add a black square above or below (much less frequently)
            if (Math.random() > 0.9) { // Reduced from 0.7 to 0.9
                const randomCol = col + Math.floor(Math.random() * word.length);
                if (row > 0) {
                    layout.blackSquares.push([row - 1, randomCol]);
                }
                if (row < this.gridSize - 1) {
                    layout.blackSquares.push([row + 1, randomCol]);
                }
            }
        } else {
            // Vertical word - similar conservative approach
            if (row > 0) {
                layout.blackSquares.push([row - 1, col]);
            }
            if (row + word.length < this.gridSize) {
                layout.blackSquares.push([row + word.length, col]);
            }
            
            // Occasionally add a black square to the left or right
            if (Math.random() > 0.9) { // Reduced from 0.7 to 0.9
                const randomRow = row + Math.floor(Math.random() * word.length);
                if (col > 0) {
                    layout.blackSquares.push([randomRow, col - 1]);
                }
                if (col < this.gridSize - 1) {
                    layout.blackSquares.push([randomRow, col + 1]);
                }
            }
        }
    }

    /**
     * Plans the placement of remaining words based on intersections.
     * @param {Object} layout - Grid layout object
     * @param {Array} words - Words to place
     * @param {Object} wordGraph - Word intersection graph
     */
    planWordPlacements(layout, words, wordGraph) {
        const remainingWords = words.filter(w => w !== layout.centralWord);
        
        for (const word of remainingWords) {
            // Find best intersection with already placed words
            const bestPlacement = this.findBestWordPlacement(word, layout.wordPositions, wordGraph);
            
            if (bestPlacement) {
                layout.wordPositions.push(bestPlacement);
                this.designBlackSquaresAroundWord(
                    layout, 
                    word, 
                    bestPlacement.row, 
                    bestPlacement.col, 
                    bestPlacement.horizontal
                );
            }
        }
    }

    /**
     * Finds the best placement for a word based on intersections.
     * @param {string} word - Word to place
     * @param {Array} placedWords - Already placed words
     * @param {Object} wordGraph - Word intersection graph
     * @returns {Object|null} - Best placement or null if none found
     */
    findBestWordPlacement(word, placedWords, wordGraph) {
        let bestPlacement = null;
        let bestScore = -1;
        
        for (const placedWord of placedWords) {
            const intersections = this.findWordIntersections(word, placedWord.word);
            
            for (const intersection of intersections) {
                const placement = this.calculateWordPlacement(word, placedWord, intersection);
                
                if (placement && this.isValidPlacement(placement)) {
                    const score = this.calculatePlacementScore(placement);
                    
                    if (score > bestScore) {
                        bestScore = score;
                        bestPlacement = placement;
                    }
                }
            }
        }
        
        if (bestPlacement) {
            bestPlacement.number = placedWords.length + 1;
        }
        
        return bestPlacement;
    }

    /**
     * Calculates where a word should be placed based on intersection.
     * @param {string} word - Word to place
     * @param {Object} existingWord - Existing word to intersect with
     * @param {Object} intersection - Intersection data
     * @returns {Object|null} - Calculated placement or null if invalid
     */
    calculateWordPlacement(word, existingWord, intersection) {
        console.log(`Calculating placement for "${word}" intersecting with "${existingWord.word}" at intersection:`, intersection);
        
        if (existingWord.horizontal) {
            // Place new word vertically
            const newRow = existingWord.row - intersection.word2Index;
            const newCol = existingWord.col + intersection.word1Index;
            
            console.log(`  Existing word horizontal at [${existingWord.row}, ${existingWord.col}]`);
            console.log(`  Intersection: word1Index=${intersection.word1Index}, word2Index=${intersection.word2Index}`);
            console.log(`  Calculated position: [${newRow}, ${newCol}]`);
            
            if (newRow >= 0 && newRow + word.length <= this.gridSize) {
                const placement = {
                    word: word,
                    row: newRow,
                    col: newCol,
                    horizontal: false
                };
                console.log(`  Valid placement found:`, placement);
                return placement;
            } else {
                console.log(`  Invalid placement: newRow=${newRow}, newCol=${newCol}, word.length=${word.length}, gridSize=${this.gridSize}`);
            }
        } else {
            // Place new word horizontally
            const newRow = existingWord.row + intersection.word1Index;
            const newCol = existingWord.col - intersection.word2Index;
            
            console.log(`  Existing word vertical at [${existingWord.row}, ${existingWord.col}]`);
            console.log(`  Intersection: word1Index=${intersection.word1Index}, word2Index=${intersection.word2Index}`);
            console.log(`  Calculated position: [${newRow}, ${newCol}]`);
            
            if (newCol >= 0 && newCol + word.length <= this.gridSize) {
                const placement = {
                    word: word,
                    row: newRow,
                    col: newCol,
                    horizontal: true
                };
                console.log(`  Valid placement found:`, placement);
                return placement;
            } else {
                console.log(`  Invalid placement: newRow=${newRow}, newCol=${newCol}, word.length=${word.length}, gridSize=${this.gridSize}`);
            }
        }
        
        console.log(`  No valid placement found`);
        return null;
    }

    /**
     * Checks if a word placement is valid.
     * @param {Object} placement - Word placement to check
     * @param {Array} placedWords - Already placed words
     * @returns {boolean} - True if placement is valid
     */
    isValidPlacement(placement) {
        // Check bounds
        if (placement.row < 0 || placement.col < 0) return false;
        if (placement.horizontal) {
            if (placement.col + placement.word.length > this.gridSize) return false;
        } else {
            if (placement.row + placement.word.length > this.gridSize) return false;
        }
        
        // Check for conflicts with existing letters in the grid
        if (this.wouldOverwriteLetters(placement)) {
            console.log(`Placement would overwrite existing letters:`, placement);
            return false;
        }
        
        // Check for conflicts with other placed words
        for (const placedWord of this.placedWords) {
            if (this.wordsOverlap(placement, placedWord)) {
                console.log(`Placement conflicts with existing word:`, placedWord);
                return false;
            }
        }
        
        // Check for minimum spacing between words
        if (!this.hasMinimumSpacing(placement)) {
            console.log(`Placement does not have minimum spacing:`, placement);
            return false;
        }
        
        return true;
    }

    /**
     * Checks if a word placement would overwrite existing letters in the grid.
     * @param {Object} placement - Word placement to check
     * @returns {boolean} - True if it would overwrite letters
     */
    wouldOverwriteLetters(placement) {
        const { word, row, col, horizontal } = placement;
        
        if (horizontal) {
            for (let i = 0; i < word.length; i++) {
                const targetRow = row;
                const targetCol = col + i;
                
                // Check if cell already contains a letter (not empty and not black square)
                if (this.crossword[targetRow][targetCol] !== '' && 
                    this.crossword[targetRow][targetCol] !== '#') {
                    console.log(`Would overwrite letter "${this.crossword[targetRow][targetCol]}" at [${targetRow}, ${targetCol}]`);
                    return true;
                }
            }
        } else {
            for (let i = 0; i < word.length; i++) {
                const targetRow = row + i;
                const targetCol = col;
                
                // Check if cell already contains a letter (not empty and not black square)
                if (this.crossword[targetRow][targetCol] !== '' && 
                    this.crossword[targetRow][targetCol] !== '#') {
                    console.log(`Would overwrite letter "${this.crossword[targetRow][targetCol]}" at [${targetRow}, ${targetCol}]`);
                    return true;
                }
            }
        }
        
        return false;
    }

    /**
     * Checks if two word placements overlap.
     * @param {Object} placement1 - First word placement
     * @param {Object} placement2 - Second word placement
     * @returns {boolean} - True if words overlap
     */
    wordsOverlap(placement1, placement2) {
        // Check if words are in the same direction
        if (placement1.horizontal === placement2.horizontal) {
            if (placement1.row === placement2.row && placement1.horizontal) {
                // Both horizontal, check column overlap
                return !(placement1.col + placement1.word.length <= placement2.col ||
                        placement2.col + placement2.word.length <= placement1.col);
            } else if (placement1.col === placement2.col && !placement1.horizontal) {
                // Both vertical, check row overlap
                return !(placement1.row + placement1.word.length <= placement2.row ||
                        placement2.row + placement2.word.length <= placement1.row);
            }
        }
        
        return false;
    }

    /**
     * Checks if a word placement has minimum spacing from other words.
     * @param {Object} placement - Word placement to check
     * @returns {boolean} - True if minimum spacing is maintained
     */
    hasMinimumSpacing(placement) {
        const { word, row, col, horizontal } = placement;
        
        // ENFORCE MINIMUM WORD LENGTH - Never allow single-letter words
        if (word.length < 3) {
            console.log(`Rejecting word "${word}" - too short (${word.length} letters)`);
            return false;
        }
        
        // Check spacing from other placed words
        for (const placedWord of this.placedWords) {
            if (placement === placedWord) continue;
            
            if (horizontal) {
                // Check if this word is too close to a horizontal word
                if (placedWord.horizontal && Math.abs(row - placedWord.row) <= 1) {
                    // Check for minimum column separation
                    const thisStart = col;
                    const thisEnd = col + word.length - 1;
                    const otherStart = placedWord.col;
                    const otherEnd = placedWord.col + placedWord.word.length - 1;
                    
                    // Ensure at least 1 cell separation
                    if (!(thisEnd < otherStart - 1 || thisStart > otherEnd + 1)) {
                        return false;
                    }
                }
            } else {
                // Check if this word is too close to a vertical word
                if (!placedWord.horizontal && Math.abs(col - placedWord.col) <= 1) {
                    // Check for minimum row separation
                    const thisStart = row;
                    const thisEnd = row + word.length - 1;
                    const otherStart = placedWord.row;
                    const otherEnd = placedWord.row + placedWord.word.length - 1;
                    
                    // Ensure at least 1 cell separation
                    if (!(thisEnd < otherStart - 1 || thisStart > otherEnd + 1)) {
                        return false;
                    }
                }
            }
        }
        
        return true;
    }

    /**
     * Calculates a score for a word placement.
     * @param {Object} placement - Word placement to score
     * @param {Array} placedWords - Already placed words
     * @returns {number} - Placement score
     */
    calculatePlacementScore(placement) {
        let score = 0;
        
        // Prefer longer words
        score += placement.word.length * 2;
        
        // Prefer words that create more intersections
        for (const placedWord of this.placedWords) {
            if (this.wordsOverlap(placement, placedWord)) {
                score += 10;
            }
        }
        
        // Prefer central placement
        const center = Math.floor(this.gridSize / 2);
        const distanceFromCenter = Math.abs(placement.row - center) + Math.abs(placement.col - center);
        score += (this.gridSize - distanceFromCenter);
        
        return score;
    }

    /**
     * Places words and black squares according to the designed layout.
     * @param {Array} words - Words to place
     * @param {Object} layout - Grid layout design
     */
    placeWordsAndBlackSquares(words, layout) {
        // Initialize empty grid
        this.crossword = Array(this.gridSize).fill().map(() => Array(this.gridSize).fill(''));
        this.placedWords = [];
        
        console.log('=== DEBUGGING WORD PLACEMENT ===');
        console.log('Layout object:', layout);
        console.log('Word positions to place:', layout.wordPositions);
        console.log('Black squares to place:', layout.blackSquares);
        
        // Place black squares first
        for (const [row, col] of layout.blackSquares) {
            if (row >= 0 && row < this.gridSize && col >= 0 && col < this.gridSize) {
                this.crossword[row][col] = '#';
            }
        }
        
        // Place words
        console.log(`Attempting to place ${layout.wordPositions.length} words...`);
        for (const wordPlacement of layout.wordPositions) {
            console.log('Placing word:', wordPlacement);
            this.placeWord(wordPlacement);
            this.placedWords.push(wordPlacement);
        }
        
        console.log('Grid after word placement:');
        console.log(this.crossword.map(row => row.join('')).join('\n'));
        
        // Fill remaining spaces with additional black squares if needed
        this.fillRemainingBlackSquares();
    }

    /**
     * Places a single word in the grid.
     * @param {Object} placement - Word placement data
     */
    placeWord(placement) {
        const { word, row, col, horizontal } = placement;
        
        console.log(`=== PLACING WORD ===`);
        console.log(`Word: "${word}"`);
        console.log(`Position: [${row}, ${col}]`);
        console.log(`Direction: ${horizontal ? 'horizontal' : 'vertical'}`);
        console.log(`Word length: ${word.length}`);
        
        // Validate placement coordinates
        if (row < 0 || row >= this.gridSize || col < 0 || col >= this.gridSize) {
            console.error(`Invalid coordinates: [${row}, ${col}] for grid size ${this.gridSize}`);
            return;
        }
        
        if (horizontal) {
            if (col + word.length > this.gridSize) {
                console.error(`Word "${word}" too long for horizontal placement at col ${col}`);
                return;
            }
            
            console.log(`Placing horizontally from col ${col} to ${col + word.length - 1}`);
            for (let i = 0; i < word.length; i++) {
                const targetRow = row;
                const targetCol = col + i;
                const letter = word[i];
                
                console.log(`  Setting [${targetRow}, ${targetCol}] = "${letter}" (letter ${i + 1} of "${word}")`);
                
                // Check if cell is already occupied
                if (this.crossword[targetRow][targetCol] !== '') {
                    console.warn(`  WARNING: Cell [${targetRow}, ${targetCol}] already contains "${this.crossword[targetRow][targetCol]}"`);
                }
                
                this.crossword[targetRow][targetCol] = letter;
            }
        } else {
            if (row + word.length > this.gridSize) {
                console.error(`Word "${word}" too long for vertical placement at row ${row}`);
                return;
            }
            
            console.log(`Placing vertically from row ${row} to ${row + word.length - 1}`);
            for (let i = 0; i < word.length; i++) {
                const targetRow = row + i;
                const targetCol = col;
                const letter = word[i];
                
                console.log(`  Setting [${targetRow}, ${targetCol}] = "${letter}" (letter ${i + 1} of "${word}")`);
                
                // Check if cell is already occupied
                if (this.crossword[targetRow][targetCol] !== '') {
                    console.warn(`  WARNING: Cell [${targetRow}, ${targetCol}] already contains "${this.crossword[targetRow][targetCol]}"`);
                }
                
                this.crossword[targetRow][targetCol] = letter;
            }
        }
        
        // Add black squares around the word for proper separation
        this.addWordBoundaries(placement);
        
        console.log(`Word "${word}" placed successfully`);
        console.log(`Grid state after placement:`);
        this.logGrid();
        console.log(`=== END PLACING WORD ===`);
    }

    /**
     * Adds black squares around a word to ensure proper separation from other words.
     * @param {Object} placement - Word placement object
     */
    addWordBoundaries(placement) {
        const { word, row, col, horizontal } = placement;
        
        if (horizontal) {
            // Add black squares at the ends (always)
            if (col > 0) {
                this.addBlackSquare(row, col - 1);
            }
            if (col + word.length < this.gridSize) {
                this.addBlackSquare(row, col + word.length);
            }
            
            // Add black squares above and below (more aggressively)
            for (let i = 0; i < word.length; i++) {
                if (Math.random() < 0.5) { // 50% chance for better separation
                    if (row > 0) {
                        this.addBlackSquare(row - 1, col + i);
                    }
                    if (row + 1 < this.gridSize) {
                        this.addBlackSquare(row + 1, col + i);
                    }
                }
            }
        } else {
            // Add black squares at the ends (always)
            if (row > 0) {
                this.addBlackSquare(row - 1, col);
            }
            if (row + word.length < this.gridSize) {
                this.addBlackSquare(row + word.length, col);
            }
            
            // Add black squares to the left and right (more aggressively)
            for (let i = 0; i < word.length; i++) {
                if (Math.random() < 0.5) { // 50% chance for better separation
                    if (col > 0) {
                        this.addBlackSquare(row + i, col - 1);
                    }
                    if (col + 1 < this.gridSize) {
                        this.addBlackSquare(row + i, col + 1);
                    }
                }
            }
        }
    }

    /**
     * Fills remaining spaces with black squares to complete the grid.
     * Only fills truly empty spaces, never overwrites letters.
     */
    fillRemainingBlackSquares() {
        const targetBlackSquares = Math.floor(this.gridSize * this.gridSize * this.config.get('blackSquares.percentage'));
        let currentBlackSquares = 0;
        
        // Count existing black squares
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                if (this.crossword[row][col] === '#') {
                    currentBlackSquares++;
                }
            }
        }
        
        // Only add black squares if we're under the target AND there are empty spaces
        let attempts = 0;
        const maxAttempts = 200;
        
        while (currentBlackSquares < targetBlackSquares && attempts < maxAttempts) {
            const row = Math.floor(Math.random() * this.gridSize);
            const col = Math.floor(Math.random() * this.gridSize);
            
            // CRITICAL FIX: Only place black squares in truly empty spaces
            // Never overwrite letters that are already there
            if (this.crossword[row][col] === '' && this.canPlaceBlackSquare(row, col)) {
                this.crossword[row][col] = '#';
                currentBlackSquares++;
                console.log(`Added black square at [${row}, ${col}]`);
            }
            
            attempts++;
        }
        
        console.log(`Final black square count: ${currentBlackSquares}/${targetBlackSquares}`);
    }

    /**
     * Checks if a black square can be placed at the given position.
     * @param {number} row - Row position
     * @param {number} col - Column position
     * @returns {boolean} - True if placement is allowed
     */
    canPlaceBlackSquare(row, col) {
        // Basic bounds check
        if (row < 0 || row >= this.gridSize || col < 0 || col >= this.gridSize) {
            return false;
        }
        
        // Check if it would create a 2x2 block
        if (this.wouldCreate2x2Block(row, col)) {
            return false;
        }
        
        return true;
    }

    /**
     * Safely adds a black square at the specified position if possible.
     * @param {number} row - Row position
     * @param {number} col - Column position
     */
    addBlackSquare(row, col) {
        if (row >= 0 && row < this.gridSize && col >= 0 && col < this.gridSize) {
            if (this.crossword[row][col] === '' && this.canPlaceBlackSquare(row, col)) {
                this.crossword[row][col] = '#';
            }
        }
    }

    /**
     * Checks if placing a black square would create a 2x2 block.
     * @param {number} row - Row position
     * @param {number} col - Column position
     * @returns {boolean} - True if it would create a 2x2 block
     */
    wouldCreate2x2Block(row, col) {
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
                if (blackCount >= 3) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Builds a comprehensive word connection graph showing all possible intersections.
     * @param {Array} words - Array of words to analyze
     */
    buildWordConnectionGraph(words) {
        this.wordGraph = {};
        
        for (let i = 0; i < words.length; i++) {
            const word1 = words[i];
            this.wordGraph[word1] = [];
            
            for (let j = 0; j < words.length; j++) {
                if (i === j) continue;
                
                const word2 = words[j];
                const intersections = this.findWordIntersections(word1, word2);
                
                if (intersections.length > 0) {
                    this.wordGraph[word1].push({
                        word: word2,
                        intersections: intersections,
                        score: intersections.length * 2 + Math.min(word1.length, word2.length)
                    });
                }
            }
            
            // Sort connections by score (best intersections first)
            this.wordGraph[word1].sort((a, b) => b.score - a.score);
        }
        
        console.log('Word connection graph built with', Object.keys(this.wordGraph).length, 'words');
    }

    /**
     * Generates the crossword grid using strategic word placement.
     * @param {Array} words - Words to place in the grid
     * @returns {boolean} - True if successful, false otherwise
     */
    generateCrosswordGrid(words) {
        console.log('=== GENERATING CROSSWORD GRID ===');
        console.log('Grid size:', this.gridSize);
        console.log('Words to place:', words);
        
        // Initialize empty grid
        this.crossword = Array(this.gridSize).fill().map(() => Array(this.gridSize).fill(''));
        this.placedWords = [];
        
        console.log('Grid initialized, size:', this.crossword.length, 'x', this.crossword[0].length);
        
        // Start with a central word
        const center = Math.floor(this.gridSize / 2);
        const centralWord = words.find(w => w.length >= 6) || words[0];
        
        console.log('Center position:', center);
        console.log('Central word selected:', centralWord);
        
        if (!centralWord) {
            console.error('No suitable central word found');
            return false;
        }
        
        // Place central word horizontally
        const centralCol = Math.max(0, center - Math.floor(centralWord.length / 2));
        const centralPlacement = {
            word: centralWord,
            row: center,
            col: centralCol,
            horizontal: true,
            number: 1
        };
        
        console.log('Central word placement:', centralPlacement);
        
        this.placeWord(centralPlacement);
        this.placedWords.push(centralPlacement);
        
        console.log(`Placed central word "${centralWord}" at [${center}, ${centralCol}]`);
        console.log('Grid after central word:');
        this.logGrid();
        
        // Try to place remaining words with intersections
        const remainingWords = words.filter(w => w !== centralWord);
        console.log('Remaining words to place:', remainingWords.length);
        
        let attempts = 0;
        const maxAttempts = 200; // Increased max attempts
        let placedCount = 0;
        
        // Sort words by length (shorter words are easier to place)
        // Also remove duplicates to avoid the same word appearing multiple times
        const uniqueWords = [...new Set(remainingWords)];
        const sortedWords = uniqueWords.sort((a, b) => a.length - b.length);
        
        console.log(`Processing ${sortedWords.length} unique words (removed ${remainingWords.length - sortedWords.length} duplicates)`);
        
        for (const word of sortedWords) {
            if (attempts >= maxAttempts) break;
            
            console.log(`Attempting to place word "${word}" (attempt ${attempts + 1})`);
            const placement = this.findBestIntersectionPlacement(word);
            
            if (placement) {
                console.log(`Found placement for "${word}":`, placement);
                this.placeWord(placement);
                this.placedWords.push(placement);
                placedCount++;
                console.log(`Successfully placed word "${word}" with intersection`);
                console.log('Grid after placement:');
                this.logGrid();
            } else {
                console.log(`Could not place word "${word}" with intersection`);
            }
            
            attempts++;
        }
        
        // Re-number all words sequentially from top-left to bottom-right
        this.renumberWordsSequentially();
        
        console.log(`=== GRID GENERATION COMPLETE ===`);
        console.log(`Successfully placed ${this.placedWords.length} words`);
        console.log(`Final grid state:`);
        this.logGrid();
        
        return this.placedWords.length >= Math.min(5, words.length);
    }

    /**
     * Logs the current grid state for debugging.
     */
    logGrid() {
        console.log('Grid contents:');
        for (let row = 0; row < this.gridSize; row++) {
            let rowStr = '';
            for (let col = 0; col < this.gridSize; col++) {
                const cell = this.crossword[row][col];
                rowStr += (cell || ' ') + ' ';
            }
            console.log(`Row ${row}: ${rowStr}`);
        }
    }

    /**
     * Renumbers all placed words sequentially from top-left to bottom-right.
     * This ensures professional crossword numbering.
     */
    renumberWordsSequentially() {
        if (this.placedWords.length === 0) return;
        
        // Sort words by position (top-left to bottom-right)
        const sortedWords = [...this.placedWords].sort((a, b) => {
            if (a.row !== b.row) {
                return a.row - b.row; // Sort by row first
            }
            return a.col - b.col; // Then by column
        });
        
        // Assign sequential numbers starting from 1
        let number = 1;
        for (const word of sortedWords) {
            word.number = number++;
        }
        
        // Also update the placedWords array to maintain order
        this.placedWords = sortedWords;
        
        console.log('Renumbered words sequentially:', sortedWords.map(w => `${w.number}: ${w.word}`));
        console.log('Total words placed:', this.placedWords.length);
    }

    /**
     * Finds the best placement for a word that intersects with existing words.
     * @param {string} word - Word to place
     * @returns {Object|null} - Best placement or null if none found
     */
    findBestIntersectionPlacement(word) {
        let bestPlacement = null;
        let bestScore = -1;
        
        // First try to find intersections with existing words
        for (const placedWord of this.placedWords) {
            const intersections = this.findWordIntersections(word, placedWord.word);
            
            for (const intersection of intersections) {
                const placement = this.calculateIntersectionPlacement(word, placedWord, intersection);
                
                if (placement && this.isValidPlacement(placement)) {
                    const score = this.calculatePlacementScore(placement);
                    
                    if (score > bestScore) {
                        bestScore = score;
                        bestPlacement = placement;
                    }
                }
            }
        }
        
        // If no intersection found, try placing in empty space
        if (!bestPlacement) {
            bestPlacement = this.findEmptySpacePlacement(word);
        }
        
        // If still no placement, try placing adjacent to existing words
        if (!bestPlacement) {
            bestPlacement = this.findAdjacentPlacement(word);
        }
        
        if (bestPlacement) {
            // Assign a unique number based on placement order
            bestPlacement.number = this.placedWords.length + 1;
        }
        
        return bestPlacement;
    }

    /**
     * Calculates placement coordinates for a word intersecting with an existing word.
     * @param {string} word - Word to place
     * @param {Object} existingWord - Existing word to intersect with
     * @param {Object} intersection - Intersection data
     * @returns {Object|null} - Placement object or null if invalid
     */
    calculateIntersectionPlacement(word, existingWord, intersection) {
        if (existingWord.horizontal) {
            // Place new word vertically
            const newRow = existingWord.row - intersection.word2Index;
            const newCol = existingWord.col + intersection.word1Index;
            
            if (newRow >= 0 && newRow + word.length <= this.gridSize) {
                return {
                    word: word,
                    row: newRow,
                    col: newCol,
                    horizontal: false
                };
            }
        } else {
            // Place new word horizontally
            const newRow = existingWord.row + intersection.word1Index;
            const newCol = existingWord.col - intersection.word2Index;
            
            if (newCol >= 0 && newCol + word.length <= this.gridSize) {
                return {
                    word: word,
                    row: newRow,
                    col: newCol,
                    horizontal: true
                };
            }
        }
        
        return null;
    }

    /**
     * Finds a placement for a word in empty space when no intersections are available.
     * @param {string} word - Word to place
     * @returns {Object|null} - Placement object or null if no space found
     */
    findEmptySpacePlacement(word) {
        // Prefer placements near existing words for better connectivity
        const preferredPositions = [];
        const otherPositions = [];
        
        // Try to find a row or column with enough empty space
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col <= this.gridSize - word.length; col++) {
                // Check if we can place horizontally
                let canPlace = true;
                for (let i = 0; i < word.length; i++) {
                    if (this.crossword[row][col + i] !== '') {
                        canPlace = false;
                        break;
                    }
                }
                
                if (canPlace) {
                    const placement = {
                        word: word,
                        row: row,
                        col: col,
                        horizontal: true
                    };
                    
                    // Check if this placement is near existing words
                    if (this.isNearExistingWords(placement)) {
                        preferredPositions.push(placement);
                    } else {
                        otherPositions.push(placement);
                    }
                }
            }
        }
        
        // Try vertical placement
        for (let col = 0; col < this.gridSize; col++) {
            for (let row = 0; row <= this.gridSize - word.length; row++) {
                // Check if we can place vertically
                let canPlace = true;
                for (let i = 0; i < word.length; i++) {
                    if (this.crossword[row + i][col] !== '') {
                        canPlace = false;
                        break;
                    }
                }
                
                if (canPlace) {
                    const placement = {
                        word: word,
                        row: row,
                        col: col,
                        horizontal: false
                    };
                    
                    // Check if this placement is near existing words
                    if (this.isNearExistingWords(placement)) {
                        preferredPositions.push(placement);
                    } else {
                        otherPositions.push(placement);
                    }
                }
            }
        }
        
        // Return preferred placement if available, otherwise any placement
        if (preferredPositions.length > 0) {
            return preferredPositions[0];
        }
        return otherPositions.length > 0 ? otherPositions[0] : null;
    }

    /**
     * Checks if a word placement is near existing words for better connectivity.
     * @param {Object} placement - Word placement to check
     * @returns {boolean} - True if placement is near existing words
     */
    isNearExistingWords(placement) {
        const { row, col, horizontal } = placement;
        
        // Check if any existing word is within 2 cells
        for (const placedWord of this.placedWords) {
            const rowDiff = Math.abs(row - placedWord.row);
            const colDiff = Math.abs(col - placedWord.col);
            
            if (rowDiff <= 2 && colDiff <= 2) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Finds a placement for a word adjacent to existing words when no intersections are available.
     * @param {string} word - Word to place
     * @returns {Object|null} - Placement object or null if no placement found
     */
    findAdjacentPlacement(word) {
        // Try to place adjacent to existing words
        for (const placedWord of this.placedWords) {
            if (placedWord.horizontal) {
                // Try placing above or below horizontally
                const aboveRow = placedWord.row - 1;
                const belowRow = placedWord.row + 1;
                
                if (aboveRow >= 0) {
                    let canPlaceAbove = true;
                    for (let i = 0; i < word.length; i++) {
                        if (this.crossword[aboveRow][placedWord.col + i] !== '') {
                            canPlaceAbove = false;
                            break;
                        }
                    }
                    
                    if (canPlaceAbove) {
                        return {
                            word: word,
                            row: aboveRow,
                            col: placedWord.col,
                            horizontal: true
                        };
                    }
                }
                
                if (belowRow < this.gridSize) {
                    let canPlaceBelow = true;
                    for (let i = 0; i < word.length; i++) {
                        if (this.crossword[belowRow][placedWord.col + i] !== '') {
                            canPlaceBelow = false;
                            break;
                        }
                    }
                    
                    if (canPlaceBelow) {
                        return {
                            word: word,
                            row: belowRow,
                            col: placedWord.col,
                            horizontal: true
                        };
                    }
                }
            } else {
                // Try placing left or right vertically
                const leftCol = placedWord.col - 1;
                const rightCol = placedWord.col + 1;
                
                if (leftCol >= 0) {
                    let canPlaceLeft = true;
                    for (let i = 0; i < word.length; i++) {
                        if (this.crossword[placedWord.row + i][leftCol] !== '') {
                            canPlaceLeft = false;
                            break;
                        }
                    }
                    
                    if (canPlaceLeft) {
                        return {
                            word: word,
                            row: placedWord.row,
                            col: leftCol,
                            horizontal: false
                        };
                    }
                }
                
                if (rightCol < this.gridSize) {
                    let canPlaceRight = true;
                    for (let i = 0; i < word.length; i++) {
                        if (this.crossword[placedWord.row + i][rightCol] !== '') {
                            canPlaceRight = false;
                            break;
                        }
                    }
                    
                    if (canPlaceRight) {
                        return {
                            word: word,
                            row: placedWord.row,
                            col: rightCol,
                            horizontal: false
                        };
                    }
                }
            }
        }
        
        return null;
    }

    /**
     * Adds professional black square patterns to the grid.
     */
    addProfessionalBlackSquares() {
        // Add black squares around word boundaries
        for (const placedWord of this.placedWords) {
            this.addBoundaryBlackSquares(placedWord);
        }
        
        // Fill remaining spaces strategically
        this.fillStrategicBlackSquares();
    }

    /**
     * Adds black squares around word boundaries for proper separation.
     * @param {Object} placedWord - Word to add boundaries around
     */
    addBoundaryBlackSquares(placedWord) {
        const { word, row, col, horizontal } = placedWord;
        
        if (horizontal) {
            // Add black squares at start and end
            if (col > 0) this.addBlackSquare(row, col - 1);
            if (col + word.length < this.gridSize) this.addBlackSquare(row, col + word.length);
            
            // Occasionally add black squares above/below (20% chance)
            if (Math.random() < 0.2) {
                const randomCol = col + Math.floor(Math.random() * word.length);
                if (row > 0) this.addBlackSquare(row - 1, randomCol);
                if (row < this.gridSize - 1) this.addBlackSquare(row + 1, randomCol);
            }
        } else {
            // Add black squares at start and end
            if (row > 0) this.addBlackSquare(row - 1, col);
            if (row + word.length < this.gridSize) this.addBlackSquare(row + word.length, col);
            
            // Occasionally add black squares to left/right (20% chance)
            if (Math.random() < 0.2) {
                const randomRow = row + Math.floor(Math.random() * word.length);
                if (col > 0) this.addBlackSquare(randomRow, col - 1);
                if (col < this.gridSize - 1) this.addBlackSquare(randomRow, col + 1);
            }
        }
    }

    /**
     * Adds a black square at the specified position if valid.
     * @param {number} row - Row position
     * @param {number} col - Column position
     */
    addBlackSquare(row, col) {
        if (row >= 0 && row < this.gridSize && col >= 0 && col < this.gridSize) {
            if (this.crossword[row][col] === '' && this.canPlaceBlackSquare(row, col)) {
                this.crossword[row][col] = '#';
            }
        }
    }

    /**
     * Fills remaining spaces with strategic black squares.
     */
    fillStrategicBlackSquares() {
        const targetPercentage = this.config.get('blackSquares.percentage');
        const targetCount = Math.floor(this.gridSize * this.gridSize * targetPercentage);
        let currentCount = 0;
        
        // Count existing black squares
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                if (this.crossword[row][col] === '#') currentCount++;
            }
        }
        
        // Add strategic black squares to reach target
        let attempts = 0;
        while (currentCount < targetCount && attempts < 200) {
            const row = Math.floor(Math.random() * this.gridSize);
            const col = Math.floor(Math.random() * this.gridSize);
            
            if (this.crossword[row][col] === '' && this.canPlaceBlackSquare(row, col)) {
                this.crossword[row][col] = '#';
                currentCount++;
            }
            
            attempts++;
        }
        
        console.log(`Black squares: ${currentCount}/${targetCount} (${Math.round(currentCount / (this.gridSize * this.gridSize) * 100)}%)`);
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
        this.placedWords = words; // Store the placed words for proper numbering
        
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
        // No more +1 since we removed axis labels
        crosswordElement.style.gridTemplateColumns = `repeat(${size}, ${this.cellSize}px)`;
        crosswordElement.style.gridTemplateRows = `repeat(${size}, ${this.cellSize}px)`;

        // Create grid content directly without axis labels
        for (let row = 0; row < size; row++) {
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
        const isAcrossStart = this.isWordStart(row, col, 'across');
        const isDownStart = this.isWordStart(row, col, 'down');
        
        // Only show number if this is actually the start of a placed word
        if (isAcrossStart || isDownStart) {
            // Check if this position matches a placed word start
            if (this.placedWords) {
                for (const word of this.placedWords) {
                    if (word.row === row && word.col === col) {
                        return true;
                    }
                }
            }
        }
        
        return false;
    }

    isWordStart(row, col, direction) {
        if (direction === 'across') {
            // Check if this is the start of a horizontal word
            // Must have at least 2 letters to be a valid word
            if (col === 0 || this.crossword[row][col - 1] === '#') {
                // Count how many letters follow this cell horizontally
                let letterCount = 0;
                for (let c = col; c < this.gridSize && this.crossword[row][c] !== '#' && this.crossword[row][c] !== ''; c++) {
                    letterCount++;
                }
                return letterCount >= 2; // Only count as word start if at least 2 letters
            }
            return false;
        } else {
            // Check if this is the start of a vertical word
            // Must have at least 2 letters to be a valid word
            if (row === 0 || this.crossword[row - 1][col] === '#') {
                // Count how many letters follow this cell vertically
                let letterCount = 0;
                for (let r = row; r < this.gridSize && this.crossword[r][col] !== '#' && this.crossword[r][col] !== ''; r++) {
                    letterCount++;
                }
                return letterCount >= 2; // Only count as word start if at least 2 letters
            }
            return false;
        }
    }

    getCellNumber(row, col) {
        // Try to find a placed word that starts at this position
        if (this.placedWords) {
            for (const word of this.placedWords) {
                if (word.row === row && word.col === col) {
                    return word.number || 1;
                }
            }
        }
        
        // Fallback: calculate sequential number
        let number = 1;
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
