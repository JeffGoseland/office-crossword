// Configuration instance
let config = null;

// Word list will be loaded from CSV file
let words = [];
let crossword = [];
let placedWords = [];
let gridSize = 0;
let blackSquareCount = 0;
let maxBlackSquares = 0;

// Load configuration and initialize
async function initializeCrossword() {
    // Load configuration first
    config = new CrosswordConfig();
    await config.loadConfig();
    
    // Set grid size from config
    gridSize = config.getGridSize();
    
    // Adjust black square percentage based on grid density
    let blackSquarePercentage = config.getBlackSquarePercentage();
    const density = config.get('placement.gridDensity');
    
    if (density === 'low') {
        blackSquarePercentage = Math.min(blackSquarePercentage + 5, config.get('blackSquares.maxPercentage'));
    } else if (density === 'high') {
        blackSquarePercentage = Math.max(blackSquarePercentage - 5, config.get('blackSquares.minPercentage'));
    }
    
    maxBlackSquares = Math.floor((gridSize * gridSize) * (blackSquarePercentage / 100));
    
    // Now load words
    await loadWordsFromCSV();
}

// Load words from CSV file
async function loadWordsFromCSV() {
    try {
        const wordListPath = config.getWordListPath();
        const response = await fetch(wordListPath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const csvText = await response.text();
        
        // Parse CSV - split by lines and skip header
        const lines = csvText.split('\n');
        words = lines.slice(1) // Skip header row
            .map(line => line.trim())
            .filter(line => line.length > 0) // Remove empty lines
            .filter(word => word.length >= config.getMinWordLength()) // Rule 3: Words must be ≥3 letters
            .filter(word => word.length <= config.getMaxWordLength()) // Respect max word length
            .map(word => word.toUpperCase()); // Convert to uppercase
        
        console.log(`Loaded ${words.length} words from CSV (${config.getMinWordLength()}-${config.getMaxWordLength()} letters)`);
        
            // Hide loading indicator
    document.getElementById('loading-indicator').style.display = 'none';
    
    // Generate initial crossword after loading words
    generateCrossword();
    } catch (error) {
        console.error('Error loading words from CSV:', error);
        // Fallback to fallback words if CSV loading fails
        words = config.getFallbackWords();
        generateCrossword();
    }
}

function generateCrossword() {
    // Check if words are loaded
    if (words.length === 0) {
        console.log('Words not yet loaded, waiting...');
        return;
    }
    
    // Clear previous crossword
    document.getElementById('crossword-container').innerHTML = '';
    document.getElementById('clues-container').innerHTML = '';
    
    // Reset variables
    crossword = [];
    placedWords = [];
    blackSquareCount = 0;
    
    // Initialize grid with rotational symmetry
    initializeGrid();
    
    // Place black squares with rotational symmetry
    placeBlackSquares();
    
    // Filter words for better placement (longer words first)
    const filteredWords = words
        .filter(word => word.length >= config.getMinWordLength() && word.length <= config.getMaxWordLength())
        .sort((a, b) => config.get('placement.preferLongerWords') ? b.length - a.length : a.length - b.length);
    
    // Select words for this puzzle (aim for balanced across/down)
    const selectedWords = selectWordsForPuzzle(filteredWords);
    
    // Place words with rotational symmetry
    placeWordsWithSymmetry(selectedWords);
    
    // Ensure grid connectivity
    if (config.get('placement.ensureConnectivity')) {
        ensureGridConnectivity();
    }
    
    // Render crossword
    renderCrossword();
    renderClues();
}

function initializeGrid() {
    crossword = [];
    for (let i = 0; i < gridSize; i++) {
        crossword[i] = [];
        for (let j = 0; j < gridSize; j++) {
            crossword[i][j] = '';
        }
    }
}

function placeBlackSquares() {
    // Rule 1: 180° rotational symmetry
    // Rule 7: Black squares = ~15–20% of grid
    
    if (!config.isSymmetryEnabled()) {
        return;
    }
    
    // Place black squares in center area first (for symmetry)
    const center = Math.floor(gridSize / 2);
    
    // Place some black squares in the center for rotational symmetry
    if (gridSize % 2 === 1) { // Odd grid size
        // Center cell can be black
        if (blackSquareCount < maxBlackSquares) {
            crossword[center][center] = '#';
            blackSquareCount++;
        }
    }
    
    // Place black squares with rotational symmetry
    for (let i = 0; i < center && blackSquareCount < maxBlackSquares; i++) {
        for (let j = 0; j < center && blackSquareCount < maxBlackSquares; j++) {
            // Randomly place black squares with probability based on config
            if (Math.random() < 0.3 && blackSquareCount < maxBlackSquares) {
                // Place in all four quadrants for symmetry
                const positions = [
                    [i, j], [i, gridSize - 1 - j], 
                    [gridSize - 1 - i, j], [gridSize - 1 - i, gridSize - 1 - j]
                ];
                
                positions.forEach(([row, col]) => {
                    if (blackSquareCount < maxBlackSquares && 
                        crossword[row][col] === '' && 
                        isValidBlackSquarePlacement(row, col)) {
                        crossword[row][col] = '#';
                        blackSquareCount++;
                    }
                });
            }
        }
    }
}

function isValidBlackSquarePlacement(row, col) {
    // Check if placing a black square here would create isolated sections
    // or violate other crossword rules
    
    // Don't place black squares in corners if configured
    if (config.get('blackSquares.avoidCorners')) {
        if ((row === 0 && col === 0) || 
            (row === 0 && col === gridSize - 1) ||
            (row === gridSize - 1 && col === 0) ||
            (row === gridSize - 1 && col === gridSize - 1)) {
            return false;
        }
    }
    
    // Don't place black squares that would create 2x2 blocks if configured
    if (config.get('blackSquares.avoid2x2Blocks') && row > 0 && col > 0) {
        if (crossword[row-1][col] === '#' && 
            crossword[row][col-1] === '#' && 
            crossword[row-1][col-1] === '#') {
            return false;
        }
    }
    
    return true;
}

function selectWordsForPuzzle(filteredWords) {
    // Rule 5: Balance across and down entries
    // Rule 14: Avoid obscure "crosswordese" fill
    
    const selectedWords = [];
    const targetWordCount = config.getTargetWordCount();
    
    // Select a mix of longer and shorter words
    const longWords = filteredWords.filter(w => w.length >= 6).slice(0, 10);
    const mediumWords = filteredWords.filter(w => w.length >= 4 && w.length <= 5).slice(0, 15);
    const shortWords = filteredWords.filter(w => w.length === 3).slice(0, 10);
    
    selectedWords.push(...longWords, ...mediumWords, ...shortWords);
    
    // Shuffle and limit to target count
    return selectedWords
        .sort(() => Math.random() - 0.5)
        .slice(0, targetWordCount);
}

function placeWordsWithSymmetry(selectedWords) {
    // Rule 1: 180° rotational symmetry
    // Rule 6: Every letter should cross (limit unchecked letters)
    
    if (!config.isSymmetryEnabled()) {
        // Place words without symmetry
        const localPlacedWords = [];
        for (const word of selectedWords) {
            if (localPlacedWords.length >= config.getTargetWordCount()) break;
            const placed = placeWordWithoutSymmetry(word);
            if (placed) {
                localPlacedWords.push(placed);
            }
        }
        placedWords = localPlacedWords;
        return;
    }
    
    const localPlacedWords = [];
    
    // Start with a central word to establish the grid structure
    const centralWord = selectedWords.find(w => w.length >= 5) || selectedWords[0];
    if (centralWord) {
        const center = Math.floor(gridSize / 2);
        const wordLength = centralWord.length;
        const startCol = center - Math.floor(wordLength / 2);
        
        if (startCol >= 0 && startCol + wordLength <= gridSize) {
            // Place central word horizontally
            for (let i = 0; i < centralWord.length; i++) {
                crossword[center][startCol + i] = centralWord[i];
            }
            
            localPlacedWords.push({
                word: centralWord,
                row: center,
                col: startCol,
                horizontal: true,
                number: 1
            });
            
            // Place rotational counterpart
            const symRow = gridSize - 1 - center;
            const symCol = gridSize - 1 - startCol - wordLength + 1;
            if (symCol >= 0 && symCol + wordLength <= gridSize) {
                for (let i = 0; i < centralWord.length; i++) {
                    crossword[symRow][symCol + i] = centralWord[i];
                }
            }
        }
    }
    
    // Now place other words strategically
    const remainingWords = selectedWords.filter(w => w !== centralWord);
    
    // Sort words by length (longer first) for better placement
    remainingWords.sort((a, b) => b.length - a.length);
    
    for (const word of remainingWords) {
        if (localPlacedWords.length >= config.getTargetWordCount()) break;
        
        // Try to place word with its rotational counterpart
        const placed = placeWordWithSymmetry(word);
        if (placed) {
            localPlacedWords.push(placed);
        }
    }
    
    placedWords = localPlacedWords;
}

function placeWordWithoutSymmetry(word) {
    const maxAttempts = config.getMaxAttempts();
    let attempts = 0;
    
    while (attempts < maxAttempts) {
        attempts++;
        
        // Randomly choose horizontal or vertical placement
        const isHorizontal = Math.random() > 0.5;
        
        if (isHorizontal) {
            const result = tryPlaceHorizontal(word, false);
            if (result) return result;
        } else {
            const result = tryPlaceVertical(word, false);
            if (result) return result;
        }
    }
    
    return null;
}

function placeWordWithSymmetry(word) {
    const maxAttempts = config.getMaxAttempts();
    let attempts = 0;
    
    while (attempts < maxAttempts) {
        attempts++;
        
        // Randomly choose horizontal or vertical placement
        const isHorizontal = Math.random() > 0.5;
        
        if (isHorizontal) {
            const result = tryPlaceHorizontalWithSymmetry(word);
            if (result) return result;
        } else {
            const result = tryPlaceVerticalWithSymmetry(word);
            if (result) return result;
        }
    }
    
    return null;
}

function tryPlaceHorizontal(word, withSymmetry = true) {
    const wordLength = word.length;
    
    for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col <= gridSize - wordLength; col++) {
            if (canPlaceWord(word, row, col, true)) {
                placeWordInGrid(word, row, col, true);
                
                return {
                    word: word,
                    row: row,
                    col: col,
                    horizontal: true,
                    number: placedWords.length + 1
                };
            }
        }
    }
    return null;
}

function tryPlaceVertical(word, withSymmetry = true) {
    const wordLength = word.length;
    
    for (let row = 0; row <= gridSize - wordLength; row++) {
        for (let col = 0; col < gridSize; col++) {
            if (canPlaceWord(word, row, col, false)) {
                placeWordInGrid(word, row, col, false);
                
                return {
                    word: word,
                    row: row,
                    col: col,
                    horizontal: false,
                    number: placedWords.length + 1
                };
            }
        }
    }
    return null;
}

function tryPlaceHorizontalWithSymmetry(word) {
    const wordLength = word.length;
    
    for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col <= gridSize - wordLength; col++) {
            if (canPlaceWordWithSymmetry(word, row, col, true)) {
                placeWordInGrid(word, row, col, true);
                
                // Place rotational counterpart
                const symRow = gridSize - 1 - row;
                const symCol = gridSize - 1 - col - wordLength + 1;
                if (canPlaceWordWithSymmetry(word, symRow, symCol, true)) {
                    placeWordInGrid(word, symRow, symCol, true);
                }
                
                return {
                    word: word,
                    row: row,
                    col: col,
                    horizontal: true,
                    number: placedWords.length + 1
                };
            }
        }
    }
    return null;
}

function tryPlaceVerticalWithSymmetry(word) {
    const wordLength = word.length;
    
    for (let row = 0; row <= gridSize - wordLength; row++) {
        for (let col = 0; col < gridSize; col++) {
            if (canPlaceWordWithSymmetry(word, row, col, false)) {
                placeWordInGrid(word, row, col, false);
                
                // Place rotational counterpart
                const symRow = gridSize - 1 - row - wordLength + 1;
                const symCol = gridSize - 1 - col;
                if (canPlaceWordWithSymmetry(word, symRow, symCol, false)) {
                    placeWordInGrid(word, symRow, symCol, false);
                }
                
                return {
                    word: word,
                    row: row,
                    col: col,
                    horizontal: false,
                    number: placedWords.length + 1
                };
            }
        }
    }
    return null;
}

function canPlaceWord(word, row, col, horizontal) {
    const wordLength = word.length;
    
    // Check if word fits within grid
    if (horizontal && col + wordLength > gridSize) return false;
    if (!horizontal && row + wordLength > gridSize) return false;
    
    // Check if placement conflicts with existing words or black squares
    for (let i = 0; i < wordLength; i++) {
        const currentRow = horizontal ? row : row + i;
        const currentCol = horizontal ? col + i : col;
        
        if (crossword[currentRow][currentCol] === '#') return false;
        if (crossword[currentRow][currentCol] !== '' && 
            crossword[currentRow][currentCol] !== word[i]) {
            return false;
        }
    }
    
    // Check if this placement would create isolated single letters
    if (config.get('placement.preventIsolatedLetters') && !wouldCreateIsolatedLetters(word, row, col, horizontal)) {
        return false;
    }
    
    return true;
}

function canPlaceWordWithSymmetry(word, row, col, horizontal) {
    const wordLength = word.length;
    
    // Check if word fits within grid
    if (horizontal && col + wordLength > gridSize) return false;
    if (!horizontal && row + wordLength > gridSize) return false;
    
    // Check if placement conflicts with existing words or black squares
    for (let i = 0; i < wordLength; i++) {
        const currentRow = horizontal ? row : row + i;
        const currentCol = horizontal ? col + i : col;
        
        if (crossword[currentRow][currentCol] === '#') return false;
        if (crossword[currentRow][currentCol] !== '' && 
            crossword[currentRow][currentCol] !== word[i]) {
            return false;
        }
    }
    
    // Check if this placement would create isolated single letters
    if (config.get('placement.preventIsolatedLetters') && !wouldCreateIsolatedLetters(word, row, col, horizontal)) {
        return false;
    }
    
    return true;
}

function wouldCreateIsolatedLetters(word, row, col, horizontal) {
    const wordLength = word.length;
    
    // Check if placing this word would create isolated single letters
    for (let i = 0; i < wordLength; i++) {
        const currentRow = horizontal ? row : row + i;
        const currentCol = horizontal ? col + i : col;
        
        // Check if this cell would be isolated after placement
        if (crossword[currentRow][currentCol] === '') {
            let hasNeighbor = false;
            
            // Check all four directions for neighbors
            const directions = [
                [-1, 0], [1, 0], [0, -1], [0, 1] // up, down, left, right
            ];
            
            for (const [dr, dc] of directions) {
                const newRow = currentRow + dr;
                const newCol = currentCol + dc;
                
                if (newRow >= 0 && newRow < gridSize && 
                    newCol >= 0 && newCol < gridSize && 
                    crossword[newRow][newCol] !== '' && 
                    crossword[newRow][newCol] !== '#') {
                    hasNeighbor = true;
                    break;
                }
            }
            
            // If this cell would be isolated and it's not part of a word, it's a problem
            if (!hasNeighbor && i === 0 && i === wordLength - 1) {
                return false;
            }
        }
    }
    
    return true;
}

function placeWordInGrid(word, row, col, horizontal) {
    for (let i = 0; i < word.length; i++) {
        const currentRow = horizontal ? row : row + i;
        const currentCol = horizontal ? col + i : col;
        crossword[currentRow][currentCol] = word[i];
    }
}

function ensureGridConnectivity() {
    // Rule 4: Keep entire grid connected, no isolated sections
    // This is a simplified version - in practice, more sophisticated algorithms are used
    
    if (!config.get('placement.fillEmptyCells')) {
        return;
    }
    
    // First, identify isolated areas and connect them
    connectIsolatedAreas();
    
    // Then fill remaining empty cells with random letters to ensure connectivity
    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            if (crossword[i][j] === '') {
                // Place a random letter to maintain connectivity
                const randomLetter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
                crossword[i][j] = randomLetter;
            }
        }
    }
}

function connectIsolatedAreas() {
    // Find isolated areas and try to connect them with short words
    const isolatedAreas = findIsolatedAreas();
    
    if (isolatedAreas.length > 1) {
        // Try to connect isolated areas with bridges
        for (let i = 0; i < isolatedAreas.length - 1; i++) {
            const area1 = isolatedAreas[i];
            const area2 = isolatedAreas[i + 1];
            
            // Try to place a short word to connect these areas
            const bridgeWord = findBridgeWord(area1, area2);
            if (bridgeWord) {
                placeBridgeWord(bridgeWord, area1, area2);
            }
        }
    }
}

function findIsolatedAreas() {
    const visited = Array(gridSize).fill().map(() => Array(gridSize).fill(false));
    const areas = [];
    
    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            if (!visited[i][j] && crossword[i][j] !== '' && crossword[i][j] !== '#') {
                const area = [];
                floodFill(i, j, visited, area);
                if (area.length > 0) {
                    areas.push(area);
                }
            }
        }
    }
    
    return areas;
}

function floodFill(row, col, visited, area) {
    if (row < 0 || row >= gridSize || col < 0 || col >= gridSize || 
        visited[row][col] || crossword[row][col] === '' || crossword[row][col] === '#') {
        return;
    }
    
    visited[row][col] = true;
    area.push([row, col]);
    
    // Check all four directions
    floodFill(row - 1, col, visited, area);
    floodFill(row + 1, col, visited, area);
    floodFill(row, col - 1, visited, area);
    floodFill(row, col + 1, visited, area);
}

function findBridgeWord(area1, area2) {
    // Simple approach: try to find a 3-letter word that could connect the areas
    const shortWords = ['THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'MAN', 'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'ITS', 'LET', 'PUT', 'SAY', 'SHE', 'TOO', 'USE'];
    
    // Try to find a word that could bridge the gap
    for (const word of shortWords) {
        if (canBridgeAreas(word, area1, area2)) {
            return word;
        }
    }
    
    return null;
}

function canBridgeAreas(word, area1, area2) {
    // Check if this word could be placed to connect the two areas
    // This is a simplified check - in practice, more sophisticated logic would be needed
    return true; // Placeholder
}

function placeBridgeWord(word, area1, area2) {
    // Place the bridge word to connect the areas
    // This is a simplified implementation
    // In practice, you'd need more sophisticated logic to find the best placement
}

function renderCrossword() {
    const container = document.getElementById('crossword-container');
    
    // Create wrapper for crossword and labels
    const wrapper = document.createElement('div');
    wrapper.className = 'crossword-wrapper';
    
    const crosswordContainer = document.createElement('div');
    crosswordContainer.className = 'crossword-container';
    
    const crosswordDiv = document.createElement('div');
    crosswordDiv.className = 'crossword';
    
    // Use grid size from config (with fallback to 45px for better spacing)
    const cellSize = config.getCellSize() || 45;
    crosswordDiv.style.gridTemplateColumns = `repeat(${gridSize}, ${cellSize}px)`;
    crosswordDiv.style.gridTemplateRows = `repeat(${gridSize}, ${cellSize}px)`;
    
    // Create row labels (left side) if enabled
    if (config.get('rendering.showGridLabels')) {
        for (let row = 0; row < gridSize; row++) {
            const rowLabel = document.createElement('div');
            rowLabel.className = 'grid-labels row-labels';
            rowLabel.style.top = `${40 + (row * cellSize)}px`; // 40px is crossword padding
            rowLabel.textContent = row + 1;
            crosswordContainer.appendChild(rowLabel);
        }
        
        // Create column labels (top side)
        for (let col = 0; col < gridSize; col++) {
            const colLabel = document.createElement('div');
            colLabel.className = 'grid-labels column-labels';
            colLabel.style.left = `${40 + (col * cellSize)}px`; // 40px is crossword padding
            colLabel.textContent = String.fromCharCode(65 + col); // A, B, C, etc.
            crosswordContainer.appendChild(colLabel);
        }
    }
    
    // Render all cells in the grid
    for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
            const cellContainer = document.createElement('div');
            cellContainer.className = 'cell-container';
            
            const cell = document.createElement('div');
            cell.className = 'cell';
            
            if (crossword[row][col] === '#') {
                cell.classList.add('black');
            } else if (crossword[row][col] === '') {
                cell.classList.add('black');
            } else {
                cell.textContent = crossword[row][col];
                
                // Add number if this is the start of a word and numbers are enabled
                if (config.get('rendering.showNumbers')) {
                    const wordStart = placedWords.find(w => 
                        (w.horizontal && w.row === row && w.col === col) ||
                        (!w.horizontal && w.row === row && w.col === col)
                    );
                    
                    if (wordStart) {
                        const number = document.createElement('div');
                        number.className = 'number';
                        number.textContent = wordStart.number;
                        cellContainer.appendChild(number);
                    }
                }
            }
            
            cellContainer.appendChild(cell);
            crosswordDiv.appendChild(cellContainer);
        }
    }
    
    crosswordContainer.appendChild(crosswordDiv);
    wrapper.appendChild(crosswordContainer);
    container.appendChild(wrapper);
}

function renderClues() {
    if (!config.get('rendering.showClues')) {
        return;
    }
    
    const container = document.getElementById('clues-container');
    
    const acrossDiv = document.createElement('div');
    acrossDiv.className = 'clue-section';
    acrossDiv.innerHTML = '<h3>Across</h3>';
    
    const downDiv = document.createElement('div');
    downDiv.className = 'clue-section';
    downDiv.innerHTML = '<h3>Down</h3>';
    
    placedWords.forEach(wordInfo => {
        const clueDiv = document.createElement('div');
        clueDiv.className = 'clue';
        clueDiv.innerHTML = `<span class="clue-number">${wordInfo.number}.</span>${wordInfo.word}`;
        
        if (wordInfo.horizontal) {
            acrossDiv.appendChild(clueDiv);
        } else {
            downDiv.appendChild(clueDiv);
        }
    });
    
    container.appendChild(acrossDiv);
    container.appendChild(downDiv);
}

// Initialize when page loads
window.onload = function() {
    initializeCrossword();
};
