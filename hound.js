const
    fs = require('fs')
    , path = require('path')
    , FileHound = require('filehound')
    , assert = require("assert")
    , db = require('./db')
    , md5 = require('md5')
    , ffmpeg = require('fluent-ffmpeg')
    , {getFilesizeInMBytes} = require('./helpers')
    , debug = require("debug")('videory:hound')
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
        , fps = (() => {
            try {
                return Math.round(eval(ffprobeMeta.streams[0]["r_frame_rate"]) * 100) / 100
            } catch (e) {
                console.error(`couldn't fetch fps for${name}`, e)
            }
        })()
        , frames = (() => {
            try {
                return ffprobeMeta.streams[0]["nb_frames"]
            } catch (e) {
                console.error(`couldn't fetch amount of frames for${name}`, e)
            }
        })()
    ;

    debug("Video indexed", "name: " + name, "path: " + filePath, "size in MB: " + size, "hash: " + fileHash, "created: " + lastModified.format());
    return db.insertMovie(fileHash, name, filePath, lastModified, length, fps, frames)
}

/**
 * find all files with matching file extension in given path
 * @param {[String]} watchDirs - fs file paths
 * @param {String} searchExt - file extension to query
 * @return {Promise}
 */
module.exports.findAndUpdate = async (watchDirs, searchExt) => {
    assert.equal(watchDirs.constructor, Array, "First argument must be an array of Strings with directories");
    assert.ok(searchExt, 'Missing mandatory second argument');
    debug('Updating index', watchDirs);
    if (!watchDirs.length) {
        return Promise.resolve();
    }

    console.time("indexing");

    const hound = FileHound.create();
    hound.paths(watchDirs)
        .ext(searchExt)
        .discard(["_.*", "#recycle", "_@eadir"]) //todo: extract to settings
        .depth(10) //todo: extract to settings
        .ignoreHiddenDirectories()
        .ignoreHiddenFiles()
        .find()
        .then(async files => {
            console.timeEnd("indexing");
            debug(`Found ${files.length} ${searchExt} files`);
            console.time("hashing");
            for (let i = 0; i < files.length; i++) {
                const movie = files[i];
                await indexMovie(movie);
            }
            console.timeEnd("hashing");
        });

    hound.on('match', (file) => {
        debug(`Process ${file}`);
    });

    hound.on('error', e => {
        console.error(e);
        throw e;
    });

    hound.on('end', () => {
        debug(`Search complete`);
    });

    return hound;
};