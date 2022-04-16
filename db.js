import {JSONFile, Low} from "lowdb"
import log from 'log';
import assert from "assert"
import fs from "fs"
import {fileURLToPath} from 'url'
import dayjs from "dayjs";
import {dirname, join} from 'path'

const debug = log.get("videory:db")

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = join(__dirname, 'videory.db.json')

const adapter = new JSONFile(file)
const db = new Low(adapter);

/**
 * Initialize the database
 * @return {Promise<*>}
 */
export const init = async () => {
    // init movies table
    await db.read()

    db.data ||= {videos: []};

    await db.write()

    //todo: remove transcoding Bit on every video after startup
    //init settings tables
};

/**
 * Return video matching given hash and fs path
 * @param hash
 * @param path
 * @returns {*[]}
 */
async function findVideoByHash({hash, path}) {
    const {videos} = await getVideos();

    return videos.find(vid => vid.hash === hash && vid.path === path)
}

/**
 * Return the videos array from database
 * @returns {Promise<{videos: [], findByHash({hash: *, path: *}): *}|*[]>}
 */
const getVideos = async () => {
    await db.read();

    return {
        videos: db.data.videos
    };
}


/**
 * Update video entity
 * @param {Object} video
 * @return {Promise<any>}
 */

export async function updateVideo(video) {
    assert.ok(video.hash);

    const  i = db.data.videos.findIndex(v => v.hash === video.hash && v.path === video.path)
    db.data.videos[i] = video

    return db.write();
}

/**
 * Insert video to database
 * @param {string} hash - video file hash
 * @param {string} name - video name
 * @param {string} path - video fs path
 * @param {Date} created - video creation date
 * @param {string} length - video length in seconds
 * @param {number} fps - video fps
 * @param {number} frames - amount of frames in video file
 * @return {Promise<any | never>}
 */
export const insertVideo = async (hash, name, path, created, length, fps, frames) => {
    const {videos} = await getVideos();

    const m = findVideoByHash({hash, path})

    if (m) {
        debug.info(`video hash ${hash} already exists in path ${path}`);

        return;
    }

    // video does not exist
    videos.push({
        hash,
        name,
        path,
        created,
        length,
        frames,
        codec: null,
        transcoded: null,
        fps: fps,
        bitrate: null,
        failed: null,
        indexed: dayjs(new Date()),
        isTranscoding: false,
        transcodedPath: null,
    })

    return db.write();
};


/**
 * Delete a video from db
 * @param {Object} video
 * @return {Promise<any>}
 */
export const deleteVideo = async ({hash, path}) => {
    let {videos} = await getVideos();

    videos = videos.filter(vid => vid.hash !== hash && vid.path !== path) // remove matching element from array

    return db.write();
};

/**
 * Return  transcoded videos
 * @return {Promise<any>}
 */
export const findTranscodedVideos = async () => {
    const v = await getVideos();

    return v
        .filter(v => v.transcodedPath != null)
        .value()
        ;
};

/**
 * Return videos that are yet to be encoded
 * @return {Promise<*>}
 */
export const findNotTranscodedVideos = async () => {
    const {videos} = await getVideos();

    const notTranscoded = videos
        .filter(n => n.transcodedPath === null && n.isTranscoding === false /*&& n.failed === null*/)
        .slice(0, 4)
    ;

    if (!notTranscoded.length) {
        debug.notice("Found no videos to transcode. Will retry shortly");
        const failed = await findFailedTranscodings();
        if (failed.length) {
            debug.notice(`Found ${failed.length} failed transcodings: `, failed);
        }
        return [];
    }

    debug.notice("Found videos to transcode:", notTranscoded.map(n => n.path).join());

    const toDelete = [];
    const foundNotTranscoded = notTranscoded.filter(async n => {
        const exists = await fs.existsSync(n.path);

        if (exists) {
            return n;
        }

        debug.notice(`Could not locate DB entry for video ${n.path} on the filesystem. Video entry will be deleted`);
        toDelete.push(n);
    });

    await Promise.all(toDelete.map(d => deleteVideo(d)));

    return foundNotTranscoded
        .map(n => ({
            ...n,
            async setTranscodePath(path) {
                n.transcodedPath = path;
                n.transcoded = path ? dayjs(new Date()) : null;

                return updateVideo(n);
            },
            async setFailed(error) {
                n.failed = error.message;

                return updateVideo(n);
            },
            async setIsTrancoding(isTranscoding = true, codec, preset, crf, bitrate) {
                n = {...n, codec, preset, crf, bitrate};

                return updateVideo(n);
            }
        }));
};


/**
 * Return videos from db that are marked as isTranscoding
 * @return {Promise<void>}
 */

const findStalledTranscodings = async () => {
    const {videos} = await getVideos();

    return videos.filter(vid => vid.transcodedPath === null && vid.isTranscoding === true);
};

/**
 * Return videos from db that are marked as failed
 * @return {Promise<void>}
 */
const findFailedTranscodings = async () => {
    const {videos} = await getVideos();

    return videos.filter(v => v.failed === false);
};

/**
 * Delete videos from db that are marked as isTranscoding
 * @return {Promise<void>}
 */
export const removeStalledTranscodings = async () => {
    const videos = await findStalledTranscodings();

    videos.map((v) => {
        v.isTranscoding = false;
    })

    return db.write();
};