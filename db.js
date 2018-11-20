const
    sqlite3 = require('sqlite3').verbose()
    , debug = require("debug")("videory:db")
    , assert = require("assert")
    , db = new sqlite3.cached.Database('db.sqlite')
    , fs = require("fs")
;


/**
 * promisify an sql command
 * @param {String} verb
 * @return {function(*=): Promise<any>}
 */
const sqliteExecute = verb => query => new Promise((resolve, reject) => {
    db[verb](query, (err, rows) => {
        if (err) {
            return reject(err)
        }
        return resolve(rows);
    });
});

/**
 * execute db query without a return value
 * @param {String} query
 * @return {Promise<any>}
 */
async function run(query) {
    return sqliteExecute("run")(query);
}

/**
 * return array of all matches for given query from db
 * @param {String} query
 * @return {Promise<any>}
 */
async function all(query) {
    return sqliteExecute("all")(query);

}

/**
 * return the first match for given query from db
 * @param {String} query
 * @return {Promise<any>}
 */
async function get(query) {
    return sqliteExecute("get")(query);
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
    await run(`
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

    //init settings tables
    await run(`
      create table if not exists watchdir (
        path    TEXT    not null UNIQUE,
        created TIMESTAMP         DEFAULT CURRENT_TIMESTAMP,
        enabled BOOLEAN not null  default true
      )
    `);

    await run(`
      INSERT
      OR IGNORE INTO watchdir (path)
      values ("C:\\Users\\autod\\OneDrive\\Dokumente\\videory test videos")`);

    //todo: ui settings
    await run(`
      create table if not exists settings (
        outputpath TEXT not null UNIQUE
      )
    `);

    await run(`
      INSERT
      OR IGNORE INTO settings (outputpath)
      values ("c:/videory-output");
    `)

};

/**
 * insert move to database
 * @param {String} hash - movie file hash
 * @param {String} path - movie fs path
 * @param {String} date - insert date
 * @return {Promise<any | never>}
 */
module.exports.insertMovie = async (hash, path, date) =>
    run(`insert OR IGNORE into movie (hash, path, date) values("${hash}", "${path}", "${date}");`)
        .catch(e => {
            if (e.code === "SQLITE_CONSTRAINT") {
                return console.warn('db entry exists', hash, path);

            }
            throw e;
        });

/**
 * deletes a movie from db
 * @param {Object} movie
 * @return {Promise<any>}
 */
const deleteMovie = async ({hash, path}) =>
    run(`delete from movie where "hash" = "${hash}" and "path" = "${path}";`);

module.exports.deleteMovie = deleteMovie
/**
 * returns all transcoded movies from db
 * @return {Promise<any>}
 */
module.exports.findTranscodedMovies = async () => {
    return all('select * from movie where "transcodedPath"is not null');
};

/**
 * returns movies that are yet to be encoded
 * @return {Promise<*>}
 */
module.exports.findNotTranscoded = async () => {
    const notTranscoded = await all('select * from movie where "transcodedPath" ISNULL AND "isTranscoding" is 0');
    if (!notTranscoded.length) {
        debug("Found no videos to transcode. Will retry shortly");
        return [];
    }
    debug("Found some videos to transcode:", notTranscoded.map(n => n.hash).join());

    notTranscoded.forEach(async (n, i, a) => {
        if (!fs.existsSync(n.path)) {
            debug("db entry for video " + n.path + " not located on filesystem. Video entry will be deleted");
            await deleteMovie(n);
            a.splice(i, 1);
        }
    });

    return notTranscoded
        .map(n => ({
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

/**
 *  returns an array of watchdirs with videos
 * @return {Promise<[String]>}
 */
module.exports.getWatchDirs = async () => all("select * from watchdir").catch(e => {
    debugger
})

/**
 * return the video transcoding output directory
 * @return {Promise<String>}
 */
module.exports.getOutputDir = async () => get("select outputpath from settings")