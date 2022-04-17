# Videory
> transcode all videos in a directory

#Environment Variables
Variable|Description|Possible Values
---|---|---
LOG_DEBUG|Enable logger messages|`videory:*`

# Arguments
- `-i`, `--in` - directory to transcode videos from
- `-o`, `--out` - director< to transcode videos to

#Errors
|ErrNo|Description|
|---|---|
|1|Coldn't initilaize database|
|2|Failed while initial files query|
|3|Error while watching directory|

# Todo:
- cli interface for input output https://www.npmjs.com/package/inquirer o https://www.npmjs.com/package/prompts
- silent flag (with env requirements for input output) 
