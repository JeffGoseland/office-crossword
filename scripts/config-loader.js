// Configuration loader for crossword settings with cookie support
class CrosswordConfig {
    constructor() {
        this.config = null;
        this.cookieName = 'crossword_preferences';
        this.cookieExpiryDays = 365; // Save preferences for 1 year
        this.defaultConfig = {
            grid: {
                size: 15,
                type: "daily",
                maxSize: 21,
                minSize: 15
            },
            blackSquares: {
                percentage: 18,
                maxPercentage: 20,
                minPercentage: 15,
                avoidCorners: true,
                avoid2x2Blocks: true
            },
            words: {
                minLength: 3,
                maxLength: 15,
                targetCount: 30,
                maxCount: 50,
                balanceAcrossDown: true,
                avoidObscureWords: true
            },
            symmetry: {
                enabled: true,
                type: "rotational",
                angle: 180
            },
            placement: {
                maxAttempts: 50,
                preferLongerWords: true,
                ensureConnectivity: true,
                fillEmptyCells: true,
                preventIsolatedLetters: true,
                gridDensity: "medium"
            },
            rendering: {
                cellSize: 45,
                showNumbers: true,
                showClues: true,
                showGridLabels: true,
                clueColumns: 2
            },
            difficulty: {
                level: "medium",
                allowRepeatedWords: false,
                maxThemeEntries: 5,
                minThemeEntries: 3
            },
            files: {
                wordListPath: "./data/sample.csv",
                fallbackWords: ["DESK", "CHAIR", "PHONE", "COMPUTER", "PRINTER", "PAPER", "PEN", "PENCIL"]
            }
        };
    }

    async loadConfig() {
        try {
            // First try to load from cookies
            const cookieConfig = this.loadFromCookies();
            if (cookieConfig) {
                this.config = { ...this.defaultConfig, ...cookieConfig };
                console.log('Configuration loaded from cookies');
                return this.config;
            }

            // Fallback to JSON file
            const response = await fetch('./config/crossword-config.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const jsonConfig = await response.json();
            this.config = { ...this.defaultConfig, ...jsonConfig };
            console.log('Configuration loaded from JSON file');
            return this.config;
        } catch (error) {
            console.warn('Failed to load configuration, using defaults:', error);
            this.config = { ...this.defaultConfig };
            return this.config;
        }
    }

    // Cookie management methods
    setCookie(name, value, days) {
        const expires = new Date();
        expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
        const cookieValue = encodeURIComponent(JSON.stringify(value));
        document.cookie = `${name}=${cookieValue};expires=${expires.toUTCString()};path=/`;
    }

    getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) {
                try {
                    return JSON.parse(decodeURIComponent(c.substring(nameEQ.length, c.length)));
                } catch (e) {
                    console.warn('Failed to parse cookie value:', e);
                    return null;
                }
            }
        }
        return null;
    }

    deleteCookie(name) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`;
    }

    loadFromCookies() {
        return this.getCookie(this.cookieName);
    }

    saveToCookies(config) {
        this.setCookie(this.cookieName, config, this.cookieExpiryDays);
        console.log('Configuration saved to cookies');
    }

    get(path) {
        if (!this.config) {
            return this.getDefault(path);
        }
        
        const keys = path.split('.');
        let value = this.config;
        
        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return this.getDefault(path);
            }
        }
        
        return value;
    }

    getDefault(path) {
        const keys = path.split('.');
        let value = this.defaultConfig;
        
        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return undefined;
            }
        }
        
        return value;
    }

    // Convenience methods for commonly used settings
    getGridSize() {
        return this.get('grid.size');
    }

    getBlackSquarePercentage() {
        return this.get('blackSquares.percentage');
    }

    getMinWordLength() {
        return this.get('words.minLength');
    }

    getMaxWordLength() {
        return this.get('words.maxLength');
    }

    getTargetWordCount() {
        return this.get('words.targetCount');
    }

    getCellSize() {
        return this.get('rendering.cellSize');
    }

    getMaxAttempts() {
        return this.get('placement.maxAttempts');
    }

    isSymmetryEnabled() {
        return this.get('symmetry.enabled');
    }

    getWordListPath() {
        return this.get('files.wordListPath');
    }

    getFallbackWords() {
        return this.get('files.fallbackWords');
    }

    // Method to update configuration at runtime and save to cookies
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.saveToCookies(this.config);
        console.log('Configuration updated and saved to cookies:', this.config);
    }

    // Method to reset to defaults and clear cookies
    resetToDefaults() {
        this.config = { ...this.defaultConfig };
        this.deleteCookie(this.cookieName);
        console.log('Configuration reset to defaults and cookies cleared');
    }

    // Method to export current config
    exportConfig() {
        return JSON.stringify(this.config, null, 2);
    }

    // Method to import config from string
    importConfig(configString) {
        try {
            const importedConfig = JSON.parse(configString);
            this.config = { ...this.defaultConfig, ...importedConfig };
            this.saveToCookies(this.config);
            console.log('Configuration imported and saved to cookies');
            return true;
        } catch (error) {
            console.error('Failed to import configuration:', error);
            return false;
        }
    }

    // Method to check if config was loaded from cookies
    isFromCookies() {
        return this.loadFromCookies() !== null;
    }

    // Method to get config source info
    getConfigSource() {
        if (this.loadFromCookies()) {
            return 'cookies';
        } else if (this.config && this.config !== this.defaultConfig) {
            return 'json_file';
        } else {
            return 'defaults';
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CrosswordConfig;
}
