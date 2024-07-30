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
const { MongoClient, ServerApiVersion } = require('mongodb')
const uri = process.env.MONGO_CONNECTION_STRING
const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,}
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

app.get("/login", async (req, res) => {
    if(req.session.username != undefined) {
        res.redirect("/home")
    } else {
        res.render("login")
    }
})

app.post("/login", async (req, res) => {
    try {
        await client.connect()
        let {username, password, confirm_password} = req.body
        const result = await client.db(process.env.LOGIN_DB).collection(process.env.USER_PASS_COL).findOne({username: username})
        if(result) {
            res.redirect("/create_account?issue=user")
        } else if (password !== confirm_password) {
            res.redirect("/create_account?issue=pass")
        } else {
            await client.db(process.env.LOGIN_DB).collection(process.env.USER_PASS_COL).insertOne({username: username, password: password})
            res.redirect("/login")
        }
    } catch(e) {
        console.error(e)
    } finally {
        await client.close()
    }
})

app.get("/create_account", (req, res) => {
    res.render("create_account")
})

app.get("/home", (req, res) => {
    if(req.session.username != undefined) {
        res.render("home", {username: req.session.username})
    } else {
        res.redirect("/login")
    }
})

app.post("/home", (req, res) => {
    let {username, password} = req.body
    if(username != undefined && password != undefined) {
        req.session.username = username 
        req.session.password = password
        req.session.save()
    }
    res.render("home", {username: req.session.username})
})

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