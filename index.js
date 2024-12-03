// this is porter trying to use git hub and push changes and such
let express = require('express');
let app = express();
let path = require('path');
const PORT = process.env.PORT || 3000
// Set Security 
let security = false;
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


const excludedRoutes = ['/', '/about', "/requestEvent", '/help'];

// Middleware to enforce login check
app.use((req, res, next) => {
    // Check if the route is excluded
    if (excludedRoutes.includes(req.path)) {
        return next(); // Skip login check for excluded routes
    }
    
    // If security is false, render the login page
    if (!security) {
        return res.render('/login'); // Render the login page
    }

    next(); // Proceed to the requested route
});



// Define route for home page
app.get('/', (req, res) => {

  res.render('index');

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

// this is an experiment to see how git works! 

// port number, (parameters) => what you want it to do.
app.listen(PORT, () => console.log('Server started on port ' + PORT));
