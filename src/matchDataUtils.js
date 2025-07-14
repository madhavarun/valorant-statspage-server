function extractBasicMatchData(matchData, team1Attackers) {
    // Extract basic match info
    const metadata = matchData.data.metadata;
    const teams = matchData.data.teams;

    // Separate players by team
    const redTeamPlayers = [];
    const blueTeamPlayers = [];
    
    matchData.data.players.forEach(player => {
        const playerName = `${player.name}#${player.tag}`;
        const playerObject = {
            name: playerName,
            puuid: player.puuid,
            agent: player.agent.name
        }
        if (player.team_id === "Red") {
            redTeamPlayers.push(playerObject);
        } else if (player.team_id === "Blue") {
            blueTeamPlayers.push(playerObject);
        }
    });
    
    // Find which team is which (Red is team1, Blue is team2)
    const redTeam = teams.find(team => team.team_id === "Red");
    const blueTeam = teams.find(team => team.team_id === "Blue");
    
    // Check team sides
    const team1 = team1Attackers ? redTeam : blueTeam;
    const team2 = team1Attackers ? blueTeam : redTeam;
    
    // Construct the result object
    const result = {
        match_id: metadata.match_id,
        teams: [
            {
                team_id: 'Team1',
                has_won: team1.won,
                pick: team1Attackers ? 'Attackers' : 'Defenders',
                players: team1Attackers ? redTeamPlayers : blueTeamPlayers,
                rounds_won: team1.rounds.won
            },
            {
                team_id: 'Team2',
                has_won: team2.won,
                pick: team1Attackers ? 'Defenders' : 'Attackers',
                players: team1Attackers ? blueTeamPlayers : redTeamPlayers,
                rounds_won: team2.rounds.won
            }
        ],
        map: metadata.map.name,
        game_start: metadata.started_at,
        game_server: metadata.cluster
    };
    
    return result;
}

function extractDetailedMatchData(matchData, team1Attacking) {
    const metadata = matchData.data.metadata;
    const teams = matchData.data.teams;
    const players = matchData.data.players;
    const rounds = matchData.data.rounds;
    const kills = matchData.data.kills || [];

    // Determine team assignments based on team1Pick
    const team1 = team1Attacking ? 'Red' : 'Blue';
    const team2 = team1Attacking ? 'Blue' : 'Red';

    // Store the game's winner
    const winning_team = teams.find(t => t.won)?.team_id || 'Red';

    // Initialize statistics
    let atkRoundsWonTeam1 = 0;
    let defRoundsWonTeam1 = 0;
    let atkRoundsWonTeam2 = 0;
    let defRoundsWonTeam2 = 0;
    let overtimeRounds = 0;
    let overtimePeriods = 0;

    // Track side swaps
    const maxRegularRounds = 24; // 12 rounds per side
    let currentAttacker = 'Red'; // Red starts as attacker
    let isOvertime = false;

    // Initialize player tracking
    const playerStats = {};
    const firstKills = {};
    const firstDeaths = {};
    const playerRounds = {};

    players.forEach(player => {
        const puuid = player.puuid;
        const team = player.team_id === 'Red' ? 
            (team1 === 'Red' ? 'Team1' : 'Team2') : 
            (team1 === 'Blue' ? 'Team1' : 'Team2');

        playerStats[puuid] = {
            ...player.stats,
            player: {
                puuid: puuid,
                name: `${player.name}#${player.tag}`,
                rank: player.tier.id,
            },
            team: team,
            originalTeam: player.team_id,
            agent: player.agent.name,
            firstKills: 0,
            firstDeaths: 0,
            kastRounds: 0,
            roundsPlayed: 0,
            trades: 0,
            traded: 0,
            attackRounds: 0,
            defenseRounds: 0,
            roundsWon: 0,
            roundsLost: 0,
        };
        firstKills[puuid] = 0;
        firstDeaths[puuid] = 0;
        playerRounds[puuid] = Array(rounds.length).fill(null).map(() => ({
            kills: 0,
            deaths: 0,
            assists: 0,
            survived: false,
            traded: false,
            wasTraded: false,
            wasAttack: false
        }));
    });

    // Process kills to find first kills/deaths per round
    const roundFirstKills = {};
    kills.forEach(kill => {
        const roundNum = kill.round;
        if (!roundFirstKills[roundNum]) {
            roundFirstKills[roundNum] = {
                firstKill: kill.killer.puuid,
                firstDeath: kill.victim.puuid,
                time: kill.time_in_round_in_ms
            };
            firstKills[kill.killer.puuid]++;
            firstDeaths[kill.victim.puuid]++;
        }
    });

    // Process each round with precise side tracking
    rounds.forEach((round, roundIndex) => {
        // Handle regular time side swaps
        if (roundIndex === 12) { // Halftime
            currentAttacker = 'Blue'; // Swap sides
        } 
        // Handle overtime side swaps (alternates every round)
        else if (roundIndex >= maxRegularRounds) {
            isOvertime = true;
            overtimeRounds++;
            currentAttacker = currentAttacker === 'Red' ? 'Blue' : 'Red';
            // Mark the end of a 2 round overtime period
            if (overtimeRounds % 2 === 0) {
                overtimePeriods++;
            }
        }

        const isRedWin = round.winning_team === 'Red';
        const isBlueWin = round.winning_team === 'Blue';
        
        // Track round wins by side using Team1/Team2 for first 2 halves
        if (!isOvertime) {
            if (currentAttacker === 'Red') {
                if (isRedWin) {
                    team1 === 'Red' ? atkRoundsWonTeam1++ : atkRoundsWonTeam2++;
                }
                if (isBlueWin) {
                    team1 === 'Blue' ? defRoundsWonTeam1++ : defRoundsWonTeam2++;
                }
            } else {
                if (isRedWin) {
                    team1 === 'Red' ? defRoundsWonTeam1++ : defRoundsWonTeam2++;
                }
                if (isBlueWin) {
                    team1 === 'Blue' ? atkRoundsWonTeam1++ : atkRoundsWonTeam2++;
                }
            }
        }

        // Process round stats for each player
        round.stats.forEach(pStats => {
            const puuid = pStats.player.puuid;
            if (!playerStats[puuid]) return;

            const isAttack = pStats.player.team === currentAttacker;
            playerRounds[puuid][roundIndex] = {
                kills: pStats.stats.kills,
                deaths: pStats.stats.deaths,
                assists: pStats.stats.assists,
                survived: pStats.stats.deaths === 0,
                traded: false,
                wasTraded: false,
                wasAttack: isAttack
            };

            playerStats[puuid].roundsPlayed++;
            if (isAttack) {
                playerStats[puuid].attackRounds++;
            } else {
                playerStats[puuid].defenseRounds++;
            }
        });
    });

    // Process kills to determine trades (same as before)
    kills.forEach(kill => {
        const roundNum = kill.round;
        const killerPuuid = kill.killer.puuid;
        const victimPuuid = kill.victim.puuid;
        
        const killerDeath = kills.find(k => 
            k.round === roundNum && 
            k.victim.puuid === killerPuuid &&
            k.time_in_round_in_ms > kill.time_in_round_in_ms
        );
        
        if (killerDeath) {
            const traderPuuid = killerDeath.killer.puuid;
            if (playerStats[victimPuuid] && playerStats[traderPuuid] && 
                playerStats[victimPuuid].originalTeam === playerStats[traderPuuid].originalTeam) {
                playerRounds[victimPuuid][roundNum].traded = true;
                playerRounds[traderPuuid][roundNum].wasTraded = true;
                playerStats[traderPuuid].trades++;
                playerStats[victimPuuid].traded++;
            }
        }
    });

    // Calculate KAST for each player (same as before)
    players.forEach(player => {
        const puuid = player.puuid;
        if (!playerStats[puuid]) return;

        let kastRounds = 0;
        for (let i = 0; i < playerRounds[puuid].length; i++) {
            const round = playerRounds[puuid][i];
            if (!round) continue;
            
            if (round.kills > 0 || round.assists > 0 || round.survived || round.traded) {
                kastRounds++;
            }
        }

        playerStats[puuid].kast = playerStats[puuid].roundsPlayed > 0 
            ? Math.round((kastRounds / playerStats[puuid].roundsPlayed) * 100)
            : 0;
        playerStats[puuid].firstKills = firstKills[puuid] || 0;
        playerStats[puuid].firstDeaths = firstDeaths[puuid] || 0;
    });

    // Prepare final player data
    const processedPlayers = players.map(player => {
        const puuid = player.puuid;
        const stats = playerStats[puuid];
        const kdaDiff = stats.kills - stats.deaths;
        const fkfdDiff = stats.firstKills - stats.firstDeaths;
        const damageDelta = Math.round((stats.damage?.dealt - stats.damage?.received) / stats.roundsPlayed) || 0;
        
        return {
            name: stats.player.name,
            puuid: stats.player.puuid,
            rank: stats.player.rank,
            team: stats.team,
            agent: stats.agent,
            acs: Math.round(stats.score / (stats.roundsPlayed || 1)),
            kills: stats.kills,
            deaths: stats.deaths,
            assists: stats.assists,
            kda_diff: kdaDiff,
            kast: stats.kast,
            hs_percentage: stats.headshots + stats.bodyshots + stats.legshots > 0 
                ? Math.round((stats.headshots / (stats.headshots + stats.bodyshots + stats.legshots)) * 100)
                : 0,
            first_bloods: stats.firstKills,
            first_deaths: stats.firstDeaths,
            fkfd_diff: fkfdDiff,
            trades: stats.trades,
            traded: stats.traded,
            adr: stats.damage?.dealt ? Math.round(stats.damage.dealt / (stats.roundsPlayed || 1)) : 0,
            damage_delta: damageDelta,
            attack_rounds: stats.attackRounds,
            defense_rounds: stats.defenseRounds,
            rounds_won: stats.roundsWon,
            rounds_lost: stats.roundsLost,
        };
    });

    // Separate players by team
    const team1Players = processedPlayers.filter(p => p.team === "Team1");
    const team2Players = processedPlayers.filter(p => p.team === "Team2");

    // Assign rounds won/lost based on team and side
    team1Players.forEach(player => {
        player.rounds_won = team1 === 'Red' ?
            teams.find(t => t.team_id === 'Red')?.rounds?.won || 0 :
            teams.find(t => t.team_id === 'Blue')?.rounds?.won || 0
        player.rounds_lost = team1 === 'Red' ?
            teams.find(t => t.team_id === 'Blue')?.rounds?.won || 0 :
            teams.find(t => t.team_id === 'Red')?.rounds?.won || 0
    });

    team2Players.forEach(player => {
        player.rounds_won = team2 === 'Red' ?
            teams.find(t => t.team_id === 'Red')?.rounds?.won || 0 :
            teams.find(t => t.team_id === 'Blue')?.rounds?.won || 0
        player.rounds_lost = team2 === 'Red' ?
            teams.find(t => t.team_id === 'Blue')?.rounds?.won || 0 :
            teams.find(t => t.team_id === 'Red')?.rounds?.won || 0
    })

    // Prepare round win conditions with proper side tracking
    let currentAttackerForRounds = team1Attacking ? 'Red' : 'Blue';
    const roundWinConditions = rounds.map((round, roundIndex) => {
        // Handle side swaps
        if (roundIndex === 12) {
            currentAttackerForRounds = currentAttackerForRounds === 'Red' ? 'Blue' : 'Red';
        } else if (roundIndex >= maxRegularRounds) {
            currentAttackerForRounds = currentAttackerForRounds === 'Red' ? 'Blue' : 'Red';
        }

        const winningTeam = round.winning_team === 'Red' ? 
            (team1 === 'Red' ? 'Team1' : 'Team2') : 
            (team1 === 'Blue' ? 'Team1' : 'Team2');

        return {
            round: roundIndex + 1,
            winning_team: winningTeam,
            round_type: currentAttackerForRounds === 'Red' ? 
                (team1 === 'Red' ? 'Team1 Attack' : 'Team2 Attack') : 
                (team1 === 'Blue' ? 'Team1 Attack' : 'Team2 Attack'),
            result: round.result,
            site: round.plant?.site || null,
            first_kill: roundFirstKills[roundIndex]?.firstKill 
                ? playerStats[roundFirstKills[roundIndex].firstKill]?.player 
                : null,
            first_death: roundFirstKills[roundIndex]?.firstDeath 
                ? playerStats[roundFirstKills[roundIndex].firstDeath]?.player 
                : null,
            ceremony: round.ceremony,
            is_overtime: roundIndex >= maxRegularRounds
        };
    });

    // Final result
    const result = {
        match_id: metadata.match_id,
        map: metadata.map.name,
        teams: [
            {
                team_id: 'Team1',
                won: team1 === winning_team,
                pick: team1Attacking ? 'Attackers' : 'Defenders',
                rounds_won: {
                    atk: atkRoundsWonTeam1,
                    def: defRoundsWonTeam1,
                    total: team1 === 'Red' ? 
                        teams.find(t => t.team_id === 'Red')?.rounds?.won || 0 : 
                        teams.find(t => t.team_id === 'Blue')?.rounds?.won || 0,
                    overtime: calculateOverTimeRounds(team1)
                },
                players: team1Players
            },
            {
                team_id: 'Team2',
                won: team2 === winning_team,
                pick: team1Attacking ? 'Defenders' : 'Attackers',
                rounds_won: {
                    atk: atkRoundsWonTeam2,
                    def: defRoundsWonTeam2,
                    total: team1 === 'Red' ? 
                        teams.find(t => t.team_id === 'Blue')?.rounds?.won || 0 : 
                        teams.find(t => t.team_id === 'Red')?.rounds?.won || 0,
                    overtime: calculateOverTimeRounds(team2)
                },
                players: team2Players
            }
        ],
        start_time: metadata.started_at,
        round_win_conditions: roundWinConditions,
        game_server: metadata.cluster,
        game_mode: metadata.queue.name,
        game_duration: metadata.game_length_in_ms,
        season: metadata.season.short,
        patch: metadata.game_version,
    };

    return result;

    // Helper functions
    function calculateOverTimeRounds(team) {
        if (!isOvertime || overtimePeriods === 0) {
            return 0;
        }
        let overtimeWins = overtimePeriods - 1;
        if (team == winning_team) {
            overtimeWins += 2; // Winning team gets 2 rounds in overtime
        }
        return overtimeWins;
    }
}

export { extractBasicMatchData, extractDetailedMatchData };