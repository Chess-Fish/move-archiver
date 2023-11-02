import * as dotenv from 'dotenv';
dotenv.config();

import { Chess } from 'chess.js';
import { abi as chessWagerABI } from './ABI/ChessWager.json';
import { abi as TournamentABI } from './ABI/ChessFishTournament.json';

import { ethers } from 'ethers';
import { Client } from 'pg';

/* import { createClient } from 'redis';
const url = process.env.REDIS_URL || 'redis://localhost:6379';
const client = createClient({ url });

client.on('connect', () => {
  console.log('Redis client connected');
});

client.on('error', (err) => {
  console.error('Redis error:', err);
});

client.on('end', () => {
  console.log('Redis client disconnected');
});

async function initialize() {
  try {
    await client.connect();
  } catch (error) {
    console.error('Error initializing the server:', error);
  }
}
initialize(); */

interface Wager {
  chainId: number;
  matchAddress: string;
  player0Address: any;
  player1Address: any;
  wagerToken: any;
  wagerAmount: number;
  numberOfGames: number;
  isInProgress: boolean;
  timeLimit: number;
  timeLastMove: number;
  timePlayer0: number;
  timePlayer1: number;
  isPlayerTurn: boolean;
  isTournament: boolean;
  fenString: string;
}

interface GamesData {
  chainId: number;
  numberOfGames: number;
  numberOfWagers: number;
}

interface TournamentData {
  chainId: number;
  tournamentNonce: number;
  numberOfPlayers: number;
  players: string[];
  numberOfGames: number;
  token: string;
  tokenAmount: number;
  isInProgress: boolean;
  startTime: number;
  timeLimit: number;
  isComplete: boolean;
  isTournament: boolean;
}

const getRetryWithDelay = async (fn, delay = 10000) => {
  while (true) {
    try {
      return await fn();
    } catch (error) {
      console.error('Network error, retrying in 10 seconds', error);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

const GetAnalyticsData = async () => {
  try {
    const wagerAddresses: string[] = [];

    const numberOfWagers = await getRetryWithDelay(() =>
      chess.getAllWagersCount()
    );

    for (let i = 0; i < numberOfWagers; i++) {
      try {
        const wagerAddress = await getRetryWithDelay(() => chess.allWagers(i));
        wagerAddresses.push(wagerAddress);
      } catch (error) {
        console.log(`Failed to get wager address for index ${i}`);
        console.log(error);
      }
    }

    const allWagerParams: Wager[] = [];
    for (let i = 0; i < wagerAddresses.length; i++) {
      try {
        const wagerParams = await getRetryWithDelay(() =>
          chess.gameWagers(wagerAddresses[i])
        );
        const fenString = await getFenString(wagerAddresses[i]);

        const wager = {
          chainId: Number((await provider.getNetwork()).chainId),
          matchAddress: wagerAddresses[i],
          player0Address: wagerParams[0],
          player1Address: wagerParams[1],
          wagerToken: wagerParams[2],
          wagerAmount: parseInt(wagerParams[3]),
          numberOfGames: parseInt(wagerParams[4]),
          isInProgress: wagerParams[5],
          timeLimit: parseInt(wagerParams[6]),
          timeLastMove: parseInt(wagerParams[7]),
          timePlayer0: parseInt(wagerParams[8]),
          timePlayer1: parseInt(wagerParams[9]),
          isPlayerTurn: false,
          isTournament: wagerParams.isTournament,
          fenString: fenString,
        };
        allWagerParams.push(wager);

        pushWagerDataToDb(wager);
      } catch (error) {
        console.log(error);
        return null;
      }
    }

    let games = 0;
    for (let i = 0; i < allWagerParams.length; i++) {
      const winsData = await chess.wagerStatus(wagerAddresses[i]);
      games += Number(winsData.winsPlayer0);
      games += Number(winsData.winsPlayer1);
    }

    const gamesData: GamesData = {
      chainId: Number((await provider.getNetwork()).chainId),
      numberOfGames: games,
      numberOfWagers: allWagerParams.length,
    };

    pushGamesDataToDb(gamesData);

    return allWagerParams;
  } catch (error) {
    console.log(error);
    return null;
  }
};

const GetGameMoves = async (wagerAddress: string) => {
  try {
    let gameID = Number(await chess.getGameLength(wagerAddress));

    if (gameID !== 0) {
      gameID--;
    }

    const data = await getRetryWithDelay(() =>
      chess.getGameMoves(wagerAddress, gameID)
    );
    const hexMoves = data.moves;

    const algebraeicMoves: string[] = [];
    for (let i = 0; i < hexMoves.length; i++) {
      const algebraeicMove = await chess.hexToMove(hexMoves[i]);
      algebraeicMoves.push(algebraeicMove);
    }

    return algebraeicMoves;
  } catch (error) {
    console.log(`Get game moves: ${wagerAddress} not found`);
    console.log(error);
    return [];
  }
};

async function getFenString(wagerAddress: string): Promise<string> {
  let gameFen: string = '';
  try {
    const game = new Chess();
    const movesArray = await GetGameMoves(wagerAddress);

    for (let j = 0; j < movesArray.length; j++) {
      game.move(movesArray[j]);
    }
    gameFen = game.fen();

    return gameFen;
  } catch (error) {
    console.log(error);
    return '';
  }
}

async function pushWagerDataToDb(wager: Wager) {
  const connectionString = `${process.env.DB_CONNECTION}?sslmode=require`;

  const client = new Client({
    connectionString: connectionString,
  });

  try {
    await client.connect();

    const query = `
    INSERT INTO chess_games (chain_id, match_address, player0_address, player1_address, wager_token, wager_amount, number_of_games, is_in_progress, time_limit, time_last_move, time_player0, time_player1, is_player_turn, is_tournament, fen_string)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    ON CONFLICT (match_address)
    DO UPDATE SET
      chain_id = $1,
      player0_address = $3,
      player1_address = $4,
      wager_token = $5,
      wager_amount = $6,
      number_of_games = $7,
      is_in_progress = $8,
      time_limit = $9,
      time_last_move = $10,
      time_player0 = $11,
      time_player1 = $12,
      is_player_turn = $13,
      is_tournament = $14,
      fen_string = $15;
  `;

    const values = [
      wager.chainId,
      wager.matchAddress,
      wager.player0Address,
      wager.player1Address,
      wager.wagerToken,
      wager.wagerAmount,
      wager.numberOfGames,
      wager.isInProgress,
      wager.timeLimit,
      wager.timeLastMove,
      wager.timePlayer0,
      wager.timePlayer1,
      wager.isPlayerTurn,
      wager.isTournament,
      wager.fenString,
    ];

    await client.query(query, values);

    console.log('Wager data updated successfully.');
  } catch (error) {
    console.error('Error updating wager data:', error);
  } finally {
    await client.end();
  }
}

async function pushGamesDataToDb(data: GamesData) {
  const connectionString = `${process.env.DB_CONNECTION}?sslmode=require`;

  const client = new Client({
    connectionString: connectionString,
  });

  try {
    await client.connect();

    const query = `
      INSERT INTO chess_analytics (chain_id, number_of_games, number_of_wagers)
      VALUES ($1, $2, $3)
      ON CONFLICT (chain_id) 
      DO UPDATE SET number_of_games = $2, number_of_wagers = $3
    `;

    const values = [data.chainId, data.numberOfGames, data.numberOfWagers];

    await client.query(query, values);

    console.log('Wager data updated successfully.');
  } catch (error) {
    console.error('Error updating wager data:', error);
  } finally {
    await client.end();
  }
}

async function pushTournamentDataToDb(data: TournamentData) {
  const connectionString = `${process.env.DB_CONNECTION}?sslmode=require`;

  const client = new Client({
    connectionString: connectionString,
  });

  try {
    await client.connect();

    const query = `
    INSERT INTO tournaments (chain_id, tournament_nonce, number_of_players, players, number_of_games, token, token_amount, is_in_progress, start_time, time_limit, is_complete, is_tournament)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (chain_id, tournament_nonce) 
    DO UPDATE SET number_of_players = $3, players = $4, number_of_games = $5, token = $6, token_amount = $7, is_in_progress = $8, start_time = $9, time_limit = $10, is_complete = $11, is_tournament = $12
`;

    const values = [
      data.chainId,
      data.tournamentNonce,
      data.numberOfPlayers,
      data.players,
      data.numberOfGames,
      data.token,
      data.tokenAmount,
      data.isInProgress,
      data.startTime,
      data.timeLimit,
      data.isComplete,
      data.isTournament,
    ];

    await client.query(query, values);

    console.log('Tournament data updated successfully.');
  } catch (error) {
    console.error('Error updating tournament data:', error);
  } finally {
    await client.end();
  }
}

export const GetTournaments = async () => {
  const tournamentsData: TournamentData[] = [];

  try {
    let tournamentNonce = await tournament.tournamentNonce();

    for (let i = 0; i < tournamentNonce; i++) {
      const data = await tournament.tournaments(i);

      const tournamentData: TournamentData = {
        chainId: Number((await provider.getNetwork()).chainId),
        tournamentNonce: i,
        numberOfPlayers: Number(data[0]),
        players: [],
        numberOfGames: Number(data[1]),
        token: data[2],
        tokenAmount: Number(data[3]),
        isInProgress: Boolean(data[4]),
        startTime: Number(data[5]),
        timeLimit: Number(data[6]),
        isComplete: Boolean(data[7]),
        isTournament: Boolean(data[8]),
      };

      const players = await tournament.getTournamentPlayers(i);
      tournamentData.players = players;

      tournamentsData.push(tournamentData);
      await pushTournamentDataToDb(tournamentData);
    }
  } catch (error) {
    // Handle error if needed
    console.error('Error:', error);
  }
};

type PlayerStats = {
  totalGames: number;
  gamesWon: number;
};

export const GetLeaderboardData = async (): Promise<{
  [key: string]: PlayerStats;
}> => {
  const playerStatistics: { [key: string]: PlayerStats } = {};
  
  const connectionString = `${process.env.DB_CONNECTION}?sslmode=require`;

  const client = new Client({
    connectionString: connectionString,
  });
  await client.connect();

  try {
    let wagerAddresses: string[] = [];

    // Fetch all wager addresses
    let value = 0;
    let errorOccurred = false;
    while (!errorOccurred) {
      try {
        const wagerAddress = await chess.allWagers(value.toString());
        wagerAddresses.push(wagerAddress);
        value++;
      } catch (error) {
        errorOccurred = true;
      }
    }

    for (const wagerAddress of wagerAddresses) {
      const wagerParams = await chess.gameWagers(wagerAddress);
      const status = await chess.wagerStatus(wagerAddress);

      const players = [wagerParams[0], wagerParams[1]];

      players.forEach((player, index) => {
        if (player === ethers.constants.AddressZero) return; // Skip the iteration if player is the zero address

        if (!playerStatistics[player]) {
          playerStatistics[player] = {
            totalGames: 0,
            gamesWon: 0,
          };
        }
        // Increment the total games played by the player
        playerStatistics[player].totalGames += parseInt(wagerParams[4]);

        // Increment the games won by the player
        if (index === 0) {
          playerStatistics[player].gamesWon += Number(status.winsPlayer0);
        } else {
          playerStatistics[player].gamesWon += Number(status.winsPlayer1);
        }
      });
    }



    // Save the data to the database
    for (const [address, stats] of Object.entries(playerStatistics)) {
      const { totalGames, gamesWon } = stats;

      const query = `
      INSERT INTO leaderboard (chain_id, address_player, total_games, games_won)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (chain_id, address_player)
      DO UPDATE SET 
          total_games = EXCLUDED.total_games,
          games_won = EXCLUDED.games_won;
  `;

      chainId = (await provider.getNetwork()).chainId;

      await client.query(query, [chainId, address, totalGames, gamesWon]);
    }


    return playerStatistics;
  } catch (error) {
    //alert(`Analytics function : error`);
    console.log(error);

    return {};
  } finally {
    await client.end();
  }
};

const contractAddresses = require('./addresses/contractAddresses.json');
const providerUrls = [
  'https://polygon-mumbai-bor.publicnode.com',
  'https://alfajores-forno.celo-testnet.org',
];

let provider;
let chessAddress;
let tournamentAddress;

let chess;
let tournament;

let chainId;

async function main() {
  console.log('STARTING');

  for (let providerUrl of providerUrls) {
    console.log(`Fetching data for provider: ${providerUrl}`);

    // Update global provider
    provider = new ethers.providers.JsonRpcProvider(providerUrl);

    let chainId;
    try {
      chainId = (await provider.getNetwork()).chainId;
    } catch (error) {
      console.error(
        `Failed to get chainId for provider: ${providerUrl}`,
        error
      );
      continue; // skip to the next iteration
    }

    console.log('CHAIN ID', chainId);

    // Update global contractAddress
    let contractInfo = contractAddresses.find(
      (contract) => contract.chainID === chainId
    );

    if (contractInfo) {
      chessAddress = contractInfo.chessWager;
      tournamentAddress = contractInfo.tournament;
      // Update global chess
      chess = new ethers.Contract(chessAddress, chessWagerABI, provider);
      tournament = new ethers.Contract(
        tournamentAddress,
        TournamentABI,
        provider
      );
    } else {
      console.error(`No contract found for chainId: ${chainId}`);
      continue; // skip to the next iteration
    }

    try {
      await GetAnalyticsData();
      console.log('analytics updated successfully');
    } catch (error) {
      console.error(
        `Failed to fetch analytics data for chainId: ${chainId}`,
        error
      );
    }

    try {
      await GetLeaderboardData();
      console.log('leaderboard updated successfully');
    } catch (error) {
      console.error(
        `Failed to fetch leaderboard data for chainId: ${chainId}`,
        error
      );
    }

    try {
      await GetTournaments();
      console.log('tournaments updated successfully');
    } catch (error) {
      console.error(
        `Failed to fetch tournaments for chainId: ${chainId}`,
        error
      );
    }
  }
}

main();

const countdownInterval = 20 * 60 * 1000; // 20 mins in milliseconds

// Function to update the terminal title with the countdown
function updateTerminalTitle(countdown: number) {
  process.stdout.write(
    `\rNext run in ${Math.ceil(countdown / 1000)} seconds\n`
  );
}

// Countdown interval to update the terminal title and run the main function
let countdown = countdownInterval;
const interval = setInterval(() => {
  countdown -= 1000; // Reduce the countdown by 1 second
  updateTerminalTitle(countdown);

  // If countdown reaches zero, run the main function and reset the countdown
  if (countdown <= 0) {
    main();
    countdown = countdownInterval;
  }
}, 1000);
