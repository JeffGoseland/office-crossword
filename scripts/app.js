// Main application logic
class CrosswordApp {
    constructor() {
        this.config = null;
        this.generator = null;
        this.renderer = null;
        this.isInitialized = false;
    }

    async initialize() {
        try {
            // Load configuration
            this.config = new CrosswordConfig();
            await this.config.loadConfig();
            
            // Initialize generator and renderer
            this.generator = new CrosswordGenerator(this.config);
            this.renderer = new CrosswordRenderer(this.config);
            
            this.isInitialized = true;
            console.log('Crossword app initialized successfully');
            
            // Generate initial crossword
            await this.generateCrossword();
            
        } catch (error) {
            console.error('Failed to initialize crossword app:', error);
            this.showError('Failed to initialize application');
        }
    }

    async generateCrossword() {
        if (!this.isInitialized) {
            console.error('App not initialized');
            return;
        }

        try {
            this.renderer.showLoading();
            
            // Generate new crossword
            const crosswordData = await this.generator.generateCrossword();
            
            // Render the crossword
            this.renderer.renderCrossword(crosswordData);
            
            this.renderer.hideLoading();
            
        } catch (error) {
            console.error('Failed to generate crossword:', error);
            this.renderer.hideLoading();
            this.showError('Failed to generate crossword');
        }
    }

    showError(message) {
        const container = document.getElementById('crossword-container');
        if (container) {
            container.innerHTML = `<div class="error">${message}</div>`;
        }
    }

    // Public method for button click
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

// Global function for button click (called from HTML)
async function generateCrossword() {
    if (crosswordApp) {
        await crosswordApp.handleGenerateClick();
    } else {
        console.error('Crossword app not initialized');
    }
}
