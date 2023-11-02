# update postgres db

### SSH




### Table 1 Chess games

CREATE TABLE chess_games (
    chain_id            varchar(255),
    match_address      TEXT PRIMARY KEY, -- Assuming text or varchar; also assumed to be the primary key based on the ON CONFLICT clause
    player0_address    varchar(255),    -- Assuming text or varchar based on "_address"
    player1_address    varchar(255),    -- Same as above
    wager_token        varchar(255),    -- Assuming text or varchar based on "token"
    wager_amount       varchar(255), -- Assuming numeric or decimal for financial values
    number_of_games    varchar(255), -- Assuming integer
    is_in_progress     BOOLEAN, -- Assuming boolean based on "is_"
    time_limit         varchar(255),        -- Assuming timestamp; could be INTERVAL depending on context
    time_last_move     varchar(255),        -- Assuming timestamp
    time_player0       varchar(255),        -- Assuming timestamp
    time_player1       varchar(255),        -- Assuming timestamp
    is_player_turn     BOOLEAN, -- Assuming boolean based on "is_"
    is_tournament      BOOLEAN,
    fen_string         varchar(255)     -- Assuming text or varchar based on "_string"
);

### Table 2 chess analytics

CREATE TABLE chess_analytics (
    chain_id varchar(255) UNIQUE,
    number_of_games int,
    number_of_wagers int
);

### Table 3 Leaderboard

CREATE TABLE leaderboard (
    chain_id VARCHAR(255),
    address_player VARCHAR(255),
    total_games VARCHAR(255),
    games_won VARCHAR(255),
    UNIQUE(chain_id, address_player)
);


### Table 4 tournaments 

CREATE TABLE tournaments (
    chain_id Integer Not NULL,
    tournament_nonce INTEGER NOT NULL,
    number_of_players INTEGER NOT NULL,
    players TEXT[],
    number_of_games INTEGER NOT NULL,
    token TEXT NOT NULL,
    token_amount INTEGER NOT NULL,
    is_in_progress BOOLEAN NOT NULL,
    start_time INTEGER NOT NULL,
    time_limit INTEGER NOT NULL,
    is_complete BOOLEAN NOT NULL,
    is_tournament BOOLEAN NOT NULL
);


## LINTER

npx prettier --write '**/*.ts'
