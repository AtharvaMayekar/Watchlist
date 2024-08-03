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
    res.render("welcome")
})

app.post("/", (req, res) => {
    if(req.session.username != undefined) {
        req.session.destroy()
    }
    res.render("welcome")
})

app.get("/login", (req, res) => {
    if(req.session.username != undefined) {
        res.redirect("/watchlist")
    } else {
        res.render("login", req.query.message ? req.query : {message: ""})
    }
})

app.post("/login", async (req, res) => {
    try {
        let {username, password, confirm_password} = req.body
        if(password === confirm_password) {
            await client.connect()
            const result = await client.db(process.env.LOGIN_DB).collection(process.env.USER_PASS_COL).findOne({username: username})
            if(result) {
                res.redirect("/create_account?message=Username+already+taken")
            } else {
                await client.db(process.env.LOGIN_DB).collection(process.env.USER_PASS_COL).insertOne({username: username, password: password})
                await client.db(process.env.CONTENT_DB).collection(process.env.ENTRIES_COL).insertOne({username: username, watchlist: [], ratings: []})
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
    if(req.session.username != undefined) {
        console.log(req.query.title)
        if(req.query.title !== undefined) {
            try {
                await client.connect()
                await client.db(process.env.CONTENT_DB).collection(process.env.ENTRIES_COL).updateOne({username: req.session.username}, {$push: {watchlist: req.query}})
            } catch(e) {
                console.error(e)
            } finally {
                await client.close()
            }
        }
        res.render("watchlist", {username: req.session.username, watchlist: await renderWatchlist(req.session.username)})
    } else {
        res.redirect("/login")
    }
})

app.post("/watchlist", async (req, res) => {
    try {
        await client.connect()
        const result = await client.db(process.env.LOGIN_DB).collection(process.env.USER_PASS_COL).findOne(req.body)
        if(result) {
            req.session.username = req.body.username 
            req.session.password = req.body.password
            req.session.save()
            res.render("watchlist", {username: req.session.username, watchlist: await renderWatchlist(req.session.username)})
        } else {
            res.redirect("/login?message=Invalid+username+or+password")
        }
    } catch(e) {
        console.error(e)
        res.redirect("/welcome")
    } finally {
        await client.close()
    }
})

app.get("/ratings", (req, res) => {
    if(req.session.username != undefined) {
        res.render("ratings", {username: req.session.username})
    } else {
        res.redirect("/login")
    }
})

async function renderWatchlist(username) {
    try {
        await client.connect()
        const result = await client.db(process.env.CONTENT_DB).collection(process.env.ENTRIES_COL).findOne({username: username})
        return result.watchlist.reduce((acc, entry) => {
            return acc +=   `<div class="card">
                                <div class="card-header d-flex">
                                    <h4>${entry.title}</h4>
                                    <form class="end" method="get" action="/watchlist">
                                        <button class="btn btn-success" type="submit">Watched</button>
                                    </form>
                                    <button type="button" class="btn btn-outline-danger" data-bs-toggle="modal" data-bs-target="#delete">
                                        Delete
                                    </button>

                                    <div class="modal" id="delete">
                                        <div class="modal-dialog">
                                            <div class="modal-content">

                                                <div class="modal-body">
                                                    Are you sure you want to delete <strong>${entry.title}</strong>?
                                                </div>

                                                <div class="modal-footer">
                                                    <form>
                                                        <button class="btn btn-outline-primary" type="button" data-bs-dismiss="modal">No, go back</button>
				                                        <button class="btn btn-danger" type="submit">Yes, delete</button>
                                                    </form>
                                                </div>

                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div class="card-body">
                                    Body
                                </div>

                                <div class="card-footer">
                                    Footer
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