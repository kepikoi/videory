const
    sqlite3 = require('sqlite3').verbose()
    , db = new sqlite3.Database('db.sqlite')
;

async function run(query) {
    return new Promise((resolve, reject) => {
        db.run(query, (err) => {
            if (err) {
                reject(err)
            }
            resolve();
        });
    })
}

async function all(query) {
    return new Promise((resolve, reject) => {
        db.all(query, (err, rows) => {
            if (err) {
                reject(err)
            }
            resolve(rows);
        });
    })
}

/**
 * initial
 * @return {Promise<*>}
 */
module.exports.init = async () => {
    // init movies table
    await run(`
      create table if not exists movie (
        hash       TEXT not null,
        path       TEXT not null,
        date       TEXT not null,
        transcoded TEXT not null,
        UNIQUE (hash, path)
      )
    `);

    //init settings table
    await run(`
      create table if not exists settings (
        name  TEXT not null unique,
        value TEXT not null unique
      )
    `);

    //init default settings //todo: enable setting for the ui
    await run(`insert into settings
               values ("outputpath", "c:/videory-output")`);
};

module.exports.insertMovie = async (hash, path, date) =>
    run(`insert into movie values("${hash}", "${path}", "${date}");`)
        .catch(e => {
            if (e.errno === 19) {
                return console.warn('db entry exists', hash, path);

            }
            throw e;
        });

module.exports.find = async () => {
    return all('select * from movie');
};