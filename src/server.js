import express from 'express';
import cors from 'cors';
import DatabaseManager from './db.js';
import dotenv from 'dotenv';
import winston from 'winston';

const logger = winston.createLogger({
  transports: [new winston.transports.Console()]
});

import { addMatch, removeMatch } from './matchManager.js';
dotenv.config();
const app = express();
const currentSeason = process.env.CURRENT_SEASON;

// Middleware
app.use(cors());
app.use(express.json());

// Database setup
const dbManager = new DatabaseManager(
  process.env.MONGODB_READER_URI,
  process.env.DB_NAME
);

// Connect to MongoDB
dbManager.connect().catch(err => {
  console.error("DB connection failed:", err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  dbManager.disconnect().finally(() => process.exit(0));
});

// --- Season Endpoints ---

// 1. Get all seasons
app.get('/api/seasons', async (req, res) => {
  try {
    const seasons = await dbManager.db.collection("seasons")
      .find()
      .sort({ order: 1 })
      .toArray();
    res.json(seasons);
  } catch (err) {
    res.status(500).json({ error: "Server error fetching seasons" });
  }
});

// 2. Get season details
app.get('/api/seasons/:seasonId', async (req, res) => {
  try {
    const season = await dbManager.db.collection("seasons")
      .findOne({ _id: req.params.seasonId });
      
    res.json(season || { error: "Season not found" });
  } catch (err) {
    res.status(500).json({ error: "Server error fetching season" });
  }
});

// --- Match Endpoints ---

// 3. Get all matches in a season (full data)
app.get('/api/seasons/:seasonId/matches', async (req, res) => {
  try {
    const season = await dbManager.db.collection("seasons")
      .findOne({ _id: req.params.seasonId });
    
    if (!season) return res.status(404).json({ error: "Season not found" });

    const matches = await dbManager.db.collection("matches")
      .find({ _id: { $in: season.matches } })
      .toArray();
      
    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: "Server error fetching season matches" });
  }
});

// 4. Get all matches in a season (basic data only)
app.get('/api/seasons/:seasonId/matches/basic', async (req, res) => {
  try {
    const season = await dbManager.db.collection("seasons")
      .findOne({ _id: req.params.seasonId });
    
    if (!season) return res.status(404).json({ error: "Season not found" });

    const basicData = await dbManager.db.collection("matches")
      .aggregate([
        { $match: { _id: { $in: season.matches } } },
        { $replaceRoot: { newRoot: "$data.basic" } }
      ])
      .toArray();
      
    res.json(basicData);
  } catch (err) {
    res.status(500).json({ error: "Server error fetching basic matches" });
  }
});

// 5. Get all matches in a season (detailed data only)
app.get('/api/seasons/:seasonId/matches/detailed', async (req, res) => {
  try {
    const season = await dbManager.db.collection("seasons")
      .findOne({ _id: req.params.seasonId });
    
    if (!season) return res.status(404).json({ error: "Season not found" });

    const detailedData = await dbManager.db.collection("matches")
      .aggregate([
        { $match: { _id: { $in: season.matches } } },
        { $replaceRoot: { newRoot: "$data.detailed" } }
      ])
      .toArray();
      
    res.json(detailedData);
  } catch (err) {
    res.status(500).json({ error: "Server error fetching detailed matches" });
  }
});

// --- Global Match Endpoints ---

// 6. Get all matches (full data)
app.get('/api/matches', async (req, res) => {
  try {
    const matches = await dbManager.db.collection("matches").find().toArray();
    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: "Server error fetching matches" });
  }
});

// 7. Get all matches (basic data only)
app.get('/api/matches/basic', async (req, res) => {
  try {
    const basicData = await dbManager.db.collection("matches")
      .aggregate([
        { $sort: { "data.basic.game_start": -1 } },            // Sort before dropping path
        { $replaceRoot: { newRoot: "$data.basic" } }           // Now safely unwrap basic
      ])
      .toArray();
    res.json(basicData);
  } catch (err) {
    res.status(500).json({ error: "Server error fetching basic matches" });
  }
});

// 8. Get all matches (detailed data only)
app.get('/api/matches/detailed', async (req, res) => {
  try {
    const detailedData = await dbManager.db.collection("matches")
      .aggregate([
        { $replaceRoot: { newRoot: "$data.detailed" } }
      ])
      .toArray();
    res.json(detailedData);
  } catch (err) {
    res.status(500).json({ error: "Server error fetching detailed matches" });
  }
});

// 9. Get single match (full data)
app.get('/api/match/:matchId', async (req, res) => {
  try {
    const match = await dbManager.db.collection("matches")
      .findOne({ _id: req.params.matchId });
      
    res.json(match || { error: "Match not found" });
  } catch (err) {
    res.status(500).json({ error: "Server error fetching match" });
  }
});

// 10. Get single match (basic data only)
app.get('/api/match/:matchId/basic', async (req, res) => {
  try {
    const [basicData] = await dbManager.db.collection("matches")
      .aggregate([
        { $match: { _id: req.params.matchId } },
        { $replaceRoot: { newRoot: "$data.basic" } }
      ])
      .toArray();
    res.json(basicData || { error: "Match not found" });
  } catch (err) {
    res.status(500).json({ error: "Server error fetching basic match" });
  }
});

// 11. Get single match (detailed data only)
app.get('/api/match/:matchId/detailed', async (req, res) => {
  try {
    const [detailedData] = await dbManager.db.collection("matches")
      .aggregate([
        { $match: { _id: req.params.matchId } },
        { $replaceRoot: { newRoot: "$data.detailed" } }
      ])
      .toArray();
    res.json(detailedData || { error: "Match not found" });
  } catch (err) {
    res.status(500).json({ error: "Server error fetching detailed match" });
  }
});

// 12. Get stats of player by puuid
app.get('/api/player/:puuid', async (req, res) => {
  try {
    const player = await dbManager.db.collection("players").findOne({
      _id: req.params.puuid
    });

    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    res.json(player);
  } catch (err) {
    res.status(500).json({ error: 'Server error fetching player data' })
  }
});

// 13. Get stats of all players
app.get('/api/players', async (req, res) => {
  try {
    const players = await dbManager.db.collection("players").find().sort({ [`seasons.${currentSeason}.avg_acs`]: -1 }).toArray();

    if (!players || players.length == 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    res.json(players);
  } catch (err) {
    res.status(500).json({ error: 'Server error fetching player data' })
  }
});

// 14. Protected endpoint to allow adding matches to the database
app.post('/api/addmatch', async (req, res) => {
  const { matchId, team1Attacking } = req.body;
  const providedKey = req.headers['x-api-key'];
  const apiKeys = JSON.parse(process.env.ACCESS_KEYS);

  const owner = Object.keys(apiKeys).find(owner => apiKeys[owner] === providedKey);
  if (!owner) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  try {
    logger.info(`${owner} triggered addMatch(${matchId}, ${currentSeason}, ${team1Attacking})`);
    const response = await addMatch(matchId, currentSeason, team1Attacking, false);
    logger.info(response);
    const status = response.success ? 200 : 500;
    res.status(status).json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// 15. Protected endpoint to allow removing matches from the database
app.post('/api/removematch', async (req, res) => {
  const { matchId } = req.body;
  const providedKey = req.headers['x-api-key'];
  const apiKeys = JSON.parse(process.env.ACCESS_KEYS);

  const owner = Object.keys(apiKeys).find(owner => apiKeys[owner] === providedKey);
  if (!owner) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  try {
    logger.info(`${owner} triggered removeMatch(${matchId}, ${currentSeason})`);
    const response = await removeMatch(matchId, currentSeason, false);
    logger.info(response);
    const status = response.success ? 200 : 500;
    res.status(status).json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});


// Handle invalid paths
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Start server
const PORT = process.env.PORT || 27001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
