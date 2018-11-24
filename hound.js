const
    fs = require('fs')
    , path = require('path')
    , FileHound = require('filehound')
    , assert = require("assert")
    , db = require('./db')
    , md5 = require('md5')
    , ffmpeg = require('easy-ffmpeg')
    , {getFilesizeInMBytes} = require('./helpers')
    , debug = require("debug")('videory:hound')
    , chokidar = require('chokidar')
    , dayjs = require("dayjs")
;

/**
 * reads and returns ffprobe metadata for given videofile path
 * @param {String} path - fs filepath to the video
 * @return {Promise<Object>}
 */
async function probe(path) {
    assert.ok(path);
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(path, (err, metadata) => {
            if (err) {
                reject(err);
            }
            resolve(metadata);
        });
    })
}

/**
 * returns md5 hash from concatinated video and filesystem metadata
 * @param {Object} ffprobeMeta - video metadata output from ffprobe
 * @param {Object} fsStats - filesystem metadata outpout from  fs.stat
 * @return {String} video hash estimation
 */
function calculateHashFromMeta(ffprobeMeta, fsStats) {
    const
        {bit_rate, format_name, duration, size} = ffprobeMeta.format
        , {encoder, major_brand, minor_version} = ffprobeMeta.format.tags
        , videoStream = ffprobeMeta.streams.find((e, i) => i === 0)
        , {codec_tag, pix_fmt, start_pts, start_time, width, height, nb_frames} = videoStream
        , {timecode} = videoStream.tags
        , {mtimeMs: lastModified, birthtimeMs: created} = fsStats
        ,
        str = [bit_rate, format_name, duration, size, encoder, major_brand, minor_version, codec_tag, pix_fmt, start_pts, start_time, width, height, nb_frames, timecode, lastModified, created].join("")
    ;

    return md5(str);
}

/**
 * add movie from fs to db
 * @param {String} filePath - fs path to movie file
 * @return {Promise}
 */
async function indexMovie(filePath) {
    assert.ok(filePath, 'missing mandatory argument');
    debug("calculating hash for video " + filePath);
    // const fileHash = await md5file(filePath);
    const
        ffprobeMeta = await probe(filePath)
        , fsStats = fs.statSync(filePath)
        , fileHash = calculateHashFromMeta(ffprobeMeta, fsStats)
        , lastModified = dayjs(fsStats["mtime"])
        , name = path.basename(filePath, path.extname(filePath)) //without the extension
        , size = getFilesizeInMBytes(filePath)
        , length = ffprobeMeta.format.duration
    ;

    debug("video indexed", "name: " + name, "path: " + filePath, "size in MB: " + size, "hash: " + fileHash, "created: " + lastModified);
    return db.insertMovie(fileHash, name, filePath, lastModified, length)
}

/**
 * find all files with matching file extension in given path
 * @param {[String]} watchDirs - fs file paths
 * @param {String} searchExt - file extension to query
 * @return {Promise}
 */
module.exports.findAndUpdate = async (watchDirs, searchExt) => {
    assert.equal(watchDirs.constructor, Array, "first argument must be an array of Strings with directories");
    assert.ok(searchExt, 'missing mandatory second argument');
    debug('Updating index', watchDirs);
    if (!watchDirs.length) {
        return Promise.resolve();
    }

    console.time("indexing");

    const hound =  FileHound.create();
    hound.paths(watchDirs)
        .ext(searchExt)
        .discard("_.*") //todo: extract to settings
        .depth(10) //todo: extract to settings
        .find()
        .then(async files => {
            console.timeEnd("indexing");
            debug(`found ${files.length} ${searchExt} files`);
            console.time("hashing");
            for (let i = 0; i < files.length; i++) {
                const movie = files[i];
                await indexMovie(movie);
            }
            console.timeEnd("hashing");
        });

    hound.on('match', (file) => {
        debug(`process ${file}`);
    });

    hound.on('error', e => {
        debug(`error ${error}`);
        throw error;
    });

    hound.on('end', file => {
        debug(`search complete`,file);
    });

    return hound;
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

    // watcher
    //     .on('add', debugevent("add"))
    //     .on('change', debugevent("change"))
    //     .on('unlink', debugevent("remove"))
    //     .on('error', e => reject(e))
});