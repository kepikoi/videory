select * from movie where hash = "e49c46c4bd8a0b46d3bc64a11405037d";

select * from movie where "transcodedPath" ISNULL   AND "isTranscoding" = 0;