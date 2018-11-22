const
    fs = require("fs")
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


module.exports.logAndExit = exitCode => err => {
    console.trace(err);
    process.exit(exitCode);
};