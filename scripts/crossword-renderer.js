// Crossword rendering logic
class CrosswordRenderer {
    constructor(config) {
        this.config = config;
        this.gridSize = config.get('grid.size') || 15;
        this.cellSize = config.get('rendering.cellSize') || 45;
    }

    renderCrossword(crosswordData) {
        const { grid, words, size } = crosswordData;
        const container = document.getElementById('crossword-container');
        const cluesContainer = document.getElementById('clues-container');
        
        if (!container || !cluesContainer) {
            console.error('Required containers not found');
            return;
        }

        // Clear previous content
        container.innerHTML = '';
        cluesContainer.innerHTML = '';

        // Create crossword wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'crossword-wrapper';

        // Create grid labels
        if (this.config.get('rendering.showGridLabels')) {
            this.createGridLabels(wrapper, size);
        }

        // Create crossword grid
        const crosswordElement = this.createCrosswordGrid(grid, size);
        wrapper.appendChild(crosswordElement);

        // Create clues
        if (this.config.get('rendering.showClues')) {
            this.createClues(cluesContainer, words);
        }

        container.appendChild(wrapper);
    }

    createGridLabels(wrapper, size) {
        const labelsContainer = document.createElement('div');
        labelsContainer.className = 'grid-labels';

        // Row labels (A, B, C...)
        const rowLabels = document.createElement('div');
        rowLabels.className = 'row-labels';
        for (let i = 0; i < size; i++) {
            const label = document.createElement('div');
            label.className = 'grid-label';
            label.textContent = String.fromCharCode(65 + i); // A, B, C...
            rowLabels.appendChild(label);
        }

        // Column labels (1, 2, 3...)
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
        crosswordElement.style.gridTemplateColumns = `repeat(${size}, ${this.cellSize}px)`;
        crosswordElement.style.gridTemplateRows = `repeat(${size}, ${this.cellSize}px)`;

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
        // This is a simplified check - in practice, you'd want to track word starts
        return row === 0 || col === 0 || 
               (row > 0 && this.isWordStart(row, col, 'across')) ||
               (col > 0 && this.isWordStart(row, col, 'down'));
    }

    isWordStart(row, col, direction) {
        // Simplified check for word start
        // In practice, you'd want to check against the placed words array
        return true; // Placeholder
    }

    getCellNumber(row, col) {
        // Return a unique number for this cell
        // In practice, you'd want to track actual word numbers
        return row * 100 + col; // Placeholder
    }

    createClues(container, words) {
        if (!words || words.length === 0) return;

        // Separate across and down clues
        const acrossWords = words.filter(w => w.horizontal);
        const downWords = words.filter(w => !w.horizontal);

        // Across clues
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

        // Down clues
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
        text.textContent = this.generateClue(word.word);
        
        clueElement.appendChild(number);
        clueElement.appendChild(text);
        
        return clueElement;
    }

    generateClue(word) {
        // Simple clue generation - in practice, you'd want more sophisticated logic
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

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CrosswordRenderer;
}
