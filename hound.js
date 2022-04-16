import fs from "fs"
import path from "path"
import FileHound from "filehound"
import assert from "assert"
import {insertVideo} from "./db.js"
import md5 from "md5"
import ffmpeg from "fluent-ffmpeg"
import {getFilesizeInMBytes} from "./helpers.js"
import dayjs from "dayjs";
import log from "log";

const debug = log.get('videory:hound')

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
                return reject(err);
            }

            return resolve(metadata);
        });
    })
}

/**
 * Return md5 hash from concatinated video and filesystem meta data
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
 * Add video from fs to the database
 * @param {String} filePath - fs path to movie file
 * @return {Promise}
 */
async function indexMovie(filePath) {
    assert.ok(filePath, 'missing mandatory argument');
    debug.notice("calculating hash for video " + filePath);
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
                debug.error(`couldn't fetch fps for${name}`, e)
            }
        })()
        , frames = (() => {
            try {
                return ffprobeMeta.streams[0]["nb_frames"]
            } catch (e) {
                debug.error(`couldn't fetch amount of frames for${name}`, e)
            }
        })()
    ;

    debug.notice("Video indexed", "name: " + name, "path: " + filePath, "size in MB: " + size, "hash: " + fileHash, "created: " + lastModified.format());

    return insertVideo(fileHash, name, filePath, lastModified, length, fps, frames)
}

/**
 * Find all files matching given file extension and path
 * @param {[String]} watchDirs - fs file paths
 * @param {String} searchExt - file extension to query
 * @return {Promise}
 */
export const findAndUpdate = async (watchDirs, searchExt) => {
    assert.ok(Array.isArray(watchDirs), "First argument must be an array of Strings with directories");
    assert.ok(searchExt, 'Missing mandatory second argument');
    debug.notice('Updating index', watchDirs);

    if (!watchDirs.length) {
        return Promise.resolve();
    }

    const hashing = "hashing", indexing = "indexing";

    console.time(indexing);

    const hound = FileHound.create();

    hound
        .paths(watchDirs)
        .ext(searchExt)
        .discard(["_.*", "#recycle", "_@eadir"]) //todo: extract to settings
        .depth(10) //todo: extract to settings
        .ignoreHiddenDirectories()
        .ignoreHiddenFiles()
        .find()
        .then(async files => {
            console.timeEnd(indexing);
            debug.notice(`Found ${files.length} ${searchExt} files`);

            console.time(hashing);

            for (let i = 0; i < files.length; i++) {
                const movie = files[i];
                await indexMovie(movie);
            }

            console.timeEnd(hashing);
        });

    hound.on('match', (file) => {
        debug.notice(`Process ${file}`);
    });

    hound.on('error', e => {
        debug.error(e);

        throw e;
    });

    hound.on('end', () => {
        debug.notice(`Search complete`);
    });

    return hound;
};