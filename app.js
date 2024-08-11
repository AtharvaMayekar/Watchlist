const path = require('path')
const express = require('express')
const session = require("express-session");
const cookieParser = require("cookie-parser");
const bodyParser = require('body-parser')
const app = express()

app.set("views", path.resolve(__dirname, 'templates'))
app.set("view engine", "ejs")
app.use(bodyParser.urlencoded({extended:false}))

require("dotenv").config({path: path.resolve(__dirname, ".env")})
const { MongoClient, ServerApiVersion } = require('mongodb');
const { render } = require('ejs');
const uri = process.env.MONGO_CONNECTION_STRING
const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true}
    })

app.use(cookieParser())
app.use(session({
    resave: true,
    saveUninitialized: false,
    secret: process.env.SESSION_SECRET}
))

app.get("/", (req, res) => {
    res.render("index")
})

app.post("/", (req, res) => {
    if(req.session.username != undefined) {
        req.session.destroy()
    }
    res.render("index")
})

app.get("/login", (req, res) => {
    if(req.session.username === undefined) {
        res.render("login", req.query.message ? req.query : {message: ""})
    } else {
        res.redirect("/watchlist")
    }
})

app.post("/login", async (req, res) => {
    try {
        let {username, password, confirm_password} = req.body
        if(password === confirm_password) {
            await client.connect()
            const result = await client.db(process.env.USER_DATA_DB).collection(process.env.LOGIN_COL).findOne({username: username})
            if(result) {
                res.redirect("/create_account?message=Username+already+taken")
            } else {
                await client.db(process.env.USER_DATA_DB).collection(process.env.LOGIN_COL).insertOne({username: username, password: password})
                await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).insertOne({username: username, watchlist: [], watched: []})
                res.redirect("/login?message=Account+successfully+created")
            }
        } else {
            res.redirect("/create_account?message=Passwords+do+not+match")
        }
    } catch(e) {
        console.error(e)
    } finally {
        await client.close()
    }
})

app.get("/create_account", (req, res) => {
    res.render("create_account", req.query.message ? req.query : {message: ""})
})

app.get("/search_results", async (req, res) => {
    res.render("search_results", {search: req.query, results: await renderResults(req.query)})
})

app.get("/watchlist", async (req, res) => {
    if(req.session.username == undefined) {
        res.redirect("/login")
    } else {
        res.render("watchlist", {username: req.session.username, watchlist: await renderWatchlist(req.session.username)})
    }
})

app.post("/watchlist", async (req, res) => {
    let {username, password} = req.body
    try {
        await client.connect()

        if(username && password) {
            const accountFound = await client.db(process.env.USER_DATA_DB).collection(process.env.LOGIN_COL).findOne({username: username, password: password})
            if(accountFound) {
                req.session.username = req.body.username 
                req.session.save()
                res.render("watchlist", {username: req.session.username, watchlist: await renderWatchlist(req.session.username)})
            } else {
                res.redirect("/login?message=Invalid+username+or+password")
            }
        } else {
            if(req.session.username) {
                res.render("watchlist", {username: req.session.username, watchlist: await renderWatchlist(req.session.username)})
            } else {
                res.redirect("/login?message=Your+session+expired")
            }
        }
    } catch(e) {
        console.error(e)
        res.redirect("/")
    } finally {
        await client.close()
    }
})

app.get("/watched", async (req, res) => {
    if(req.session.username === undefined) {
        res.redirect("/login")
    } else {
        res.render("watched", {username: req.session.username, watched: await renderWatched(req.session.username)})
    }
})

app.post("/watched", async (req, res) => {
    try {
        await client.connect()
            if(req.session.username) {
                res.render("watched", {username: req.session.username, watched: await renderWatched(req.session.username)})
            } else {
                res.redirect("/login?message=Your+session+expired")
            }
    } catch(e) {
        console.error(e)
        res.redirect("/")
    } finally {
        await client.close()
    }
})

async function renderResults(search) {
    let results = await fetch(`http://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&s=${search.title}${search.year ? `&y${search.year}` : ''}${search.type==='0' ? '' : `&type${search.type==='1' ? 'movie' : 'series'}`}`)
                        .then(response => response.json())
    console.log(results)

    if(results.Response === 'False') {
        console.log("Search fail")
        return results.Error
    }

    return results.Search.reduce((acc, entry) => {
        return acc +=   `<div class="card">
                            <div class="row g-0">
                                <div class="col-auto">
                                    <img src="${entry.Poster}" class="img-fluid rounded-start">
                                </div>
                                <div class="col-auto">
                                    <div class="card-header">
                                        <h3 class="card-title">${entry.Title}(${entry.Year})</h3>
                                    </div>
                                    <div class="card-body">
                                        
                                    </div>
                                </div>
                            </div>
                        </div>`
    }, "")
}

async function renderWatchlist(username) {
    try {
        await client.connect()
        const result = await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).findOne({username: username})
        return result.watchlist.reduce((acc, entry, i) => {
            return acc +=   ``
        }, "")
    } catch(e) {
        console.log(e)
        return ""
    } finally {
        await client.close()
    }
}

async function renderWatched(username) {
    try {
        await client.connect()
        const result = await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).findOne({username: username})
        return result.watched.reduce((acc, entry, i) => {
            return acc +=   ``
        }, "")
    } catch(e) {
        console.log(e)
        return ""
    } finally {
        await client.close()
    }
}

process.stdin.setEncoding("utf8");

if (process.argv.length != 3) {
    console.error("Usage app.js portNumber")
    process.exit(1)
}
const portNumber = process.argv[2]
app.listen(portNumber);
console.log(`Web server started and running at http://localhost:${portNumber}`);

process.stdin.write('Stop to shutdown the server: ')
process.stdin.on("readable", () => {
    const input = process.stdin.read();
    if (input !== null) {
        const command = input.trim();
        if (command === "stop") {
            process.stdout.write("Shutting down the server\n");
            process.exit(0);
        }
    }
    process.stdin.write('Stop to shutdown the server: ')
    process.stdin.resume()
});