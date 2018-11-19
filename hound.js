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
    const timer = 'timer ' + filePath;
    console.time(timer);
    const fileHash = await md5file(filePath);
    debug(filePath, getFilesizeInMBytes(filePath), fileHash);
    console.timeEnd(timer);
    const createDate = getCreateDate(filePath).toISOString();
    return db.insertMovie(fileHash, filePath, createDate)
}

/**
 * find all files with matching file extension in given path
 * @param {String} searchDir - fs file path
 * @param {String} searchExt - file extension to query
 * @return {Promise}
 */
module.exports.findAndUpdate = async (searchDir, searchExt) => {
    assert.ok(searchDir && searchExt, 'missing mandatory argument');
    debug('Updating index', searchDir);
    return FileHound.create()
        .paths(searchDir)
        .ext(searchExt)
        .find()
        .then(files => {
            debug(`found ${files.length} ${searchExt} files`);
            return Promise.all(files.map(indexMovie));
        });
};

/**
 * watch filesystem to changes
 * @param {String} searchDir - fs file path
 * @param {String} searchExt - file extension to query
 * @return {Promise<void>}
 */
module.exports.watchDir = (searchDir, searchExt) => new Promise((resolve, reject) => {
    assert.ok(searchDir && searchExt, 'missing mandatory argument');
    const
        watcher = chokidar.watch(searchDir, {
            ignored: /(^|[\/\\])\../,
            persistent: true
        })
        , debugevent = verb => path => debug(`File ${path} has been ${verb}ed`)
    ;

    watcher
        .on('add', debugevent("add"))
        .on('change', debugevent("change"))
        .on('unlink', debugevent("remove"))
        .on('error', e => reject(e))
});