// this is porter trying to use git hub and push changes and such
let express = require('express');
let app = express();
let path = require('path');
const PORT = process.env.PORT || 3000
app.use(express.urlencoded( {extended: true} )); 

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
// Serve static files (CSS, images, etc.)
app.use(express.static(path.join(__dirname, 'public')));



const knex = require("knex") ({
  client : "pg",
  connection : {
  host : process.env.RDS_HOSTNAME || "localhost",
  user : process.env.RDS_USERNAME || "postgres",
  password : process.env.RDS_PASSWORD || "Admin",
  database : process.env.RDS_DB_NAME || "TurtleShelter",
  port : process.env.RDS_PORT || 5432,
  ssl: process.env.DB_SSL ? { rejectUnauthorized: false } : false  // Fixed line
}
})



// Define route for home page
app.get('/', (req, res) => {
// <<<<<<<<< Temporary merge branch 1
  res.render('index');
// =========
  // write a sql statement to pull something in. here
});


// Serve static files (e.g., CSS) if needed
// app.use(express.static('public'));

app.get('/addVolunteer', (req, res) => {
  res.render('addVolunteer');  // Render the EJS form template
});

// Handle form submission
// app.post('/submit', (req, res) => {
//   const formData = req.body;  // Access form data sent via POST
//   console.log(formData);       // For demonstration, log the submitted data
//   res.send('Form submitted successfully!');
// });


// port number, (parameters) => what you want it to do.
app.listen(PORT, () => console.log('Server started on port ' + PORT));
