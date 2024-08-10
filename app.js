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

app.get("/results", (req, res) => {
    res.render("results")
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

app.get("/watchlist", async (req, res) => {
    if(req.session.username == undefined) {
        res.redirect("/login")
    } else {
        res.render("watchlist", {username: req.session.username, watchlist: await renderWatchlist(req.session.username)})
    }
})

app.post("/watchlist", async (req, res) => {
    let {username, password, action, ...rest} = req.body
    console.log(action, rest)
    try {
        await client.connect()

        if(action === "login") {
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
                if(action === "add") {
                    await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).updateOne({username: req.session.username}, {$push: {watchlist: rest}})
                } else if(action === "watch") {
                    let result = await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).findOneAndUpdate({username: req.session.username}, {$pull: {watchlist: {title: rest.title}}}, {projection: {watchlist: {$elemMatch: {title: rest.title}}}, returnDocument: 'before'})
                    await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).updateOne({username: req.session.username}, {$push: {watched: { ...result.watchlist[0], ...rest}}})                    
                } else if(action === "delete" || action === "edit") {
                    await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).updateOne({username: req.session.username}, {$pull: {watchlist: {title: rest.title}}})
                    if(action === "edit") {
                        await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).updateOne({username: req.session.username}, {$push: {watchlist: rest}})
                    }
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
    if(req.session.username === undefined) {
        res.redirect("/login")
    } else {
        res.render("watched", {username: req.session.username, watched: await renderWatched(req.session.username)})
    }
})

app.post("/watched", async (req, res) => {
    let {action, ...rest} = req.body
    console.log(action, rest)
    try {
        await client.connect()
            if(req.session.username) {
                if(action === "delete" || action === "edit") {
                    await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).updateOne({username: req.session.username}, {$pull: {watched: {title: rest.title}}})
                    if(action === "edit") {
                        await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).updateOne({username: req.session.username}, {$push: {watched: rest}})
                    }
                }
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

async function renderWatchlist(username) {
    try {
        await client.connect()
        const result = await client.db(process.env.USER_DATA_DB).collection(process.env.CONTENT_COL).findOne({username: username})
        return result.watchlist.reduce((acc, entry) => {
            return acc +=   `<div class="card">
                                <div class="card-header d-flex">
                                    <h4>${entry.title}</h4>
                                    <button type="button" class="btn btn-success" data-bs-toggle="modal" data-bs-target="#watched${entry.title}">
                                        Watched
                                    </button>
                                </div>
                                <div class="card-body">
                                    Body
                                </div>
                                <div class="card-footer">
                                    <button type="button" class="btn btn-secondary" data-bs-toggle="modal" data-bs-target="#edit${entry.title}">
                                        Edit
                                    </button>
                                    <button type="button" class="btn btn-outline-danger" data-bs-toggle="modal" data-bs-target="#delete${entry.title}">
                                        Delete
                                    </button>
                                </div>
                            </div>

                            <div class="modal" id="watched${entry.title}">
                                <div class="modal-dialog">
                                    <div class="modal-content">
                                        <div class="modal-header">
                                            Rate!
                                        </div>
                                        <form method="post">
                                            <div class="modal-body">
                                                <input type="hidden" name="action" value="watch">
                                                <input type="hidden" name="title" value="${entry.title}">
                                                <label>Your Rating: <input class="form-control" type="number" min="0.0" max="10.0" step="0.1" name="rating"></label>
                                            </div>
                                            <div class="modal-footer">
                                                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
                                                <button class="btn btn-success" type="submit">Confirm</button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            </div>

                            <div class="modal" id="edit${entry.title}">
                                <div class="modal-dialog">
                                    <div class="modal-content">
                                        <div class="modal-header">
                                            Edit
                                        </div>
                                        <form method="post">
                                            <div class="modal-body">
                                                <input type="hidden" name="action" value="edit">
                                                <label>Title <input class="form-control-plaintext" name="title" type="text" readonly value="${entry.title}"></label>
                                                <label>Genre <input class="form-control" name="genre" type="text" value="${entry.genre}"></label>
                                            </div>
                                            <div class="modal-footer">
                                                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
                                                <button class="btn btn-success" type="submit">Confirm Changes</button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            </div>

                            <div class="modal" id="delete${entry.title}">
                                <div class="modal-dialog">
                                    <div class="modal-content">
                                        <div class="modal-header">
                                            Delete from Watchlist
                                        </div>
                                        <form method="post">
                                            <div class="modal-body">
                                                Are you sure you want to delete <strong>${entry.title}</strong>?
                                                <input type="hidden" name="action" value="delete">
                                                <input type="hidden" name="title" value="${entry.title}">
                                            </div>
                                            <div class="modal-footer">
                                                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
                                                <button class="btn btn-danger" type="submit">Delete</button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            </div><br>`
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
        return result.watched.reduce((acc, entry) => {
            return acc +=   `<div class="card">
                                <div class="card-header d-flex">
                                    <h4>${entry.title}</h4>
                                    <h3>${entry.rating}</h3>
                                </div>
                                <div class="card-body">
                                    Body
                                </div>
                                <div class="card-footer">
                                    <button type="button" class="btn btn-secondary" data-bs-toggle="modal" data-bs-target="#edit${entry.title}">
                                        Edit
                                    </button>
                                    <button type="button" class="btn btn-outline-danger" data-bs-toggle="modal" data-bs-target="#delete${entry.title}">
                                        Delete
                                    </button>
                                </div>
                            </div>

                            <div class="modal" id="edit${entry.title}">
                                <div class="modal-dialog">
                                    <div class="modal-content">
                                        <div class="modal-header">
                                            Edit
                                        </div>
                                        <form method="post">
                                            <div class="modal-body">
                                                <input type="hidden" name="action" value="edit">
                                                <label>Title <input class="form-control-plaintext" name="title" type="text" readonly value="${entry.title}"></label>
                                                <label>Genre <input class="form-control" name="genre" type="text" value="${entry.genre}"></label>
                                                <label>Your Rating: <input class="form-control" type="number" min="0.0" max="10.0" step="0.1" name="rating" required value="${entry.rating}"></label>
                                            </div>
                                            <div class="modal-footer">
                                                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
                                                <button class="btn btn-success" type="submit">Confirm Changes</button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            </div>

                            <div class="modal" id="delete${entry.title}">
                                <div class="modal-dialog">
                                    <div class="modal-content">
                                        <div class="modal-header">
                                            Delete from Watched
                                        </div>
                                        <form method="post">
                                            <div class="modal-body">
                                                Are you sure you want to delete <strong>${entry.title}</strong>?
                                                <input type="hidden" name="action" value="delete">
                                                <input type="hidden" name="title" value="${entry.title}">
                                            </div>
                                            <div class="modal-footer">
                                                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
                                                <button class="btn btn-danger" type="submit">Delete</button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            </div><br>`
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