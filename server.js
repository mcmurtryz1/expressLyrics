let getLyrics = require('4lyrics');
let fetch = require('node-fetch');
const mongodb = require('mongodb').MongoClient;
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json()); 
const url = 'mongodb://localhost:27017';
const apiKey = '';
const searchUrl = 'https://api.genius.com/search?q=';

const dbName = 'lyrics';
let dbCon;
 
mongodb.connect(url, {useUnifiedTopology: true}, function(err, client) {
    if (err) {
        console.log(err);
    } else {
        dbCon = client.db(dbName);
    }
});

app.get("/lyrics/fetchSong", (req, res) => {
    dbCon.collection('song').findOne({title: req.body.title, artist: req.body.artist})
    .then(song => {
        if (song != null) {
            res.status(200).send(song.lyrics != "" ? song.lyrics : {message: "Lyrics not found"});
        } else {
            let searchString;

            searchString = `${req.body.title} ${req.body.artist}`;

            //Replace characters for URL
            searchString = searchString.replace(' ', '%20');
            searchString = searchString.replace('&', '%26');

            let reqUrl = searchUrl + searchString;
            fetch(reqUrl, { 'headers': { 'Authorization': 'Bearer ' + apiKey } })
            .then(res => res.json())
            .then(body => {
                if (body.response.hits[0] == undefined || body.meta.status != 200) {

                    //Try pulling lyrics from other service
                    getLyrics.lyricscom.getURL(`${req.body.artist} - ${req.body.title}`)
                    .then(r => getLyrics.lyricscom.getLyrics(r))
                    .then(songLyrics => {
                        dbCon.collection('song').insertOne({title: req.body.title, artist: req.body.artist, lyrics: songLyrics});
                        res.status(200).send(songLyrics);
                    })
                    .catch((err) => {
                        dbCon.collection('song').insertOne({title: req.body.title, artist: req.body.artist, lyrics: ""});
                        res.status(200).send("Lyrics not found")
                    });
                } else {
                    let songUrl = "";
                    for (hit of body.response.hits) {
                        if (hit.result.primary_artist.name.toLowerCase() == req.body.artist.toLowerCase()) {
                            songUrl = hit.result.url;
                            break;
                        }
                    }
                    if (songUrl != "") {
                        fetch(songUrl)
                        .then(res => res.text())
                        .then(body => {
                            //Split up the lyrics from the page that is fetched
                            let songLyrics = "";
                            let lyricsTag = body.split(`<div class="lyrics">`)[1];
                            let unfilteredLyrics = lyricsTag.split(`<p>`)[1];
                            unfilteredLyrics = unfilteredLyrics.split(`</p>`)[0];
                            let splitLyrics = unfilteredLyrics.split(/<.+>/);

                            //Split lines
                            for (lyric of splitLyrics) {
                                if (lyric.match(">")) {
                                    lyric = "\n" + lyric.split(">")[1];
                                }
                                songLyrics += lyric;
                            }

                            dbCon.collection('song').insertOne({title: req.body.title, artist: req.body.artist, lyrics: songLyrics});
                            res.status(200).send(songLyrics);
                        })
                        .catch((err) => {
                            console.log(err)
                            res.status(500).send();
                        });
                    } else {
                        //Try pulling lyrics from other service
                        getLyrics.lyricscom.getURL(`${req.body.artist} - ${req.body.title}`)
                        .then(r => getLyrics.lyricscom.getLyrics(r))
                        .then(songLyrics => {
                            dbCon.collection('song').insertOne({title: req.body.title, artist: req.body.artist, lyrics: songLyrics});
                            res.status(200).send(songLyrics);
                        })
                        .catch((err) => {
                            dbCon.collection('song').insertOne({title: req.body.title, artist: req.body.artist, lyrics: ""});
                            res.status(200).send("Lyrics not found")
                        });
                    }
                }
            })
            .catch((err) => {
                console.log(err)
                res.status(500).send();
            });
        }
    })
});

app.listen(8888);