select * from movie where hash = "e49c46c4bd8a0b46d3bc64a11405037d";

select * from movie where "transcodedPath" ISNULL AND "isTranscoding" = 0;

select outputpath from settings;

delete from movie where "hash" = "d25f6ae24d44dd6876871867aa975e22" and "path" = "M:\2018-09-15 Singoldpfad Bobingen\P1477349.MP4"