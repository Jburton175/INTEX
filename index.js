let express = require('express');
let app = express();
const path = require('path');
const session = require('express-session');
const PORT = process.env.PORT || 3000;

// Middleware for parsing request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files (CSS, images, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Set up EJS for templating
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Initialize session middleware
app.use(session({
    secret: 'intex2346235346', // Replace with a strong secret key
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Use `true` for HTTPS
}));

const knex = require("knex")({
    client: "pg",
    connection: {
        host: process.env.RDS_HOSTNAME || "localhost",
        user: process.env.RDS_USERNAME || "postgres",
        password: process.env.RDS_PASSWORD || "admin",
        database: process.env.RDS_DB_NAME || "TurtleShelter",
        port: process.env.RDS_PORT || 5432,
        ssl: process.env.DB_SSL ? { rejectUnauthorized: false } : false
    }
});

// Excluded routes that don't require login
const excludedRoutes = ['/', '/login', '/requestEvent', '/addVolunteer','/createRequest'];

// Middleware to enforce login check
app.use((req, res, next) => {
    // Skip excluded routes and favicon.ico
    if (excludedRoutes.includes(req.path) || req.path === '/favicon.ico') {
        return next();
    }

    // Redirect to login if no session exists
    if (!req.session.volunteer) {
        console.log('Access denied. Redirecting to login.');
        return res.redirect('/login');
    }

    next(); // Allow access if logged in
});

// Login route
app.post('/login', (req, res) => {
    const username = req.body.username;
    const password = req.body.password;

    knex('volunteers')
        .join('roles', 'roles.role_id', '=', 'volunteers.role_id')
        .select('volunteers.vol_id', 'roles.role_name')
        .where("vol_email", username)
        .where("password", password) // Replace with hashed password comparison
        .first()
        .then(volunteer => {
            if (volunteer) {
                req.session.volunteer = volunteer; // Save volunteer to session
                console.log('Volunteer logged in:', req.session.volunteer);
                res.redirect('/dashboard');
            } else {
                console.log('Invalid username or password');
                res.status(401).send("Invalid username or password");
            }
        })
        .catch(error => {
            console.error('Error during database query:', error.stack);
            res.status(500).send('Database query failed: ' + error.message);
        });
});

// Dashboard route (protected)
app.get('/dashboard', (req, res) => {
    console.log('Session on /dashboard:', req.session); // Debug session
    if (req.session.volunteer) {
        console.log('Logged-in role:', req.session.volunteer.role_name);
        if(req.session.volunteer.role_name === "Admin"){
            knex("events")
            .select('events.*', knex.raw('COUNT(ev.vol_id) as volunteers_signed_up'))
            .leftJoin('event_volunteers as ev', 'ev.event_id', '=', 'events.event_id')
            .groupBy('events.event_id')  // Group by event_id to count volunteers per event
            .orderBy("event_datetime", "desc")
            .then(vol_events => {
                res.render("dashboard", { volunteer: req.session.volunteer, vol_events });
            });
        } else {
            knex("events")
            .leftJoin("event_volunteers as ev_signed_up", function() {
                this.on("ev_signed_up.event_id", "=", "events.event_id")
                    .andOn("ev_signed_up.vol_id", "=", req.session.volunteer.vol_id);
            })
            .leftJoin('event_volunteers as ev', 'ev.event_id', '=', 'events.event_id')  // Use alias for counting volunteers
            .select('events.*', knex.raw('COUNT(ev.vol_id) as volunteers_signed_up'))
            .groupBy('events.event_id')  // Group by event_id to count volunteers per event
            .orderBy("event_datetime", "desc")
            .then(vol_events => {
                res.render("dashboard", { volunteer: req.session.volunteer, vol_events });
            });
        }
        
    } else {
        console.log('No session found. Redirecting to login.');
        res.redirect('/login');
    }
});



// Define route for home page
app.get('/', (req, res) => {
  res.render('index');

});


app.get('/login', (req, res) => {
  res.render('login');

});





// Serve static files (e.g., CSS) if needed
// app.use(express.static('public'));

app.get('/manageRequests', (req, res) => {
    knex("requests")
    .join('request_status', 'requests.request_status_id', '=', 'request_status.request_status_id')
    .join('event_type', 'requests.req_type_id', '=', 'event_type.event_type_id')
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
            "requests.req_street_1",
            "requests.req_street_2",
            "requests.req_city",
            "requests.req_state",
            "requests.req_zip",
            "requests.req_type_id",
            "request_status.request_status_id",
            "request_status.request_status_name",
            "event_type.event_type_name")
            .where('requests.request_status_id' == 1)
            .then(requests => { // selects all the info from the requests table and passes it to display characters ejs
        res.render("manageRequests", {myrequests : requests});
    }).catch( err => {
        console.log(err);
        res.status(500).json({err});
    });
  });

  app.get('/createRequest', (req, res) => {
    knex("event_type")
    .select("event_type_id",
            "event_type_name"
    )
            .then(eventTypes => { // selects all the info from the requests table and passes it to display characters ejs

        const states = [
            "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
            "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
            "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
            "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
            "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
        ];

        const hours = [];
        for (let i = 1; i <= 12; i++) {
            hours.push(i); // Add whole hours
            if (i < 12) {
            hours.push(i + 0.5); // Add half hour increments
        }
}

        res.render("createRequest", {eventTypes, states, hours});
    }).catch( err => {
        console.log(err);
        res.status(500).json({err});
    });
});

app.post('/createRequest', (req, res) => {
    
    const contact_first_name = req.body.contact_first_name; // Access each value directly from req.body
    const contact_last_name = req.body.contact_last_name;
    const organization_name = req.body.organization_name;
    const contact_phone = req.body.contact_phone;
    const est_attendees = req.body.est_attendees;
    const basic_sewers = req.body.basic_sewers;
    const advanced_sewers = req.body.advanced_sewers;
    const proposed_datetime = req.body.proposed_datetime;
    const alt_datetime = req.body.alt_datetime;
    const est_duration = req.body.est_duration;
    const num_machines = req.body.num_machines;
    const num_sergers = req.body.num_sergers;
    const contact_email = req.body.contact_email;
    const jen_story = req.body.jen_story === 'true';
    const request_status_id = 1;
    const req_street_1 = req.body.req_street_1;
    const req_street_2 = req.body.req_street_2;
    const req_city = req.body.req_city;
    const req_state = req.body.req_state;
    const req_zip = req.body.req_zip;
    const req_type_id = req.body.req_type_id;

    knex('requests').insert({
        contact_first_name: contact_first_name,
        contact_last_name: contact_last_name,
        organization_name: organization_name,
        contact_phone: contact_phone,
        est_attendees: est_attendees,
        basic_sewers: basic_sewers,
        advanced_sewers: advanced_sewers,
        proposed_datetime: proposed_datetime,
        alt_datetime: alt_datetime,
        est_duration: est_duration,
        num_machines: num_machines,
        num_sergers: num_sergers,
        contact_email: contact_email,
        jen_story: jen_story,
        request_status_id: request_status_id,
        req_street_1: req_street_1,
        req_street_2: req_street_2,
        req_city: req_city,
        req_state: req_state,
        req_zip: req_zip,
        req_type_id: req_type_id
    }).then(myrequests => {
        res.redirect("/");
    }).catch( err => {
        console.log(err);
        res.status(500).json({err});
    });
});

app.post('/denyRequest/:request_id', (req, res) => {
    const reqstatus = 3
    // Update the character in the database
    knex('requests')
      .where('request_id', parseInt(req.params.request_id))
      .update({
        request_status_id: reqstatus 
      })
      .then(myrequests => {
        res.redirect('/manageRequests'); // Redirect to the list of requests
      })
      .catch(error => {
        console.error('Error updating character:', error);
        res.status(500).send('Internal Server Error');
      });
});

// render the addVolunteer page
app.get('/addVolunteer', (req, res) => {
  const states = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
];
  console.log('States:', states);
  knex('sewing_proficiency')
      .select('level_id', 'level') // Query sewing_proficiency
      .then(proficiency => {
          knex('roles')
              .select('role_id', 'role_name') // Query roles
              .then(role => {
                  knex('vol_source')
                      .select('vol_source', 'source_type') // Query vol_source
                      .then(source => {
                          // Render the EJS template with all data
                          console.log('Rendering with data:', { proficiency, role, source, states });  // Log the data to check what's being passed
                          res.render('addVolunteer', { proficiency, role, source, states });
                      })
                      .catch(error => {
                          console.error('Error fetching sources: ', error);
                          res.status(500).send('Internal Server Error 1');
                      });
              })
              .catch(error => {
                  console.error('Error fetching roles: ', error);
                  res.status(500).send('Internal Server Error 2');
              });
      })
      .catch(error => {
          console.error('Error fetching proficiency: ', error);
          res.status(500).send('Internal Server Error 3');
      });
});


//testing a few things in this route
app.get('/test', (req, res) => {
  const states = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
  ];

  res.render('test', { states });
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
    console.log('Request body:', req.body);
  
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


// render page to edit a volunteer
app.get('/editVolunteer/:id', (req, res) => {
  let id = req.params.id
  
  knex('volunteers')
  .where('vol_id', id)
  .first()
  .then(volunteer => {
      if (!volunteer) {
          return res.status(404).send('Volunteer not found');
      }

      // query for sewing proficiency dropdown
      knex('sewing_proficiency')
      .select('level_id', 'level') 
      .then(proficiency => {
          // query for roles dropdown
          knex('roles')
              .select('role_id', 'role_name')
              .then(role => {
                  // query for source dropdown
                  knex('vol_source')
                      .select('source_id', 'source_type') 
                      .then(source => {
                          // Render the EJS template with all data
                          res.render('editVolunteer', { volunteer, proficiency, role, source });
                      })
                      .catch(error => {
                          console.error('Error fetching sources: ', error);
                          res.status(500).send('Internal Server Error');
                      });
              })
              .catch(error => {
                  console.error('Error fetching roles: ', error);
                  res.status(500).send('Internal Server Error');
              });
      })
      .catch(error => {
          console.error('Error fetching proficiency: ', error);
          res.status(500).send('Internal Server Error');
      });
  })
  .catch(error => {
      console.error('Error fetching volunteer: ', error);
      res.status(500).send('Internal Server Error');
  });
})



// post edits to a volunteer
app.post('/editVolunteer/:id', (req, res) => {
  const id = req.params.id;

  const firstname = req.body.firstName;  // Access form data sent via POST
  const lastname = req.body.lastName;  
  const email = req.body.email;  
  const phone = req.body.phone;  
  const password = req.body.password;  
  const sAddress1 = req.body.address1;  
  const sAddress2 = req.body.address2;  
  const city = req.body.city;  
  const state = req.body.state;  
  const zip = req.body.zip;  
  const source = parseInt(req.body.source); 
  const role = parseInt(req.body.role);
  const sew_id = parseInt(req.body.sewLevel);  
  const hours = parseInt(req.body.hours);  
  // const formData = req.body;
  // console.log(formData);
  // console.log(formData);       // For demonstration, log the submitted data
  console.log('Request body:', req.body);

  knex('volunteers')
      .where('vol_id', id)
      .update({
          vol_first_name: firstname,
          vol_last_name: lastname, 
          vol_phone: phone,
          vol_email: email,
          password: password,
          role_id: role,
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
          res.redirect('/manageUsers'); 
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

app.get('/manageEvents', (req, res) => {
    knex('events')
    .join('volunteers', 'events.supervisor_id', '=', 'volunteers.vol_id')
    .join('event_status', 'events.event_status_id', '=', 'event_status.status_id')
    .join('event_type', 'events.event_type_id', '=', 'event_type.event_type_id')
    .join('location_type', 'events.location_type_id', '=', 'event_type.event_type_id')
    .select(
        "events.event_id", // ghost
	    "events.request_id", // ghost
	    "events.event_datetime",
	    "events.supervisor_id", // name of supervisor, from volunteers
	    "events.event_status_id", // from event_status table we need the name
	    "events.event_type_id", // from the table we need the type name
	    "events.event_street_1",
	    "events.event_street_2",
	    "events.event_city",
	    "events.event_state",
	    "events.event_zip",
	    "events.location_type_id", // get the location type
	    "events.participants",
	    "events.event_duration",
	    "events.pockets",
	    "events.collars",
	    "events.envelopes",
	    "events.vests",
	    "events.completed_products",
	    "events.distributed_products",
	    "events.volunteers_present",
        "volunteers.vol_first_name",
        "volunteers.vol_last_name",
        "event_status.event_status_name",
        "event_type.event_type_name",
        "location_type.location_type_name"
    )
    .then(events => {
        res.render('manageEvents', { events });
    })
    .catch(error => {
        console.error('Error querying database: ', error);
        res.status(500).send('Internal Server Error');
    });
  });

// route to delete volunteer
app.post('/deleteVolunteer/:id', (req, res) => {
    const id = req.params.id;
  
    knex('volunteers')
        .where ('vol_id', id)
        .del()
        .then(() => {
            res.redirect('/manageUsers');
        })
        .catch(error => {
            console.error('Error deleting volunteer:', error);
            res.status(500).send('Internal Server Error');
        });
  });
  

// port number, (parameters) => what you want it to do.
app.listen(PORT, () => console.log('Server started on port ' + PORT));
