// db.js - Handle all database operations
import { MongoClient } from 'mongodb';

class DatabaseManager {
    constructor(connectionString, databaseName) {
        this.uri = connectionString;
        this.dbName = databaseName;
        this.client = null;
        this.db = null;
    }

    async connect() {
        try {
            this.client = new MongoClient(this.uri);
            await this.client.connect();
            this.db = this.client.db(this.dbName);
            console.log('Connected to MongoDB');
        } catch (error) {
            console.error('Failed to connect to MongoDB:', error);
            throw error;
        }
    }

    async disconnect() {
        if (this.client) {
            await this.client.close();
            console.log('Disconnected from MongoDB');
        }
    }

    // Insert a match into the database
    async insertMatch(matchObject) {
        try {
            await this.db.collection("matches").insertOne(matchObject);
            console.log(`Match ${matchObject._id} inserted successfully`);
            return;
        } catch (error) {
            console.error('Error inserting match:', error);
            throw error;
        }
    }

    // Delete a match from the database
    async deleteMatch(matchId) {
        try {
            await this.db.collection("matches").deleteOne({ _id: matchId });
            console.log(`Match ${matchId} deleted successfully`);
            return;
        } catch (error) {
            console.error('Error deleting match:', error);
            throw error;
        }
    }

    // Get a specific match by ID (needed to extract player info)
    async getMatch(matchId) {
        try {
            return await this.db.collection('matches').findOne({ _id: matchId });
        } catch (error) {
            console.error('Error getting match:', error);
            throw error;
        }
    }

    // Update season with new match ID
    async updateSeasonWithMatch(seasonId, matchId, change = null) {
        try {
            if (change !== "add" && change !== "remove") {
                throw new Error("Invalid change type. Use 'add' or 'remove'.");
            }
            if (change == "add") {
                await this.db.collection("seasons").updateOne(
                    { _id: seasonId },
                    {
                        $push: { matches: matchId },
                        $inc: { match_count: 1 }
                    }
                );
            } else if (change == "remove") {
                await this.db.collection("seasons").updateOne(
                    { _id: seasonId },
                    {
                        $pull: { matches: matchId },
                        $inc: { match_count: -1 }
                    }
                );
            }
        } catch (error) {
            console.error('Error updating season:', error);
            throw error;
        }
        console.log(`${ change == "add" ? 'Added' : "Removed"} ${matchId} in season ${seasonId}`);
    }

    // Get player data by player ID (puuid)
    async getPlayer(puuid) {
        try {
            const player = await this.db.collection("players").findOne({ _id: puuid });
            return player;
        } catch (error) {
            console.error('Error fetching player:', error);
            throw error;
        }
    }

    // Update player data by puuid, overwriting existing data
    async updatePlayer(puuid, updatedPlayerObject) {
        try {
            await this.db.collection("players").replaceOne(
                { _id: puuid }, 
                updatedPlayerObject
            );
            console.log(`Player ${updatedPlayerObject.current_name} (${puuid}) updated successfully`);
        } catch (error) {
            console.error('Error updating player:', error);
            throw error;
        }
    }

    // Check if a player exists in the database
    async playerExists(puuid) {
        try {
            const count = await this.db.collection("players").countDocuments({ _id: puuid });
            return count > 0;
        } catch (error) {
            console.error('Error checking if player exists:', error);
            throw error;
        }
    }

    // Get all players from the database
    async getAllPlayers() {
        try {
            const players = await this.db.collection("players").find({}).toArray();
            return players;
        } catch (error) {
            console.error('Error fetching all players:', error);
            throw error;
        }
    }

    // Get players by season ID
    async getPlayersBySeason(seasonId) {
        try {
            const players = await this.db.collection("players").find({
                [`seasons.${seasonId}`]: { $exists: true }
            }).toArray();
            return players;
        } catch (error) {
            console.error('Error fetching players by season:', error);
            throw error;
        }
    }

    // Delete a player from the database
    async deletePlayer(puuid) {
        try {
            await this.db.collection("players").deleteOne({ _id: puuid });
            console.log(`Player ${puuid} deleted successfully`);
        } catch (error) {
            console.error('Error deleting player:', error);
            throw error;
        }
    }

    // Insert a player into the database
    async insertPlayer(playerObject) {
        try {
            await this.db.collection("players").insertOne(playerObject);
            console.log(`Player ${playerObject.current_name} (${playerObject._id}) inserted successfully`);
        } catch (error) {
            console.error('Error inserting player:', error);
            throw error;
        }
    }

    // Check if match already exists
    async matchExists(matchId) {
        const count = await this.db.collection("matches").countDocuments({ _id: matchId });
        return count > 0;
    }
}

export default DatabaseManager;