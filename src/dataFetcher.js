// dataFetcher.js - Handle fetching raw match data
import fs from 'fs/promises';
import 'dotenv/config';

class DataFetcher {
    constructor(dataSource = 'api') {
        this.dataSource = dataSource;
    }

    async fetchMatchData(matchId) {
        switch (this.dataSource) {
            case 'file':
                return await this.fetchFromFile(matchId);
            case 'api':
                return await this.fetchFromAPI(matchId);
            default:
                throw new Error(`Unknown data source: ${this.dataSource}`);
        }
    }

    // Fetch from local JSON files
    async fetchFromFile(matchId) {
        try {
            const filePath = this.config.filePath || `./data/${matchId}.json`;
            const rawData = await fs.readFile(filePath, 'utf8');
            return JSON.parse(rawData);
        } catch (error) {
            throw new Error(`Failed to read match file for ${matchId}: ${error.message}`);
        }
    }

    // Fetch from API (you'll need to implement this based on your API)
    async fetchFromAPI(matchId) {
        try {
            const apiUrl = 'https://api.henrikdev.xyz';
            const apiKey = process.env.API_KEY; // Ensure you have an API key set in your .env file
            const region = 'na';
            
            const response = await fetch(`${apiUrl}/valorant/v4/match/${region}/${matchId}`, {
                headers: apiKey ? { 'Authorization': apiKey } : {}
            });
            
            if (!response.ok) {
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            throw new Error(`Failed to fetch match from API for ${matchId}: ${error.message}`);
        }
    }
}

export default DataFetcher;