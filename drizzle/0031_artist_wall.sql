-- every Artists' Alley table starts with its print wall up; the stands are a choice now, never shown with the wall
UPDATE `booths` SET `table_mode` = 'wall' WHERE `kind` = 'artist' AND `table_mode` = 'books';
