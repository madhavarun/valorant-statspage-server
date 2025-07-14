// playerStatsUpdater.js - Handle all player statistics processing
class PlayerStatsUpdater {
    constructor(db) {
        this.db = db;
    }

    /**
     * Update all players from a match
     * @param {Object} matchData - The detailed match data
     * @param {string} seasonId - Current season ID
     */
    async updatePlayersFromMatch(matchData, seasonId) {
        console.log('Processing player data from match...');
        
        // Extract all players from both teams
        const allPlayers = [];
        matchData.teams.forEach(team => {
            team.players.forEach(player => {
                allPlayers.push({
                    ...player,
                    won: team.won
                });
            });
        });

        // Process each player
        for (const playerMatchData of allPlayers) {
            await this.updatePlayerStats(playerMatchData, seasonId);
        }
    }

    /**
     * Update individual player statistics
     * @param {Object} playerMatchData - Player data from the match
     * @param {string} seasonId - Current season ID
     */
    async updatePlayerStats(playerMatchData, seasonId) {
        const { puuid, name, agent, won } = playerMatchData;
        
        // Get existing player data
        const existingPlayer = await this.db.getPlayer(puuid);
        
        if (existingPlayer) {
            // Update existing player
            const updatedPlayer = this.calculateUpdatedStats(existingPlayer, playerMatchData, seasonId);
            await this.db.updatePlayer(puuid, updatedPlayer);
        } else {
            // Create new player
            const newPlayer = this.createNewPlayer(playerMatchData, seasonId);
            await this.db.insertPlayer(newPlayer);
        }
    }

    /**
     * Calculate updated statistics for existing player
     */
    calculateUpdatedStats(existingPlayer, playerMatchData, seasonId) {
        const { agent, won } = playerMatchData;
        
        // Deep clone to avoid mutation
        const updatedPlayer = JSON.parse(JSON.stringify(existingPlayer));
        updatedPlayer.current_name = playerMatchData.name;
        updatedPlayer.last_updated = new Date();

        // Update overall stats
        this.updateStatsSection(updatedPlayer.overall_stats, playerMatchData, won);
        this.updateAgentStats(updatedPlayer.overall_stats.agents, agent, playerMatchData, won);

        // Update season stats
        if (!updatedPlayer.seasons[seasonId]) {
            updatedPlayer.seasons[seasonId] = this.createEmptyStatsSection();
        }
        this.updateStatsSection(updatedPlayer.seasons[seasonId], playerMatchData, won);
        this.updateAgentStats(updatedPlayer.seasons[seasonId].agents, agent, playerMatchData, won);

        return updatedPlayer;
    }

    /**
     * Create new player object
     */
    createNewPlayer(playerMatchData, seasonId) {
        const { puuid, name, agent, won } = playerMatchData;
        
        const newPlayer = {
            _id: puuid,
            current_name: name,
            overall_stats: this.createEmptyStatsSection(),
            seasons: {
                [seasonId]: this.createEmptyStatsSection()
            },
            last_updated: new Date()
        };

        // Add first match data
        this.updateStatsSection(newPlayer.overall_stats, playerMatchData, won);
        this.updateAgentStats(newPlayer.overall_stats.agents, agent, playerMatchData, won);
        this.updateStatsSection(newPlayer.seasons[seasonId], playerMatchData, won);
        this.updateAgentStats(newPlayer.seasons[seasonId].agents, agent, playerMatchData, won);

        return newPlayer;
    }

    /**
     * Create empty stats section structure
     */
    createEmptyStatsSection() {
        return {
            // Game tracking
            games: { won: 0, lost: 0, percentage: 0 },
            rounds: { won: 0, lost: 0, percentage: 0 },
            
            // Totaled stats
            total_kills: 0,
            total_deaths: 0,
            total_assists: 0,
            total_kda_diff: 0,
            total_first_bloods: 0,
            total_first_deaths: 0,
            total_fkfd_diff: 0,
            total_trades: 0,
            total_traded: 0,
            total_attack_rounds: 0,
            total_defense_rounds: 0,
            
            // Averaged stats
            avg_acs: 0,
            avg_hs_percentage: 0,
            avg_damage_delta: 0,
            avg_kast: 0,
            avg_adr: 0,
            
            // Agent breakdown
            agents: {}
        };
    }

    /**
     * Update a stats section with new match data
     */
    updateStatsSection(statsSection, playerMatchData, won) {
        const { 
            acs, kills, deaths, assists, kda_diff, kast, hs_percentage,
            first_bloods, first_deaths, fkfd_diff, trades, traded,
            adr, damage_delta, attack_rounds, defense_rounds,
            rounds_won, rounds_lost
        } = playerMatchData;

        // Update game counts
        const previousGames = statsSection.games.won + statsSection.games.lost;
        const newGames = previousGames + 1;
        
        if (won) {
            statsSection.games.won++;
        } else {
            statsSection.games.lost++;
        }
        statsSection.games.percentage = (statsSection.games.won / newGames) * 100;

        // Update round counts
        statsSection.rounds.won += rounds_won;
        statsSection.rounds.lost += rounds_lost;
        const totalRounds = statsSection.rounds.won + statsSection.rounds.lost;
        statsSection.rounds.percentage = (statsSection.rounds.won / totalRounds) * 100;

        // Update totaled stats
        statsSection.total_kills += kills;
        statsSection.total_deaths += deaths;
        statsSection.total_assists += assists;
        statsSection.total_kda_diff += kda_diff;
        statsSection.total_first_bloods += first_bloods;
        statsSection.total_first_deaths += first_deaths;
        statsSection.total_fkfd_diff += fkfd_diff;
        statsSection.total_trades += trades;
        statsSection.total_traded += traded;
        statsSection.total_attack_rounds += attack_rounds;
        statsSection.total_defense_rounds += defense_rounds;

        // Update averaged stats using running average formula
        statsSection.avg_acs = this.calculateRunningAverage(statsSection.avg_acs, acs, previousGames, newGames);
        statsSection.avg_hs_percentage = this.calculateRunningAverage(statsSection.avg_hs_percentage, hs_percentage, previousGames, newGames);
        statsSection.avg_damage_delta = this.calculateRunningAverage(statsSection.avg_damage_delta, damage_delta, previousGames, newGames);
        statsSection.avg_kast = this.calculateRunningAverage(statsSection.avg_kast, kast, previousGames, newGames);
        statsSection.avg_adr = this.calculateRunningAverage(statsSection.avg_adr, adr, previousGames, newGames);
    }

    /**
     * Update agent-specific stats
     */
    updateAgentStats(agentsSection, agent, playerMatchData, won) {
        if (!agentsSection[agent]) {
            agentsSection[agent] = this.createEmptyStatsSection();
        }
        
        this.updateStatsSection(agentsSection[agent], playerMatchData, won);
    }

    /**
     * Calculate running average: (old_avg * old_count + new_value) / new_count
     */
    calculateRunningAverage(oldAverage, newValue, oldCount, newCount) {
        if (oldCount === 0) return newValue;
        return ((oldAverage * oldCount) + newValue) / newCount;
    }

    /**
     * Remove player data when a match is deleted
     */
    async removePlayersFromMatch(matchData, seasonId) {
        console.log('Removing player data from match...');
        
        const allPlayers = [];
        matchData.teams.forEach(team => {
            team.players.forEach(player => {
                allPlayers.push({
                    ...player,
                    won: team.won
                });
            });
        });

        for (const playerMatchData of allPlayers) {
            await this.removePlayerStats(playerMatchData, seasonId);
        }
    }

    /**
     * Remove individual player statistics (reverse of update)
     */
    async removePlayerStats(playerMatchData, seasonId) {
        const { puuid, agent, won } = playerMatchData;
        
        const existingPlayer = await this.db.getPlayer(puuid);
        if (!existingPlayer) {
            console.log(`Player ${puuid} not found for removal`);
            return;
        }

        const updatedPlayer = this.calculateRemovedStats(existingPlayer, playerMatchData, seasonId);
        await this.db.updatePlayer(puuid, updatedPlayer);
    }

    /**
     * Calculate statistics after removing a match
     */
    calculateRemovedStats(existingPlayer, playerMatchData, seasonId) {
        const { agent, won } = playerMatchData;
        
        const updatedPlayer = JSON.parse(JSON.stringify(existingPlayer));
        updatedPlayer.last_updated = new Date();

        // Remove from overall stats
        this.removeStatsSection(updatedPlayer.overall_stats, playerMatchData, won);
        this.removeAgentStats(updatedPlayer.overall_stats.agents, agent, playerMatchData, won);

        // Remove from season stats
        if (updatedPlayer.seasons[seasonId]) {
            this.removeStatsSection(updatedPlayer.seasons[seasonId], playerMatchData, won);
            this.removeAgentStats(updatedPlayer.seasons[seasonId].agents, agent, playerMatchData, won);
        }

        return updatedPlayer;
    }

    /**
     * Remove stats from a section (reverse of updateStatsSection)
     */
    removeStatsSection(statsSection, playerMatchData, won) {
        const { 
            acs, kills, deaths, assists, kda_diff, kast, hs_percentage,
            first_bloods, first_deaths, fkfd_diff, trades, traded,
            adr, damage_delta, attack_rounds, defense_rounds,
            rounds_won, rounds_lost
        } = playerMatchData;

        // Update game counts
        const previousGames = statsSection.games.won + statsSection.games.lost;
        const newGames = previousGames - 1;
        
        if (won) {
            statsSection.games.won--;
        } else {
            statsSection.games.lost--;
        }
        statsSection.games.percentage = newGames > 0 ? (statsSection.games.won / newGames) * 100 : 0;

        // Update round counts
        statsSection.rounds.won -= rounds_won;
        statsSection.rounds.lost -= rounds_lost;
        const totalRounds = statsSection.rounds.won + statsSection.rounds.lost;
        statsSection.rounds.percentage = totalRounds > 0 ? (statsSection.rounds.won / totalRounds) * 100 : 0;

        // Update totaled stats
        statsSection.total_kills -= kills;
        statsSection.total_deaths -= deaths;
        statsSection.total_assists -= assists;
        statsSection.total_kda_diff -= kda_diff;
        statsSection.total_first_bloods -= first_bloods;
        statsSection.total_first_deaths -= first_deaths;
        statsSection.total_fkfd_diff -= fkfd_diff;
        statsSection.total_trades -= trades;
        statsSection.total_traded -= traded;
        statsSection.total_attack_rounds -= attack_rounds;
        statsSection.total_defense_rounds -= defense_rounds;

        // Update averaged stats using reverse running average
        if (newGames > 0) {
            statsSection.avg_acs = this.calculateReverseRunningAverage(statsSection.avg_acs, acs, previousGames, newGames);
            statsSection.avg_hs_percentage = this.calculateReverseRunningAverage(statsSection.avg_hs_percentage, hs_percentage, previousGames, newGames);
            statsSection.avg_damage_delta = this.calculateReverseRunningAverage(statsSection.avg_damage_delta, damage_delta, previousGames, newGames);
            statsSection.avg_kast = this.calculateReverseRunningAverage(statsSection.avg_kast, kast, previousGames, newGames);
            statsSection.avg_adr = this.calculateReverseRunningAverage(statsSection.avg_adr, adr, previousGames, newGames);
        } else {
            // Reset averages if no games left
            statsSection.avg_acs = 0;
            statsSection.avg_hs_percentage = 0;
            statsSection.avg_kast = 0;
            statsSection.avg_adr = 0;
        }
    }

    /**
     * Remove agent-specific stats
     */
    removeAgentStats(agentsSection, agent, playerMatchData, won) {
        if (agentsSection[agent]) {
            this.removeStatsSection(agentsSection[agent], playerMatchData, won);
            
            // Remove agent entry if no games left
            const agentStats = agentsSection[agent];
            if (agentStats.games.won === 0 && agentStats.games.lost === 0) {
                delete agentsSection[agent];
            }
        }
    }

    /**
     * Calculate reverse running average: (old_avg * old_count - removed_value) / new_count
     */
    calculateReverseRunningAverage(oldAverage, removedValue, oldCount, newCount) {
        if (newCount === 0) return 0;
        return ((oldAverage * oldCount) - removedValue) / newCount;
    }
}

export default PlayerStatsUpdater;