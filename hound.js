const
    fs = require('fs')
    , path = require('path')
    , FileHound = require('filehound')
    , assert = require("assert")
    , db = require('./db')
    , md5file = require('md5-file/promise')
    , {getFilesizeInMBytes, getCreateDate} = require('./helpers')
    , debug = require("debug")('videory:hound')
    , chokidar = require('chokidar')
;

/**
 * add movie from fs to db
 * @param {String} filePath - fs path to movie file
 * @return {Promise}
 */
async function indexMovie(filePath) {
    assert.ok(filePath, 'missing mandatory argument');
    debug("calculating md5 hash for " + filePath);
    const fileHash = await md5file(filePath);
    debug(filePath, getFilesizeInMBytes(filePath), fileHash);
    const createDate = getCreateDate(filePath).toISOString();
    return db.insertMovie(fileHash, filePath, createDate)
}

/**
 * find all files with matching file extension in given path
 * @param {[String]} watchDirs - fs file paths
 * @param {String} searchExt - file extension to query
 * @return {Promise}
 */
module.exports.findAndUpdate = async (watchDirs, searchExt) => {
    assert.equal(watchDirs.constructor, Array, "first argument must be an array of Strings with directories")
    assert.ok(searchExt, 'missing mandatory second argument');
    debug('Updating index', watchDirs);
    if (!watchDirs.length) {
        return Promise.resolve();
    }

    return FileHound.create()
        .paths(watchDirs)
        .ext(searchExt)
        .find()
        .then(async files => {
            debug(`found ${files.length} ${searchExt} files`);
            for (let i = 0; i < files.length; i++) {
                const movie = files[i];
                await indexMovie(movie);
            }
        });
};

/**
 * watch filesystem to changes
 * @param {[String]} watchDirs - fs file paths
 * @param {String} searchExt - file extension to query
 * @return {Promise<void>}
 */
module.exports.watchDir = (watchDirs, searchExt) => new Promise((resolve, reject) => {
    assert.equal(watchDirs.constructor, Array, "first argument must be an array of Strings with directories")
    assert.ok(searchExt, 'missing mandatory second argument');
    if (!watchDirs.length) {
        return Promise.resolve();
    }

    const
        watcher = chokidar.watch(watchDirs, {
            ignored: /(^|[\/\\])\../,
            persistent: true
        })
        , debugevent = verb => path => debug(`File ${path} has been ${verb}ed to the filesystem`)
    ;

    watcher
        .on('add', debugevent("add"))
        .on('change', debugevent("change"))
        .on('unlink', debugevent("remove"))
        .on('error', e => reject(e))
});