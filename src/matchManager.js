import DataFetcher from './dataFetcher.js';
import DatabaseManager from './db.js';
import { extractDetailedMatchData, extractBasicMatchData } from './matchDataUtils.js';
import PlayerStatsUpdater from './playerStatsUpdater.js';

function makeLogger(enabled) {
    return (...args) => {
        if (enabled) console.log(...args);
    };
}

async function addMatch(matchId, currSeasonId, team1Attacking, logEnabled = true) {
    const log = makeLogger(logEnabled);
    if (!matchId || !currSeasonId || team1Attacking === undefined) {
        const errorMessage = 'Invalid parameters provided for addMatch function.';
        log(errorMessage);
        return {'success': false, 'message': errorMessage};
    }
    log(`Processing match id ${matchId}...`);
    log('Connecting to database...');
    const db = new DatabaseManager(process.env.MONGODB_WRITER_URI, process.env.DB_NAME);
    await db.connect()
    
    log(`Adding match to season ${currSeasonId}...`);
    let existing_match = await db.matchExists(matchId);
    if (existing_match) {
        const errorMessage = `Match ${matchId} already exists in the database.`;
        log(errorMessage);
        db.disconnect();
        return {'success': false, 'message': errorMessage};
    }

    log('Fetching raw match data...');
    const df = new DataFetcher('api');
    let matchData;
    try {
        matchData = await df.fetchMatchData(matchId);
    } catch (error) {
        const errorMessage = 'Error fetching match data: ' + error;
        log(errorMessage);
        db.disconnect();
        return {'success': false, 'message': errorMessage};
    }

    log('Processing match data...');
    const extendedMatchData = extractDetailedMatchData(matchData, team1Attacking);
    const shortMatchData = extractBasicMatchData(matchData, team1Attacking);

    const matchObject = {
        _id: matchId,
        season_id: currSeasonId,
        data: {
            basic: shortMatchData,
            detailed: extendedMatchData
        },
        created_at: new Date(),
    };

    log('Inserting match into database...');
    await db.insertMatch(matchObject);

    log('Updating season with new match...');
    await db.updateSeasonWithMatch(currSeasonId, matchId, "add");

    log('Processing player statistics...');
    const playerStatsUpdater = new PlayerStatsUpdater(db);
    await playerStatsUpdater.updatePlayersFromMatch(extendedMatchData, currSeasonId);

    log('Match successfully added.');
    await db.disconnect();
    return {'success': true, 'message': "Match successfully added"};
}

async function removeMatch(matchId, currSeasonId, logEnabled = true) {
    const log = makeLogger(logEnabled);
    log(`Processing match id ${matchId}...`);
    log('Connecting to database...');
    const db = new DatabaseManager(process.env.MONGODB_WRITER_URI, process.env.DB_NAME);
    await db.connect()

    log(`Removing match from season ${currSeasonId}...`);
    let existing_match = await db.matchExists(matchId);
    if (!existing_match) {
        const errorMessage = `Match ${matchId} does not exist in the database.`;
        log(errorMessage);
        db.disconnect();
        return {'success': false, 'message': errorMessage};
    }

    log('Fetching match data for player stats removal...');
    const matchData = await db.getMatch(matchId);

    log('Removing player statistics...');
    const playerStatsUpdater = new PlayerStatsUpdater(db);
    await playerStatsUpdater.removePlayersFromMatch(matchData.data.detailed, currSeasonId);

    log('Deleting match from database...');
    await db.deleteMatch(matchId);

    log('Updating season with match removal...');
    await db.updateSeasonWithMatch(currSeasonId, matchId , "remove");

    log('Match successfully removed.');
    await db.disconnect();
    return {'success': true, 'message': "Match successfully removed."};
}

async function printMatch(matchId, currSeasonId, team1Attacking) {
    console.log(`Processing match id ${matchId}...`);
    console.log('Fetching raw match data...');
    const df = new DataFetcher('api');
    let matchData;
    try {
        matchData = await df.fetchMatchData(matchId);
    } catch (error) {
        console.error('Error fetching match data:', error);
    }

    console.log('Processing match data...');
    const extendedMatchData = extractDetailedMatchData(matchData, team1Attacking);
    const shortMatchData = extractBasicMatchData(matchData, team1Attacking);

    const matchObject = {
        _id: matchId,
        season_id: currSeasonId,
        data: {
            basic: shortMatchData,
            detailed: extendedMatchData
        },
        created_at: new Date(),
    };

    //console.log('Match Object:', JSON.stringify(matchObject, null, 2));
}

export { addMatch, removeMatch };