const
    sqlite3 = require('sqlite3').verbose()
    , debug = require("debug")("videory:db")
    , assert = require("assert")
    , db = new sqlite3.cached.Database('db.sqlite')
;

/**
 * execute db query
 * @param {String} query
 * @return {Promise<any>}
 */
async function run(query) {
    return new Promise((resolve, reject) => {
        db.run(query, (err) => {
            if (err) {
                return reject(err)
            }
            return resolve();
        });
    })
}

/**
 * return array of matches for query
 * @param query
 * @return {Promise<any>}
 */
async function all(query) {
    return new Promise((resolve, reject) => {
        db.all(query, (err, rows) => {
            if (err) {
                return reject(err)
            }
            return resolve(rows);
        });
    })
}

/**
 * update move entity
 * @param {Object} movie
 * @return {Promise<any>}
 */

async function updateMovie(movie) {
    assert.ok(movie.hash);
    const sql = `update movie set ${Object.entries(movie).map(([k, v]) => {
            return ` ${k} = ${v === undefined || v === null ? null : '"' + v + '"' }`
        }
    ).join()} where hash = "${movie.hash}"`;
    return run(sql);
}

module.exports.updateMovie = updateMovie;

/**
 * init database
 * @return {Promise<*>}
 */
module.exports.init = async () => {
    // init movies table
    return run(`
      create table if not exists movie (
        hash           TEXT    not null,
        path           TEXT    not null,
        date           TEXT    not null,
        transcodedPath TEXT,
        isTranscoding  BOOLEAN not null default false,
        UNIQUE (hash, path)
      )
    `);

    //todo: remove transcoding Bit on every video after startup

    //init settings table
    // await run(`
    //   create table if not exists settings (
    //     name  TEXT not null unique,
    //     value TEXT not null unique
    //   )
    // `);

    //init default settings //todo: enable setting for the ui
    //  await run(`insert into settings
    //           values ("outputpath", "c:/videory-output")`);
};

/**
 * insert move to database
 * @param {String} hash - movie file hash
 * @param {String} path - movie fs path
 * @param {String} date - insert date
 * @return {Promise<any | never>}
 */
module.exports.insertMovie = async (hash, path, date) =>
    run(`insert into movie (hash, path, date) values("${hash}", "${path}", "${date}");`)
        .catch(e => {
            if (e.code === "SQLITE_CONSTRAINT") {
                return console.warn('db entry exists', hash, path);

            }
            throw e;
        });


/**
 * returns all movies from db
 * @return {Promise<any>}
 */
module.exports.findMovies = async () => {
    return all('select * from movie');
};

/**
 * returns movies that are yet to be encoded
 * @return {Promise<*>}
 */
module.exports.findNotTranscoded = async () => {
    const notTranscoded = await all('select * from movie where "transcodedPath" ISNULL AND "isTranscoding" is 0');
    if (!notTranscoded.length) {
        return [];
    }
    debug("found some videos to transcode:", notTranscoded.map(n => n.hash).join());
    return notTranscoded.map(n => ({
        ...n,
        async setTranscodePath(path) {
            n.transcodedPath = path;
            return updateMovie(n);
        },
        async setIsTrancoding(isTranscoding = true) {
            n.isTranscoding = isTranscoding;
            return updateMovie(n)
        }
    }))
};

