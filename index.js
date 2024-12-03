let express = require('express');
let app = express();
let path = require('path');
const PORT = process.env.PORT || 3000
// grab html form from file 
// allows to pull JSON data from form 
app.use(express.urlencoded( {extended: true} )); 

const knex = require("knex") ({
  client : "pg",
  connection : {
  host : process.env.RDS_HOSTNAME || "awseb-e-jscipcpyz9-stack-awsebrdsdatabase-roat50cnm4ii.c7kgaykw042g.us-east-2.rds.amazonaws.com",
  user : process.env.RDS_USERNAME || "dev-admins",
  password : process.env.RDS_PASSWORD || "Password123",
  database : process.env.RDS_DB_NAME || "ebdb",
  port : process.env.RDS_PORT || 5432,
  ssl: process.env.DB_SSL ? { rejectUnauthorized: false } : false  // Fixed line
}
})

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
// Serve static files (CSS, images, etc.)
app.use(express.static(path.join(__dirname, 'public')));
// Define route for home page

// Serve the login page (login.ejs)
app.get('/', (req, res) => {
  res.render('home');  // Renders 'login.ejs' file
});


// Serve static files (e.g., CSS) if needed
app.use(express.static('public'));


// port number, (parameters) => what you want it to do.
app.listen(PORT, () => console.log('Server started on port ' + PORT));
