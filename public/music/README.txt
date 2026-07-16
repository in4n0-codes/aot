BACKGROUND MUSIC
================

The game loops through tracks placed in this folder. No audio ships with the
project — add your own files here.

How to add songs
-----------------
1. Copy your .mp3 files into this folder (odm-gear/public/music/).
      e.g.  reluctant-heroes.mp3
            barricades.mp3

2. List their exact filenames in playlist.json (in this same folder):

      [
        "reluctant-heroes.mp3",
        "barricades.mp3"
      ]

3. Reload the game and click "CLICK TO DEPLOY". The playlist starts and loops
   through the tracks in order, repeating forever.

Controls
--------
  M  — mute / unmute the music
  N  — skip to the next track

Notes
-----
- Vite serves everything in public/ from the site root, so a file at
  public/music/song.mp3 is reachable as  music/song.mp3  (which is what the
  loader uses). No build step or import is needed — just drop the files in.
- Use music you have the right to use. Anything you place here plays only in
  your local build.
