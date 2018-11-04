const
    fs = require("fs")
    , dayjs = require("dayjs")
    , assert = require("assert")
    , debug = require("debug")("videory:helpers")
;

/**
 * returns file size in MB
 * @param {String} filename - file path to check size
 * @return {string}
 */
module.exports.getFilesizeInMBytes = function (filename) {
    var stats = fs.statSync(filename);
    var fileSizeInBytes = stats["size"];
    return Math.round(fileSizeInBytes / 1024 / 1024 * 100) / 100 + ' MB';
};

/**
 * returns files create date for
 * @param {String} filename - file path to check size
 * @return {Object}
 */
module.exports.getCreateDate = function (filename) {
    var stats = fs.statSync(filename);
    var date = stats["birthtime"];
    return dayjs(date)
};


module.exports.logAndExit = exitCode => err => {
    console.trace(err);
    process.exit(exitCode);
};