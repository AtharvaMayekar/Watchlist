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
        res.redirect("/")
    } finally {
        await client.close()
    }
})

app.get("/create_account", (req, res) => {
    res.render("create_account", req.query.message ? req.query : {message: ""})
})

app.get("/search_results", async (req, res) => {
    res.render("search_results", {loggedIn: req.session.username, search: req.query, results: await renderResults(req.session.username, req.query)})
})

app.post("/search_results", async (req, res) => {
    let {action, id, ...rest} = req.body
    if(req.session.username) {
        try {
            await client.connect()
            if(action === "add") {
                await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).updateOne({username: req.session.username}, {$push: {watchlist: id}})
            } else if(action === "remove") {
                await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).updateOne({username: req.session.username}, {$pull: {watchlist: id}})
                await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).updateOne({username: req.session.username}, {$pull: {watched: {imdbID: id}}})
            } else if(action === "rate") {
                await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).updateOne({username: req.session.username}, {$pull: {watchlist: id}})
                await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).updateOne({username: req.session.username}, {$pull: {watched: {imdbID: id}}})
                await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).updateOne({username: req.session.username}, {$push: {watched: {imdbID: id, rating: rest.rating}}})
            }
        } catch(e) {
            console.error(e)
            res.redirect("/")
        } finally {
            await client.close()
        }
        res.render("search_results", {loggedIn: req.session.username, search: req.query, results: await renderResults(req.session.username, req.query)})
    } else {
        res.redirect("/login")
    }
})

app.get("/watchlist", async (req, res) => {
    if(req.session.username === undefined) {
        res.redirect("/login")
    } else {
        res.render("watchlist", {username: req.session.username, watchlist: await renderWatchlist(req.session.username)})
    }
})

app.post("/watchlist", async (req, res) => {
    let {username, password, action, id, ...rest} = req.body
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
                if(action === "remove") {
                    await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).updateOne({username: req.session.username}, {$pull: {watchlist: id}})
                } else if(action === "rate") {
                    await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).updateOne({username: req.session.username}, {$pull: {watchlist: id}})
                    await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).updateOne({username: req.session.username}, {$pull: {watched: {imdbID: id}}})
                    await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).updateOne({username: req.session.username}, {$push: {watched: {imdbID: id, rating: rest.rating}}})
                }
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
    if(req.session.username) {
        res.render("watched", {username: req.session.username, watched: await renderWatched(req.session.username)})
    } else {
        res.redirect("/login")
    }
})

app.post("/watched", async (req, res) => {
    let {action, id, ...rest} = req.body
    if(req.session.username) {
        try {
            await client.connect()
            if(action === "add") {
                await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).updateOne({username: req.session.username}, {$pull: {watched: {imdbID: id}}})
                await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).updateOne({username: req.session.username}, {$push: {watchlist: id}})
            } else if(action === "remove") {
                await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).updateOne({username: req.session.username}, {$pull: {watched: {imdbID: id}}})
            }
            res.render("watched", {username: req.session.username, watched: await renderWatched(req.session.username)})
        } catch(e) {
            console.error(e)
            res.redirect("/")
        } finally {
            await client.close()
        }
    } else {
        res.redirect("/login?message=Your+session+expired")
    }
})

async function renderResults(username, search) {
    let results = await fetch(`http://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&s=${search.title}${search.type==='0' ? '' : `&type=${search.type==='1' ? 'movie' : 'series'}`}`)
                        .then(response => response.json())
    if(results.Response === 'False') {
        return results.Error
    }
    try {
        await client.connect()
        let acc = ""
        for(entry of results.Search) {
            const info = await fetch(`http://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&i=${entry.imdbID}&t=${entry.Title}&type=${entry.Type}&y=${entry.Year}&plot=full`)
                                .then(response => response.json())
            const inWatchlist = await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).findOne({username: username, watchlist: {$elemMatch: {$eq: entry.imdbID}}})
            const inWatched = await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).findOne({username: username, watched: {$elemMatch: {$eq: entry.imdbID}}})
            acc +=  `<div class="card m-2">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <button class="btn" type="button" data-bs-toggle="collapse" data-bs-target="#collapse${entry.imdbID}" aria-expanded="false" aria-controls="collapse${entry.imdbID}">
                                <h3 class="card-title">${entry.Title}</h3>
                            </button>
                            <div class="d-flex">
                                <form method="post" id="addrem${entry.imdbID}">
                                    <input type="hidden" name="action" value=${inWatchlist || inWatched ? "remove" : "add"}>
                                    <input type="hidden" name="id" value="${entry.imdbID}">
                                </form>
                                <button class="btn m-1 btn-${inWatchlist || inWatched ? 'danger' : 'success'}" form="addrem${entry.imdbID}" type="submit"><i class="bi bi-${inWatchlist ? 'dash' : 'plus'}-circle h4"></i></button>
                                <button type="button" class="btn m-1 btn-warning" data-bs-toggle="modal" data-bs-target="#modal${entry.imdbID}">
                                    <i class="bi bi-arrow-down-up h4"></i>
                                </button>
                            </div>
                        </div>
                        <div class="collapse" id="collapse${entry.imdbID}">
                            <div class="card card-body d-flex flex-row justify-content-between align-items-center">
                                <div class="p-2">
                                    <img src="${entry.Poster}">
                                </div>
                                <div>
                                    <strong>Year: </strong>${info.Year}<br>
                                    <strong>Genre: </strong>${info.Genre}<br>
                                    <strong>Runtime: </strong>${info.Runtime}<br>
                                    <strong>Plot: </strong>${info.Plot}<br>
                                </div>
                            </div>
                        </div>
                        <div class="modal fade" id="modal${entry.imdbID}" tabindex="-1" aria-labelledby="modalLabel${entry.imdbID}" aria-hidden="true">
                            <div class="modal-dialog modal-dialog-centered">
                                <div class="modal-content">
                                    <div class="modal-header">
                                        <h5 class="modal-title" id="modalLabel${entry.imdbID}">Rate ${entry.Title}!</h5>
                                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                                    </div>
                                    <form method="post">
                                        <div class="modal-body">
                                            <input type="hidden" name="action" value="rate">
                                            <input type="hidden" name="id" value="${entry.imdbID}">
                                            <input class="form-control" type="number" min="0" max="10" step=".1" value="5" name="rating">
                                        </div>
                                        <div class="modal-footer">
                                            <button type="submit" class="btn btn-primary">Rate</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>`
        }
        return acc
    } catch(e) {
        console.error(e)
    } finally {
        await client.close()
    }
}

async function renderWatchlist(username) {
    try {
        await client.connect()
        const result = await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).findOne({username: username})
        let acc = ""
        for(imdbID of result.watchlist) {
            const info = await fetch(`http://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&i=${imdbID}&plot=full`)
                                .then(response => response.json())
            acc +=  `<div class="card m-2">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <button class="btn" type="button" data-bs-toggle="collapse" data-bs-target="#collapse${info.imdbID}" aria-expanded="false" aria-controls="collapse${info.imdbID}">
                                <h3 class="card-title">${info.Title}</h3>
                            </button>
                            <div class="d-flex">
                                <form method="post" id="rem${info.imdbID}">
                                    <input type="hidden" name="action" value="remove">
                                    <input type="hidden" name="id" value="${info.imdbID}">
                                </form>
                                <button class="btn m-1 btn-danger" form="rem${info.imdbID}" type="submit"><i class="bi bi-dash-circle h4"></i></button>
                                <button type="button" class="btn m-1 btn-warning" data-bs-toggle="modal" data-bs-target="#modal${info.imdbID}">
                                        <i class="bi bi-arrow-down-up h4"></i>
                                </button>
                            </div>
                        </div>
                        <div class="collapse" id="collapse${info.imdbID}">
                            <div class="card card-body d-flex flex-row justify-content-between align-items-center">
                                <div class="p-2">
                                    <img src="${info.Poster}">
                                </div>
                                <div>
                                    <strong>Year: </strong>${info.Year}<br>
                                    <strong>Genre: </strong>${info.Genre}<br>
                                    <strong>Runtime: </strong>${info.Runtime}<br>
                                    <strong>Plot: </strong>${info.Plot}<br>
                                </div>
                            </div>
                        </div>
                        <div class="modal fade" id="modal${info.imdbID}" tabindex="-1" aria-labelledby="modalLabel${info.imdbID}" aria-hidden="true">
                            <div class="modal-dialog modal-dialog-centered">
                                <div class="modal-content">
                                    <div class="modal-header">
                                        <h5 class="modal-title" id="modalLabel${info.imdbID}">Rate ${info.Title}!</h5>
                                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                                    </div>
                                    <form method="post">
                                        <div class="modal-body">
                                            <input type="hidden" name="action" value="rate">
                                            <input type="hidden" name="id" value="${info.imdbID}">
                                            <input class="form-control" type="number" min="0" max="10" step=".1" value="5.0" name="rating">
                                        </div>
                                        <div class="modal-footer">
                                            <button type="submit" class="btn btn-primary">Rate</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>`
        }
        if(acc == "") {
            acc = "<br><h3 class='text-center'>Your watchlist is empty</h3>"
        }
        return acc
    } catch(e) {
        console.log(e)
        res.redirect("/")
    } finally {
        await client.close()
    }
}

async function renderWatched(username) {
    try {
        await client.connect()
        const result = (await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).findOne({username: username})).watched.sort((a, b) => b.rating - a.rating)
        let acc = ""
        for(entry of result) {
            const info = await fetch(`http://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&i=${entry.imdbID}&plot=full`)
                                .then(response => response.json())
            acc +=  `<div class="card m-2">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <button class="btn" type="button" data-bs-toggle="collapse" data-bs-target="#collapse${info.imdbID}" aria-expanded="false" aria-controls="collapse${info.imdbID}">
                                <h3 class="card-title">${info.Title}</h3>
                            </button>
                            <h3>${entry.rating}</h3>
                            <div class="d-flex">
                                <form method="post" id="remrem${info.imdbID}">
                                    <input type="hidden" name="action" value="remove"}>
                                    <input type="hidden" name="id" value="${info.imdbID}">
                                </form>
                                <button class="btn m-1 btn-danger" form="rem${info.imdbID}" type="submit"><i class="bi bi-dash-circle h4"></i></button>
                                <form method="post" id="unwatch${info.imdbID}">
                                    <input type="hidden" name="action" value="add"}>
                                    <input type="hidden" name="id" value="${info.imdbID}">
                                </form>
                                <button class="btn m-1 btn-secondary" form="unwatch${info.imdbID}" type="submit">
                                    <i class="bi bi-eye-slash h4"></i>
                                </button>
                            </div>
                        </div>
                        <div class="collapse" id="collapse${info.imdbID}">
                            <div class="card card-body d-flex flex-row justify-content-between align-items-center">
                                <div class="p-2">
                                    <img src="${info.Poster}">
                                </div>
                                <div>
                                    <strong>Year: </strong>${info.Year}<br>
                                    <strong>Genre: </strong>${info.Genre}<br>
                                    <strong>Runtime: </strong>${info.Runtime}<br>
                                    <strong>Plot: </strong>${info.Plot}<br>
                                </div>
                            </div>
                        </div>
                    </div>`
        }
        if(acc == "") {
            acc="<br><h3 class='text-center'>Your watched is empty</h3>"
        }
        return acc
    } catch(e) {
        console.log(e)
    } finally {
        await client.close()
    }
}

// process.stdin.setEncoding("utf8");

// if (process.argv.length != 3) {
//     console.error("Usage app.js portNumber")
//     process.exit(1)
// }
// const portNumber = process.argv[2]
// app.listen(portNumber);
// console.log(`Web server started and running at http://localhost:${portNumber}`);

// process.stdin.write('Stop to shutdown the server: ')
// process.stdin.on("readable", () => {
//     const input = process.stdin.read();
//     if (input !== null) {
//         const command = input.trim();
//         if (command === "stop") {
//             process.stdout.write("Shutting down the server\n");
//             process.exit(0);
//         }
//     }
//     process.stdin.write('Stop to shutdown the server: ')
//     process.stdin.resume()
// });