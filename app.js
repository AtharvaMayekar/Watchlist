const path = require('path')
const express = require('express')
const bodyParser = require('body-parser')
const app = express();

app.set("views", path.resolve(__dirname, 'templates'))
app.set("view engine", "ejs")
app.use(bodyParser.urlencoded({extended:false}))

app.get("/", (req, res) => {
    res.render("welcome")
})

app.get("/login", (req, res) => {
    res.render("login")
})

app.get("/create_account", (req, res) => {
    res.render("create_account")
})

app.post("/home", (req, res) => {
    res.render("home")
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