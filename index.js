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



const excludedRoutes = ['/', '/about', "/requestEvent", '/help', '/addVolunteer', '/manageUsers'];

// Middleware to enforce login check
app.use((req, res, next) => {
    // Check if the route is excluded
    if (excludedRoutes.includes(req.path)) {
        return next(); // Skip login check for excluded routes
    }
    
    // If security is false, render the login page
    if (!security) {
        return res.render('login'); // Render the login page
    }

    next(); // Proceed to the requested route
});



// Define route for home page
app.get('/', (req, res) => {
  res.render('index');

});


app.get('/login', (req, res) => {
  res.render('login');

});


app.post('/login', async (req, res) => {
    const username = req.body.username;
    const password = req.body.password;

    try {
        // Query the user table to find the record
        const volunteer = await knex('volunteers')
            .select('*')
            .where("vol_email", username)
            .where("password", password) // Replace with hashed password comparison in production
            .first(); // Returns the first matching record

        // Update security variable based on query result
        if (volunteer) {
            security = true;
        } else {
            security = false;
        }
    } catch (error) {
        return res.status(500).send('Database query failed: ' + error.message);
    }

    res.redirect("/");
});


// Serve static files (e.g., CSS) if needed
// app.use(express.static('public'));

app.get('/manageRequests', (req, res) => {
  knex("requests").join('request_status', 'requests.request_status_id', '=', 'request_status.request_status_id')
  .select("requests.request_id",
          "requests.request_datetime",
          "requests.organization_name",
          "requests.contact_phone",
          "requests.est_attendees",
          "requests.basic_sewers",
          "requests.advanced_sewers",
          "requests.proposed_datetime",
          "requests.alt_datetime",
          "requests.est_duration",
          "requests.contact_first_name",
          "requests.contact_last_name",
          "requests.num_machines",
          "requests.num_sergers",
          "requests.contact_email",
          "requests.jen_story",
          "requests.request_status_id as request_status",
          "request_status.request_status_id",
          "request_status.request_status_name")
          .then(requests => { // selects all the info from the requests table and passes it to display characters ejs
      res.render("manageRequests", {myrequests : requests});
  }).catch( err => {
      console.log(err);
      res.status(500).json({err});
  });
})


app.get('/addVolunteer', (req, res) => {
    res.render('addVolunteer');
  
  });

app.post('/addVolunteer', (req, res) => {
    const firstname = req.body.firstName || '';  // Access form data sent via POST
    const lastname = req.body.lastName || '';  
    const email = req.body.email || '';  
    const phone = req.body.phone || '';  
    const password = req.body.password;  
    const sAddress1 = req.body.address1 || '';  
    const sAddress2 = req.body.address2 || '';  
    const city = req.body.city || '';  
    const state = req.body.state || '';  
    const zip = req.body.zip || '';  
    const source = parseInt(req.body.source) || 6;  
    const sew_id = parseInt(req.body.sewLevel) || 1;  
    const hours = parseInt(req.body.hours) || 0;  
    // const formData = req.body;
    // console.log(formData);
    // console.log(formData);       // For demonstration, log the submitted data
    
  
    knex('volunteers')
        .insert({
            vol_first_name: firstname,
            vol_last_name: lastname, 
            vol_phone: phone,
            vol_email: email,
            password: password,
            role_id: 2,
            vol_street_1: sAddress1,
            vol_street_2: sAddress2,
            vol_city: city,
            vol_state: state.toUpperCase(),
            vol_zip: zip,
            source_id: source,
            vol_sew_level_id: sew_id,
            vol_hours_per_month: hours,
            
        })
        .then(() => {
            console.log('Form submitted successfully!');
            console.log('Request body:', req.body);
            res.redirect('/login'); 
        })
  
        .catch(error => {
            console.error('Error adding a volunteer:', error);
            console.log('Request body:', req.body);
            res.status(500).send('Internal Server Error');

        });
  });





// route for admin to view all volunteers (manageUsers page)
app.get('/manageUsers', (req, res) => {
  knex('volunteers')
  .join('roles', 'volunteers.role_id', '=', 'roles.role_id')
  .join('sewing_proficiency', 'volunteers.vol_sew_level_id', '=', 'sewing_proficiency.level_id')
  .join('vol_source', 'volunteers.source_id', '=', 'vol_source.source_id')
  .select(
      'volunteers.vol_id',
      'volunteers.vol_first_name',
      'volunteers.vol_last_name',
      'volunteers.vol_email',
      'volunteers.vol_phone',
      'volunteers.password',
      'volunteers.vol_street_1',
      'volunteers.vol_street_2',
      'volunteers.vol_city',
      'volunteers.vol_state',
      'volunteers.vol_zip',
      'volunteers.vol_signup_date',
      'volunteers.vol_hours_per_month',
      'volunteers.source_id',
      'volunteers.vol_sew_level_id',
      'volunteers.role_id',
      'vol_source.source_type as vol_source_type',
      'sewing_proficiency.level as vol_sewing_level',
      'roles.role_name as vol_role'
  )
  .orderBy('vol_signup_date', 'asc')
  .then(volunteers => {
      res.render('manageUsers', { volunteers });
  })
  .catch(error => {
      console.error('Error querying database: ', error);
      res.status(500).send('Internal Server Error');
  });
});

// port number, (parameters) => what you want it to do.
app.listen(PORT, () => console.log('Server started on port ' + PORT));
